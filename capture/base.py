"""
capture/base.py — shared pieces for the capture backends.

A backend produces a process whose stdout is a stream of raw BGR24 frames at a
known size.

BGR rather than RGB is deliberate, for two reasons. It is the byte order most
real VNC servers advertise, so clients are well tested against it — including
nodejs-rfb, the library mcp-vnc uses, whose decoder hardcodes a BGR-to-RGBA
swap and ignores the negotiated channel shifts entirely. And it is byte-for-byte
the CPIXEL layout such a client wants, so the RFB encoder slices pixels straight
out of the framebuffer with no per-pixel conversion.
"""

import subprocess
from typing import Iterator

BYTES_PER_PIXEL = 3   # BGR24


def encode_outputs(scale_w: int, scale_h: int) -> list[str]:
    """
    ffmpeg output stage: emit raw BGR24 on stdout, optionally downscaled.

    scale_w/scale_h of 0 means "no scaling" — serve the source resolution.
    """
    args = []
    if scale_w and scale_h:
        args += ["-vf", f"scale={scale_w}:{scale_h}:flags=fast_bilinear"]
    return args + ["-pix_fmt", "bgr24", "-f", "rawvideo", "pipe:1"]


def iter_frames(stream, frame_bytes: int) -> Iterator[bytes]:
    """
    Yield fixed-size raw frames from a byte stream.

    Raw video has no framing markers, so a frame is simply the next
    ``frame_bytes`` bytes. Stops at EOF, discarding any trailing partial frame.
    """
    while True:
        buf = stream.read(frame_bytes)
        if buf is None or len(buf) < frame_bytes:
            return
        yield buf


class CaptureBackend:
    """Base class for capture backends. Subclasses implement open()."""

    def prepare(self) -> bool:
        """
        Per-restart readiness check (e.g. CSI EDID negotiation). Return True
        when capture can begin, False to back off and retry.
        """
        return True

    def open(self) -> tuple[object, list[subprocess.Popen], int, int]:
        """
        Start the capture pipeline.

        Returns (stream, procs, width, height): *stream* is a readable file
        object yielding raw RGB24 frames of exactly width*height*3 bytes, and
        *procs* is every process to terminate on shutdown or restart. Returning
        a bare stream rather than a process lets the synthetic test backend use
        the same path without spawning anything.
        """
        raise NotImplementedError
