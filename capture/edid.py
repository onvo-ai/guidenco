"""
capture/edid.py — build the EDID the CSI adapter advertises to the source.

The TC358743 has no EDID of its own; we hand it one and it replays that to
whatever is plugged into the HDMI socket. What we put in it decides what the
source sends, which is the only control we have over the incoming signal.

It matters because the Pi Zero 2 W wires two CSI lanes to the adapter. That is
enough for 1080p30 and not enough for 1080p60, so the EDID must not advertise
1080p60 — a source that picks it produces a signal we cannot carry.

Built here rather than shipped as a hex blob so the timings stay readable and
the checksums are always right: a single wrong byte in an EDID is the kind of
fault that shows up as "no picture" with nothing in the logs to say why.
"""

# ── Structure ─────────────────────────────────────────────────────────────────
#
# An EDID is a 128-byte base block, optionally followed by extension blocks.
# Each block ends with a checksum byte chosen so the block sums to 0 mod 256.
# The base block carries identity and up to four 18-byte descriptors; the CEA
# extension carries the list of TV formats the sink accepts.

BLOCK = 128
DESCRIPTOR = 18


def _checksum(block: bytes) -> int:
    """The byte that makes a block sum to zero, mod 256."""
    return (-sum(block)) & 0xFF


def _seal(block: bytearray) -> bytes:
    """Pad a block to 128 bytes and stamp its checksum."""
    if len(block) > BLOCK - 1:
        raise ValueError(f"block is {len(block)} bytes, over the {BLOCK - 1} limit")
    block.extend(bytes(BLOCK - 1 - len(block)))
    block.append(_checksum(block))
    return bytes(block)


def _manufacturer(code: str) -> bytes:
    """Three letters packed five bits each, as EDID has done since 1994."""
    if len(code) != 3 or not code.isalpha():
        raise ValueError("manufacturer code must be three letters")
    bits = 0
    for letter in code.upper():
        bits = (bits << 5) | (ord(letter) - ord("A") + 1)
    return bits.to_bytes(2, "big")


def detailed_timing(pixel_clock_khz: int,
                    h_active: int, h_front: int, h_sync: int, h_blank: int,
                    v_active: int, v_front: int, v_sync: int, v_blank: int,
                    width_mm: int, height_mm: int) -> bytes:
    """
    One 18-byte detailed timing descriptor.

    The format splits every value across a low byte and a nibble in a shared
    high byte, which is why this is arithmetic rather than a literal.
    """
    if pixel_clock_khz % 10:
        raise ValueError("pixel clock must be a multiple of 10 kHz")
    clock = pixel_clock_khz // 10
    if not 0 < clock <= 0xFFFF:
        raise ValueError("pixel clock out of range")

    return bytes([
        clock & 0xFF, (clock >> 8) & 0xFF,
        h_active & 0xFF,
        h_blank & 0xFF,
        ((h_active >> 8) & 0x0F) << 4 | ((h_blank >> 8) & 0x0F),
        v_active & 0xFF,
        v_blank & 0xFF,
        ((v_active >> 8) & 0x0F) << 4 | ((v_blank >> 8) & 0x0F),
        h_front & 0xFF,
        h_sync & 0xFF,
        ((v_front & 0x0F) << 4) | (v_sync & 0x0F),
        (((h_front >> 8) & 0x03) << 6) | (((h_sync >> 8) & 0x03) << 4)
        | (((v_front >> 4) & 0x03) << 2) | ((v_sync >> 4) & 0x03),
        width_mm & 0xFF,
        height_mm & 0xFF,
        ((width_mm >> 8) & 0x0F) << 4 | ((height_mm >> 8) & 0x0F),
        0x00,                       # horizontal border
        0x00,                       # vertical border
        0x1E,                       # digital separate sync, both polarities +
    ])


# 1920x1080 at 30 Hz — CEA format 34. Front porch, sync width and blanking are
# the values that format defines; they are not ours to choose.
TIMING_1080P30 = dict(
    pixel_clock_khz=74250,
    h_active=1920, h_front=88, h_sync=44, h_blank=280,
    v_active=1080, v_front=4, v_sync=5, v_blank=45,
    width_mm=520, height_mm=290,
)


