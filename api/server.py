"""
api/server.py — the HTTP control surface.

Screenshots are served as the capture device's own JPEG, passed through
untouched, so an idle service does no work at all. Input arrives as intent
("click here", "type this") and hid/ turns it into HID reports.

Built on http.server, which is enough for a handful of clients on a LAN and
keeps the dependency count at zero.
"""

import json
import logging
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import config
import hid
from . import netinfo
from .openapi import build_spec

logger = logging.getLogger("guidenco.api")

MAX_BODY_BYTES = 64 * 1024
STREAM_BOUNDARY = "guidencoframe"

#: Paths reachable without a token, so an agent can discover the API before it
#: has been given credentials. Neither reveals anything about the target.
PUBLIC_PATHS = {"/", "/openapi.json"}


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

    def _read_json(self) -> dict:
        length = int(self.headers.get("Content-Length") or 0)
        if length > MAX_BODY_BYTES:
            raise ApiError(413, "request body too large")
        if length == 0:
            return {}
        try:
            return json.loads(self.rfile.read(length) or b"{}")
        except (ValueError, UnicodeDecodeError) as exc:
            raise ApiError(400, f"body is not valid JSON: {exc}")

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
            return self._fail(404, f"no such endpoint: {path}")
        except ApiError as exc:
            return self._fail(exc.status, exc.message)
        except Exception:
            logger.exception("[api] GET %s failed", path)
            return self._fail(500, "internal error")

    def do_POST(self):
        path = self.path.split("?", 1)[0].rstrip("/") or "/"
        if not self._authorised(path):
            return self._fail(401, "missing or invalid bearer token")
        action = ACTIONS.get(path)
        if action is None:
            return self._fail(404, f"no such endpoint: {path}")
        try:
            body = self._read_json()
            result = action(self, body)
            return self._json(200, {"ok": True, **(result or {})})
        except ApiError as exc:
            return self._fail(exc.status, exc.message)
        except hid.InputUnavailable as exc:
            return self._fail(503, f"input is unavailable: {exc}")
        except hid.UnknownKey as exc:
            return self._fail(400, str(exc))
        except ValueError as exc:
            return self._fail(400, str(exc))
        except Exception:
            logger.exception("[api] POST %s failed", path)
            return self._fail(500, "internal error")

    # ── Read endpoints ────────────────────────────────────────────────────────

    def _index(self) -> dict:
        return {
            "service": "guidenco",
            "description": "HDMI capture and USB HID control for the attached machine",
            "openapi": "/openapi.json",
            "authentication": "bearer token required" if config.API_TOKEN else "open",
        }

    def _health(self) -> dict:
        fb = self.framebuffer
        return {
            "status": "ok" if fb.ready else "waiting for capture",
            "capture": {
                "ready": fb.ready,
                "width": fb.width,
                "height": fb.height,
                "frames": fb.sequence,
                "source": config.CAPTURE_TYPE,
                "device": config.VIDEO_DEV,
            },
            "input": hid.status(),
            "network": netinfo.describe(),
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

    # ── Body parsing helpers ──────────────────────────────────────────────────

    def _coord(self, body: dict, x_key: str = "x", y_key: str = "y") -> tuple[float, float]:
        fb = self.framebuffer
        if not fb.ready:
            raise ApiError(503, "no frame captured yet, so the screen size is unknown")
        try:
            x, y = float(body[x_key]), float(body[y_key])
        except KeyError as exc:
            raise ApiError(400, f"missing required field {exc.args[0]!r}")
        except (TypeError, ValueError):
            raise ApiError(400, f"{x_key} and {y_key} must be numbers")
        if not (0 <= x < fb.width and 0 <= y < fb.height):
            raise ApiError(400, f"({x:.0f},{y:.0f}) is outside the "
                                f"{fb.width}x{fb.height} screen")
        return x, y

    @staticmethod
    def _smooth(body: dict) -> bool | None:
        value = body.get("smooth")
        if value is None:
            return None
        if not isinstance(value, bool):
            raise ApiError(400, "smooth must be true or false")
        return value


# ── Action endpoints ──────────────────────────────────────────────────────────

def _act_move(h: Handler, body: dict) -> dict:
    x, y = h._coord(body)
    hid.move(x, y, smooth=h._smooth(body))
    return {"x": x, "y": y}


def _act_click(h: Handler, body: dict) -> dict:
    x, y = h._coord(body)
    button = body.get("button", "left")
    count = body.get("count", 1)
    if not isinstance(count, int) or isinstance(count, bool):
        raise ApiError(400, "count must be an integer")
    hid.click(x, y, button=button, count=count, smooth=h._smooth(body))
    return {"x": x, "y": y, "button": button, "count": count}


def _act_drag(h: Handler, body: dict) -> dict:
    fx, fy = h._coord(body, "from_x", "from_y")
    tx, ty = h._coord(body, "to_x", "to_y")
    button = body.get("button", "left")
    hid.drag(fx, fy, tx, ty, button=button, smooth=h._smooth(body))
    return {"from": [fx, fy], "to": [tx, ty], "button": button}


def _act_scroll(h: Handler, body: dict) -> dict:
    x, y = h._coord(body)
    amount = body.get("amount")
    if not isinstance(amount, int) or isinstance(amount, bool):
        raise ApiError(400, "amount must be a non-zero integer; positive scrolls up")
    hid.scroll(x, y, amount, smooth=h._smooth(body))
    return {"x": x, "y": y, "amount": amount}


def _act_type(h: Handler, body: dict) -> dict:
    text = body.get("text")
    if not isinstance(text, str):
        raise ApiError(400, "text must be a string")
    skipped = hid.type_text(text)
    result: dict = {"typed": len(text) - len(skipped)}
    if skipped:
        # Report rather than hide it: the caller's text did not fully arrive.
        result["skipped"] = "".join(sorted(set(skipped)))
        result["note"] = "characters with no US-layout mapping were skipped"
    return result


def _act_key(h: Handler, body: dict) -> dict:
    combo = body.get("key")
    if not isinstance(combo, str) or not combo.strip():
        raise ApiError(400, "key must be a non-empty string, e.g. 'ctrl+c'")
    hid.press_key(combo)
    return {"key": combo}


ACTIONS = {
    "/move": _act_move,
    "/click": _act_click,
    "/drag": _act_drag,
    "/scroll": _act_scroll,
    "/type": _act_type,
    "/key": _act_key,
}


class ApiServer(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True

    def __init__(self, framebuffer, host: str, port: int) -> None:
        super().__init__((host, port), Handler)
        self.framebuffer = framebuffer
        self.started_at = time.monotonic()


def serve(framebuffer, host: str = "0.0.0.0", port: int = 8080) -> ApiServer:
    server = ApiServer(framebuffer, host, port)
    if config.API_TOKEN:
        logger.info("[api] listening on %s:%d (bearer token required)", host, server.server_port)
    else:
        logger.warning("[api] listening on %s:%d with NO TOKEN — anyone who can reach "
                       "this port can control the target machine. Set API_TOKEN.",
                       host, server.server_port)
    return server
