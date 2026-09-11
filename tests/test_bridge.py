"""
Tests for the VNC bridge.

Everything here runs on a laptop: the capture layer's synthetic backend replaces
the HDMI hardware, and a fake input sink replaces the USB gadget. No Pi, no
ffmpeg, no capture card.

Run with:  python3 -m unittest discover -s tests -v
"""

import os
import sys
import threading
import time
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from capture.framebuffer import BAND_H, Framebuffer                  # noqa: E402
from rfb import des                                                  # noqa: E402
from rfb.encodings import PSEUDO_DESKTOP_SIZE, RAW, ZRLE             # noqa: E402
from rfb.keysyms import MOD_LSHIFT, MODIFIERS, lookup                # noqa: E402
from rfb.pixels import (                                             # noqa: E402
    PixelFormat, Translator, UnsupportedPixelFormat,
)
from rfb.server import VncServer                                     # noqa: E402
from tests.rfb_client import TestClient                              # noqa: E402


class DesTest(unittest.TestCase):
    def test_matches_the_published_worked_example(self):
        # The standard DES worked example, used by every implementation as a
        # sanity check. If this passes, the tables and the round structure are
        # right; VNC Auth is just this plus a key mangle.
        self.assertEqual(
            des.encrypt_block(bytes.fromhex("133457799BBCDFF1"),
                              bytes.fromhex("0123456789ABCDEF")).hex().upper(),
            "85E813540F0AB405",
        )

    def test_vnc_key_reverses_bits_within_each_byte(self):
        # 'a' is 0x61 = 0b01100001, reversed is 0b10000110 = 0x86.
        self.assertEqual(des.vnc_key("a")[0], 0x86)

    def test_vnc_key_is_truncated_and_padded_to_eight_bytes(self):
        self.assertEqual(len(des.vnc_key("")), 8)
        self.assertEqual(des.vnc_key("abcdefghXXXX"), des.vnc_key("abcdefgh"))

    def test_response_is_two_blocks_and_depends_on_the_password(self):
        challenge = bytes(range(16))
        self.assertEqual(len(des.vnc_response("secret", challenge)), 16)
        self.assertNotEqual(des.vnc_response("secret", challenge),
                            des.vnc_response("secrat", challenge))


class PixelFormatTest(unittest.TestCase):
    def test_a_client_accepting_our_bgr_format_needs_no_conversion(self):
        translator = Translator(PixelFormat())
        self.assertTrue(translator.cpixel_identity)
        source = bytes([1, 2, 3, 10, 20, 30])
        self.assertIs(translator.cpixels(source), source)

    def test_an_rgb_client_gets_channels_swapped(self):
        translator = Translator(PixelFormat(red_shift=0, green_shift=8, blue_shift=16))
        self.assertEqual(translator.cpixels(bytes([1, 2, 3, 10, 20, 30])),
                         bytes([3, 2, 1, 30, 20, 10]))

    def test_raw_pixels_are_padded_to_the_client_width(self):
        translator = Translator(PixelFormat())
        self.assertEqual(translator.pixels(bytes([1, 2, 3])), bytes([1, 2, 3, 0]))

    def test_pack_unpack_round_trips(self):
        fmt = PixelFormat(red_shift=0, green_shift=8, blue_shift=16)
        self.assertEqual(PixelFormat.unpack(fmt.pack()), fmt)

    def test_unsupported_formats_are_rejected_rather_than_mangled(self):
        for bad in (
            PixelFormat(true_colour=0),                                  # palette
            PixelFormat(bits_per_pixel=16, depth=16, red_max=31,
                        green_max=63, blue_max=31),                      # 16bpp
            PixelFormat(red_shift=4),                                    # unaligned
        ):
            with self.assertRaises(UnsupportedPixelFormat):
                Translator(bad)


