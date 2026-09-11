"""
capture/usb.py — USB HDMI capture card backend.

USB UVC capture cards vary widely in the pixel formats and resolutions they
expose. Rather than hardcoding 1080p MJPEG, we probe the device and pick the
best mode it actually supports:

  1. If the card offers MJPEG, use it at the largest advertised size (these
     cards deliver compressed frames, which is cheapest for the Pi).
  2. Otherwise fall back to a raw format and let ffmpeg do the JPEG encode.

CAPTURE_W / CAPTURE_H env vars override the probed size if set.
"""

import logging
import os
import re
import subprocess

from config import VIDEO_DEV, CAPTURE_W, CAPTURE_H, STREAM_W, STREAM_H, STREAM_FPS
from .base import CaptureBackend, encode_outputs

logger = logging.getLogger("guidenco.capture.usb")

# v4l2 fourcc → ffmpeg pixel-format name, for raw (non-MJPEG) fallbacks.
_RAW_V4L2_TO_FFMPEG = {
    "YUYV": "yuyv422",
    "UYVY": "uyvy422",
    "NV12": "nv12",
    "YU12": "yuv420p",
    "RGB3": "rgb24",
    "BGR3": "bgr24",
}


def _run_v4l2(*args: str) -> str:
    try:
        r = subprocess.run(["v4l2-ctl", "-d", VIDEO_DEV, *args],
                           capture_output=True, timeout=5)
        return r.stdout.decode(errors="replace")
    except Exception as e:
        logger.debug("[usb] v4l2-ctl %s failed: %s", args, e)
        return ""


def _supported_fourccs() -> list[str]:
    """Pixel formats the device advertises, e.g. ['MJPG', 'YUYV']."""
    out = _run_v4l2("--list-formats")
    return re.findall(r"'(\w{4})'", out)


def _largest_size_for(fourcc: str) -> tuple[int, int] | None:
    """Largest discrete frame size advertised for a given fourcc, or None."""
    out = _run_v4l2("--list-formats-ext")
    best: tuple[int, int] | None = None
    in_section = False
    for line in out.splitlines():
        if "]:" in line and "'" in line:
            in_section = f"'{fourcc}'" in line
        elif in_section:
            m = re.search(r"(\d+)x(\d+)", line)
            if m:
                w, h = int(m.group(1)), int(m.group(2))
                if best is None or w * h > best[0] * best[1]:
                    best = (w, h)
    return best


def _current_size() -> tuple[int, int] | None:
    out = _run_v4l2("--get-fmt-video")
    m = re.search(r"Width/Height\s*:\s*(\d+)/(\d+)", out)
    return (int(m.group(1)), int(m.group(2))) if m else None


class UsbBackend(CaptureBackend):
    def _probe(self) -> tuple[str, int, int]:
        """Return (ffmpeg_input_format, width, height) for the best mode."""
        fourccs = _supported_fourccs()
        env_override = (CAPTURE_W, CAPTURE_H) if "CAPTURE_W" in os.environ else None

        if "MJPG" in fourccs:
            size = env_override or _largest_size_for("MJPG") or _current_size() or (CAPTURE_W, CAPTURE_H)
            logger.info("[usb] using MJPEG %dx%d", *size)
            return "mjpeg", size[0], size[1]

        for fourcc in fourccs:
            if fourcc in _RAW_V4L2_TO_FFMPEG:
                size = env_override or _largest_size_for(fourcc) or _current_size() or (CAPTURE_W, CAPTURE_H)
                fmt = _RAW_V4L2_TO_FFMPEG[fourcc]
                logger.info("[usb] no MJPEG; using raw %s %dx%d", fmt, *size)
                return fmt, size[0], size[1]

        # Nothing probed — assume MJPEG at the configured fallback size.
        logger.warning("[usb] could not probe formats; defaulting to MJPEG %dx%d",
                       CAPTURE_W, CAPTURE_H)
        return "mjpeg", CAPTURE_W, CAPTURE_H

    def open(self) -> tuple[object, list[subprocess.Popen], int, int]:
        input_format, w, h = self._probe()
        out_w, out_h = (STREAM_W, STREAM_H) if (STREAM_W and STREAM_H) else (w, h)
        cmd = [
            "ffmpeg", "-hide_banner", "-loglevel", "error",
            "-f", "v4l2",
            "-input_format", input_format,
            "-video_size", f"{w}x{h}",
            "-framerate", str(STREAM_FPS),
            "-i", VIDEO_DEV,
        ] + encode_outputs(STREAM_W, STREAM_H)
        proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
        return proc.stdout, [proc], out_w, out_h
