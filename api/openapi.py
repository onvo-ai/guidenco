"""
api/openapi.py — the served OpenAPI 3.1 description.

This is the discovery surface: an agent fetches /openapi.json and learns the
whole API without being told anything else. So the descriptions here are
written for a reader who has never seen this service, and they say what a
caller actually needs to know — that coordinates are screenshot pixels, that
the screen size comes from /health, that typing is US-layout.
"""

import config

_COORD_NOTE = ("Pixel position in the screenshot's own coordinate space, origin "
               "top-left. Read a position off GET /screenshot and post it back "
               "unchanged. The screen size is reported by GET /health.")

_SMOOTH = {
    "type": "boolean",
    "description": ("Interpolate the pointer to the target with easing instead of "
                    "jumping. Defaults to the server's MOUSE_SMOOTH setting (on). "
                    "Leave it on unless you are automating in bulk and do not care "
                    "how it looks: many applications only fire hover states, open "
                    "hover menus, or recognise a drag when they observe motion."),
}

_BUTTON = {
    "type": "string",
    "enum": ["left", "right", "middle"],
    "default": "left",
}


def _xy(extra: dict | None = None, required: list[str] | None = None) -> dict:
    properties = {
        "x": {"type": "number", "description": _COORD_NOTE},
        "y": {"type": "number", "description": _COORD_NOTE},
        "smooth": _SMOOTH,
    }
    properties.update(extra or {})
    return {
        "required": True,
        "content": {"application/json": {"schema": {
            "type": "object",
            "required": required or ["x", "y"],
            "properties": properties,
        }}},
    }


def _responses(ok_description: str) -> dict:
    return {
        "200": {
            "description": ok_description,
            "content": {"application/json": {"schema": {
                "type": "object",
                "properties": {"ok": {"type": "boolean"}},
            }}},
        },
        "400": {"description": "Malformed request, or coordinates off-screen."},
        "401": {"description": "Missing or invalid bearer token."},
        "503": {"description": "Input unavailable — the USB HID gadget is not bound."},
    }


