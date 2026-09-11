"""
api/mcp.py — Model Context Protocol over Streamable HTTP.

Lives alongside the read-only REST routes on the same server, at /mcp. Tools
are answered with a plain application/json body rather than an SSE stream,
which the spec explicitly permits and which suits this service: every tool is a
short request/response with nothing to stream.

Implemented against the 2025-06-18 specification:
  * POST carrying a request  -> one JSON-RPC response
  * POST carrying a notification or response -> 202 Accepted, empty body
  * GET  -> 405, since no server-initiated messages are offered
  * DELETE -> ends the session
  * Mcp-Session-Id issued at initialize and required afterwards
  * Origin validated on every request, because a browser on the same network
    could otherwise be talked into driving this by a hostile page
"""

import base64
import json
import logging
import secrets
import threading
import time

import hid

logger = logging.getLogger("guidenco.mcp")

SERVER_NAME = "guidenco"
SERVER_VERSION = "3.0.0"

LATEST_PROTOCOL = "2025-06-18"
SUPPORTED_PROTOCOLS = (LATEST_PROTOCOL, "2025-03-26", "2024-11-05")
#: The spec says to assume this when a client sends no version header.
ASSUMED_PROTOCOL = "2025-03-26"

SESSION_TTL_S = 3600

# JSON-RPC error codes.
PARSE_ERROR = -32700
INVALID_REQUEST = -32600
METHOD_NOT_FOUND = -32601
INVALID_PARAMS = -32602
INTERNAL_ERROR = -32603

INSTRUCTIONS = """\
This controls a physical machine through a Raspberry Pi wired between it and \
its monitor. The Pi captures HDMI output and acts as a USB keyboard and mouse, \
so nothing runs on the target and there is no API into it — the screen is the \
only source of truth.

Work in a loop: take a screenshot, decide what to do from what you see, act, \
then screenshot again to confirm it worked. Do not assume an action succeeded.

Coordinates are pixels in the screenshot you were just given, origin top-left. \
Read a position off the image and pass it back unchanged.

Typing goes to whatever currently has keyboard focus, so click the field first. \
The keyboard is a US layout.\
"""