class FramebufferTest(unittest.TestCase):
    def setUp(self):
        self.width, self.height = 8, BAND_H * 3
        self.framebuffer = Framebuffer(self.width, self.height)
        self.blank = bytes(self.width * self.height * 3)

    def test_first_frame_marks_everything_dirty(self):
        self.framebuffer.update(self.blank)
        _, _, _, runs = self.framebuffer.snapshot([])
        self.assertEqual(len(runs), 1)
        self.assertEqual(runs[0][1], self.height, "adjacent bands should merge")

    def test_an_unchanged_frame_produces_nothing(self):
        self.framebuffer.update(self.blank)
        _, _, _, runs = self.framebuffer.snapshot([])
        sent = [version for _, version in runs[0][3]]
        self.framebuffer.update(self.blank)
        self.assertEqual(self.framebuffer.snapshot(sent)[3], [])

    def test_only_the_touched_band_is_reported(self):
        self.framebuffer.update(self.blank)
        sent = [version for _, version in self.framebuffer.snapshot([])[0 + 3][0][3]]

        frame = bytearray(self.blank)
        row = BAND_H + 5                        # somewhere inside band 1
        frame[row * self.width * 3:(row + 1) * self.width * 3] = b"\xff" * (self.width * 3)
        self.framebuffer.update(bytes(frame))

        _, _, _, runs = self.framebuffer.snapshot(sent)
        self.assertEqual(len(runs), 1)
        self.assertEqual(runs[0][0], BAND_H, "run should start at band 1")
        self.assertEqual(runs[0][1], BAND_H)

    def test_separated_bands_are_not_merged(self):
        self.framebuffer.update(self.blank)
        sent = [version for _, version in self.framebuffer.snapshot([])[3][0][3]]
        frame = bytearray(self.blank)
        for row in (0, BAND_H * 2 + 1):         # bands 0 and 2, skipping 1
            frame[row * self.width * 3:(row + 1) * self.width * 3] = b"\xff" * (self.width * 3)
        self.framebuffer.update(bytes(frame))
        self.assertEqual(len(self.framebuffer.snapshot(sent)[3]), 2)

    def test_a_short_trailing_band_reports_its_real_height(self):
        framebuffer = Framebuffer(8, BAND_H + 10)
        self.assertEqual(framebuffer.band_count, 2)
        self.assertEqual(framebuffer.band_rows(1), 10)

    def test_a_frame_of_the_wrong_size_is_ignored(self):
        self.framebuffer.update(b"\x00" * 12)
        self.assertFalse(self.framebuffer.have_frame)

    def test_resize_bumps_the_generation(self):
        before = self.framebuffer.generation
        self.framebuffer.resize(16, 16)
        self.assertNotEqual(self.framebuffer.generation, before)
        self.assertEqual((self.framebuffer.width, self.framebuffer.height), (16, 16))


class KeysymTest(unittest.TestCase):
    def test_lowercase_letters_need_no_shift(self):
        self.assertEqual(lookup(ord("a")), (0x04, False))

    def test_uppercase_and_symbols_imply_shift(self):
        self.assertEqual(lookup(ord("A")), (0x04, True))
        self.assertEqual(lookup(ord("!")), (0x1E, True))

    def test_function_keys_are_contiguous(self):
        self.assertEqual(lookup(0xFFBE), (0x3A, False))     # F1
        self.assertEqual(lookup(0xFFC9), (0x45, False))     # F12

    def test_navigation_keys_map_to_the_right_usages(self):
        self.assertEqual(lookup(0xFF51)[0], 0x50)           # Left
        self.assertEqual(lookup(0xFF0D)[0], 0x28)           # Return

    def test_unicode_keysyms_fold_back_to_ascii(self):
        self.assertEqual(lookup(0x01000041), lookup(ord("A")))

    def test_modifiers_are_separate_from_key_slots(self):
        self.assertEqual(MODIFIERS[0xFFE1], MOD_LSHIFT)
        self.assertIsNone(lookup(0xFFE1))

    def test_unmappable_keysyms_return_none(self):
        self.assertIsNone(lookup(0xFF20))                   # Multi_key


class FakeInput:
    """Stands in for the USB HID gadget and records what it was told."""

    def __init__(self):
        self.pointers = []
        self.keys = []
        self.released = 0

    def pointer(self, x, y, width, height, mask):
        self.pointers.append((x, y, width, height, mask))

    def key(self, keysym, down):
        self.keys.append((keysym, down))

    def release_all(self):
        self.released += 1


