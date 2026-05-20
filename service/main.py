#!/usr/bin/env python3
"""
main.py — Guidenco Pi service entry point.

Starts the capture card reader and the cloud relay WebSocket client.
All agent / LLM logic runs in the web server — the Pi is pure I/O.
"""

import logging
import signal
import sys

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)

logger = logging.getLogger("guidenco")


def main():
    from capture import get_manager
    from ws_client import start_in_thread
    from actions import cleanup

    # Start capture card reader
    mgr = get_manager()
    mgr.start()
    logger.info("[main] capture manager started")

    # Connect to cloud relay
    start_in_thread()
    logger.info("[main] relay started — waiting for commands")

    def _shutdown(sig, frame):
        logger.info("[main] shutting down")
        mgr.stop()
        cleanup()
        sys.exit(0)

    signal.signal(signal.SIGTERM, _shutdown)
    signal.signal(signal.SIGINT,  _shutdown)

    # Block main thread
    signal.pause()


if __name__ == "__main__":
    main()
