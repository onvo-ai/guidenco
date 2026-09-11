"""
Tests for the HTTP API.

Everything runs on a laptop: the synthetic capture backend replaces the HDMI
hardware and a fake sink replaces the USB gadget. No Pi, no ffmpeg, no capture
card.

Run with:  python3 -m unittest discover -s tests -t . -v
"""

import json
import os
import sys
import threading
import time
import unittest
import urllib.error
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import config                                                      # noqa: E402
from capture.framebuffer import Framebuffer                        # noqa: E402
from hid.keys import (                                             # noqa: E402
    CHARS, MOD_LCTRL, MOD_LGUI, MOD_LSHIFT, UnknownKey, parse_combo,
)


class FramebufferWaitTest(unittest.TestCase):
    """
    latest() and next_after() differ in a way that once cost a whole CPU core.

    latest() returns immediately when any frame exists; next_after() blocks
    until a NEWER one arrives. A consumer that loops on the wrong one spins.
    """

    def test_latest_returns_immediately_when_a_frame_exists(self):
        fb = Framebuffer(10, 10)
        fb.update(b"frame")
        started = time.monotonic()
        frame, _ = fb.latest(timeout=5.0)
        self.assertEqual(frame, b"frame")
        self.assertLess(time.monotonic() - started, 0.2)

    def test_next_after_blocks_until_something_new_arrives(self):
        fb = Framebuffer(10, 10)
        fb.update(b"first")
        _, sequence = fb.latest()
        started = time.monotonic()
        frame, new_sequence = fb.next_after(sequence, timeout=0.4)
        elapsed = time.monotonic() - started
        self.assertIsNone(frame, "no newer frame existed, so none should be returned")
        self.assertEqual(new_sequence, sequence)
        self.assertGreater(elapsed, 0.3,
                           "next_after must actually wait, or callers looping on it spin")

    def test_next_after_wakes_as_soon_as_a_frame_arrives(self):
        fb = Framebuffer(10, 10)
        fb.update(b"first")
        _, sequence = fb.latest()
        threading.Timer(0.15, lambda: fb.update(b"second")).start()
        started = time.monotonic()
        frame, new_sequence = fb.next_after(sequence, timeout=5.0)
        self.assertEqual(frame, b"second")
        self.assertGreater(new_sequence, sequence)
        self.assertLess(time.monotonic() - started, 1.0, "should wake on the update, not the timeout")


class KeyParsingTest(unittest.TestCase):
    def test_a_bare_character(self):
        self.assertEqual(parse_combo("a"), (0, 0x04))

    def test_uppercase_implies_shift(self):
        self.assertEqual(parse_combo("A"), (MOD_LSHIFT, 0x04))

    def test_named_keys_are_case_insensitive(self):
        self.assertEqual(parse_combo("Return"), (0, 0x28))
        self.assertEqual(parse_combo("return"), parse_combo("RETURN"))

    def test_single_modifier(self):
        self.assertEqual(parse_combo("ctrl+c"), (MOD_LCTRL, 0x06))

    def test_multiple_modifiers_combine(self):
        mods, usage = parse_combo("cmd+shift+4")
        self.assertEqual(mods, MOD_LGUI | MOD_LSHIFT)
        self.assertEqual(usage, 0x21)

    def test_command_aliases_all_reach_the_gui_bit(self):
        for alias in ("cmd", "command", "super", "win", "windows", "meta", "gui"):
            self.assertEqual(parse_combo(f"{alias}+a")[0], MOD_LGUI, alias)

    def test_a_shifted_symbol_adds_shift_on_top_of_modifiers(self):
        mods, usage = parse_combo("ctrl+?")
        self.assertEqual(mods, MOD_LCTRL | MOD_LSHIFT)
        self.assertEqual(usage, CHARS["/"][0])

    def test_function_keys_span_f1_to_f24(self):
        self.assertEqual(parse_combo("F1")[1], 0x3A)
        self.assertEqual(parse_combo("F12")[1], 0x45)
        self.assertEqual(parse_combo("F13")[1], 0x68)
        self.assertEqual(parse_combo("F24")[1], 0x73)

    def test_plus_itself_is_typable(self):
        self.assertEqual(parse_combo("ctrl++")[1], CHARS["+"][0])

    def test_unknown_names_are_rejected_not_guessed(self):
        for bad in ("", "ctrl+nope", "wibble+a"):
            with self.assertRaises(UnknownKey, msg=bad):
                parse_combo(bad)


