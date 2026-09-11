#!/usr/bin/env python3
"""
main.py — guidenco.

Captures a machine's HDMI output and presents itself to that machine as a USB
keyboard and mouse, exposing both over a small HTTP API. Nothing is installed
on the target.

    POST /mcp            Model Context Protocol — how an agent drives it
    GET  /screenshot     what the target is showing
    GET  /stream         the same, live, in a browser
    GET  /health         capture, input and network state
"""

import logging
import signal
import sys
import threading

import config
import hid
from api import serve
from api.tunnel import Tunnel
from ble import SetupService
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

    Both the capture resolution and the letterboxing can change while running —
    the source switches display mode, or goes from mirrored to extended — and a
    target that changes geometry must not silently start receiving clicks
    mapped to the old one.
    """
    last = None
    sequence = 0
    while True:
        # Block until a NEW frame arrives. Calling latest() here would return
        # instantly once any frame existed, turning this into a spin loop that
        # burns a whole core.
        _, sequence = framebuffer.next_after(sequence, timeout=30.0)
        current = (framebuffer.width, framebuffer.height, framebuffer.active)
        if current != last and all(current[:2]):
            hid.set_screen(current[0], current[1], current[2])
            if last is not None:
                if current[:2] != last[:2]:
                    logger.info("[main] screen size changed %s -> %s",
                                last[:2], current[:2])
                if current[2] != last[2]:
                    logger.info("[main] active screen area changed %s -> %s",
                                last[2], current[2])
            last = current


def _setup_state(framebuffer, server):
    """What the Bluetooth setup page shows: where we are and how to reach us."""
    def state():
        from api import netinfo
        network = netinfo.describe()
        return {
            "host": network["hostname"],
            "net": network["type"],
            "ssid": network["ssid"],
            "ip": network["address"],
            "signal": network["signal_dbm"],
            "url": server.tunnel_url,
            "screen": [framebuffer.width, framebuffer.height] if framebuffer.ready else None,
            "input": hid.available(),
        }
    return state


def main() -> None:
    manager = get_manager()
    manager.start()
    hid.init()

    framebuffer = manager.framebuffer
    threading.Thread(target=_track_screen_size, args=(framebuffer,),
                     daemon=True, name="screen-size").start()

    server = serve(framebuffer, host=config.API_HOST, port=config.API_PORT)

    tunnel = None
    if config.TUNNEL_ENABLED:
        if not config.API_TOKEN:
            # Refusing is the whole point: a tunnel without a token publishes
            # keyboard and mouse control of the target machine to the internet.
            logger.error("[main] TUNNEL_ENABLED is on but API_TOKEN is empty. "
                         "Refusing to open a public tunnel to an unauthenticated "
                         "service. Set API_TOKEN in /etc/guidenco/config.env.")
        else:
            tunnel = Tunnel(server.server_port,
                            on_url=lambda url: setattr(server, "tunnel_url", url))
            tunnel.start()

    setup = None
    if config.BLE_ENABLED:
        setup = SetupService(_setup_state(framebuffer, server), config.BLE_NAME)
        setup.start()

    def shutdown(signum, frame):
        logger.info("[main] shutting down")
        if tunnel:
            tunnel.stop()
        server.shutdown()
        manager.stop()
        hid.cleanup()
        sys.exit(0)

    signal.signal(signal.SIGTERM, shutdown)
    signal.signal(signal.SIGINT, shutdown)
    server.serve_forever()


if __name__ == "__main__":
    main()