def _text_descriptor(tag: int, text: str) -> bytes:
    """A descriptor carrying up to 13 characters, newline-terminated."""
    body = text.encode("ascii")[:13]
    body += b"\x0a" + b"\x20" * (13 - len(body) - 1) if len(body) < 13 else b""
    return bytes([0x00, 0x00, 0x00, tag, 0x00]) + body


def _range_limits(v_min: int, v_max: int, h_min: int, h_max: int,
                  max_clock_mhz: int) -> bytes:
    """Monitor range limits: the envelope a source must stay inside."""
    return bytes([0x00, 0x00, 0x00, 0xFD, 0x00,
                  v_min, v_max, h_min, h_max,
                  # Stored in units of 10 MHz, rounded up so the limit is never
                  # advertised below a mode we actually accept.
                  (max_clock_mhz + 9) // 10,
                  0x00, 0x0A, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20])


def _base_block(name: str) -> bytes:
    block = bytearray()
    block += bytes([0x00, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0x00])  # header
    block += _manufacturer("GDC")
    block += (0x0001).to_bytes(2, "little")     # product code
    block += (0).to_bytes(4, "little")          # serial number
    block += bytes([0x01, 0x22])                # week 1, year 2024 (1990 + 34)
    block += bytes([0x01, 0x03])                # EDID 1.3
    block += bytes([0x80])                      # digital input
    block += bytes([52, 29])                    # screen size, cm
    block += bytes([0x78])                      # gamma 2.2
    block += bytes([0x0E])                      # RGB, sRGB, preferred timing
    # Standard sRGB colour primaries.
    block += bytes([0xEE, 0x91, 0xA3, 0x54, 0x4C, 0x99, 0x26, 0x0F, 0x50, 0x54])
    block += bytes([0x20, 0x00, 0x00])          # established: 640x480@60 only
    block += bytes([0x01, 0x01]) * 8            # no standard timings

    block += detailed_timing(**TIMING_1080P30)  # preferred mode
    block += _range_limits(24, 75, 15, 70, 75)
    block += _text_descriptor(0xFC, name)
    block += bytes([0x00, 0x00, 0x00, 0x10, 0x00]) + bytes(13)  # unused

    block += bytes([0x01])                      # one extension block follows
    return _seal(block)


def _cea_block() -> bytes:
    # Video data block: the formats we accept, most preferred first. 1080p60
    # (format 16) is deliberately absent — see the module docstring.
    video = bytes([
        (2 << 5) | 3,       # video data block, three entries
        34 | 0x80,          # 1920x1080p30, flagged native
        4,                  # 1280x720p60
        1,                  # 640x480p60
    ])
    # Vendor block carrying the HDMI OUI. Without it a source treats the sink as
    # DVI and drops HDMI signalling.
    vendor = bytes([
        (3 << 5) | 5,       # vendor-specific data block, five bytes
        0x03, 0x0C, 0x00,   # HDMI Licensing IEEE registration ID
        0x10, 0x00,         # source physical address 1.0.0.0
    ])

    blocks = video + vendor
    header = bytes([
        0x02,               # CEA extension
        0x03,               # version 3
        4 + len(blocks),    # offset to the first detailed timing
        0x01,               # one native detailed timing, no basic audio claimed
    ])
    return _seal(bytearray(header + blocks + detailed_timing(**TIMING_1080P30)))


def build(name: str = "guidenco") -> bytes:
    """The full EDID: base block plus CEA extension."""
    return _base_block(name) + _cea_block()


def to_hex(edid: bytes) -> str:
    """
    v4l2-ctl's --set-edid=file= format: plain hex, 16 bytes to a line.
    """
    lines = [edid[i:i + 16].hex() for i in range(0, len(edid), 16)]
    return "\n".join(lines) + "\n"


if __name__ == "__main__":
    import sys
    sys.stdout.write(to_hex(build()))
