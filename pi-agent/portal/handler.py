# pi-agent/portal/handler.py
"""
HTTP request handler for the Guidenco captive portal.

Serves the setup UI on / and handles:
  GET  /scan     — list nearby WiFi networks
  POST /connect  — connect to WiFi + register device + return pairing code
  GET  /status   — internet connectivity check (polled by UI)

All other paths (captive portal detection probes from iOS/Android/Windows)
receive a 302 → http://192.168.4.1/ which triggers the system portal popup.
"""
import http.server
import json
import logging
import os
import subprocess
import threading

from .cloud import register, poll_until_claimed
from .wifi import scan, connect

logger = logging.getLogger("guidenco.portal.handler")

_INDEX = os.path.join(os.path.dirname(__file__), "index.html")
_PORTAL_IP = "192.168.4.1"

# Paths this server owns — anything else triggers captive portal redirect
_KNOWN_PATHS = {"/", "/scan", "/connect", "/status"}


class PortalHandler(http.server.BaseHTTPRequestHandler):
    # Set by captive.py before the server starts
    cloud_url: str = "https://guidenco.app"
    teardown_cb = None   # called with no args once device is claimed

    # ── logging ──────────────────────────────────────────────────────────────
    def log_message(self, fmt, *args):
        logger.debug(fmt, *args)

    # ── helpers ───────────────────────────────────────────────────────────────
    def _redirect(self, to: str = "/") -> None:
        self.send_response(302)
        self.send_header("Location", f"http://{_PORTAL_IP}{to}")
        self.send_header("Content-Length", "0")
        self.end_headers()

    def _json(self, data: dict, status: int = 200) -> None:
        body = json.dumps(data).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _is_captive_probe(self) -> bool:
        """True if this request looks like an OS captive-portal probe."""
        path = self.path.split("?")[0]
        return path not in _KNOWN_PATHS

    # ── GET ───────────────────────────────────────────────────────────────────
    def do_GET(self) -> None:
        path = self.path.split("?")[0]

        if self._is_captive_probe():
            self._redirect()
            return

        if path == "/":
            with open(_INDEX, "rb") as fh:
                body = fh.read()
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        elif path == "/scan":
            self._json({"networks": scan()})

        elif path == "/status":
            r = subprocess.run(["ping", "-c1", "-W2", "1.1.1.1"],
                               capture_output=True, timeout=5)
            self._json({"internet": r.returncode == 0})

    # ── POST ──────────────────────────────────────────────────────────────────
    def do_POST(self) -> None:
        if self.path != "/connect":
            self.send_response(404)
            self.end_headers()
            return

        length = int(self.headers.get("Content-Length", 0))
        try:
            body = json.loads(self.rfile.read(length))
        except Exception:
            self._json({"ok": False, "error": "Bad request"}, 400)
            return

        ssid: str = body.get("ssid", "").strip()
        password: str = body.get("password", "")

        if not ssid:
            self._json({"ok": False, "error": "SSID is required"}, 400)
            return

        logger.info(f"Attempting to connect to '{ssid}'")

        if not connect(ssid, password):
            self._json({"ok": False,
                        "error": "Could not connect. Check your password and try again."})
            return

        try:
            device_id, code = register(self.cloud_url)
        except Exception:
            logger.exception("Cloud registration failed")
            self._json({"ok": False,
                        "error": "Connected to WiFi but cloud registration failed. Please retry."})
            return

        self._json({"ok": True, "code": code})

        # Poll for claim in background so the response is returned immediately
        threading.Thread(
            target=poll_until_claimed,
            args=(self.cloud_url, device_id, self._on_claimed),
            daemon=True,
        ).start()

    def _on_claimed(self, token: str) -> None:
        logger.info("Device claimed — calling teardown")
        if self.teardown_cb:
            try:
                self.teardown_cb()
            except Exception:
                logger.exception("Teardown callback failed")