class EasingTest(unittest.TestCase):
    """The motion curve itself, independent of any hardware."""

    def setUp(self):
        import hid
        self.hid = hid

    def test_easing_starts_and_ends_at_the_endpoints(self):
        self.assertAlmostEqual(self.hid._ease_in_out_cubic(0.0), 0.0)
        self.assertAlmostEqual(self.hid._ease_in_out_cubic(1.0), 1.0)

    def test_easing_is_symmetric_about_the_midpoint(self):
        self.assertAlmostEqual(self.hid._ease_in_out_cubic(0.5), 0.5)
        for t in (0.1, 0.25, 0.4):
            self.assertAlmostEqual(self.hid._ease_in_out_cubic(t),
                                   1 - self.hid._ease_in_out_cubic(1 - t), places=9)

    def test_easing_is_monotonic(self):
        values = [self.hid._ease_in_out_cubic(i / 50) for i in range(51)]
        self.assertEqual(values, sorted(values))

    def test_easing_is_slow_at_the_ends_and_fast_in_the_middle(self):
        start = self.hid._ease_in_out_cubic(0.05) - self.hid._ease_in_out_cubic(0.0)
        middle = self.hid._ease_in_out_cubic(0.525) - self.hid._ease_in_out_cubic(0.475)
        self.assertGreater(middle, start * 3,
                           "the middle of the move should be much faster than the start")

    def test_longer_moves_take_longer_but_sublinearly(self):
        short = self.hid._move_duration_ms(1000, 0)
        long = self.hid._move_duration_ms(16000, 0)
        self.assertGreater(long, short)
        self.assertLess(long, short * 16, "duration should grow slower than distance")

    def test_duration_is_capped(self):
        self.assertLessEqual(self.hid._move_duration_ms(32767, 32767),
                             config.MOUSE_MOVE_MAX_MS)


class RecordingGadget:
    """Stands in for /dev/hidg*, capturing every report written."""

    def __init__(self):
        self.keyboard = []
        self.mouse = []

    def install(self, hid):
        self.hid = hid
        hid._enabled = True
        hid._reason = "test"
        hid._write = self._write
        hid._buttons = 0
        hid._x = hid._y = 0

    def _write(self, target, data, _retried=False):
        (self.keyboard if target == "kb" else self.mouse).append(data)

    @property
    def positions(self):
        import struct
        return [struct.unpack("<BHHb", r)[1:3] for r in self.mouse]

    @property
    def buttons(self):
        import struct
        return [struct.unpack("<BHHb", r)[0] for r in self.mouse]

    @property
    def wheels(self):
        import struct
        return [struct.unpack("<BHHb", r)[3] for r in self.mouse]


