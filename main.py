#!/usr/bin/env python3
"""
main.py — guidenco.

Captures a machine's HDMI output and presents itself to that machine as a USB
keyboard and mouse, exposing both over a small HTTP API. Nothing is installed
on the target.

    GET  /openapi.json   the whole API, for discovery
    GET  /screenshot     what the target is showing
    POST /click,/type    drive it
"""

import logging
import signal
import sys
import threading

import config
import hid
from api import serve
from capture import get_manager

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)

logger = logging.getLogger("guidenco")


def _track_screen_size(framebuffer) -> None:
    """
    Keep hid/ told what pixel space API coordinates are in.

    The capture resolution follows the HDMI source, so it can change while
    running — a target that switches mode must not silently start receiving
    clicks scaled to the old geometry.
    """
    last = None
    sequence = 0
    while True:
        # Block until a NEW frame arrives. Calling latest() here would return
        # instantly once any frame existed, turning this into a spin loop that
        # burns a whole core.
        _, sequence = framebuffer.next_after(sequence, timeout=30.0)
        current = (framebuffer.width, framebuffer.height)
        if current != last and all(current):
            hid.set_screen(*current)
            if last is not None:
                logger.info("[main] screen size changed %s -> %s", last, current)
            last = current


def main() -> None:
    manager = get_manager()
    manager.start()
    hid.init()

    framebuffer = manager.framebuffer
    threading.Thread(target=_track_screen_size, args=(framebuffer,),
                     daemon=True, name="screen-size").start()

    server = serve(framebuffer, host=config.API_HOST, port=config.API_PORT)

    def shutdown(signum, frame):
        logger.info("[main] shutting down")
        server.shutdown()
        manager.stop()
        hid.cleanup()
        sys.exit(0)

    signal.signal(signal.SIGTERM, shutdown)
    signal.signal(signal.SIGINT, shutdown)
    server.serve_forever()


if __name__ == "__main__":
    main()
