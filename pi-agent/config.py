"""
config.py — environment-driven configuration for the Pi agent.

Values are populated by install.sh into /etc/guidenco/device.env and loaded by
systemd (EnvironmentFile). Sensible defaults let the agent run standalone for
local testing.
"""

import os


def _int(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, default))
    except (TypeError, ValueError):
        return default


# ── Capture hardware ──────────────────────────────────────────────────────────
# CAPTURE_TYPE selects the HDMI capture backend:
#   "usb"  — USB HDMI capture card (e.g. Macrosilicon MS2109/MS2130, em28xx)
#   "csi"  — HDMI-to-CSI adapter using the TC358743 chip
CAPTURE_TYPE = os.environ.get("CAPTURE_TYPE", "usb")
VIDEO_DEV    = os.environ.get("VIDEO_DEV", "/dev/video0")

# Capture geometry. For USB cards these are auto-probed from the device and used
# only as a fallback; set them explicitly to override. For the TC358743 the
# hardware dictates 1080p, so leave at the default.
CAPTURE_W = _int("CAPTURE_W", 1920)
CAPTURE_H = _int("CAPTURE_H", 1080)

# Output stream geometry — frames are downscaled to this before JPEG encode and
# forwarded to the cloud. 960×540 keeps encode cost within the Pi Zero 2 W budget
# while preserving enough detail for the agent to read on-screen text.
STREAM_W   = _int("STREAM_W", 960)
STREAM_H   = _int("STREAM_H", 540)
STREAM_FPS = _int("STREAM_FPS", 10)

# ── USB HID coordinate space ──────────────────────────────────────────────────
COORD_SPACE = 1000    # agent/UI coordinate space (0–1000 maps to full screen)
ABS_MAX     = 32767   # USB HID absolute pointer range

# ── Cloud relay ───────────────────────────────────────────────────────────────
DEVICE_TOKEN = os.environ.get("DEVICE_TOKEN", "")
CLOUD_URL    = os.environ.get("CLOUD_URL", "https://guidenco.app")
