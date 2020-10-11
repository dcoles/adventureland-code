import asyncio
import logging
import shutil
import tempfile
from pathlib import Path
from typing import Optional, Tuple

import aiohttp
import cdp

from chrome_rdt import remote
from chrome_rdt.page import Page

logger = logging.getLogger(__name__)


class BrowserProcess:
    """Chrome browser process."""
    TERMINATE_TIMEOUT = 5  # sec
    DEVTOOLS_ACTIVE_PORT_FILENAME = 'DevToolsActivePort'

    @classmethod
    async def launch(cls, path: Path, headless=True):
        """
        Launch a new browser instance with debugging enabled.

        :path: Path to chrome executable.
        :headless: If set to True, run headless in the background.
        """
        temp_dir = Path(tempfile.mkdtemp('.chrome'))
        args = [
            '--disable-background-timer-throttling',
            '--disable-breakpad',
            '--enable-automation',
            '--no-first-run',
            '--remote-debugging-port=0',
            f'--user-data-dir={temp_dir}',
        ]
        if headless:
            args.extend(['--headless', '--hide-scrollbars', '--mute-audio'])
        args.append('about:blank')

        try:
            process = await asyncio.create_subprocess_exec(path, *args)
        except OSError:
            shutil.rmtree(temp_dir, True)
            raise

        return cls(process, temp_dir)

    def __init__(self, process: asyncio.subprocess.Process, temp_dir: Path):
        """
        :param process: Process handle.
        :param temp_dir: Temporary directory for user-data (will be deleted on process exit).
        """
        self.process = process
        self.temp_dir = temp_dir

    async def terminate(self):
        """Terminate the browser process and cleanup userdata."""
        if self.process:
            self.process.terminate()
            try:
                await asyncio.wait_for(self.process.wait(), self.TERMINATE_TIMEOUT)
            except asyncio.TimeoutError:
                self.process.kill()

            self.process = None

        if self.temp_dir:
            while True:
                try:
                    shutil.rmtree(self.temp_dir)
                except OSError as e:
                    # On Windows crash-pad might still be using the user directory.
                    # See https://github.com/GoogleChrome/puppeteer/issues/2778.
                    # If so, just try again after a second
                    logger.warning(e)
                    await asyncio.sleep(1)
                else:
                    break

            self.temp_dir = None

    async def wait_for_devtools_port(self) -> Tuple[int, str]:
        """Wait for userdata port to be available."""
        port_path = self.temp_dir / self.DEVTOOLS_ACTIVE_PORT_FILENAME
        while True:
            try:
                contents = port_path.read_text()
            except FileNotFoundError:
                pass
            else:
                break

            await asyncio.sleep(0.250)

        lines = contents.splitlines()
        port = int(lines[0])
        browser_path = lines[1]
        return port, browser_path


class Browser:
    """Web browser."""
    LAUNCH_TIMEOUT = 30  # sec

    @classmethod
    async def launch(cls, path: Path) -> 'Browser':
        """Launch a new browser instance and connect to it."""
        process = await BrowserProcess.launch(path)
        try:
            port, _ = await asyncio.wait_for(process.wait_for_devtools_port(), cls.LAUNCH_TIMEOUT)
        except asyncio.TimeoutError:
            await process.terminate()
            raise

        client = remote.Client(port=port)
        try:
            target = await client.connect_to_browser()
        except aiohttp.ClientError:
            await client.disconnect()
            await process.terminate()
            raise

        return cls(client, target, process=process)

    @classmethod
    async def connect_to(cls, host: Optional[str] = None, port: Optional[int] = None) -> 'Browser':
        """
        Connect to browser.

        :param host: hostname (default: "localhost")
        :param port: port (default: 9222)
        """
        client = remote.Client(host, port)
        target = await client.connect_to_browser()

        return cls(client, target)

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        await self.disconnect()

    def __init__(self, client: remote.Client, target: remote.Target, process: Optional[BrowserProcess] = None):
        """
        Create new browser instance.

        :param client: Remote client.
        :param target: Browser target.
        """
        self.client = client
        self.target = target
        self.process = process
        self._page_targets = set()

    async def disconnect(self):
        """Disconnect from Browser."""
        if self.client:
            await self.client.disconnect()

        if self.process:
            await self.process.terminate()
            self.process = None

    async def new_page(self, url: Optional[str] = None) -> Page:
        """
        Open a new page.

        :param url: URL to open in new page (default: "about:blank").
        :returns: New page.
        """
        url = url or 'about:blank'
        target_id = await self.target(cdp.target.create_target(url))

        target = await self.client.connect_to_page(target_id)

        return Page(target)

    async def close(self):
        """Close the browser."""
        await self.target(cdp.browser.close())
        await self.client.disconnect()
