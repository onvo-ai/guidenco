#!/usr/bin/env python3
"""
tools/get_screenshot_capture_card.py
=====================================
Returns the latest frame from the persistent CaptureCardManager.

When called from server.py the manager is already running.
When called standalone it starts its own manager instance and waits
for the first frame (up to 15 s warmup, then falls back to direct ffmpeg).
"""

import logging
import os
import subprocess
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from config import NATIVE_W, NATIVE_H, VIDEO_DEV, TEMP_DIR

logger = logging.getLogger("guidenco")

SCREENSHOT_PATH = os.path.join(TEMP_DIR, "screenshot_capture_card.jpg")


def get_screenshot_capture_card() -> str | None:
    os.makedirs(TEMP_DIR, exist_ok=True)

    try:
        from tools.capture_card_manager import get_manager
        mgr = get_manager()
        if mgr._running:
            frame = mgr.get_fresh_frame(timeout=2)
            if frame:
                with open(SCREENSHOT_PATH, "wb") as f:
                    f.write(frame)
                return SCREENSHOT_PATH
    except Exception:
        pass

    # ── Standalone fallback: quick single-frame grab ───────────────────────
    try:
        with tempfile.TemporaryDirectory() as tmp:
            raw = os.path.join(tmp, "raw.mjpg")
            subprocess.run(
                [
                    "v4l2-ctl", "-d", VIDEO_DEV,
                    "--set-fmt-video=width={},height={},pixelformat=MJPG".format(NATIVE_W, NATIVE_H),
                    "--stream-mmap", "--stream-count=5",
                    "--stream-to", raw,
                ],
                capture_output=True, timeout=15,
            )
            with open(raw, "rb") as f:
                data = f.read()

            # Find the largest JPEG frame
            offsets = [i for i in range(len(data) - 1)
                       if data[i] == 0xFF and data[i + 1] == 0xD8]
            if not offsets:
                return None

            best = max(
                ((data.find(b"\xff\xd9", off) + 2 - off, off)
                 for off in offsets),
                key=lambda x: x[0],
            )
            size, start = best
            frame = data[start : start + size]
            if len(frame) < 1000:
                return None

            with open(SCREENSHOT_PATH, "wb") as f:
                f.write(frame)
            return SCREENSHOT_PATH
    except Exception as exc:
        logger.error(f"[capture_card] fallback failed: {exc}")
        return None


if __name__ == "__main__":
    path = get_screenshot_capture_card()
    if path:
        print(f"Screenshot saved to {path}")
    else:
        print("Failed to capture from capture card")
