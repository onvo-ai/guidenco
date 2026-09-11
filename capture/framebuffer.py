"""
capture/framebuffer.py — the shared screen buffer, with change tracking.

One Framebuffer holds the latest RGB24 pixels. Change detection works on
full-width bands of 64 rows rather than square tiles, because a band is
contiguous in memory: diffing a whole 1080p frame is 17 buffer comparisons
instead of ~500 strided ones. 64 also happens to be the ZRLE tile height, so a
changed band maps onto exactly one row of ZRLE tiles.

Each band carries a version counter. A client remembers the versions it last
sent and asks for bands whose version has moved on, so a still screen costs
nothing and a busy one costs only what actually moved.

Pixels are held as an immutable bytes object and swapped wholesale, never
mutated in place. That is a deliberate performance choice: comparing slices of
bytes runs as a memcmp, while comparing slices of a memoryview goes through
CPython's element-wise path and measures about sixty times slower — 23ms versus
0.4ms for one 1080p frame, which at 10fps is the difference between saturating
a Pi Zero core and barely touching it.
"""

import threading

from .base import BYTES_PER_PIXEL

BAND_H = 64


class Framebuffer:
    def __init__(self, width: int = 0, height: int = 0) -> None:
        self._lock = threading.Lock()
        self._cond = threading.Condition(self._lock)
        # Bumped whenever the screen size changes, so clients know to renegotiate
        # their geometry rather than decode into a stale-sized buffer.
        self.generation = 0
        self._set_size(width, height)

    # ── Geometry ──────────────────────────────────────────────────────────────

    def _set_size(self, width: int, height: int) -> None:
        self.width = width
        self.height = height
        self.stride = width * BYTES_PER_PIXEL
        self.band_count = (height + BAND_H - 1) // BAND_H if height else 0
        self.pixels = bytes(self.stride * height)
        self.versions = [0] * self.band_count
        self.have_frame = False

    def resize(self, width: int, height: int) -> None:
        """Replace the buffer with a new size and wake every waiting client."""
        with self._cond:
            if (width, height) == (self.width, self.height):
                return
            self._set_size(width, height)
            self.generation += 1
            self._cond.notify_all()

    def band_range(self, band: int) -> tuple[int, int]:
        """Byte offsets [start, end) of a band within the pixel buffer."""
        start = band * BAND_H * self.stride
        end = min(start + BAND_H * self.stride, len(self.pixels))
        return start, end

    def band_rows(self, band: int) -> int:
        """Row count of a band — the last one is short unless height divides 64."""
        return min(BAND_H, self.height - band * BAND_H)

    # ── Producer side ─────────────────────────────────────────────────────────

    def update(self, frame: bytes) -> None:
        """
        Take a new full frame, bumping the version of every band that changed.

        Frames whose length doesn't match the current geometry are dropped; the
        capture loop calls resize() when the source resolution changes.
        """
        with self._cond:
            if len(frame) != len(self.pixels) or not self.band_count:
                return

            # Idle screens are the common case, and an identical frame settles
            # in one memcmp that usually exits on the first differing byte.
            if self.have_frame and frame == self.pixels:
                return

            changed = not self.have_frame
            for band in range(self.band_count):
                start, end = self.band_range(band)
                if self.pixels[start:end] != frame[start:end]:
                    self.versions[band] += 1
                    changed = True

            # Swapping the reference is cheaper than copying the changed bands.
            self.pixels = frame
            self.have_frame = True
            if changed:
                self._cond.notify_all()

    # ── Consumer side ─────────────────────────────────────────────────────────

    def snapshot(self, sent_versions: list[int]):
        """
        Copy out everything that has changed since the caller last looked.

        Returns (generation, width, height, runs). A run is
        (top_row, row_count, pixel_bytes, [(band_index, version), ...]) — a
        vertical stack of adjacent changed bands, merged into one rectangle.
        Merging matters twice over: fewer rectangle headers, and a bigger
        contiguous block for zlib to find repetition in.

        Copying happens under the lock so a rectangle can never tear mid-frame;
        encoding then happens outside it, off the capture thread's back.
        """
        with self._cond:
            if not self.have_frame:
                return self.generation, self.width, self.height, []

            dirty = [
                (band, self.versions[band])
                for band in range(self.band_count)
                if not (band < len(sent_versions) and sent_versions[band] == self.versions[band])
            ]
            runs = []
            index = 0
            while index < len(dirty):
                end = index
                while end + 1 < len(dirty) and dirty[end + 1][0] == dirty[end][0] + 1:
                    end += 1
                first_band, last_band = dirty[index][0], dirty[end][0]
                start = self.band_range(first_band)[0]
                stop = self.band_range(last_band)[1]
                rows = sum(self.band_rows(b) for b in range(first_band, last_band + 1))
                runs.append((
                    first_band * BAND_H,
                    rows,
                    self.pixels[start:stop],
                    dirty[index:end + 1],
                ))
                index = end + 1
            return self.generation, self.width, self.height, runs
