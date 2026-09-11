"""
config.py — environment-driven configuration.

Values live in /etc/guidenco/config.env, written by install.sh and loaded by
systemd (EnvironmentFile). Every setting has a working default so the service
can run straight from a git checkout for development.
"""

import os


def _int(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, default))
    except (TypeError, ValueError):
        return default


def _bool_or_auto(name: str, default: str = "auto") -> str:
    v = os.environ.get(name, default).strip().lower()
    return v if v in ("on", "off", "auto") else default


# ── Capture hardware ──────────────────────────────────────────────────────────
# CAPTURE_TYPE selects the HDMI capture backend:
#   "usb"  — USB HDMI capture card (e.g. Macrosilicon MS2109/MS2130, em28xx)
#   "csi"  — HDMI-to-CSI adapter using the TC358743 chip
#   "test" — synthetic moving pattern; no hardware needed (development only)
CAPTURE_TYPE = os.environ.get("CAPTURE_TYPE", "usb")
VIDEO_DEV    = os.environ.get("VIDEO_DEV", "/dev/video0")

# Source geometry. USB cards are probed and these act only as a fallback; the
# TC358743 dictates its own timings. Set them to override.
CAPTURE_W = _int("CAPTURE_W", 1920)
CAPTURE_H = _int("CAPTURE_H", 1080)

# Served screen size. 0 means "whatever the capture device gives us" — native
# resolution, no scaling, sharpest text. Set both to a smaller size (e.g.
# 1280x720) if a Pi Zero can't keep up at 1080p.
STREAM_W   = _int("STREAM_W", 0)
STREAM_H   = _int("STREAM_H", 0)
STREAM_FPS = _int("STREAM_FPS", 10)

# ── VNC server ────────────────────────────────────────────────────────────────
VNC_HOST        = os.environ.get("VNC_HOST", "0.0.0.0")
VNC_PORT        = _int("VNC_PORT", 5900)
# Empty password means the server offers the "None" security type: anyone who
# can reach the port gets in. Set a password for anything but a trusted LAN.
VNC_PASSWORD    = os.environ.get("VNC_PASSWORD", "")
VNC_MAX_CLIENTS = _int("VNC_MAX_CLIENTS", 4)
VNC_NAME        = os.environ.get("VNC_NAME", "guidenco")

# ── USB HID gadget ────────────────────────────────────────────────────────────
# "auto" replays input when /dev/hidg0 exists and serves screen-only when it
# doesn't (e.g. a Pi Zero whose single USB port is taken by a capture card).
HID_ENABLED = _bool_or_auto("HID_ENABLED")

ABS_MAX = 32767   # USB HID absolute pointer range
