import asyncio
import contextlib
import json
import logging
import time
from dataclasses import dataclass
from enum import Enum
from urllib.parse import urljoin, urlencode
from typing import *

import aiohttp

SECOND_MS = 1000

logger = logging.getLogger(__name__)


@dataclass
class EngineIOPacket:
    """
    See https://github.com/socketio/engine.io-protocol/tree/v3.
    """
    class Type(Enum):
        OPEN = 0
        CLOSE = 1
        PING = 2
        PONG = 3
        MESSAGE = 4
        UPGRADE = 5
        NOOP = 6

    type: Type
    data: str = ''

    @classmethod
    def parse(cls, data: str):
        return cls(EngineIOPacket.Type(int(data[0])), data[1:])

    def encode(self):
        return '%d%s' % (self.type.value, self.data)

    def __str__(self):
        return f'{self.type.name} {self.data}' if self.data else self.type.name


class EngineIO:
    """
    Engine.IO client.
    """
    VERSION = 3
    DEFAULT_PATH = '/engine.io'

    def __init__(self, url: str, path: str = None):
        """
        Create new Engine.IO client.

        :param url: Server URL.
        :param path: Engine path (default: "/engine.io").
        """
        path = path or self.DEFAULT_PATH
        self.url = url
        self.path = path
        self.session: Optional[aiohttp.ClientSession] = None
        self.socket: Optional[aiohttp.ClientWebSocketResponse] = None
        self.runner: Optional[asyncio.Task] = None

        self.ping_interval = 0
        self.ping_timeout = 0
        self.last_ping = 0

    @property
    def connected(self) -> bool:
        """Are we connected to the server?"""
        return self.socket is not None

    @property
    def connection_url(self) -> str:
        """Full connection URL"""
        params = {"EIO": self.VERSION, "transport": "websocket"}
        return urljoin(self.url, f'{self.path}/?{urlencode(params)}')

    async def connect(self):
        """Connect to server."""
        if self.connected:
            return

        self.session = aiohttp.ClientSession()
        try:
            logger.debug('Connecting to %s', self.connection_url)
            self.socket = await self.session.ws_connect(self.connection_url)

            packet = EngineIOPacket.parse(await self.socket.receive_str())
            if packet.type is not EngineIOPacket.Type.OPEN:
                raise RuntimeError('Unexpected packet: %s' % packet)

            await self._on_packet(packet)

        except:
            await self.session.close()
            self.session = None
            raise

        self.runner = asyncio.create_task(self._run())

    async def close(self):
        """Close connection to server."""
        if self.runner:
            self.runner.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self.runner

        if self.socket:
            await self.socket.disconnect()

        if self.session:
            await self.session.disconnect()

        self.socket = None
        self.session = None
        self.runner = None

    async def _run(self):
        """Internal runner for consuming messages."""
        logger.debug('Runner starting')
        try:
            while True:
                now = time.monotonic()
                if self.ping_interval:
                    if now > self.last_ping + self.ping_interval:
                        await self.ping()

                    timeout = self.ping_interval - (now - self.last_ping)
                else:
                    timeout = None

                try:
                    msg = await self.socket.receive(timeout)
                except asyncio.TimeoutError:
                    continue

                if msg.type in (aiohttp.WSMsgType.CLOSE, aiohttp.WSMsgType.CLOSED):
                    break
                elif msg.type != aiohttp.WSMsgType.TEXT:
                    logger.warning('Unexpected WebSocket message type: %s', msg.type)
                else:
                    try:
                        packet = EngineIOPacket.parse(msg.data)
                    except ValueError as e:
                        logger.warning('Failed to parse packet: %s', e)
                        continue

                    await self._on_packet(packet)
        except Exception:
            logger.exception('Unhandled exception in runner')
        finally:
            logger.debug('Runner stopped')

    async def _on_packet(self, packet: EngineIOPacket):
        """
        Handle Engine.IO packet.

        :param packet: Decoded packet.
        """
        logger.debug('> %s %s', packet.type.name, packet.data)
        if packet.type is EngineIOPacket.Type.NOOP:
            pass
        elif packet.type is EngineIOPacket.Type.OPEN:
            handshake = json.loads(packet.data)
            self.sid = handshake['sid']
            self.ping_interval = handshake['pingInterval'] / SECOND_MS
            self.ping_timeout = handshake['pingTimeout'] / SECOND_MS
        elif packet.type is EngineIOPacket.Type.CLOSE:
            self.sid = None
            self.ping_interval = None
            self.ping_timeout = None
        elif packet.type is EngineIOPacket.Type.PING:
            await self.send_packet(EngineIOPacket(EngineIOPacket.Type.PONG))
        elif packet.type is EngineIOPacket.Type.PONG:
            # TODO: Handle ping timeout
            pass
        elif packet.type is EngineIOPacket.Type.MESSAGE:
            self.on_message(packet.data)
        elif packet.type is EngineIOPacket.Type.UPGRADE:
            self.on_upgrade(packet.data)
        else:
            logger.warning('Unhandled packet type: %s', packet.type.name)

    @staticmethod
    def on_message(data: str):
        """
        Called when a MESSAGE is received.

        :param data: Message data.
        """
        pass

    @staticmethod
    def on_upgrade(data: str):
        """
        Called when an UPGRADE packet is received.

        :param data: Packet data.
        """
        pass

    async def ping(self):
        """Send PING to server."""
        await self.send_packet(EngineIOPacket(EngineIOPacket.Type.PING))
        self.last_ping = time.monotonic()

    async def send_message(self, data: str):
        """
        Send MESSAGE to server.

        :param data: Message data.
        """
        await self.send_packet(EngineIOPacket(EngineIOPacket.Type.MESSAGE, data))

    async def send_packet(self, packet: EngineIOPacket):
        """
        Send low-level Engine.IO packet to server.

        :param packet: Engine.IO packet.
        """
        if not self.connected:
            raise RuntimeError('Not connected')

        logger.debug('< %s', packet)
        await self.socket.send_str(packet.encode())
