"""
api/server.py — the HTTP surface.

Two things share one port:

  /mcp        Model Context Protocol, which is how an agent drives the machine.
  GET /...    a small read-only surface for humans — a screenshot, a browser
              stream, and a health check you can curl when something breaks.

Actions live only behind MCP. Keeping a second write path to the same hardware
would mean two sets of validation to keep in step for no one's benefit.

Screenshots are the capture device's own JPEG, passed through untouched, so an
idle service does no work at all.

Built on http.server, which is enough for a handful of clients and keeps the
dependency count at zero.
"""

import json
import logging
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import config
import hid
from . import netinfo
from .mcp import McpEndpoint, origin_allowed, protocol_version_ok
from .openapi import build_spec

logger = logging.getLogger("guidenco.api")

MAX_BODY_BYTES = 64 * 1024
STREAM_BOUNDARY = "guidencoframe"

#: Paths reachable without a token, so a client can discover the service before
#: it has been given credentials. Neither reveals anything about the target.
PUBLIC_PATHS = {"/", "/openapi.json"}

MCP_PATH = "/mcp"


class ApiError(Exception):
    def __init__(self, status: int, message: str) -> None:
        super().__init__(message)
        self.status = status
        self.message = message


class Handler(BaseHTTPRequestHandler):
    server_version = "guidenco"
    protocol_version = "HTTP/1.1"

    # ── Plumbing ──────────────────────────────────────────────────────────────

    def log_message(self, fmt, *args):
        logger.info("[api] %s %s", self.address_string(), fmt % args)

    @property
    def framebuffer(self):
        return self.server.framebuffer

    def _authorised(self, path: str) -> bool:
        if not config.API_TOKEN or path in PUBLIC_PATHS:
            return True
        header = self.headers.get("Authorization", "")
        scheme, _, value = header.partition(" ")
        return scheme.lower() == "bearer" and value.strip() == config.API_TOKEN

    def _send(self, status: int, body: bytes, content_type: str,
              extra: dict | None = None) -> None:
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        for key, value in (extra or {}).items():
            self.send_header(key, value)
        self.end_headers()
        try:
            self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def _json(self, status: int, payload: dict) -> None:
        self._send(status, json.dumps(payload, indent=2).encode() + b"\n",
                   "application/json")

    def _fail(self, status: int, message: str) -> None:
        self._json(status, {"error": message})

    # ── Routing ───────────────────────────────────────────────────────────────

    def do_GET(self):
        path = self.path.split("?", 1)[0].rstrip("/") or "/"
        if not self._authorised(path):
            return self._fail(401, "missing or invalid bearer token")
        try:
            if path == "/":
                return self._json(200, self._index())
            if path == "/openapi.json":
                return self._send(200, json.dumps(build_spec(), indent=2).encode(),
                                  "application/json")
            if path == "/health":
                return self._json(200, self._health())
            if path == "/screenshot":
                return self._screenshot()
            if path == "/stream":
                return self._stream()
            if path == MCP_PATH:
                # The transport allows a server to decline an SSE stream, and we
                # have no server-initiated messages to send.
                return self._fail(405, "this MCP endpoint does not offer an SSE stream")
            return self._fail(404, f"no such endpoint: {path}")
        except ApiError as exc:
            return self._fail(exc.status, exc.message)
        except Exception:
            logger.exception("[api] GET %s failed", path)
            return self._fail(500, "internal error")

    def do_POST(self):
        path = self.path.split("?", 1)[0].rstrip("/") or "/"
        if path != MCP_PATH:
            return self._fail(404, f"no such endpoint: {path}. Actions live at {MCP_PATH}.")
        if not origin_allowed(self.headers.get("Origin")):
            # Required by the transport spec: without it a hostile web page
            # could reach this LAN address and drive the target machine.
            return self._fail(403, "origin not allowed")
        if not protocol_version_ok(self.headers.get("MCP-Protocol-Version")):
            return self._fail(400, "unsupported MCP-Protocol-Version")
        if not self._authorised(path):
            return self._fail(401, "missing or invalid bearer token")
        try:
            length = int(self.headers.get("Content-Length") or 0)
            if length > MAX_BODY_BYTES:
                return self._fail(413, "request body too large")
            body = self.rfile.read(length) if length else b""
            status, extra, payload = self.server.mcp.handle_post(body, self.headers)
        except Exception:
            logger.exception("[mcp] request failed")
            return self._fail(500, "internal error")
        if payload is None:
            self.send_response(status)
            self.send_header("Content-Length", "0")
            for key, value in extra.items():
                self.send_header(key, value)
            self.end_headers()
            return
        self._send(status, payload, "application/json", extra)

    def do_DELETE(self):
        path = self.path.split("?", 1)[0].rstrip("/") or "/"
        if path != MCP_PATH:
            return self._fail(404, f"no such endpoint: {path}")
        if not self._authorised(path):
            return self._fail(401, "missing or invalid bearer token")
        status, extra, _ = self.server.mcp.handle_delete(self.headers)
        self.send_response(status)
        self.send_header("Content-Length", "0")
        for key, value in extra.items():
            self.send_header(key, value)
        self.end_headers()

    # ── Read endpoints ────────────────────────────────────────────────────────

    def _index(self) -> dict:
        return {
            "service": "guidenco",
            "description": "See and control a machine through its HDMI output "
                           "and a USB HID gadget.",
            "mcp": MCP_PATH,
            "openapi": "/openapi.json",
            "read_endpoints": ["/screenshot", "/stream", "/health"],
            "authentication": "bearer token required" if config.API_TOKEN else "open",
            "tunnel": self.server.tunnel_url,
        }

    def _health(self) -> dict:
        fb = self.framebuffer
        return {
            "status": "ok" if fb.ready else "waiting for capture",
            "capture": {
                "ready": fb.ready,
                "width": fb.width,
                "height": fb.height,
                "active_area": dict(zip(("x", "y", "width", "height"), fb.active)),
                "frames": fb.sequence,
                "source": config.CAPTURE_TYPE,
                "device": config.VIDEO_DEV,
            },
            "input": hid.status(),
            "network": netinfo.describe(),
            "tunnel": self.server.tunnel_url,
            "uptime_seconds": round(time.monotonic() - self.server.started_at, 1),
        }

    def _screenshot(self) -> None:
        frame, _ = self.framebuffer.latest(timeout=5.0)
        if frame is None:
            raise ApiError(503, "no frame captured yet — is an HDMI source connected?")
        self._send(200, frame, "image/jpeg", {
            "X-Screen-Width": str(self.framebuffer.width),
            "X-Screen-Height": str(self.framebuffer.height),
        })

    def _stream(self) -> None:
        """MJPEG over multipart, which any browser renders natively."""
        self.send_response(200)
        self.send_header("Content-Type",
                         f"multipart/x-mixed-replace; boundary={STREAM_BOUNDARY}")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        sequence = 0
        try:
            while True:
                frame, sequence = self.framebuffer.next_after(
                    sequence, timeout=config.STREAM_TIMEOUT_S)
                if frame is None:
                    break                      # capture stalled; let the client retry
                self.wfile.write(
                    f"--{STREAM_BOUNDARY}\r\nContent-Type: image/jpeg\r\n"
                    f"Content-Length: {len(frame)}\r\n\r\n".encode())
                self.wfile.write(frame)
                self.wfile.write(b"\r\n")
        except (BrokenPipeError, ConnectionResetError):
            pass                               # viewer closed the tab


class ApiServer(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True

    def __init__(self, framebuffer, host: str, port: int) -> None:
        super().__init__((host, port), Handler)
        self.framebuffer = framebuffer
        self.mcp = McpEndpoint(framebuffer)
        self.started_at = time.monotonic()
        #: Set by the tunnel once Cloudflare hands us a public hostname.
        self.tunnel_url: str | None = None


def serve(framebuffer, host: str = "0.0.0.0", port: int = 8080) -> ApiServer:
    server = ApiServer(framebuffer, host, port)
    if config.API_TOKEN:
        logger.info("[api] listening on %s:%d — MCP at %s (bearer token required)",
                    host, server.server_port, MCP_PATH)
    else:
        logger.warning("[api] listening on %s:%d with NO TOKEN — anyone who can reach "
                       "this port can control the target machine. Set API_TOKEN.",
                       host, server.server_port)
    return server