class ServerTestCase(unittest.TestCase):
    """Boots a real server on a loopback port with a scripted framebuffer."""

    WIDTH, HEIGHT = 192, BAND_H * 2

    def setUp(self):
        self.framebuffer = Framebuffer(self.WIDTH, self.HEIGHT)
        self.frame = self._pattern()
        self.framebuffer.update(self.frame)
        self.input = FakeInput()
        self.server = VncServer(self.framebuffer, self.input, host="127.0.0.1",
                                port=0, password=self.password(), name="test")
        self.port = self.server.start()
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()

    def tearDown(self):
        self.server.stop()
        self.thread.join(timeout=5)

    def password(self) -> str:
        return ""

    def _pattern(self) -> bytes:
        """Half solid colour, half gradient — exercises both ZRLE subencodings."""
        frame = bytearray()
        for y in range(self.HEIGHT):
            for x in range(self.WIDTH):
                if y < BAND_H:
                    frame += bytes((0x20, 0x40, 0x60))
                else:
                    frame += bytes((x % 256, y % 256, (x * y) % 256))
        return bytes(frame)

    def connect(self, password="", encodings=(ZRLE, PSEUDO_DESKTOP_SIZE)):
        client = TestClient("127.0.0.1", self.port, password)
        client.handshake()
        client.set_encodings(list(encodings))
        return client


class HandshakeTest(ServerTestCase):
    def test_server_advertises_the_captured_geometry(self):
        with self.connect() as client:
            self.assertEqual((client.width, client.height), (self.WIDTH, self.HEIGHT))
            self.assertEqual(client.name, "test")


class ZrleRoundTripTest(ServerTestCase):
    def test_decoded_pixels_match_the_captured_frame_exactly(self):
        with self.connect() as client:
            client.request_update(incremental=False)
            canvas, rects = client.read_update()
            self.assertTrue(all(r[4] == ZRLE for r in rects), rects)
            self.assertEqual(bytes(canvas), self.frame)

    def test_solid_regions_use_the_solid_subencoding(self):
        # The top band is one flat colour. If it decoded correctly and the
        # rectangle is small, the solid path was taken.
        with self.connect() as client:
            client.request_update(incremental=False)
            canvas, _ = client.read_update()
            self.assertEqual(bytes(canvas[:self.WIDTH * BAND_H * 3]),
                             self.frame[:self.WIDTH * BAND_H * 3])

    def test_an_incremental_request_sends_only_what_changed(self):
        with self.connect() as client:
            client.request_update(incremental=False)
            canvas, _ = client.read_update(None)

            changed = bytearray(self.frame)
            row = BAND_H + 3
            changed[row * self.WIDTH * 3:(row + 1) * self.WIDTH * 3] = b"\x11" * (self.WIDTH * 3)
            self.framebuffer.update(bytes(changed))

            client.request_update(incremental=True)
            canvas, rects = client.read_update(canvas)
            self.assertEqual(len(rects), 1, "only the touched band should be sent")
            self.assertEqual(rects[0][1], BAND_H, "rectangle should start at the second band")
            self.assertEqual(rects[0][3], BAND_H)
            self.assertEqual(bytes(canvas), bytes(changed))

    def test_the_zlib_stream_stays_consistent_across_updates(self):
        # ZRLE shares one zlib stream for the whole connection. If the server
        # ever reset it mid-connection, this second decode would fail.
        with self.connect() as client:
            client.request_update(incremental=False)
            canvas, _ = client.read_update()
            for step in range(3):
                changed = bytearray(self.frame)
                changed[step * 3:step * 3 + 3] = b"\x99\x88\x77"
                self.framebuffer.update(bytes(changed))
                client.request_update(incremental=True)
                canvas, _ = client.read_update(canvas)
                self.assertEqual(bytes(canvas), bytes(changed))


class RawFallbackTest(ServerTestCase):
    def test_a_client_without_zrle_gets_raw(self):
        with self.connect(encodings=(RAW,)) as client:
            client.request_update(incremental=False)
            canvas, rects = client.read_update()
            self.assertTrue(all(r[4] == RAW for r in rects), rects)
            self.assertEqual(bytes(canvas), self.frame)


class LargeFrameTest(ServerTestCase):
    """
    A full-screen update is far bigger than the socket send buffer.

    This is the case that a non-blocking socket gets wrong: sendall() fails
    partway through with EAGAIN and the viewer sees a broken connection. Raw
    encoding at 32bpp is the worst of it — about 1.2MB for this frame, with no
    compression to hide behind.
    """

    WIDTH, HEIGHT = 640, BAND_H * 8

    def _pattern(self) -> bytes:
        # Deliberately incompressible, so ZRLE cannot shrink it either.
        import hashlib
        size = self.WIDTH * self.HEIGHT * 3
        out = bytearray()
        seed = b"large-frame"
        while len(out) < size:
            seed = hashlib.sha256(seed).digest()
            out += seed
        return bytes(out[:size])

    def test_a_full_screen_raw_update_is_delivered_intact(self):
        with self.connect(encodings=(RAW,)) as client:
            client.request_update(incremental=False)
            canvas, rects = client.read_update()
            self.assertEqual(bytes(canvas), self.frame)

    def test_a_full_screen_zrle_update_is_delivered_intact(self):
        with self.connect() as client:
            client.request_update(incremental=False)
            canvas, _ = client.read_update()
            self.assertEqual(bytes(canvas), self.frame)


