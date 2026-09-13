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
# TC358743 dictates its own timings. Set them to pin an exact capture mode.
CAPTURE_W = _int("CAPTURE_W", 1920)
CAPTURE_H = _int("CAPTURE_H", 1080)

# Ceiling on the capture mode chosen by probing. HDMI capture cards advertise
# their maximum capability, not the resolution of the signal actually plugged
# in — a common MS2130 offers 2560x1600, which is 12MB per frame once decoded
# to RGB24 and roughly 123MB/s of memory traffic at 10fps. That is a poor
# default on a Pi. Raise it if your source really is above 1080p.
CAPTURE_MAX_W = _int("CAPTURE_MAX_W", 1920)
CAPTURE_MAX_H = _int("CAPTURE_MAX_H", 1080)

# Served screen size. 0 means "whatever the capture device gives us" — native
# resolution, no scaling, sharpest text. Set both to a smaller size (e.g.
# 1280x720) if a Pi Zero can't keep up at 1080p.
STREAM_W   = _int("STREAM_W", 0)
STREAM_H   = _int("STREAM_H", 0)
STREAM_FPS = _int("STREAM_FPS", 10)

# Capture runs only while something is reading it. After the last request it
# stays warm this long, then shuts down.
#
# Five minutes because the caller is usually a model: it takes a screenshot,
# spends a while deciding what to do, acts, and looks again. Thirty seconds was
# shorter than that pause, so nearly every screenshot in a session paid the cold
# restart (~2.7s against ~0.5s warm) even though the session never went idle.
# Lower it if the Pi is doing something else and you want the pipeline gone.
CAPTURE_IDLE_TIMEOUT_S = _int("CAPTURE_IDLE_TIMEOUT_S", 300)

# How long to wait for a frame after asking for one. It has to cover a cold
# start: a CSI adapter negotiates EDID and latches DV timings before the first
# frame, which takes several seconds the first time.
CAPTURE_WARMUP_S = _int("CAPTURE_WARMUP_S", 20)

# How long to let the screen settle before a return_frame screenshot.
#
# An action returns the instant the HID report is written, which is well before
# the target has redrawn — without this pause the frame shows the screen as it
# was, and the caller concludes the action failed when it did not. 400ms covers
# ordinary redraws; a slow app needs the caller to ask for more via settle_ms.
ACTION_SETTLE_MS = _int("ACTION_SETTLE_MS", 400)

# ── HTTP API ──────────────────────────────────────────────────────────────────
API_HOST = os.environ.get("API_HOST", "0.0.0.0")
API_PORT = _int("API_PORT", 8080)
# Empty token means the API is open: anyone who can reach the port can move the
# mouse and type on the target machine. Set one for anything but a trusted LAN.
API_TOKEN = os.environ.get("API_TOKEN", "")
# How long /stream waits for a new frame before giving up on a stalled capture.
STREAM_TIMEOUT_S = _int("STREAM_TIMEOUT_S", 10)

# ── Cloudflare quick tunnel ───────────────────────────────────────────────────
# Publishes the bridge to the internet on a random trycloudflare.com hostname.
# The hostname changes every restart, which is what the Bluetooth setup service
# is for. A tunnel without a token is refused outright rather than warned about:
# it would expose keyboard and mouse control of the target to anyone who finds
# the URL.
TUNNEL_ENABLED = os.environ.get("TUNNEL_ENABLED", "off").strip().lower() == "on"

# ── Bluetooth setup ───────────────────────────────────────────────────────────
# Lets a browser configure Wi-Fi and read the tunnel URL without the Pi being
# reachable on the network at all.
BLE_ENABLED = os.environ.get("BLE_ENABLED", "on").strip().lower() != "off"
BLE_NAME = os.environ.get("BLE_NAME", "guidenco")

# ── USB HID gadget ────────────────────────────────────────────────────────────
# "auto" replays input when /dev/hidg0 exists and serves screen-only when it
# does not (e.g. a Pi Zero whose single USB port is taken by a capture card).
HID_ENABLED = _bool_or_auto("HID_ENABLED")

ABS_MAX = 32767   # USB HID absolute pointer range

# ── Pointer motion ────────────────────────────────────────────────────────────
# Moves are interpolated with easing instead of teleporting. Beyond looking
# natural this is functional: applications need intermediate motion to fire
# hover states and to recognise a drag at all.
MOUSE_SMOOTH = os.environ.get("MOUSE_SMOOTH", "on").strip().lower() != "off"
# Duration model: base + k * sqrt(pixels), capped. Square root rather than
# linear echoes Fitts's law — long sweeps travel faster per pixel.
MOUSE_MOVE_BASE_MS = _int("MOUSE_MOVE_BASE_MS", 80)
MOUSE_MOVE_PER_ROOT_PX_MS = _int("MOUSE_MOVE_PER_ROOT_PX_MS", 14)
MOUSE_MOVE_MAX_MS = _int("MOUSE_MOVE_MAX_MS", 600)
# One HID report per step; 8ms matches a real mouse's 125Hz poll rate.
MOUSE_STEP_MS = _int("MOUSE_STEP_MS", 8)
