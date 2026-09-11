"""
capture/test_source.py — synthetic capture source for development.

Generates a moving pattern in-process and feeds it through an os.pipe(), so the
RFB server can be exercised end to end on a laptop with no capture hardware,
no ffmpeg and no Pi. Selected with CAPTURE_TYPE=test.

Only part of the frame moves between ticks, which is what makes it useful: it
exercises the band-diff path rather than marking every band dirty each frame.
"""

import os
import threading
import time

from config import CAPTURE_W, CAPTURE_H, STREAM_W, STREAM_H, STREAM_FPS
from .base import CaptureBackend, BYTES_PER_PIXEL


class TestBackend(CaptureBackend):
    def __init__(self, width: int = 0, height: int = 0, fps: int = 0) -> None:
        self.width = width or STREAM_W or CAPTURE_W
        self.height = height or STREAM_H or CAPTURE_H
        self.fps = fps or STREAM_FPS
        self._stop = threading.Event()

    def open(self) -> tuple[object, list, int, int]:
        read_fd, write_fd = os.pipe()
        reader = os.fdopen(read_fd, "rb")
        threading.Thread(
            target=self._feed, args=(write_fd,),
            daemon=True, name="test-source",
        ).start()
        return reader, [], self.width, self.height

    def close(self) -> None:
        self._stop.set()

    # ── Frame generation ──────────────────────────────────────────────────────

    def _background(self) -> bytearray:
        """A static BGR gradient — the part of the screen that never moves."""
        row = bytearray()
        for x in range(self.width):
            shade = (x * 255) // max(1, self.width - 1)
            row += bytes((shade, 40, 255 - shade))
        return bytearray(row) * self.height

    def _feed(self, write_fd: int) -> None:
        stride = self.width * BYTES_PER_PIXEL
        base = self._background()
        bar_h = min(64, self.height)
        interval = 1.0 / max(1, self.fps)
        step = 0
        try:
            while not self._stop.is_set():
                frame = bytearray(base)
                # A white bar sliding down the screen, dirtying one or two bands.
                top = (step * 16) % max(1, self.height - bar_h)
                for y in range(top, top + bar_h):
                    frame[y * stride:(y + 1) * stride] = b"\xff" * stride
                os.write(write_fd, bytes(frame))
                step += 1
                time.sleep(interval)
        except (BrokenPipeError, OSError):
            pass
        finally:
            try:
                os.close(write_fd)
            except OSError:
                pass
