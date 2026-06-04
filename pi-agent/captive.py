#!/usr/bin/env python3
"""
captive.py — Guidenco boot orchestrator.

Runs as a one-shot systemd service before guidenco.service.
Checks for internet connectivity; if none, starts the captive portal
so the user can configure WiFi and pair the device from a phone.
"""
import http.server
import logging
import os
import subprocess
import sys
import time

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] guidenco.captive: %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger("guidenco.captive")

INTERNET_TIMEOUT = 30        # seconds to wait for internet on boot
PING_HOSTS = ("1.1.1.1", "8.8.8.8")
HOTSPOT_SCRIPT = os.path.join(os.path.dirname(__file__), "portal", "hotspot.sh")
CLOUD_URL = os.environ.get("CLOUD_URL", "https://guidenco.app")


def _ping_ok(host: str) -> bool:
    r = subprocess.run(["ping", "-c1", "-W2", host],
                       capture_output=True, timeout=5)
    return r.returncode == 0


def check_internet(timeout: int = INTERNET_TIMEOUT) -> bool:
    logger.info(f"Checking internet ({timeout}s timeout)…")
    deadline = time.time() + timeout
    while time.time() < deadline:
        for host in PING_HOSTS:
            if _ping_ok(host):
                logger.info(f"Internet OK (reached {host})")
                return True
        time.sleep(3)
    logger.warning("No internet detected")
    return False


def run_hotspot(action: str) -> None:
    subprocess.run(["bash", HOTSPOT_SCRIPT, action], check=True)


def run_portal() -> None:
    from portal.handler import PortalHandler

    server = http.server.HTTPServer(("0.0.0.0", 80), PortalHandler)

    def _teardown():
        logger.info("Tearing down hotspot…")
        run_hotspot("stop")
        server.shutdown()   # unblocks serve_forever() below

    PortalHandler.cloud_url = CLOUD_URL
    PortalHandler.teardown_cb = _teardown

    logger.info("Captive portal listening on :80")
    server.serve_forever()   # blocks until _teardown calls server.shutdown()


if __name__ == "__main__":
    if check_internet():
        logger.info("Internet available — captive portal not needed")
        sys.exit(0)

    logger.info("Starting captive portal…")
    try:
        run_hotspot("start")
        run_portal()   # blocks until device is claimed
    except Exception:
        logger.exception("Portal error")
        run_hotspot("stop")
        sys.exit(1)

    logger.info("Setup complete")
    sys.exit(0)