class PointerMotionTest(unittest.TestCase):
    def setUp(self):
        import hid
        self.hid = hid
        self.gadget = RecordingGadget()
        self.gadget.install(hid)
        hid.set_screen(1920, 1080)

    def tearDown(self):
        self.hid._enabled = False

    def test_a_smooth_move_emits_many_intermediate_points(self):
        self.hid.move(1800, 1000, smooth=True)
        self.assertGreater(len(self.gadget.mouse), 10,
                           "a smooth move should be many small steps")

    def test_an_unsmoothed_move_emits_exactly_one_report(self):
        self.hid.move(1800, 1000, smooth=False)
        self.assertEqual(len(self.gadget.mouse), 1)

    def test_a_smooth_move_lands_exactly_on_target(self):
        self.hid.move(1234, 567, smooth=True)
        final = self.gadget.positions[-1]
        expected = (self.hid._to_abs(1234, 1920), self.hid._to_abs(567, 1080))
        self.assertEqual(final, expected, "rounding must not leave the pointer short")

    def test_intermediate_points_advance_monotonically(self):
        self.hid.move(1900, 0, smooth=True)
        xs = [p[0] for p in self.gadget.positions]
        self.assertEqual(xs, sorted(xs), "the pointer should never travel backwards")

    def test_the_path_is_eased_not_linear(self):
        self.hid.move(1919, 0, smooth=True)
        xs = [p[0] for p in self.gadget.positions]
        half = xs[len(xs) // 2]
        span = xs[-1] - xs[0]
        # Ease-in-out passes the midpoint at mid-time; a linear ramp would too,
        # so instead check the first quarter covers far less than a quarter.
        quarter = xs[len(xs) // 4] - xs[0]
        self.assertLess(quarter, span * 0.20,
                        "an eased move should still be accelerating at 25% of the way")
        self.assertAlmostEqual(half / span, 0.5, delta=0.12)

    def test_a_zero_distance_move_still_reports_once(self):
        self.hid.move(500, 500, smooth=False)
        self.gadget.mouse.clear()
        self.hid.move(500, 500, smooth=True)
        self.assertEqual(len(self.gadget.mouse), 1)

    def test_corners_map_to_the_full_absolute_range(self):
        self.hid.move(0, 0, smooth=False)
        self.assertEqual(self.gadget.positions[-1], (0, 0))
        self.hid.move(1919, 1079, smooth=False)
        self.assertEqual(self.gadget.positions[-1], (config.ABS_MAX, config.ABS_MAX))


class ClickAndScrollTest(unittest.TestCase):
    def setUp(self):
        import hid
        self.hid = hid
        self.gadget = RecordingGadget()
        self.gadget.install(hid)
        hid.set_screen(1920, 1080)

    def tearDown(self):
        self.hid._enabled = False

    def test_a_click_presses_then_releases(self):
        self.hid.click(100, 100, smooth=False)
        self.assertIn(1, self.gadget.buttons, "the left button should be pressed")
        self.assertEqual(self.gadget.buttons[-1], 0, "and released at the end")

    def test_a_double_click_presses_twice(self):
        self.hid.click(100, 100, count=2, smooth=False)
        presses = sum(1 for a, b in zip(self.gadget.buttons, self.gadget.buttons[1:])
                      if a == 0 and b == 1)
        self.assertEqual(presses, 2)

    def test_right_and_middle_buttons_use_distinct_bits(self):
        self.hid.click(10, 10, button="right", smooth=False)
        self.assertIn(2, self.gadget.buttons)
        self.gadget.mouse.clear()
        self.hid.click(10, 10, button="middle", smooth=False)
        self.assertIn(4, self.gadget.buttons)

    def test_an_unknown_button_is_rejected(self):
        with self.assertRaises(ValueError):
            self.hid.click(10, 10, button="fourth", smooth=False)

    def test_a_drag_holds_the_button_while_moving(self):
        self.hid.drag(100, 100, 800, 700, smooth=True)
        buttons = self.gadget.buttons
        held = [i for i, b in enumerate(buttons) if b == 1]
        self.assertGreater(len(held), 5,
                           "the button must stay down across the intermediate motion, "
                           "or applications will not see a drag at all")
        self.assertEqual(buttons[-1], 0)

    def test_scroll_emits_a_notch_and_clears_it(self):
        self.hid.scroll(500, 500, 3, smooth=False)
        self.assertEqual([w for w in self.gadget.wheels if w != 0], [1, 1, 1])
        self.assertEqual(self.gadget.wheels[-1], 0, "the notch must be cleared")

    def test_negative_scroll_goes_the_other_way(self):
        self.hid.scroll(500, 500, -2, smooth=False)
        self.assertEqual([w for w in self.gadget.wheels if w != 0], [-1, -1])


class TypingTest(unittest.TestCase):
    def setUp(self):
        import hid
        self.hid = hid
        self.gadget = RecordingGadget()
        self.gadget.install(hid)

    def tearDown(self):
        self.hid._enabled = False

    def test_each_character_presses_and_releases(self):
        self.hid.type_text("ab")
        self.assertEqual(len(self.gadget.keyboard), 4)
        self.assertEqual(self.gadget.keyboard[1], b"\x00" * 8)

    def test_uppercase_carries_the_shift_bit(self):
        self.hid.type_text("A")
        self.assertEqual(self.gadget.keyboard[0][0], MOD_LSHIFT)

    def test_unmappable_characters_are_reported_not_silently_dropped(self):
        skipped = self.hid.type_text("hi — there \U0001f600")
        self.assertEqual(set(skipped), {"—", "\U0001f600"})

    def test_a_mapped_string_skips_nothing(self):
        self.assertEqual(self.hid.type_text("Hello, World! 123"), [])


class ServerTestCase(unittest.TestCase):
    """Boots the real HTTP server against a scripted framebuffer."""

    TOKEN = ""

    def setUp(self):
        import hid
        from api.server import ApiServer
        self.hid = hid
        self.gadget = RecordingGadget()
        self.gadget.install(hid)
        hid.set_screen(1920, 1080)

        self._old_token = config.API_TOKEN
        config.API_TOKEN = self.TOKEN

        self.framebuffer = Framebuffer(1920, 1080)
        self.jpeg = b"\xff\xd8" + b"testframe" * 40 + b"\xff\xd9"
        self.framebuffer.update(self.jpeg)
        self.server = ApiServer(self.framebuffer, "127.0.0.1", 0)
        self.port = self.server.server_port
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()

    def tearDown(self):
        config.API_TOKEN = self._old_token
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=5)
        self.hid._enabled = False

    def request(self, path, payload=None, token=None, method=None):
        url = f"http://127.0.0.1:{self.port}{path}"
        data = json.dumps(payload).encode() if payload is not None else None
        req = urllib.request.Request(url, data=data, method=method)
        if data:
            req.add_header("Content-Type", "application/json")
        if token:
            req.add_header("Authorization", f"Bearer {token}")
        with urllib.request.urlopen(req, timeout=10) as response:
            body = response.read()
            return response.status, dict(response.headers), body

    def get_json(self, path, token=None):
        status, _, body = self.request(path, token=token)
        return status, json.loads(body)


class DiscoveryTest(ServerTestCase):
    def test_the_index_points_at_the_spec(self):
        status, body = self.get_json("/")
        self.assertEqual(status, 200)
        self.assertEqual(body["openapi"], "/openapi.json")

    def test_the_spec_is_valid_openapi_31(self):
        status, spec = self.get_json("/openapi.json")
        self.assertEqual(status, 200)
        self.assertEqual(spec["openapi"], "3.1.0")
        self.assertIn("info", spec)
        for field in ("title", "version"):
            self.assertIn(field, spec["info"])

    def test_every_action_endpoint_is_described(self):
        from api.server import ACTIONS
        _, spec = self.get_json("/openapi.json")
        for path in ACTIONS:
            self.assertIn(path, spec["paths"], f"{path} is missing from the spec")
            self.assertIn("post", spec["paths"][path])

    def test_every_described_path_actually_exists(self):
        from api.server import ACTIONS
        _, spec = self.get_json("/openapi.json")
        known = set(ACTIONS) | {"/health", "/screenshot", "/stream", "/openapi.json"}
        for path in spec["paths"]:
            self.assertIn(path, known, f"the spec describes {path}, which is not routed")

    def test_each_operation_has_an_id_and_summary(self):
        _, spec = self.get_json("/openapi.json")
        seen = set()
        for path, methods in spec["paths"].items():
            for method, operation in methods.items():
                self.assertIn("operationId", operation, f"{method} {path}")
                self.assertIn("summary", operation, f"{method} {path}")
                self.assertNotIn(operation["operationId"], seen, "duplicate operationId")
                seen.add(operation["operationId"])


class HealthTest(ServerTestCase):
    def test_health_reports_the_screen_size(self):
        status, body = self.get_json("/health")
        self.assertEqual(status, 200)
        self.assertEqual(body["capture"]["width"], 1920)
        self.assertEqual(body["capture"]["height"], 1080)
        self.assertTrue(body["capture"]["ready"])

    def test_health_reports_input_availability(self):
        _, body = self.get_json("/health")
        self.assertTrue(body["input"]["available"])

    def test_health_reports_the_network(self):
        _, body = self.get_json("/health")
        network = body["network"]
        self.assertIn("hostname", network)
        self.assertIn(network["type"], {"wifi", "ethernet", "disconnected", "unknown"})
        # ssid is meaningful only on wifi, but the key is always present so a
        # caller never has to guess whether it was omitted or empty.
        self.assertIn("ssid", network)
        self.assertIn("signal_dbm", network)


class ScreenshotTest(ServerTestCase):
    def test_the_frame_is_returned_byte_for_byte(self):
        status, headers, body = self.request("/screenshot")
        self.assertEqual(status, 200)
        self.assertEqual(headers["Content-Type"], "image/jpeg")
        self.assertEqual(body, self.jpeg, "the frame must pass through unmodified")

    def test_the_screen_size_is_in_the_headers(self):
        _, headers, _ = self.request("/screenshot")
        self.assertEqual(headers["X-Screen-Width"], "1920")
        self.assertEqual(headers["X-Screen-Height"], "1080")

    def test_a_later_frame_replaces_the_earlier_one(self):
        newer = b"\xff\xd8" + b"second" * 50 + b"\xff\xd9"
        self.framebuffer.update(newer)
        _, _, body = self.request("/screenshot")
        self.assertEqual(body, newer)


class ActionTest(ServerTestCase):
    def test_move_reaches_the_gadget(self):
        status, body = self.request("/move", {"x": 100, "y": 200, "smooth": False})[0], None
        self.assertEqual(status, 200)
        self.assertEqual(self.gadget.positions[-1],
                         (self.hid._to_abs(100, 1920), self.hid._to_abs(200, 1080)))

    def test_click_reaches_the_gadget(self):
        self.request("/click", {"x": 10, "y": 10, "smooth": False})
        self.assertIn(1, self.gadget.buttons)

    def test_type_reports_how_much_was_typed(self):
        _, _, body = self.request("/type", {"text": "hello"})
        self.assertEqual(json.loads(body)["typed"], 5)

    def test_type_reports_skipped_characters(self):
        _, _, body = self.request("/type", {"text": "ok \U0001f600"})
        payload = json.loads(body)
        self.assertEqual(payload["typed"], 3)
        self.assertIn("\U0001f600", payload["skipped"])

    def test_key_combination_sets_the_modifier(self):
        self.request("/key", {"key": "ctrl+c"})
        self.assertEqual(self.gadget.keyboard[0][0], MOD_LCTRL)

    def test_scroll_requires_an_amount(self):
        with self.assertRaises(urllib.error.HTTPError) as caught:
            self.request("/scroll", {"x": 5, "y": 5})
        self.assertEqual(caught.exception.code, 400)

    def test_off_screen_coordinates_are_rejected(self):
        for point in ({"x": 1920, "y": 0}, {"x": 0, "y": 1080}, {"x": -1, "y": 0}):
            with self.assertRaises(urllib.error.HTTPError) as caught:
                self.request("/click", point)
            self.assertEqual(caught.exception.code, 400, point)

    def test_missing_fields_are_rejected(self):
        with self.assertRaises(urllib.error.HTTPError) as caught:
            self.request("/click", {"x": 5})
        self.assertEqual(caught.exception.code, 400)

    def test_malformed_json_is_rejected(self):
        url = f"http://127.0.0.1:{self.port}/click"
        req = urllib.request.Request(url, data=b"{not json", method="POST")
        req.add_header("Content-Type", "application/json")
        with self.assertRaises(urllib.error.HTTPError) as caught:
            urllib.request.urlopen(req, timeout=10)
        self.assertEqual(caught.exception.code, 400)

    def test_an_unknown_key_name_is_rejected(self):
        with self.assertRaises(urllib.error.HTTPError) as caught:
            self.request("/key", {"key": "ctrl+wibble"})
        self.assertEqual(caught.exception.code, 400)

    def test_unknown_endpoints_are_404(self):
        with self.assertRaises(urllib.error.HTTPError) as caught:
            self.request("/nope", {})
        self.assertEqual(caught.exception.code, 404)

    def test_input_unavailable_reports_503(self):
        self.hid._enabled = False
        with self.assertRaises(urllib.error.HTTPError) as caught:
            self.request("/click", {"x": 5, "y": 5})
        self.assertEqual(caught.exception.code, 503)


class AuthTest(ServerTestCase):
    TOKEN = "s3cret"

    def test_discovery_works_without_a_token(self):
        self.assertEqual(self.get_json("/")[0], 200)
        self.assertEqual(self.get_json("/openapi.json")[0], 200)

    def test_the_spec_declares_the_security_scheme(self):
        _, spec = self.get_json("/openapi.json")
        self.assertIn("bearerAuth", spec["components"]["securitySchemes"])

    def test_reads_require_a_token(self):
        with self.assertRaises(urllib.error.HTTPError) as caught:
            self.request("/health")
        self.assertEqual(caught.exception.code, 401)

    def test_actions_require_a_token(self):
        with self.assertRaises(urllib.error.HTTPError) as caught:
            self.request("/click", {"x": 1, "y": 1})
        self.assertEqual(caught.exception.code, 401)

    def test_the_right_token_is_accepted(self):
        self.assertEqual(self.get_json("/health", token="s3cret")[0], 200)

    def test_a_wrong_token_is_refused(self):
        with self.assertRaises(urllib.error.HTTPError) as caught:
            self.request("/health", token="guess")
        self.assertEqual(caught.exception.code, 401)


class StreamTest(ServerTestCase):
    def test_the_stream_delivers_successive_frames(self):
        url = f"http://127.0.0.1:{self.port}/stream"

        def push():
            for n in range(3):
                time.sleep(0.15)
                self.framebuffer.update(b"\xff\xd8" + f"frame{n}".encode() * 30 + b"\xff\xd9")

        threading.Thread(target=push, daemon=True).start()
        data = b""
        with urllib.request.urlopen(url, timeout=10) as response:
            self.assertIn("multipart/x-mixed-replace", response.headers["Content-Type"])
            # Read a chunk at a time until two frames have arrived; asking for a
            # fixed size would block waiting for bytes that are not coming.
            deadline = time.monotonic() + 8
            while data.count(b"--guidencoframe") < 2 and time.monotonic() < deadline:
                chunk = response.read1(1024)
                if not chunk:
                    break
                data += chunk
        self.assertGreaterEqual(data.count(b"--guidencoframe"), 2,
                                "the stream should deliver successive frames")
        self.assertIn(b"Content-Type: image/jpeg", data)
        self.assertIn(b"\xff\xd8", data)


class CaptureBackendTest(unittest.TestCase):
    def test_the_synthetic_source_feeds_whole_jpeg_frames(self):
        from capture import CaptureManager
        from capture.test_source import TestBackend

        manager = CaptureManager(backend=TestBackend(width=64, height=64, fps=30))
        manager.start()
        try:
            deadline = time.monotonic() + 5
            while time.monotonic() < deadline and not manager.framebuffer.ready:
                time.sleep(0.02)
            self.assertTrue(manager.framebuffer.ready, "no frame arrived")
            frame = manager.framebuffer.frame
            self.assertEqual(frame[:2], b"\xff\xd8", "frame should start with JPEG SOI")
            self.assertEqual(frame[-2:], b"\xff\xd9", "frame should end with JPEG EOI")
            self.assertEqual((manager.framebuffer.width, manager.framebuffer.height), (64, 64))
        finally:
            manager.stop()


if __name__ == "__main__":
    unittest.main()
