"""
capture/base.py — shared pieces for the capture backends.

A backend's job is to produce a process whose stdout is a stream of JPEG frames.
The CaptureManager reads that stream, splits it into individual frames, and
publishes them. Everything common to both the USB and CSI backends lives here.
"""

import subprocess
from typing import Iterator

from config import STREAM_W, STREAM_H

# ffmpeg mjpeg -q:v scale (1 = best, 31 = worst). 6 is a good size/quality
# trade-off for downscaled 960×540 frames over a metered uplink.
FFMPEG_QUALITY = 6

# Minimum byte length for a frame to be considered real (filters truncated
# fragments produced during signal changes).
MIN_FRAME_BYTES = 1000


def encode_outputs() -> list[str]:
    """ffmpeg output stage: downscale to the stream size and emit MJPEG to stdout."""
    return [
        "-vf", f"scale={STREAM_W}:{STREAM_H}:flags=fast_bilinear",
        "-q:v", str(FFMPEG_QUALITY),
        "-f", "mjpeg", "pipe:1",
    ]


def iter_mjpeg(stream, chunk_size: int = 65536) -> Iterator[bytes]:
    """
    Yield complete JPEG frames from a byte stream.

    Frames are delimited by the JPEG SOI (FF D8) and EOI (FF D9) markers.
    Terminates when the stream returns EOF (e.g. the producing process exits).
    """
    buf = b""
    while True:
        data = stream.read(chunk_size)
        if not data:
            return
        buf += data
        while True:
            start = buf.find(b"\xff\xd8")
            if start == -1:
                buf = b""
                break
            end = buf.find(b"\xff\xd9", start + 2)
            if end == -1:
                buf = buf[start:]
                break
            frame = buf[start : end + 2]
            buf = buf[end + 2 :]
            if len(frame) > MIN_FRAME_BYTES:
                yield frame


class CaptureBackend:
    """Base class for capture backends. Subclasses implement open()."""

    # Number of leading frames to discard after each (re)start. The first frame
    # after a stream start is often partial (e.g. a CSI source-change event).
    warmup_frames = 0

    def prepare(self) -> bool:
        """
        One-time / per-restart readiness check (e.g. CSI EDID negotiation).
        Return True when capture can begin, False to retry shortly.
        """
        return True

    def open(self) -> tuple[subprocess.Popen, list[subprocess.Popen]]:
        """
        Start the capture pipeline.

        Returns (frame_proc, all_procs): frame_proc.stdout yields the MJPEG
        stream; all_procs is every process to terminate on shutdown/restart.
        """
        raise NotImplementedError