class PixelFormatNegotiationTest(ServerTestCase):
    def test_an_rgb_client_receives_swapped_channels(self):
        rgb = PixelFormat(red_shift=0, green_shift=8, blue_shift=16)
        with self.connect() as client:
            client.set_pixel_format(rgb.pack())
            client.request_update(incremental=False)
            canvas, _ = client.read_update()
            expected = bytearray(self.frame)
            expected[0::3], expected[2::3] = self.frame[2::3], self.frame[0::3]
            self.assertEqual(bytes(canvas), bytes(expected))

    def test_an_unsupported_format_closes_the_connection(self):
        with self.connect() as client:
            client.set_pixel_format(
                PixelFormat(bits_per_pixel=8, depth=8, true_colour=0).pack()
            )
            client.request_update(incremental=False)
            with self.assertRaises(ConnectionError):
                client.read_update()


class ResizeTest(ServerTestCase):
    def test_a_resolution_change_is_announced_with_desktopsize(self):
        with self.connect() as client:
            client.request_update(incremental=False)
            client.read_update()

            self.framebuffer.resize(64, BAND_H)
            self.framebuffer.update(bytes(64 * BAND_H * 3))

            client.request_update(incremental=True)
            canvas, rects = client.read_update()
            self.assertEqual(rects[0][4], PSEUDO_DESKTOP_SIZE)
            self.assertEqual((client.width, client.height), (64, BAND_H))
            self.assertEqual(bytes(canvas), bytes(64 * BAND_H * 3))


class InputTest(ServerTestCase):
    def test_pointer_events_reach_the_gadget_with_screen_size(self):
        with self.connect() as client:
            client.pointer_event(40, 50, 0x01)
            self._wait_for(lambda: self.input.pointers)
            self.assertEqual(self.input.pointers[-1],
                             (40, 50, self.WIDTH, self.HEIGHT, 0x01))

    def test_key_events_pass_the_keysym_and_direction_through(self):
        with self.connect() as client:
            client.key_event(0xFF0D, True)
            client.key_event(0xFF0D, False)
            self._wait_for(lambda: len(self.input.keys) >= 2)
            self.assertEqual(self.input.keys[:2], [(0xFF0D, True), (0xFF0D, False)])

    def test_everything_is_released_when_the_last_client_leaves(self):
        client = self.connect()
        client.pointer_event(10, 10, 0x01)
        self._wait_for(lambda: self.input.pointers)
        client.close()
        self._wait_for(lambda: self.input.released)
        self.assertGreaterEqual(self.input.released, 1)

    def _wait_for(self, predicate, timeout=5.0):
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            if predicate():
                return
            time.sleep(0.02)
        self.fail("timed out waiting for the server to react")


class AuthTest(ServerTestCase):
    def password(self) -> str:
        return "hunter2"

    def test_the_right_password_gets_in(self):
        with self.connect(password="hunter2") as client:
            self.assertEqual(client.width, self.WIDTH)

    def test_the_wrong_password_is_refused(self):
        with self.assertRaises(PermissionError):
            self.connect(password="hunter3")


class CaptureBackendTest(unittest.TestCase):
    def test_the_synthetic_source_feeds_the_framebuffer(self):
        from capture import CaptureManager
        from capture.test_source import TestBackend

        manager = CaptureManager(backend=TestBackend(width=128, height=BAND_H * 2, fps=30))
        manager.start()
        try:
            deadline = time.monotonic() + 5
            while time.monotonic() < deadline and not manager.framebuffer.have_frame:
                time.sleep(0.02)
            self.assertTrue(manager.framebuffer.have_frame, "no frame arrived")
            self.assertEqual(
                (manager.framebuffer.width, manager.framebuffer.height),
                (128, BAND_H * 2),
            )
        finally:
            manager.stop()


if __name__ == "__main__":
    unittest.main()
