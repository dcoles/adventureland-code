from typing import Optional

import cdp

from chrome_rdt import remote
from chrome_rdt.page import Page


class Browser:
    """Web browser"""

    @classmethod
    async def connect_to(cls, host: Optional[str] = None, port: Optional[int] = None):
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
        await self.client.disconnect()

    def __init__(self, client: remote.Client, target: remote.Target):
        """
        Create new browser instance.

        :param client: Remote client.
        :param target: Browser target.
        """
        self.client = client
        self.target = target
        self._page_targets = set()

    async def disconnect(self):
        """Disconnect from Browser."""
        if self.client:
            await self.client.disconnect()

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


