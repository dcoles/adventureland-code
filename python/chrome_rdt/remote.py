import asyncio
import contextlib
import itertools
import json
import logging

import aiohttp
import cdp
from pyee import AsyncIOEventEmitter

from chrome_rdt.typing import *

logger = logging.getLogger(__name__)


class Client:
    """Chrome Remote Debugging client."""

    DEFAULT_HOST = 'localhost'
    DEFAULT_PORT = 9222

    def __init__(self, host: Optional[str] = None, port: Optional[int] = None, *, loop: asyncio.AbstractEventLoop = None):
        self.host = host or self.DEFAULT_HOST
        self.port = port or self.DEFAULT_PORT
        self.loop = loop or asyncio.get_event_loop()
        self.http_session = aiohttp.ClientSession()

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        await self.disconnect()

    async def disconnect(self):
        """Disconnect from client."""
        if self.http_session:
            await self.http_session.close()
            self.http_session = None

    async def version(self) -> dict:
        """
        Get browser version metadata.

        See https://chromedevtools.github.io/devtools-protocol/#endpoints.
        """
        if not self.http_session:
            raise RuntimeError('Client has been disconnected')

        version_url = f'http://{self.host}:{self.port:d}/json/version'

        logger.debug('GET %s', version_url)
        resp = await self.http_session.get(version_url)
        resp.raise_for_status()

        return await resp.json()

    async def connect_to_browser(self) -> 'Target':
        """Connect to browser target."""
        if not self.http_session:
            raise RuntimeError('Not connected')

        version = await self.version()
        debugger_url = version['webSocketDebuggerUrl']

        return await Target.connect_to(self, debugger_url)

    async def connect_to_page(self, target_id: cdp.target.TargetID) -> 'Target':
        """Connect to page target."""
        if not self.http_session:
            raise RuntimeError('Not connected')

        url = f'ws://{self.host}:{self.port}/devtools/page/{target_id}'

        return await Target.connect_to(self, url)

    async def ws_connect(self, url):
        logger.debug('Connecting to %s', url)
        return await self.http_session.ws_connect(url)


class TargetError(Exception):
    """Exception from remote target."""
    def __init__(self, code: int, msg: str):
        self.code = code
        self.message = msg

    def __str__(self):
        return f'{self.message} (code: {self.code})'


class Target(AsyncIOEventEmitter):
    """DevTools target."""

    @classmethod
    async def connect_to(cls, client: Client, url: str) -> 'Target':
        """
        Connect to target.

        :param client: Remote debugging client.
        :param url: Target websocket URL.
        """
        websocket = await client.ws_connect(url)
        target = Target(client, websocket, url)
        await target._connect()

        return target

    def __init__(self, client: Client, websocket: aiohttp.ClientWebSocketResponse, url: str):
        super().__init__()

        self.client = client
        self.websocket = websocket
        self.url = url
        self._reader: Optional[asyncio.Task] = None
        self._requests: Dict[int, asyncio.Future] = {}
        self._request_id_counter = itertools.count()

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        await self.disconnect()

    async def _connect(self):
        """Connect to socket and begin reading messages."""
        if not self._reader:
            self._reader = asyncio.create_task(self._read())

    async def _read(self):
        """Read messages from socket."""
        try:
            logger.debug('Enter Task._read for %s', self.url)
            while self.websocket:
                await self._read_once()
        except Exception:
            logger.exception('Unhandled exception in Task._read for %s', self.url)
        finally:
            logger.debug('Exit Task._read for %s', self.url)

    async def _read_once(self):
        """Read single message from socket."""
        msg = await self.websocket.receive()
        if msg.type in {aiohttp.WSMsgType.CLOSE, aiohttp.WSMsgType.CLOSING, aiohttp.WSMsgType.CLOSED}:
            await self.websocket.close()
            self.websocket = None
            return

        if msg.type is not aiohttp.WSMsgType.TEXT:
            logger.warning('Got unexpected message type: %s', msg.type)
            return

        response = json.loads(msg.data)
        logger.debug('> %s', response)

        if 'id' in response:
            error = response.get('error')
            if error:
                self._requests[response['id']].set_exception(
                    TargetError(error['code'], error['message']))
            else:
                self._requests[response['id']].set_result(response['result'])
        else:
            event = cdp.util.parse_json_event(response)
            try:
                self.emit(response['method'], event)
            except Exception:
                logger.exception('Exception in event handler')

    async def disconnect(self):
        """Disconnect from target."""
        if self.websocket:
            await self.websocket.disconnect()
            self.websocket = None

        if self._reader:
            self._reader.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._reader
            self._reader = None

    T = TypeVar('T')

    async def __call__(self, method: Generator[JSONDict, JSONDict, T]) -> T:
        """
        Call remote method.

        :param method: Method to call (e.g. `cdt.page.navigate("https://example.com")`).
        :returns: Method result.
        :raises TargetError: If method threw an exception.
        """
        if not self.websocket:
            raise RuntimeError('Not connected')

        request = next(method)
        request['id'] = next(self._request_id_counter)

        future_response = self.client.loop.create_future()
        self._requests[request['id']] = future_response

        logger.debug('< %s', request)
        await self.websocket.send_str(json.dumps(request))

        response = await future_response
        try:
            method.send(response)
        except StopIteration as stop:
            return stop.value
