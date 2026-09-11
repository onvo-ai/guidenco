"""
capture/test_source.py — synthetic capture source for development.

Replays a small MJPEG fixture through an os.pipe(), so the API can be exercised
end to end on a laptop with no capture hardware, no ffmpeg and no image
library. Selected with CAPTURE_TYPE=test.

The fixture is testpattern.mjpeg — three noisy frames concatenated, which is
all an MJPEG stream is. They are deliberately realistic in size rather than a
few hundred bytes, because tiny frames would slip past the truncated-fragment
filter in base.iter_mjpeg and hide bugs that real capture would expose.
"""

import os
import pathlib
import threading
import time

from config import CAPTURE_W, CAPTURE_H, STREAM_FPS
from .base import CaptureBackend, iter_mjpeg, jpeg_size

FIXTURE = pathlib.Path(__file__).with_name("testpattern.mjpeg")


def _load_frames() -> list[bytes]:
    with open(FIXTURE, "rb") as handle:
        return list(iter_mjpeg(handle))


class TestBackend(CaptureBackend):
    def __init__(self, width: int = 0, height: int = 0, fps: int = 0) -> None:
        # Default to the fixture's true dimensions rather than the configured
        # capture size, so /health does not advertise a screen geometry that
        # the frames themselves contradict.
        native = jpeg_size(_load_frames()[0]) or (CAPTURE_W, CAPTURE_H)
        self.width = width or native[0]
        self.height = height or native[1]
        self.fps = fps or STREAM_FPS
        self._stop = threading.Event()

    def open(self) -> tuple[object, list, int, int]:
        read_fd, write_fd = os.pipe()
        reader = os.fdopen(read_fd, "rb")
        threading.Thread(target=self._feed, args=(write_fd,),
                         daemon=True, name="test-source").start()
        return reader, [], self.width, self.height

    def close(self) -> None:
        self._stop.set()

    def _feed(self, write_fd: int) -> None:
        frames = _load_frames()
        interval = 1.0 / max(1, self.fps)
        index = 0
        try:
            while not self._stop.is_set():
                os.write(write_fd, frames[index % len(frames)])
                index += 1
                time.sleep(interval)
        except (BrokenPipeError, OSError):
            pass
        finally:
            try:
                os.close(write_fd)
            except OSError:
                pass
