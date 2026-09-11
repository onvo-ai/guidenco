"""
rfb/pixels.py — pixel format negotiation.

The capture layer hands us BGR24: three bytes per pixel, blue first. That is
also what the server advertises, so a client which simply accepts our format —
most of them, including mcp-vnc's nodejs-rfb — costs no conversion at all. A
client that asks for a different byte order via SetPixelFormat gets one worked
out here, once, at negotiation time, never per pixel in Python.

Only true-colour formats with 8 bits per channel are supported: 32bpp and 24bpp,
either byte order. That covers every client worth caring about. Anything else
(palette modes, 16bpp low-bandwidth modes) is refused with a clear log line
rather than silently rendered as garbage.
"""

import struct
from dataclasses import dataclass


@dataclass(frozen=True)
class PixelFormat:
    bits_per_pixel: int = 32
    depth: int = 24
    big_endian: int = 0
    true_colour: int = 1
    red_max: int = 255
    green_max: int = 255
    blue_max: int = 255
    # Defaults describe BGR: blue in the lowest byte. This matches the capture
    # buffer and the convention most VNC servers follow.
    red_shift: int = 16
    green_shift: int = 8
    blue_shift: int = 0

    def pack(self) -> bytes:
        return struct.pack(
            ">BBBBHHHBBB3x",
            self.bits_per_pixel, self.depth, self.big_endian, self.true_colour,
            self.red_max, self.green_max, self.blue_max,
            self.red_shift, self.green_shift, self.blue_shift,
        )

    @classmethod
    def unpack(cls, data: bytes) -> "PixelFormat":
        (bpp, depth, be, tc, rmax, gmax, bmax,
         rsh, gsh, bsh) = struct.unpack(">BBBBHHHBBB3x", data[:16])
        return cls(bpp, depth, be, tc, rmax, gmax, bmax, rsh, gsh, bsh)


class UnsupportedPixelFormat(Exception):
    pass


#: Byte offset of each channel within a captured pixel (BGR24).
SOURCE_OFFSET = {"b": 0, "g": 1, "r": 2}


class Translator:
    """
    Converts BGR24 source bytes into a client's pixel layout.

    Exposes two conversions:
      * ``cpixels`` — the 3-byte-per-pixel CPIXEL form that ZRLE uses.
      * ``pixels``  — the full bits_per_pixel form that Raw encoding uses.

    Both are implemented with extended-slice assignment on a bytearray, which
    runs as a strided copy in C. The common case — a client that accepts the
    advertised BGR format — short-circuits to returning the source untouched.
    """

    def __init__(self, fmt: PixelFormat) -> None:
        self.format = fmt
        if not fmt.true_colour:
            raise UnsupportedPixelFormat("palette (non true-colour) formats are not supported")
        if (fmt.red_max, fmt.green_max, fmt.blue_max) != (255, 255, 255):
            raise UnsupportedPixelFormat(
                f"only 8-bit channels are supported, got max "
                f"{fmt.red_max}/{fmt.green_max}/{fmt.blue_max}"
            )
        if fmt.bits_per_pixel not in (24, 32):
            raise UnsupportedPixelFormat(f"{fmt.bits_per_pixel}bpp is not supported")
        if any(s % 8 for s in (fmt.red_shift, fmt.green_shift, fmt.blue_shift)):
            raise UnsupportedPixelFormat("channel shifts must be byte-aligned")

        self.bytes_per_pixel = fmt.bits_per_pixel // 8
        # Byte position each channel occupies once written out in the client's
        # endianness. Index 0 is the first byte on the wire.
        positions = {}
        for channel, shift in (("r", fmt.red_shift), ("g", fmt.green_shift), ("b", fmt.blue_shift)):
            index = shift // 8
            if fmt.big_endian:
                index = self.bytes_per_pixel - 1 - index
            positions[channel] = index
        self._positions = positions

        used = sorted(positions.values())
        if len(set(used)) != 3:
            raise UnsupportedPixelFormat("red, green and blue overlap in the same byte")

        # CPIXEL is the 3 significant bytes, in wire order. The spec only allows
        # the compact form when those bytes sit at one end of the pixel.
        if self.bytes_per_pixel == 3:
            cpixel_bytes = [0, 1, 2]
        elif used in ([0, 1, 2], [1, 2, 3]):
            cpixel_bytes = used
        else:
            raise UnsupportedPixelFormat("significant bytes are not contiguous at one end")

        source_of = {positions[c]: SOURCE_OFFSET[c] for c in ("r", "g", "b")}
        self._cpixel_perm = [source_of[b] for b in cpixel_bytes]
        self.cpixel_identity = self._cpixel_perm == [0, 1, 2]

    def __str__(self) -> str:
        order = "".join(
            channel.upper()
            for channel, _ in sorted(self._positions.items(), key=lambda kv: kv[1])
        )
        return f"{self.format.bits_per_pixel}bpp {order}" + (
            " big-endian" if self.format.big_endian else ""
        )

    def cpixels(self, source: bytes) -> bytes:
        """BGR24 → 3-byte CPIXELs in the client's channel order."""
        if self.cpixel_identity:
            return source
        out = bytearray(len(source))
        out[0::3] = source[self._cpixel_perm[0]::3]
        out[1::3] = source[self._cpixel_perm[1]::3]
        out[2::3] = source[self._cpixel_perm[2]::3]
        return bytes(out)

    def pixels(self, source: bytes) -> bytes:
        """BGR24 → full-width pixels for Raw encoding. Padding bytes stay zero."""
        stride = self.bytes_per_pixel
        if stride == 3 and self.cpixel_identity:
            return source
        out = bytearray((len(source) // 3) * stride)
        for channel, offset in SOURCE_OFFSET.items():
            out[self._positions[channel]::stride] = source[offset::3]
        return bytes(out)


#: What the server advertises in ServerInit — identical to the capture layout,
#: so a client that simply accepts it costs us no conversion at all.
NATIVE_FORMAT = PixelFormat()
