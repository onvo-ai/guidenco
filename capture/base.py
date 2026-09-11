"""
capture/base.py — shared pieces for the capture backends.

A backend produces a process whose stdout is a stream of JPEG frames. JPEG is
the native currency here: USB capture cards emit MJPEG on the wire, and the API
serves JPEG, so for those cards ffmpeg copies frames through without decoding
or re-encoding them at all. The CSI adapter delivers raw UYVY and is the only
path that pays for an encode.
"""

import subprocess
from typing import Iterator

# ffmpeg mjpeg -q:v scale (1 = best, 31 = worst). Only used where we actually
# encode; a passthrough card's own quality is whatever it chose.
FFMPEG_QUALITY = 4

# Frames shorter than this are treated as truncated fragments, which a source
# emits while changing resolution or losing sync. Kept low: a real 1080p frame
# is tens of kilobytes, but a small or very dark capture can be legitimately
# tiny, and silently discarding real frames is far worse than passing on a
# fragment that the client will simply fail to decode.
MIN_FRAME_BYTES = 256


def iter_mjpeg(stream, chunk_size: int = 65536) -> Iterator[bytes]:
    """
    Yield complete JPEG frames from a byte stream.

    Frames are delimited by the JPEG SOI (FF D8) and EOI (FF D9) markers.
    Terminates at EOF, e.g. when the producing process exits.

    Reads with read1() rather than read(): on a buffered pipe, read(n) blocks
    until it has all n bytes, so frames would sit unpublished in the buffer
    waiting for enough of the *next* ones to arrive. read1() returns whatever
    a single syscall gives, which is what a live stream needs.
    """
    read = getattr(stream, "read1", None) or stream.read
    buf = b""
    while True:
        data = read(chunk_size)
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
            frame = buf[start:end + 2]
            buf = buf[end + 2:]
            if len(frame) > MIN_FRAME_BYTES:
                yield frame


def encode_outputs(scale_w: int, scale_h: int, fps: int = 0) -> list[str]:
    """
    ffmpeg output stage that re-encodes to MJPEG, optionally downscaling and
    rate-limiting.

    The fps cap matters more than it looks. A capture device streams at the
    source's rate — 30fps or more — and without a filter ffmpeg encodes every
    frame it is handed, however many that is. On anything but the fastest board
    that saturates the CPU producing frames nobody will ever read, since only
    the most recent one is ever served. Passing -framerate on a rawvideo input
    does NOT cap it: that is a declaration about the input, not a limit.
    """
    filters = []
    if fps:
        filters.append(f"fps={fps}")
    if scale_w and scale_h:
        filters.append(f"scale={scale_w}:{scale_h}:flags=fast_bilinear")
    args = ["-vf", ",".join(filters)] if filters else []
    return args + ["-q:v", str(FFMPEG_QUALITY), "-f", "mjpeg", "pipe:1"]


def passthrough_outputs() -> list[str]:
    """
    ffmpeg output stage that copies JPEG frames verbatim.

    No decode, no scale, no re-encode — the card's own frames reach the client
    untouched. This is why an idle Pi costs essentially nothing.
    """
    return ["-c:v", "copy", "-f", "mjpeg", "pipe:1"]


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
        object yielding JPEG frames, and *procs* is every process to terminate
        on shutdown or restart.
        """
        raise NotImplementedError


def jpeg_size(frame: bytes) -> tuple[int, int] | None:
    """
    Width and height from a JPEG's start-of-frame marker, or None.

    Used where the true frame size matters more than the size we asked for.
    Walks the marker segments rather than guessing at fixed offsets, because
    the number and order of headers before SOF varies between encoders.
    """
    index = 2                      # skip SOI
    while index + 9 < len(frame):
        if frame[index] != 0xFF:
            index += 1
            continue
        marker = frame[index + 1]
        # SOF0-SOF15, excluding the non-frame markers DHT, JPGA and DAC.
        if 0xC0 <= marker <= 0xCF and marker not in (0xC4, 0xC8, 0xCC):
            height = int.from_bytes(frame[index + 5:index + 7], "big")
            width = int.from_bytes(frame[index + 7:index + 9], "big")
            return width, height
        if marker in (0xD8, 0x01) or 0xD0 <= marker <= 0xD7:
            index += 2
            continue
        length = int.from_bytes(frame[index + 2:index + 4], "big")
        if length < 2:
            return None
        index += 2 + length
    return None
