#!/usr/bin/env python3
"""
main.py — guidenco VNC bridge.

Reads HDMI from a capture device, serves it on port 5900 as a standard VNC
screen, and replays incoming mouse and keyboard events to the target machine
over the USB HID gadget. Nothing else.

Connect with any VNC client, or point an agent at it with mcp-vnc:
https://github.com/hrrrsn/mcp-vnc
"""

import logging
import signal
import sys

import config
import hid
from capture import get_manager
from rfb import VncServer

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)

logger = logging.getLogger("guidenco")


def main() -> None:
    manager = get_manager()
    manager.start()

    hid.init()

    server = VncServer(
        framebuffer=manager.framebuffer,
        input_handler=hid,
        host=config.VNC_HOST,
        port=config.VNC_PORT,
        password=config.VNC_PASSWORD,
        max_clients=config.VNC_MAX_CLIENTS,
        name=config.VNC_NAME,
    )

    def shutdown(signum, frame):
        logger.info("[main] shutting down")
        server.stop()
        manager.stop()
        hid.cleanup()
        sys.exit(0)

    signal.signal(signal.SIGTERM, shutdown)
    signal.signal(signal.SIGINT, shutdown)

    server.start()
    server.serve_forever()


if __name__ == "__main__":
    main()