class McpError(Exception):
    def __init__(self, code: int, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


# ── Tool definitions ──────────────────────────────────────────────────────────

_COORD = "Pixel position in the most recent screenshot, origin top-left."
_SMOOTH = {
    "type": "boolean",
    "description": ("Glide the pointer to the target instead of jumping. Defaults "
                    "to true. Leave it alone unless you need speed over realism: "
                    "many applications only fire hover states, open hover menus or "
                    "recognise a drag when they observe motion."),
}
_BUTTON = {"type": "string", "enum": ["left", "right", "middle"], "default": "left"}


def _xy_schema(extra: dict | None = None, required: list[str] | None = None) -> dict:
    properties = {
        "x": {"type": "number", "description": _COORD},
        "y": {"type": "number", "description": _COORD},
        "smooth": _SMOOTH,
    }
    properties.update(extra or {})
    return {"type": "object", "required": required or ["x", "y"],
            "properties": properties}


def _text(message: str) -> dict:
    return {"content": [{"type": "text", "text": message}]}


class Tools:
    """The tool surface, bound to a framebuffer."""

    def __init__(self, framebuffer) -> None:
        self.framebuffer = framebuffer

    # ── Descriptions ──────────────────────────────────────────────────────────

    def list(self) -> list[dict]:
        return [
            {
                "name": "screenshot",
                "title": "Take a screenshot",
                "description": ("Capture what the target machine is displaying right "
                                "now. Call this before acting, and again afterwards "
                                "to check the result."),
                "inputSchema": {"type": "object", "properties": {}},
            },
            {
                "name": "get_status",
                "title": "Bridge status",
                "description": ("Screen dimensions, whether input is available, and "
                                "which network the bridge is on. Useful when "
                                "something is not responding."),
                "inputSchema": {"type": "object", "properties": {}},
            },
            {
                "name": "move_mouse",
                "title": "Move the pointer",
                "description": "Move the pointer without pressing anything.",
                "inputSchema": _xy_schema(),
            },
            {
                "name": "click",
                "title": "Click",
                "description": "Move to a point and click there.",
                "inputSchema": _xy_schema({
                    "button": _BUTTON,
                    "count": {"type": "integer", "minimum": 1, "maximum": 3, "default": 1,
                              "description": "2 for a double click, 3 for a triple."},
                }),
            },
            {
                "name": "drag",
                "title": "Drag",
                "description": ("Press at one point, move, release at another. Use for "
                                "drag-and-drop, selecting text, and sliders."),
                "inputSchema": {
                    "type": "object",
                    "required": ["from_x", "from_y", "to_x", "to_y"],
                    "properties": {
                        "from_x": {"type": "number", "description": _COORD},
                        "from_y": {"type": "number", "description": _COORD},
                        "to_x": {"type": "number", "description": _COORD},
                        "to_y": {"type": "number", "description": _COORD},
                        "button": _BUTTON,
                        "smooth": _SMOOTH,
                    },
                },
            },
            {
                "name": "scroll",
                "title": "Scroll",
                "description": "Scroll the wheel at a point.",
                "inputSchema": _xy_schema({
                    "amount": {"type": "integer",
                               "description": "Signed notches: positive scrolls up, negative down."},
                }, required=["x", "y", "amount"]),
            },
            {
                "name": "type_text",
                "title": "Type text",
                "description": ("Type a string into whatever has keyboard focus — click "
                                "the field first. US layout; unmappable characters are "
                                "skipped and reported. Use press_key for Return, Tab "
                                "and shortcuts."),
                "inputSchema": {"type": "object", "required": ["text"],
                                "properties": {"text": {"type": "string"}}},
            },
            {
                "name": "press_key",
                "title": "Press a key",
                "description": ("Press one key or a combination. Modifiers join with "
                                "'+': ctrl, shift, alt (option), cmd (command, super, "
                                "win). Named keys include Return, Escape, Tab, "
                                "Backspace, Delete, Home, End, PageUp, PageDown, the "
                                "arrows and F1-F24."),
                "inputSchema": {
                    "type": "object", "required": ["key"],
                    "properties": {"key": {
                        "type": "string",
                        "examples": ["Return", "ctrl+c", "cmd+shift+4", "alt+Tab"],
                    }},
                },
            },
        ]

    # ── Dispatch ──────────────────────────────────────────────────────────────

    def call(self, name: str, arguments: dict) -> dict:
        handler = getattr(self, f"_tool_{name}", None)
        if handler is None:
            # A tool that does not exist is a protocol-level mistake by the
            # client, so it stays a JSON-RPC error.
            raise McpError(METHOD_NOT_FOUND, f"no such tool: {name}")
        try:
            return handler(arguments or {})
        except (McpError, hid.InputUnavailable, hid.UnknownKey, ValueError) as exc:
            # Everything that goes wrong while running a tool — bad arguments,
            # off-screen coordinates, no HDMI signal, no gadget — comes back as
            # a tool error rather than a JSON-RPC error. A JSON-RPC error tears
            # down the client session; an isError result is handed to the model,
            # which can read it and try something else.
            if isinstance(exc, McpError):
                message = exc.message
            elif isinstance(exc, hid.InputUnavailable):
                # Without the prefix the model just sees a bare device path and
                # has no idea the whole category of action is impossible.
                message = (f"Input is unavailable, so this machine cannot be "
                           f"controlled right now: {exc}")
            else:
                message = str(exc)
            return {"content": [{"type": "text", "text": message}], "isError": True}

    def _screen(self) -> tuple[int, int]:
        if not self.framebuffer.ready:
            raise McpError(INTERNAL_ERROR,
                           "no frame captured yet — is an HDMI source connected?")
        return self.framebuffer.width, self.framebuffer.height

    def _coord(self, args: dict, x_key: str = "x", y_key: str = "y") -> tuple[float, float]:
        width, height = self._screen()
        try:
            x, y = float(args[x_key]), float(args[y_key])
        except KeyError as exc:
            raise McpError(INVALID_PARAMS, f"missing required argument {exc.args[0]!r}")
        except (TypeError, ValueError):
            raise McpError(INVALID_PARAMS, f"{x_key} and {y_key} must be numbers")
        if not (0 <= x < width and 0 <= y < height):
            raise McpError(INVALID_PARAMS,
                           f"({x:.0f},{y:.0f}) is outside the {width}x{height} screen")
        return x, y

    @staticmethod
    def _smooth(args: dict) -> bool | None:
        value = args.get("smooth")
        if value is not None and not isinstance(value, bool):
            raise McpError(INVALID_PARAMS, "smooth must be true or false")
        return value

    # ── Tools ─────────────────────────────────────────────────────────────────

    def _tool_screenshot(self, args: dict) -> dict:
        frame, _ = self.framebuffer.latest(timeout=5.0)
        if frame is None:
            raise McpError(INTERNAL_ERROR,
                           "no frame captured yet — is an HDMI source connected?")
        width, height = self.framebuffer.width, self.framebuffer.height
        return {"content": [
            {"type": "image",
             "data": base64.b64encode(frame).decode(),
             "mimeType": "image/jpeg"},
            {"type": "text",
             "text": f"Screen is {width}x{height}. Coordinates for every action "
                     f"tool are pixels in this image, origin top-left."},
        ]}

    def _tool_get_status(self, args: dict) -> dict:
        from . import netinfo
        fb = self.framebuffer
        status = {
            "screen": {"ready": fb.ready, "width": fb.width, "height": fb.height,
                       "frames_captured": fb.sequence},
            "input": hid.status(),
            "network": netinfo.describe(),
        }
        return {"content": [{"type": "text", "text": json.dumps(status, indent=2)}],
                "structuredContent": status}

    def _tool_move_mouse(self, args: dict) -> dict:
        x, y = self._coord(args)
        hid.move(x, y, smooth=self._smooth(args))
        return _text(f"Pointer moved to ({x:.0f}, {y:.0f}).")

    def _tool_click(self, args: dict) -> dict:
        x, y = self._coord(args)
        button = args.get("button", "left")
        count = args.get("count", 1)
        if not isinstance(count, int) or isinstance(count, bool):
            raise McpError(INVALID_PARAMS, "count must be an integer")
        hid.click(x, y, button=button, count=count, smooth=self._smooth(args))
        label = {1: "Clicked", 2: "Double-clicked", 3: "Triple-clicked"}[count]
        return _text(f"{label} {button} at ({x:.0f}, {y:.0f}). "
                     f"Take a screenshot to confirm the result.")

    def _tool_drag(self, args: dict) -> dict:
        fx, fy = self._coord(args, "from_x", "from_y")
        tx, ty = self._coord(args, "to_x", "to_y")
        hid.drag(fx, fy, tx, ty, button=args.get("button", "left"),
                 smooth=self._smooth(args))
        return _text(f"Dragged from ({fx:.0f}, {fy:.0f}) to ({tx:.0f}, {ty:.0f}).")

    def _tool_scroll(self, args: dict) -> dict:
        x, y = self._coord(args)
        amount = args.get("amount")
        if not isinstance(amount, int) or isinstance(amount, bool) or amount == 0:
            raise McpError(INVALID_PARAMS,
                           "amount must be a non-zero integer; positive scrolls up")
        hid.scroll(x, y, amount, smooth=self._smooth(args))
        direction = "up" if amount > 0 else "down"
        return _text(f"Scrolled {direction} {abs(amount)} notches at ({x:.0f}, {y:.0f}).")

    def _tool_type_text(self, args: dict) -> dict:
        text = args.get("text")
        if not isinstance(text, str):
            raise McpError(INVALID_PARAMS, "text must be a string")
        skipped = hid.type_text(text)
        if skipped:
            unique = "".join(sorted(set(skipped)))
            return _text(f"Typed {len(text) - len(skipped)} of {len(text)} characters. "
                         f"These have no US-layout mapping and were skipped: {unique}")
        return _text(f"Typed {len(text)} characters into whatever has focus.")

    def _tool_press_key(self, args: dict) -> dict:
        combo = args.get("key")
        if not isinstance(combo, str) or not combo.strip():
            raise McpError(INVALID_PARAMS, "key must be a non-empty string")
        hid.press_key(combo)
        return _text(f"Pressed {combo}.")


# ── Sessions ──────────────────────────────────────────────────────────────────

class Sessions:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._sessions: dict[str, float] = {}

    def create(self) -> str:
        session_id = secrets.token_hex(16)
        with self._lock:
            self._expire()
            self._sessions[session_id] = time.monotonic()
        return session_id

    def touch(self, session_id: str) -> bool:
        with self._lock:
            self._expire()
            if session_id not in self._sessions:
                return False
            self._sessions[session_id] = time.monotonic()
            return True

    def drop(self, session_id: str) -> bool:
        with self._lock:
            return self._sessions.pop(session_id, None) is not None

    def _expire(self) -> None:
        cutoff = time.monotonic() - SESSION_TTL_S
        for key in [k for k, seen in self._sessions.items() if seen < cutoff]:
            del self._sessions[key]


# ── Protocol handling ─────────────────────────────────────────────────────────

class McpEndpoint:
    def __init__(self, framebuffer) -> None:
        self.tools = Tools(framebuffer)
        self.sessions = Sessions()

    # Returns (status, headers, body-bytes-or-None)
    def handle_post(self, body: bytes, headers) -> tuple[int, dict, bytes | None]:
        try:
            message = json.loads(body or b"")
        except (ValueError, UnicodeDecodeError):
            return 400, {}, self._error_body(None, PARSE_ERROR, "invalid JSON")

        if isinstance(message, list):
            # Batching was removed in 2025-06-18 and this service never needed it.
            return 400, {}, self._error_body(
                None, INVALID_REQUEST, "batched requests are not supported")
        if not isinstance(message, dict):
            return 400, {}, self._error_body(None, INVALID_REQUEST, "expected an object")

        method = message.get("method")
        message_id = message.get("id")
        is_request = message_id is not None and method is not None

        # A notification or a response: acknowledge and do nothing.
        if not is_request:
            return 202, {}, None

        session_id = headers.get("Mcp-Session-Id")
        if method == "initialize":
            return self._initialize(message)

        if session_id and not self.sessions.touch(session_id):
            # Spec: a terminated session must 404 so the client re-initializes.
            return 404, {}, self._error_body(message_id, INVALID_REQUEST,
                                             "session expired; send initialize again")

        try:
            result = self._dispatch(method, message.get("params") or {})
        except McpError as exc:
            return 200, {}, self._error_body(message_id, exc.code, exc.message)
        except Exception:
            logger.exception("[mcp] %s failed", method)
            return 200, {}, self._error_body(message_id, INTERNAL_ERROR, "internal error")
        return 200, {}, self._result_body(message_id, result)

    def _initialize(self, message: dict) -> tuple[int, dict, bytes]:
        params = message.get("params") or {}
        requested = params.get("protocolVersion")
        # Speak the client's version when we know it, otherwise answer with ours
        # and let the client decide whether it can proceed.
        version = requested if requested in SUPPORTED_PROTOCOLS else LATEST_PROTOCOL
        session_id = self.sessions.create()
        result = {
            "protocolVersion": version,
            "capabilities": {"tools": {"listChanged": False}},
            "serverInfo": {"name": SERVER_NAME, "version": SERVER_VERSION},
            "instructions": INSTRUCTIONS,
        }
        return 200, {"Mcp-Session-Id": session_id}, self._result_body(
            message.get("id"), result)

    def _dispatch(self, method: str, params: dict):
        if method == "ping":
            return {}
        if method == "tools/list":
            return {"tools": self.tools.list()}
        if method == "tools/call":
            name = params.get("name")
            if not isinstance(name, str):
                raise McpError(INVALID_PARAMS, "tools/call requires a tool name")
            return self.tools.call(name, params.get("arguments") or {})
        raise McpError(METHOD_NOT_FOUND, f"unsupported method: {method}")

    def handle_delete(self, headers) -> tuple[int, dict, bytes | None]:
        session_id = headers.get("Mcp-Session-Id")
        if session_id:
            self.sessions.drop(session_id)
        return 204, {}, None

    # ── Encoding ──────────────────────────────────────────────────────────────

    @staticmethod
    def _result_body(message_id, result) -> bytes:
        return json.dumps({"jsonrpc": "2.0", "id": message_id, "result": result}).encode()

    @staticmethod
    def _error_body(message_id, code: int, message: str) -> bytes:
        return json.dumps({"jsonrpc": "2.0", "id": message_id,
                           "error": {"code": code, "message": message}}).encode()


def protocol_version_ok(header: str | None) -> bool:
    """
    Whether a client's MCP-Protocol-Version header is one we speak.

    Absent is fine: the spec says to assume 2025-03-26 when a client sends none.
    """
    if header is None:
        return True
    return header in SUPPORTED_PROTOCOLS


def origin_allowed(origin: str | None) -> bool:
    """
    Guard against DNS rebinding, which the transport spec requires.

    A browser page on any origin can reach a LAN address, so without this a
    hostile page could quietly drive the target machine. Non-browser clients
    send no Origin at all, which is what Claude and curl do.
    """
    if origin is None:
        return True
    return origin.startswith("http://localhost") or origin.startswith("http://127.0.0.1")
