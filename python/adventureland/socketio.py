import asyncio
import collections
import functools
import json
import logging
import re
from dataclasses import dataclass
from enum import Enum
from typing import *

from adventureland import engineio

JSON = Union[None, int, float, str, bool, List, Dict]

logger = logging.getLogger(__name__)


@dataclass
class SocketIOPacket:
    """
    See https://github.com/socketio/socket.io-protocol/tree/v3.
    """
    class Type(Enum):
        CONNECT = 0
        DISCONNECT = 1
        EVENT = 2
        ACK = 3
        ERROR = 4
        BINARY_EVENT = 5
        BINARY_ACK = 6

    type: Type
    data: Optional[List[JSON]] = None
    id: Optional[int] = None
    namespace: str = '/'
    n_attachments: int = 0

    PACKET_RE = re.compile(
        r'^(?P<type>\d)(?:(?P<nbin>\d)-)?(?:(?P<nsp>/[^,]*),)?(?P<id>\d+)?(?P<data>.+)?$',
        re.DOTALL)

    @classmethod
    def parse(cls, data: str) -> 'SocketIOPacket':
        """
        Parse packet data.

        :param data: Raw packet data.
        """
        m = cls.PACKET_RE.match(data)
        if not m:
            raise ValueError('Malformed packet')

        msg_type = SocketIOPacket.Type(int(m['type']))
        data = json.loads(m['data']) if m['data'] is not None else None
        msg_id = int(m['id']) if m['id'] is not None else None
        namespace = m['nsp'] or '/'
        n_attachments = int(m['nbin']) if m['nbin'] else 0

        return cls(msg_type, data, msg_id, namespace, n_attachments)

    def encode(self) -> str:
        """
        Encode packet.
        """
        fields = [str(self.type.value)]
        if self.data:
            fields.append(json.dumps(self.data))

        return ''.join(fields)

    def __str__(self):
        return f'{self.type.name} {self.data}' if self.data else self.type.name


class SocketIO:
    """
    Socket.IO client.
    """
    VERSION = 3
    DEFAULT_PATH = '/socket.io'

    def __init__(self, url: str, *, path: str = None, **options):
        """
        Create new Socket.IO client.

        :param url: Server URL.
        :param path: Socket path (default: "/socket.io").
        :param options: Additional Engine.IO options.
        """
        path = path or self.DEFAULT_PATH
        self.engine = engineio.EngineIO(url, path=path, **options)
        self.engine.on_message = self._feed_packet
        self._handlers = collections.defaultdict(set)
        self._loop = asyncio.get_event_loop()

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        await self.close()

    def _feed_packet(self, data: str):
        """
        Feed packet data to the client.

        :param data: Packet data.
        """
        try:
            packet = SocketIOPacket.parse(data)
        except ValueError as e:
            logger.warning('Failed to parse packet: %s', e)
            return

        logger.debug('> %s', packet)
        if packet.type is SocketIOPacket.Type.CONNECT:
            self.dispatch_event('connect')
        elif packet.type is SocketIOPacket.Type.DISCONNECT:
            self.dispatch_event('disconnect')
        elif packet.type is SocketIOPacket.Type.EVENT:
            event_name, *event_data = packet.data
            self.dispatch_event(event_name, *event_data)
        elif packet.type is SocketIOPacket.Type.ACK:
            logger.warning('Acknowledgement not implemented')
        elif packet.type is SocketIOPacket.Type.ERROR:
            self.dispatch_event('error', packet.data)
            logger.error('Error: %s', packet.data)
        elif packet.type is SocketIOPacket.Type.BINARY_EVENT:
            logger.warning('Binary attachments not implemented')
        elif packet.type is SocketIOPacket.Type.BINARY_ACK:
            logger.warning('Binary attachments not implemented')
        else:
            logger.warning('Unknown packet type: %s', packet.type)

    def dispatch_event(self, event_name: str, *args: JSON):
        """
        Dispatch an event.

        :param event_name: Name of event.
        :param args: Event arguments.
        """
        if event_name not in self._handlers:
            return

        # make a copy of the handlers, since they may change during iteration
        for on_event in list(self._handlers[event_name]):
            try:
                on_event(*args)
            except Exception:
                logger.exception('Exception in event callback')

    def add_event_listener(self, event_name: str, on_event: Callable, once=False):
        """
        Register event handler.

        :param event_name: Name of event to listen for.
        :param on_event: New event listener.
        :param once: If true, this event will only fire once.
        """
        if once:
            def on_event_once(*args):
                try:
                    on_event(*args)
                finally:
                    self.remove_event_listener(event_name, on_event_once)

            self._handlers[event_name].add(on_event_once)
        else:
            self._handlers[event_name].add(on_event)

    def remove_event_listener(self, event_name: str, on_event: Callable):
        """
        Remove event listener.

        :param event_name: Name of event listened for.
        :param on_event: Previously registered event listener.
        """
        self._handlers[event_name].remove(on_event)

    def on(self, event_name: str) -> Callable:
        """
        Decorator for registering an event listener.

        :param event_name: Name of event to listen for.
        """
        return functools.partial(self.add_event_listener, event_name)

    def once(self, event_name: str) -> Callable:
        """
        Decorator for registering a single-shot event listener.

        :param event_name: Name of event to listen for.
        """
        return functools.partial(self.add_event_listener, event_name, once=True)

    async def next_event(self, event_name: str = None) -> List[JSON]:
        """
        Wait for the next event.

        :param event_name: Name of event.
        :return: Event data.
        """
        future = self._loop.create_future()

        @self.once(event_name)
        def on_event(*args):
            future.set_result(list(args))

        return await future

    async def connect(self):
        """
        Connect to server.
        """
        if not self.engine.connected:
            await self.engine.connect()

    async def close(self):
        """
        Close connection.
        """
        await self.engine.close()

    async def emit(self, event_name: str, *args: JSON):
        """
        Emit an event.

        :param event_name: Name of event.
        :param args: Event arguments.
        """
        await self.send_packet(SocketIOPacket(SocketIOPacket.Type.EVENT, [event_name, *args]))

    async def send_packet(self, packet: SocketIOPacket):
        """
        Send low-level Socket.IO packet to server.

        :param packet: Socket.IO packet.
        """
        logger.debug('< %s', packet)
        await self.engine.send_message(packet.encode())


async def connect(url: str, **options) -> SocketIO:
    """
    Connect to SocketIO server.

    :param url: Server URL.
    :param options: Additional options.
    :return: New SocketIO client.
    """
    sock = SocketIO(url, **options)
    await sock.connect()
    return sock
