"""
tests/rfb_client.py — a small RFB client, written only for the tests.

This exists so the integration test proves something real: that bytes coming
off the server socket decode back into the exact pixels the capture layer put
in. A test that called the server's own encoder to check the server's encoder
would prove nothing.

It implements the client half of RFB 3.8 plus a ZRLE and Raw decoder. It is not
a general-purpose client and makes no attempt to be tolerant.
"""

import socket
import struct
import zlib

TILE = 64


class TestClient:
    def __init__(self, host: str, port: int, password: str = "") -> None:
        self.sock = socket.create_connection((host, port), timeout=10)
        self.password = password
        self.zlib = zlib.decompressobj()
        self.width = 0
        self.height = 0
        self.name = ""
        self.pixel_format = None
        self.bytes_per_pixel = 4
        # Wire byte offsets of the three significant channel bytes, i.e. the
        # bytes a ZRLE CPIXEL would carry, in the same order.
        self.significant = [0, 1, 2]

    # ── Plumbing ──────────────────────────────────────────────────────────────

    def _recv(self, count: int) -> bytes:
        data = bytearray()
        while len(data) < count:
            chunk = self.sock.recv(count - len(data))
            if not chunk:
                raise ConnectionError(f"server closed after {len(data)}/{count} bytes")
            data += chunk
        return bytes(data)

    def close(self) -> None:
        self.sock.close()

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        self.close()

    # ── Handshake ─────────────────────────────────────────────────────────────

    def handshake(self, shared: bool = True) -> None:
        version = self._recv(12)
        assert version == b"RFB 003.008\n", version
        self.sock.sendall(version)

        count = self._recv(1)[0]
        assert count > 0, "server refused the connection during security negotiation"
        types = list(self._recv(count))

        if 2 in types:
            self.sock.sendall(bytes([2]))
            challenge = self._recv(16)
            from rfb import des
            self.sock.sendall(des.vnc_response(self.password, challenge))
        else:
            self.sock.sendall(bytes([types[0]]))

        result = struct.unpack(">I", self._recv(4))[0]
        if result != 0:
            length = struct.unpack(">I", self._recv(4))[0]
            reason = self._recv(length).decode()
            self.close()
            raise PermissionError(reason)

        self.sock.sendall(bytes([1 if shared else 0]))
        self.width, self.height = struct.unpack(">HH", self._recv(4))
        self._apply_format(self._recv(16))
        name_length = struct.unpack(">I", self._recv(4))[0]
        self.name = self._recv(name_length).decode()

    # ── Client messages ───────────────────────────────────────────────────────

    def set_encodings(self, encodings: list[int]) -> None:
        self.sock.sendall(
            struct.pack(">BxH", 2, len(encodings))
            + b"".join(struct.pack(">i", e) for e in encodings)
        )

    def set_pixel_format(self, raw_format: bytes) -> None:
        self.sock.sendall(struct.pack(">Bxxx", 0) + raw_format)
        self._apply_format(raw_format)

    def _apply_format(self, raw: bytes) -> None:
        self.pixel_format = raw
        bpp, _depth, big_endian, _tc, _rm, _gm, _bm, r, g, b = struct.unpack(
            ">BBBBHHHBBB3x", raw[:16])
        self.bytes_per_pixel = bpp // 8
        positions = []
        for shift in (r, g, b):
            index = shift // 8
            if big_endian:
                index = self.bytes_per_pixel - 1 - index
            positions.append(index)
        self.significant = sorted(positions)

    def request_update(self, incremental: bool = False) -> None:
        self.sock.sendall(
            struct.pack(">BBHHHH", 3, 1 if incremental else 0,
                        0, 0, self.width, self.height)
        )

    def key_event(self, keysym: int, down: bool) -> None:
        self.sock.sendall(struct.pack(">BB2xI", 4, 1 if down else 0, keysym))

    def pointer_event(self, x: int, y: int, mask: int) -> None:
        self.sock.sendall(struct.pack(">BBHH", 5, mask, x, y))

    # ── Framebuffer updates ───────────────────────────────────────────────────

    def read_update(self, canvas: bytearray | None = None) -> tuple[bytearray, list]:
        """
        Read one FramebufferUpdate and paint it onto *canvas* (RGB24).

        Returns (canvas, rectangles) where each rectangle is
        (x, y, width, height, encoding).
        """
        kind = self._recv(1)[0]
        assert kind == 0, f"expected FramebufferUpdate, got message type {kind}"
        self._recv(1)
        count = struct.unpack(">H", self._recv(2))[0]

        if canvas is None:
            canvas = bytearray(self.width * self.height * 3)

        rects = []
        for _ in range(count):
            x, y, width, height, encoding = struct.unpack(">HHHHi", self._recv(12))
            rects.append((x, y, width, height, encoding))
            if encoding == -223:                      # DesktopSize
                self.width, self.height = width, height
                canvas = bytearray(self.width * self.height * 3)
            elif encoding == 16:                      # ZRLE
                self._decode_zrle(canvas, x, y, width, height)
            elif encoding == 0:                       # Raw
                self._decode_raw(canvas, x, y, width, height)
            else:
                raise AssertionError(f"unexpected encoding {encoding}")
        return canvas, rects

    def _paint(self, canvas: bytearray, x: int, y: int,
               width: int, height: int, pixels: bytes) -> None:
        stride = self.width * 3
        row_bytes = width * 3
        for row in range(height):
            start = (y + row) * stride + x * 3
            canvas[start:start + row_bytes] = pixels[row * row_bytes:(row + 1) * row_bytes]

    def _decode_raw(self, canvas, x, y, width, height) -> None:
        stride = self.bytes_per_pixel
        data = self._recv(width * height * stride)
        # Drop the padding byte so the canvas stays 3 bytes per pixel, matching
        # what the ZRLE path produces.
        pixels = bytearray(width * height * 3)
        for out_index, wire_index in enumerate(self.significant):
            pixels[out_index::3] = data[wire_index::stride]
        self._paint(canvas, x, y, width, height, bytes(pixels))

    def _decode_zrle(self, canvas, x, y, width, height) -> None:
        length = struct.unpack(">I", self._recv(4))[0]
        data = self.zlib.decompress(self._recv(length))
        offset = 0
        for tile_y in range(0, height, TILE):
            tile_h = min(TILE, height - tile_y)
            for tile_x in range(0, width, TILE):
                tile_w = min(TILE, width - tile_x)
                subencoding = data[offset]
                offset += 1
                if subencoding == 0:                  # raw CPIXELs
                    size = tile_w * tile_h * 3
                    pixels = data[offset:offset + size]
                    offset += size
                elif subencoding == 1:                # solid colour
                    pixels = data[offset:offset + 3] * (tile_w * tile_h)
                    offset += 3
                else:
                    raise AssertionError(f"unexpected ZRLE subencoding {subencoding}")
                self._paint(canvas, x + tile_x, y + tile_y, tile_w, tile_h, pixels)
        assert offset == len(data), f"{len(data) - offset} bytes left undecoded"
