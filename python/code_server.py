#!/usr/bin/env python3
"""
HTTP server for hosting Adventure Land code.

This can be used as an alternative to always running VSCode.
"""
import argparse
import logging
from pathlib import Path, PurePosixPath

from aiohttp import web

DEFAULT_HOST = '127.0.0.1'
DEFAULT_PORT = 5500
ALLOWED_ORIGIN = 'https://adventure.land'

BASE_DIR = (Path(__file__) / '..' / '..').resolve()
SOURCE_DIR = BASE_DIR / 'src'

routes = web.RouteTableDef()


@routes.get('/{path:.*}')
def static(request: web.Request) -> web.FileResponse:
    path = PurePosixPath(request.match_info['path'])

    try:
        full_path = (SOURCE_DIR / path).resolve(strict=True)
        # Path must be under source directory
        path = full_path.relative_to(SOURCE_DIR)
    except ValueError as e:
        logging.warning('Bad request: %s', e)
        raise web.HTTPBadRequest()
    except FileNotFoundError:
        raise web.HTTPNotFound()

    headers = {
        'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
        'Cache-Control': 'no-cache',  # Always
    }

    return web.FileResponse(full_path, headers=headers)


def parse_args() -> argparse.Namespace:
    """Parse command-line arguments."""
    parser = argparse.ArgumentParser()
    parser.add_argument('--host', default=DEFAULT_HOST)
    parser.add_argument('--port', default=DEFAULT_PORT)
    return parser.parse_args()


def main():
    logging.basicConfig(level=logging.INFO)
    args = parse_args()

    app = web.Application()
    app.add_routes(routes)
    web.run_app(app, host=args.host, port=args.port)


if __name__ == '__main__':
    main()
