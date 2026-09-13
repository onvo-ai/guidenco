"""
api/openapi.py — the served OpenAPI 3.1 description.

Describes the read-only surface: a screenshot, a browser stream, and a health
check. Control lives behind MCP at /mcp, where an agent discovers the tools by
asking the server, so nothing about actions is restated here — two descriptions
of the same tools would eventually disagree.
"""

import config

def build_spec() -> dict:
    spec: dict = {
        "openapi": "3.1.0",
        "info": {
            "title": "guidenco",
            "version": "3.0.0",
            "summary": "See and control a machine through its HDMI output and a USB HID gadget.",
            "description": (
                "A Raspberry Pi sits between a target machine and its monitor. It "
                "captures the target's HDMI output and presents itself to the target "
                "as a USB keyboard and mouse.\n\n"
                "Nothing is installed on the target and nothing runs on it, so this "
                "works on a machine you cannot log into, during boot, or at a BIOS "
                "screen.\n\n"
                "This describes the read-only surface only: a screenshot, a "
                "browser-viewable stream, and a health check.\n\n"
                "Control — clicking, typing, scrolling — is exposed over the Model "
                "Context Protocol at POST /mcp, not here. An MCP client discovers "
                "those tools itself by calling tools/list, so they are deliberately "
                "not duplicated into this document where the two could drift apart."
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
                                    "and which network the bridge is attached to. "
                                    "capture.link says whether the source has been "
                                    "told to send a signal and whether one arrived, "
                                    "which is how you tell an idle bridge from an "
                                    "unplugged cable."),
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
                                        "link": {
                                            "type": "object",
                                            "properties": {
                                                "negotiated": {"type": ["boolean", "null"]},
                                                "signal": {"type": ["boolean", "null"]},
                                                "detail": {"type": "string"},
                                            },
                                        },
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
