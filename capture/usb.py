"""
capture/usb.py — USB HDMI capture card backend.

USB UVC capture cards vary widely in the pixel formats and resolutions they
expose. Rather than hardcoding 1080p MJPEG, we probe the device and pick the
best mode it actually supports:

  1. If the card offers MJPEG, use it (these cards deliver compressed frames
     over the wire, which is much cheaper than raw for the USB bus).
  2. Otherwise fall back to a raw format and let ffmpeg decode it.

Size selection is deliberately not "the largest mode offered". A capture card
advertises what its chip can do, not what is plugged into it: an MS2130 offers
2560x1600 whether the source is 4K or 720p. Picking that costs 12MB per decoded
frame for no gain when the source is 1080p. So we take the largest mode that
fits within CAPTURE_MAX_W/H, preferring an exact match on those dimensions.

Set CAPTURE_W / CAPTURE_H to pin a specific mode, or raise CAPTURE_MAX_W/H if
the source genuinely is above 1080p.
"""

import logging
import os
import re
import subprocess

from config import (
    VIDEO_DEV, CAPTURE_W, CAPTURE_H, CAPTURE_MAX_W, CAPTURE_MAX_H,
    STREAM_W, STREAM_H, STREAM_FPS,
)
from .base import CaptureBackend, encode_outputs, passthrough_outputs

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


def _sizes_for(fourcc: str) -> list[tuple[int, int]]:
    """Every discrete frame size advertised for a given fourcc."""
    out = _run_v4l2("--list-formats-ext")
    sizes: list[tuple[int, int]] = []
    in_section = False
    for line in out.splitlines():
        if "]:" in line and "'" in line:
            in_section = f"'{fourcc}'" in line
        elif in_section:
            m = re.search(r"Size: \w+ (\d+)x(\d+)", line)
            if m:
                size = (int(m.group(1)), int(m.group(2)))
                if size not in sizes:
                    sizes.append(size)
    return sizes


def _best_size_for(fourcc: str) -> tuple[int, int] | None:
    """
    Pick the most useful mode for a fourcc: the largest that fits inside
    CAPTURE_MAX_W/H, preferring an exact match on those dimensions.

    Returns None when the card advertises no size at all; returns the smallest
    advertised mode when every mode exceeds the ceiling, since capturing
    something beats capturing nothing.
    """
    sizes = _sizes_for(fourcc)
    if not sizes:
        return None
    if (CAPTURE_MAX_W, CAPTURE_MAX_H) in sizes:
        return (CAPTURE_MAX_W, CAPTURE_MAX_H)
    within = [s for s in sizes if s[0] <= CAPTURE_MAX_W and s[1] <= CAPTURE_MAX_H]
    if within:
        return max(within, key=lambda s: s[0] * s[1])
    smallest = min(sizes, key=lambda s: s[0] * s[1])
    logger.warning("[usb] every advertised mode exceeds %dx%d; using the smallest (%dx%d)",
                   CAPTURE_MAX_W, CAPTURE_MAX_H, *smallest)
    return smallest


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
            size = env_override or _best_size_for("MJPG") or _current_size() or (CAPTURE_W, CAPTURE_H)
            logger.info("[usb] using MJPEG %dx%d", *size)
            return "mjpeg", size[0], size[1]

        for fourcc in fourccs:
            if fourcc in _RAW_V4L2_TO_FFMPEG:
                size = env_override or _best_size_for(fourcc) or _current_size() or (CAPTURE_W, CAPTURE_H)
                fmt = _RAW_V4L2_TO_FFMPEG[fourcc]
                logger.info("[usb] no MJPEG; using raw %s %dx%d", fmt, *size)
                return fmt, size[0], size[1]

        # Nothing probed — assume MJPEG at the configured fallback size.
        logger.warning("[usb] could not probe formats; defaulting to MJPEG %dx%d",
                       CAPTURE_W, CAPTURE_H)
        return "mjpeg", CAPTURE_W, CAPTURE_H

    def open(self) -> tuple[object, list[subprocess.Popen], int, int]:
        input_format, w, h = self._probe()
        scaling = bool(STREAM_W and STREAM_H)
        out_w, out_h = (STREAM_W, STREAM_H) if scaling else (w, h)

        # The whole point of the JPEG pipeline: when the card already speaks
        # MJPEG and we are not resizing, ffmpeg copies frames byte for byte.
        # No decode, no encode, near-zero CPU.
        if input_format == "mjpeg" and not scaling:
            outputs = passthrough_outputs()
            logger.info("[usb] MJPEG passthrough %dx%d (no re-encode)", w, h)
        else:
            outputs = encode_outputs(STREAM_W, STREAM_H, STREAM_FPS)
            logger.info("[usb] decoding %s %dx%d and re-encoding to MJPEG %dx%d",
                        input_format, w, h, out_w, out_h)

        cmd = [
            "ffmpeg", "-hide_banner", "-loglevel", "error",
            "-f", "v4l2",
            "-input_format", input_format,
            "-video_size", f"{w}x{h}",
            "-framerate", str(STREAM_FPS),
            "-i", VIDEO_DEV,
        ] + outputs
        proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
        return proc.stdout, [proc], out_w, out_h
