import cdp

from chrome_rdt import remote


class Page:
    """Page opened in Browser."""
    def __init__(self, target: remote.Target):
        self.target = target

    async def goto(self, url: str):
        await self.target(cdp.page.navigate(url))