def build_spec() -> dict:
    spec: dict = {
        "openapi": "3.1.0",
        "info": {
            "title": "guidenco",
            "version": "2.0.0",
            "summary": "See and control a machine through its HDMI output and a USB HID gadget.",
            "description": (
                "A Raspberry Pi sits between a target machine and its monitor. It "
                "captures the target's HDMI output and presents itself to the target "
                "as a USB keyboard and mouse.\n\n"
                "Nothing is installed on the target and nothing runs on it, so this "
                "works on a machine you cannot log into, during boot, or at a BIOS "
                "screen.\n\n"
                "Typical loop: GET /screenshot, decide what to do, POST an action, "
                "screenshot again to confirm it worked.\n\n"
                "Coordinates everywhere are pixels in the screenshot's own space. "
                "Keyboard input assumes a US layout, because HID sends scan codes "
                "and the target decides what they mean."
            ),
        },
        "servers": [{"url": "/"}],
        "paths": {
            "/health": {
                "get": {
                    "operationId": "getHealth",
                    "summary": "Service state: capture, input and network.",
                    "description": ("Reports the screen dimensions your coordinates "
                                    "must fall within, whether input is available, "
                                    "and which network the bridge is attached to."),
                    "responses": {"200": {
                        "description": "Current state.",
                        "content": {"application/json": {"schema": {
                            "type": "object",
                            "properties": {
                                "status": {"type": "string"},
                                "capture": {
                                    "type": "object",
                                    "properties": {
                                        "ready": {"type": "boolean"},
                                        "width": {"type": "integer"},
                                        "height": {"type": "integer"},
                                        "frames": {"type": "integer"},
                                        "source": {"type": "string"},
                                        "device": {"type": "string"},
                                    },
                                },
                                "input": {
                                    "type": "object",
                                    "description": "Whether the USB HID gadget is usable.",
                                    "properties": {
                                        "available": {"type": "boolean"},
                                        "detail": {"type": "string"},
                                    },
                                },
                                "network": {
                                    "type": "object",
                                    "properties": {
                                        "hostname": {"type": "string"},
                                        "interface": {"type": ["string", "null"]},
                                        "type": {
                                            "type": "string",
                                            "enum": ["wifi", "ethernet", "disconnected", "unknown"],
                                        },
                                        "address": {"type": ["string", "null"]},
                                        "mac": {"type": ["string", "null"]},
                                        "ssid": {
                                            "type": ["string", "null"],
                                            "description": "Wi-Fi network name; null on ethernet.",
                                        },
                                        "signal_dbm": {
                                            "type": ["integer", "null"],
                                            "description": "Wi-Fi signal strength; -50 is strong, -80 is weak.",
                                        },
                                    },
                                },
                                "uptime_seconds": {"type": "number"},
                            },
                        }}},
                    }},
                }
            },
            "/screenshot": {
                "get": {
                    "operationId": "getScreenshot",
                    "summary": "The target's screen right now, as JPEG.",
                    "description": ("The capture device's own frame, passed through "
                                    "without re-encoding. Response headers "
                                    "X-Screen-Width and X-Screen-Height give the "
                                    "coordinate space for every action endpoint."),
                    "responses": {
                        "200": {"description": "Current frame.",
                                "content": {"image/jpeg": {"schema": {
                                    "type": "string", "format": "binary"}}}},
                        "503": {"description": "No frame captured yet — check the HDMI source."},
                    },
                }
            },
            "/stream": {
                "get": {
                    "operationId": "getStream",
                    "summary": "Continuous MJPEG stream.",
                    "description": ("multipart/x-mixed-replace, which any browser "
                                    "renders natively — open the URL to watch. "
                                    "Prefer /screenshot for automation: it costs "
                                    "nothing between calls."),
                    "responses": {"200": {"description": "An endless multipart stream."}},
                }
            },
            "/move": {
                "post": {
                    "operationId": "movePointer",
                    "summary": "Move the pointer.",
                    "requestBody": _xy(),
                    "responses": _responses("The pointer arrived."),
                }
            },
            "/click": {
                "post": {
                    "operationId": "click",
                    "summary": "Move to a point and click.",
                    "requestBody": _xy({
                        "button": _BUTTON,
                        "count": {"type": "integer", "minimum": 1, "maximum": 3,
                                  "default": 1,
                                  "description": "2 for a double click, 3 for a triple."},
                    }),
                    "responses": _responses("The click was delivered."),
                }
            },
            "/drag": {
                "post": {
                    "operationId": "drag",
                    "summary": "Press at one point, move, release at another.",
                    "description": ("Used for drag-and-drop, selecting text, and "
                                    "moving sliders. The pointer is interpolated "
                                    "between the two points because applications "
                                    "generally ignore a drag that teleports."),
                    "requestBody": {
                        "required": True,
                        "content": {"application/json": {"schema": {
                            "type": "object",
                            "required": ["from_x", "from_y", "to_x", "to_y"],
                            "properties": {
                                "from_x": {"type": "number", "description": _COORD_NOTE},
                                "from_y": {"type": "number", "description": _COORD_NOTE},
                                "to_x": {"type": "number", "description": _COORD_NOTE},
                                "to_y": {"type": "number", "description": _COORD_NOTE},
                                "button": _BUTTON,
                                "smooth": _SMOOTH,
                            },
                        }}},
                    },
                    "responses": _responses("The drag completed."),
                }
            },
            "/scroll": {
                "post": {
                    "operationId": "scroll",
                    "summary": "Scroll the wheel at a point.",
                    "requestBody": _xy({
                        "amount": {"type": "integer",
                                   "description": "Signed notches: positive scrolls up, negative down."},
                    }, required=["x", "y", "amount"]),
                    "responses": _responses("The scroll was delivered."),
                }
            },
            "/type": {
                "post": {
                    "operationId": "typeText",
                    "summary": "Type a string of text.",
                    "description": ("Types into whatever currently has focus — click "
                                    "the field first. US layout only; characters with "
                                    "no mapping are skipped and listed in the response "
                                    "rather than failing the whole string. Use /key "
                                    "for Return, Tab and shortcuts."),
                    "requestBody": {
                        "required": True,
                        "content": {"application/json": {"schema": {
                            "type": "object",
                            "required": ["text"],
                            "properties": {"text": {"type": "string"}},
                        }}},
                    },
                    "responses": _responses("The text was typed."),
                }
            },
            "/key": {
                "post": {
                    "operationId": "pressKey",
                    "summary": "Press a key or key combination.",
                    "description": ("Modifiers joined with '+': ctrl, shift, alt "
                                    "(option), cmd (command, super, win, meta). Named "
                                    "keys include Return, Escape, Tab, Backspace, "
                                    "Delete, Home, End, PageUp, PageDown, Up, Down, "
                                    "Left, Right and F1-F24."),
                    "requestBody": {
                        "required": True,
                        "content": {"application/json": {"schema": {
                            "type": "object",
                            "required": ["key"],
                            "properties": {"key": {
                                "type": "string",
                                "examples": ["Return", "ctrl+c", "cmd+shift+4", "alt+Tab"],
                            }},
                        }}},
                    },
                    "responses": _responses("The key was pressed."),
                }
            },
        },
    }

    if config.API_TOKEN:
        spec["components"] = {"securitySchemes": {"bearerAuth": {
            "type": "http", "scheme": "bearer",
            "description": "The token printed by install.sh, from /etc/guidenco/config.env.",
        }}}
        spec["security"] = [{"bearerAuth": []}]
        # Discovery has to work before a caller holds a token.
        for path in ("/openapi.json",):
            spec["paths"].setdefault(path, {})
    return spec
