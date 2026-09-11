"""
capture/letterbox.py — find the part of the frame that is actually the screen.

A capture device always delivers its own fixed resolution. When the source's
aspect ratio differs — a 1512x982 desktop mirrored to a 1920x1080 card, say —
the source pads the difference with black bars, and the frame is then larger
than the screen inside it.

That matters for input, not just looks. Pointer position is sent to the target
as a fraction of its screen, so a coordinate read off the frame has to be
measured against the screen area, not the whole frame. Ignoring the bars puts
every click off by up to the width of one bar: nothing at the centre, growing
towards the edges, which is the worst possible shape for a bug — it looks like
it works until it quietly doesn't.

Detection is ffmpeg's cropdetect filter on a single frame. It is only run when
the stream starts and then occasionally, never per frame, so the JPEG
passthrough is untouched.
"""

import logging
import re
import subprocess

logger = logging.getLogger("guidenco.capture.letterbox")

#: Pixel values at or below this count as black. ffmpeg's own default is 24;
#: a capture card's "black" is never truly 0 because of analogue noise and
#: lossy encoding, so some tolerance is required.
BLACK_LIMIT = 24

#: Refuse a detection covering less of the frame than this. A genuinely dark
#: screen — a screensaver, a terminal, a video letterboxed *within* the
#: desktop — would otherwise be mistaken for bars and shrink the usable area.
MIN_AREA_FRACTION = 0.40

_CROP = re.compile(r"crop=(\d+):(\d+):(\d+):(\d+)")


def detect(frame: bytes, width: int, height: int,
           timeout: float = 10.0) -> tuple[int, int, int, int]:
    """
    The active screen area within a frame, as (x, y, width, height).

    Returns the whole frame when there are no bars, when detection fails, or
    when the result looks implausible. Falling back to the full frame is always
    safe: it is exactly the behaviour of not detecting at all.
    """
    full = (0, 0, width, height)
    if not frame or width <= 0 or height <= 0:
        return full

    try:
        result = subprocess.run(
            ["ffmpeg", "-hide_banner", "-loglevel", "info",
             "-f", "mjpeg", "-i", "pipe:0",
             # skip=0 is essential: cropdetect skips its first two frames by
             # default and would report nothing at all for a single one.
             "-vf", f"cropdetect=limit={BLACK_LIMIT}:round=2:skip=0:reset=1",
             "-frames:v", "1", "-f", "null", "-"],
            input=frame, capture_output=True, timeout=timeout)
    except Exception as exc:
        logger.debug("[letterbox] cropdetect failed: %s", exc)
        return full

    matches = _CROP.findall(result.stderr.decode(errors="replace"))
    if not matches:
        return full

    w, h, x, y = (int(v) for v in matches[-1])
    if w <= 0 or h <= 0 or x < 0 or y < 0 or x + w > width or y + h > height:
        logger.warning("[letterbox] ignoring nonsensical crop %dx%d+%d+%d", w, h, x, y)
        return full
    if (w * h) < (width * height * MIN_AREA_FRACTION):
        logger.info("[letterbox] detected area %dx%d is under %.0f%% of the frame; "
                    "treating the whole frame as the screen. A very dark screen "
                    "can look like letterboxing.",
                    w, h, MIN_AREA_FRACTION * 100)
        return full

    if (x, y, w, h) != full:
        logger.info("[letterbox] screen occupies %dx%d at +%d+%d of the %dx%d frame "
                    "(bars: %d left, %d right, %d top, %d bottom)",
                    w, h, x, y, width, height,
                    x, width - (x + w), y, height - (y + h))
    return x, y, w, h
