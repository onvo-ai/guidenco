"""
rfb/encodings.py — turning changed pixels into RFB rectangles.

ZRLE is the encoding of choice: it is understood by every VNC client worth
naming, including the nodejs-rfb library that mcp-vnc uses (which notably does
*not* implement Tight, so JPEG is off the table). Raw is kept as a fallback for
clients that somehow offer nothing better.

The ZRLE tiles here only ever use two of the six sub-encodings: "solid" for a
uniform tile and "raw" for everything else. The remaining four (packed palette
and the RLE variants) would shave bytes before compression, but each costs a
per-pixel Python loop — which on a Pi Zero is far more expensive than the bytes
it saves, given zlib is already squeezing the stream behind them.
"""

import struct
import zlib

RAW = 0
ZRLE = 16
PSEUDO_DESKTOP_SIZE = -223

TILE = 64

#: zlib level 1. Levels above this buy a few percent on screen content for
#: several times the CPU, which is the wrong trade on a Pi Zero 2 W.
ZLIB_LEVEL = 1


def rect_header(x: int, y: int, width: int, height: int, encoding: int) -> bytes:
    return struct.pack(">HHHHi", x, y, width, height, encoding)


def update_message(rects: list[bytes]) -> bytes:
    """A FramebufferUpdate carrying already-encoded rectangles."""
    return struct.pack(">BxH", 0, len(rects)) + b"".join(rects)


def desktop_size_rect(width: int, height: int) -> bytes:
    """Pseudo-rectangle telling the client the screen resolution changed."""
    return rect_header(0, 0, width, height, PSEUDO_DESKTOP_SIZE)


class RawEncoder:
    """Uncompressed pixels. Simple, and roughly 30x fatter than ZRLE."""

    encoding = RAW

    def __init__(self, translator) -> None:
        self.translator = translator

    def encode(self, x: int, y: int, width: int, height: int,
               rgb: bytes, stride: int) -> bytes:
        row_bytes = width * 3
        if stride == row_bytes:
            body = self.translator.pixels(rgb)
        else:
            body = self.translator.pixels(
                b"".join(rgb[r * stride:r * stride + row_bytes] for r in range(height))
            )
        return rect_header(x, y, width, height, RAW) + body


class ZrleEncoder:
    """
    ZRLE with a single zlib stream for the whole connection.

    The stream is stateful and shared across rectangles — that is what the spec
    requires and what makes it compress well, since a redrawn region usually
    looks a lot like one the client was already sent. Each rectangle ends with a
    Z_SYNC_FLUSH so the client can decode it without waiting for more input.
    """

    encoding = ZRLE

    def __init__(self, translator) -> None:
        self.translator = translator
        self._zlib = zlib.compressobj(ZLIB_LEVEL)

    def encode(self, x: int, y: int, width: int, height: int,
               rgb: bytes, stride: int) -> bytes:
        payload = bytearray()
        for tile_y in range(0, height, TILE):
            tile_h = min(TILE, height - tile_y)
            for tile_x in range(0, width, TILE):
                tile_w = min(TILE, width - tile_x)
                payload += self._tile(rgb, stride, tile_x, tile_y, tile_w, tile_h)

        compressed = self._zlib.compress(bytes(payload)) + self._zlib.flush(zlib.Z_SYNC_FLUSH)
        return (rect_header(x, y, width, height, ZRLE)
                + struct.pack(">I", len(compressed))
                + compressed)

    def _tile(self, rgb: bytes, stride: int,
              tile_x: int, tile_y: int, tile_w: int, tile_h: int) -> bytes:
        start = tile_x * 3
        end = start + tile_w * 3
        raw = b"".join(
            rgb[(tile_y + row) * stride + start:(tile_y + row) * stride + end]
            for row in range(tile_h)
        )
        cpixels = self.translator.cpixels(raw)

        # Solid tiles are everywhere on a real desktop (blank margins, flat
        # backgrounds) and collapse 12KB to 4 bytes before zlib even sees them.
        first = cpixels[:3]
        if cpixels == first * (tile_w * tile_h):
            return b"\x01" + first
        return b"\x00" + cpixels


def make_encoder(client_encodings: list[int], translator):
    """Pick the best encoder the client admits to understanding."""
    if ZRLE in client_encodings:
        return ZrleEncoder(translator)
    return RawEncoder(translator)
