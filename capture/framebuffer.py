"""
capture/framebuffer.py — holds the most recent JPEG frame.

Now that frames are served as JPEG rather than re-encoded per client, this is
just a latest-value box with a condition variable: producers replace the frame,
consumers either grab the current one or wait for a newer one. The band-diffing
and version tracking that lived here existed only to feed the RFB encoder and
went with it.
"""

import threading
import time


class Framebuffer:
    def __init__(self, width: int = 0, height: int = 0) -> None:
        self._cond = threading.Condition()
        self.width = width
        self.height = height
        #: The part of the frame that is actually the screen, as (x, y, w, h).
        #: Equal to the whole frame unless the source is letterboxed. Input
        #: coordinates are measured against this, not against the frame.
        self.active = (0, 0, width, height)
        self.frame: bytes | None = None
        #: Incremented for every frame, so a consumer can tell "newer than the
        #: one I last saw" without comparing megabytes of pixels.
        self.sequence = 0

    def resize(self, width: int, height: int) -> None:
        with self._cond:
            if (width, height) == (self.width, self.height):
                return
            self.width, self.height = width, height
            # A new geometry invalidates any previously detected screen area.
            self.active = (0, 0, width, height)
            self.frame = None
            self._cond.notify_all()

    def set_active(self, area: tuple[int, int, int, int]) -> None:
        with self._cond:
            self.active = area

    def update(self, frame: bytes) -> None:
        with self._cond:
            self.frame = frame
            self.sequence += 1
            self._cond.notify_all()

    def latest(self, timeout: float = 5.0) -> tuple[bytes | None, int]:
        """The current frame, waiting up to *timeout* for the first one."""
        deadline = time.monotonic() + timeout
        with self._cond:
            while self.frame is None:
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    return None, self.sequence
                self._cond.wait(remaining)
            return self.frame, self.sequence

    def next_after(self, sequence: int, timeout: float = 5.0) -> tuple[bytes | None, int]:
        """
        Block until a frame newer than *sequence* arrives.

        Waits in a loop against the condition rather than once, which is not
        pedantry: resize() notifies every waiter when a stream opens, so a
        single wait would be woken before any frame existed and would then
        report a timeout that had not happened.

        Returns (None, sequence) on a real timeout, so a caller can decide
        whether to keep waiting or give up.
        """
        deadline = time.monotonic() + timeout
        with self._cond:
            while self.sequence <= sequence:
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    return None, sequence
                self._cond.wait(remaining)
            return self.frame, self.sequence

    @property
    def ready(self) -> bool:
        return self.frame is not None
