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
        expected = (self.hid._to_abs(1234, 0, 1920), self.hid._to_abs(567, 0, 1080))
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


class LetterboxMappingTest(unittest.TestCase):
    """
    A frame is not always all screen.

    When the source's aspect ratio differs from the capture device's, the frame
    carries black bars and the screen sits inside them. Pointer position goes to
    the target as a fraction of its screen, so measuring across the whole frame
    is wrong by up to a bar-width — exactly zero error at the centre, growing
    towards the edges, which is why it can look like it works.
    """

    # 1920x1080 frame holding a 1663x1080 screen: 128px bars left and right,
    # which is what mirroring a 1512x982 desktop to a 1080p card produces.
    FRAME = (1920, 1080)
    ACTIVE = (128, 0, 1663, 1080)

    def setUp(self):
        import hid
        self.hid = hid
        self.gadget = RecordingGadget()
        self.gadget.install(hid)

    def tearDown(self):
        self.hid._enabled = False

    def test_without_bars_the_frame_is_the_screen(self):
        self.hid.set_screen(*self.FRAME)
        self.hid.move(0, 0, smooth=False)
        self.assertEqual(self.gadget.positions[-1], (0, 0))
        self.hid.move(1919, 1079, smooth=False)
        self.assertEqual(self.gadget.positions[-1], (config.ABS_MAX, config.ABS_MAX))

    def test_the_left_bar_edge_maps_to_the_screens_left_edge(self):
        self.hid.set_screen(*self.FRAME, self.ACTIVE)
        self.hid.move(128, 0, smooth=False)
        self.assertEqual(self.gadget.positions[-1][0], 0,
                         "the first pixel of the screen is the screen's origin")

    def test_the_right_bar_edge_maps_to_the_screens_right_edge(self):
        self.hid.set_screen(*self.FRAME, self.ACTIVE)
        self.hid.move(128 + 1662, 0, smooth=False)
        self.assertEqual(self.gadget.positions[-1][0], config.ABS_MAX)

    def test_the_centre_is_unaffected_by_bars(self):
        # Symmetric bars leave the centre exactly where it was, which is why
        # this bug hides so well: centred targets always worked.
        self.hid.set_screen(*self.FRAME)
        self.hid.move(960, 540, smooth=False)
        without = self.gadget.positions[-1]
        self.gadget.mouse.clear()
        self.hid.set_screen(*self.FRAME, self.ACTIVE)
        self.hid.move(960, 540, smooth=False)
        # Not bit-identical: the two mappings divide by different spans, so
        # they differ by well under one pixel of the target's screen.
        drift_px = abs(self.gadget.positions[-1][0] - without[0]) / config.ABS_MAX * 1512
        self.assertLess(drift_px, 1.0, "the centre must not move perceptibly")

    def test_an_off_centre_target_shifts(self):
        self.hid.set_screen(*self.FRAME)
        self.hid.move(1360, 93, smooth=False)
        naive = self.gadget.positions[-1][0]
        self.gadget.mouse.clear()
        self.hid.set_screen(*self.FRAME, self.ACTIVE)
        self.hid.move(1360, 93, smooth=False)
        corrected = self.gadget.positions[-1][0]
        self.assertGreater(corrected, naive,
                           "correcting for a left bar must move the target right")
        # About 50px of desktop at this position, which is the difference
        # between hitting one toolbar control and its neighbour.
        drift_px = (corrected - naive) / config.ABS_MAX * 1512
        self.assertGreater(drift_px, 35)
        self.assertLess(drift_px, 70)

    def test_vertical_bars_work_the_same_way(self):
        # A tall source in a wide frame letterboxes top and bottom instead.
        self.hid.set_screen(1920, 1080, (0, 60, 1920, 960))
        self.hid.move(0, 60, smooth=False)
        self.assertEqual(self.gadget.positions[-1][1], 0)
        self.hid.move(0, 60 + 959, smooth=False)
        self.assertEqual(self.gadget.positions[-1][1], config.ABS_MAX)

    def test_status_reports_the_active_area(self):
        self.hid.set_screen(*self.FRAME, self.ACTIVE)
        status = self.hid.status()
        self.assertTrue(status["letterboxed"])
        self.assertEqual(status["active_area"],
                         {"x": 128, "y": 0, "width": 1663, "height": 1080})
        self.hid.set_screen(*self.FRAME)
        self.assertFalse(self.hid.status()["letterboxed"])


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

    def test_the_spec_covers_the_read_surface(self):
        _, spec = self.get_json("/openapi.json")
        self.assertEqual(set(spec["paths"]), {"/health", "/screenshot", "/stream"})

    def test_the_spec_points_control_at_mcp(self):
        # Actions are MCP tools; restating them here would let the two drift.
        _, spec = self.get_json("/openapi.json")
        self.assertIn("/mcp", spec["info"]["description"])

    def test_each_operation_has_an_id_and_summary(self):
        _, spec = self.get_json("/openapi.json")
        seen = set()
        for path, methods in spec["paths"].items():
            for method, operation in methods.items():
                self.assertIn("operationId", operation, f"{method} {path}")
                self.assertIn("summary", operation, f"{method} {path}")
                self.assertNotIn(operation["operationId"], seen, "duplicate operationId")
                seen.add(operation["operationId"])


class HealthStatusTest(unittest.TestCase):
    """
    The status line has to name the actual fault. It used to say "waiting for
    capture" for every failure at once — nothing asked yet, no cable, source
    asleep — which is no use to anyone trying to work out why there is no image.
    """

    def describe(self, ready, link):
        from api.server import _describe_health
        return _describe_health(ready, link)

    def test_a_working_bridge_is_just_ok(self):
        self.assertEqual(self.describe(True, {"negotiated": True, "signal": True}), "ok")

    def test_an_unnegotiated_link_says_so(self):
        status = self.describe(False, {
            "negotiated": False, "signal": False,
            "detail": "no EDID advertised yet, so the source has not been told "
                      "to send anything"})
        self.assertIn("input link", status)
        self.assertIn("EDID", status)

    def test_a_negotiated_link_with_no_signal_says_so(self):
        status = self.describe(False, {
            "negotiated": True, "signal": False,
            "detail": "EDID is advertised but no signal is arriving"})
        self.assertIn("no signal", status)

    def test_a_live_signal_with_no_frames_yet_is_merely_waiting(self):
        # Nothing is wrong here: capture is on demand and nobody has asked.
        self.assertEqual(
            self.describe(False, {"negotiated": True, "signal": True}),
            "waiting for capture")

    def test_a_backend_that_reports_nothing_still_gets_a_status(self):
        self.assertEqual(self.describe(False, {}), "waiting for capture")


class HealthTest(ServerTestCase):
    def test_health_reports_the_link_state(self):
        _, body = self.get_json("/health")
        self.assertIn("link", body["capture"])

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


class LetterboxDetectionTest(unittest.TestCase):
    """
    Exercises the real ffmpeg invocation, because the failure mode here was
    entirely in the invocation: cropdetect skips its first two frames by
    default, so a single-frame probe reported nothing and every frame looked
    bar-free.
    """

    @classmethod
    def setUpClass(cls):
        import shutil
        if not shutil.which("ffmpeg"):
            raise unittest.SkipTest("ffmpeg is not installed")

    @staticmethod
    def _frame(width, height, inner_w, inner_h):
        """A JPEG of a bright box centred on black, i.e. a letterboxed screen."""
        import subprocess
        cmd = ["ffmpeg", "-hide_banner", "-loglevel", "error",
               "-f", "lavfi", "-i", f"color=c=black:s={width}x{height}:d=1",
               "-f", "lavfi", "-i", f"color=c=white:s={inner_w}x{inner_h}:d=1",
               "-filter_complex", "[0][1]overlay=(W-w)/2:(H-h)/2",
               "-frames:v", "1", "-f", "mjpeg", "pipe:1"]
        return subprocess.run(cmd, capture_output=True, timeout=30).stdout

    def test_a_frame_with_no_bars_is_left_alone(self):
        from capture.letterbox import detect
        frame = self._frame(640, 480, 640, 480)
        self.assertEqual(detect(frame, 640, 480), (0, 0, 640, 480))

    def test_pillarbox_bars_are_found(self):
        from capture.letterbox import detect
        # 480x480 screen inside a 640x480 frame: 80px bars either side.
        x, y, w, h = detect(self._frame(640, 480, 480, 480), 640, 480)
        self.assertAlmostEqual(x, 80, delta=4)
        self.assertAlmostEqual(w, 480, delta=8)
        self.assertAlmostEqual(h, 480, delta=8)

    def test_letterbox_bars_are_found(self):
        from capture.letterbox import detect
        x, y, w, h = detect(self._frame(640, 480, 640, 360), 640, 480)
        self.assertAlmostEqual(y, 60, delta=4)
        self.assertAlmostEqual(h, 360, delta=8)

    def test_a_nearly_black_frame_never_shrinks_the_usable_area(self):
        """
        A dark screen — a screensaver, a full-screen terminal — must not be
        mistaken for bars. cropdetect reports nothing at all for such a frame,
        so detect() says "I do not know" and the area in use is left as it was.
        """
        from capture import CaptureManager
        mgr = CaptureManager()
        mgr.framebuffer.resize(640, 480)
        before = mgr.framebuffer.active

        mgr._check_letterbox(self._frame(640, 480, 40, 40), 640, 480)
        for _ in range(200):
            if not mgr._detecting:
                break
            time.sleep(0.05)
        self.assertEqual(mgr.framebuffer.active, before)

    def test_garbage_input_reports_that_it_does_not_know(self):
        from capture.letterbox import detect
        # None, not the full frame: the caller must keep the area it already
        # has. See test_a_failed_recheck_keeps_the_area_already_found.
        self.assertIsNone(detect(b"not a jpeg", 640, 480))
        self.assertIsNone(detect(b"", 640, 480))

    def test_a_failed_recheck_keeps_the_area_already_found(self):
        """
        A detection that fails must not undo one that succeeded.

        Detection is re-run periodically, and on a loaded Pi it can time out.
        When it used to answer "the whole frame" in that case, one slow run
        silently threw away correct bar positions and put every click back off
        by the width of a bar — worst of all at the screen edges.
        """
        from capture import CaptureManager
        mgr = CaptureManager()
        mgr.framebuffer.resize(640, 480)
        mgr.framebuffer.set_active((80, 0, 480, 480))

        mgr._check_letterbox(b"not a jpeg", 640, 480)
        for _ in range(200):
            if not mgr._detecting:
                break
            time.sleep(0.05)
        self.assertEqual(mgr.framebuffer.active, (80, 0, 480, 480))

    def test_a_failed_attempt_still_stamps_the_recheck_clock(self):
        """
        The capture loop only re-runs detection once the recheck interval has
        passed since the last attempt. If a failed attempt left the clock alone,
        the loop would spawn an ffmpeg for every single frame — far more
        expensive than the capture it is meant to support.
        """
        from capture import CaptureManager
        mgr = CaptureManager()
        self.assertEqual(mgr._checked_at, 0.0)
        mgr._check_letterbox(b"not a jpeg", 640, 480)
        for _ in range(200):
            if not mgr._detecting:
                break
            time.sleep(0.05)
        self.assertGreater(mgr._checked_at, 0.0,
                           "a failed attempt must still stamp the clock")


class CaptureBackendTest(unittest.TestCase):
    def test_the_synthetic_source_feeds_whole_jpeg_frames(self):
        from capture import CaptureManager
        from capture.test_source import TestBackend

        manager = CaptureManager(backend=TestBackend(width=64, height=64, fps=30))
        manager.start()
        try:
            # start() only arms the idle reaper now; capture begins when a
            # frame is actually requested.
            frame = manager.frame(timeout=10)
            self.assertIsNotNone(frame, "no frame arrived")
            self.assertEqual(frame[:2], b"\xff\xd8", "frame should start with JPEG SOI")
            self.assertEqual(frame[-2:], b"\xff\xd9", "frame should end with JPEG EOI")
            self.assertEqual((manager.framebuffer.width, manager.framebuffer.height),
                             (64, 64))
        finally:
            manager.stop()


if __name__ == "__main__":
    unittest.main()


class LetterboxSymmetryTest(unittest.TestCase):
    """
    Dark content at one edge must not be read as a bar.

    cropdetect only reports where the non-black pixels are; it cannot tell
    padding from a dark menu bar or a maximised terminal. Padding from a scaler
    is centred, so the two bars on an axis match. Content is not, and treating
    it as a bar shifts every click on that axis.
    """

    @staticmethod
    def _frame(width, height, box_w, box_h, off_x, off_y):
        """A bright box at an arbitrary offset on black."""
        import subprocess
        cmd = ["ffmpeg", "-hide_banner", "-loglevel", "error",
               "-f", "lavfi", "-i", f"color=c=black:s={width}x{height}:d=1",
               "-f", "lavfi", "-i", f"color=c=white:s={box_w}x{box_h}:d=1",
               "-filter_complex", f"[0][1]overlay={off_x}:{off_y}",
               "-frames:v", "1", "-f", "mjpeg", "pipe:1"]
        return subprocess.run(cmd, capture_output=True, timeout=30).stdout

    def test_centred_pillarbox_is_kept(self):
        from capture.letterbox import detect
        # 1662 wide inside 1920: 129 either side, the real mirrored-Mac case.
        x, y, w, h = detect(self._frame(1920, 1080, 1662, 1080, 129, 0), 1920, 1080)
        self.assertAlmostEqual(x, 129, delta=8)
        self.assertAlmostEqual(w, 1662, delta=16)
        self.assertEqual((y, h), (0, 1080), "there are no top or bottom bars here")

    def test_a_dark_strip_at_one_edge_is_not_a_bar(self):
        from capture.letterbox import detect
        # Content starts 36px down and runs to the bottom: a bar on one side
        # only, which is what a dark menu bar looks like to cropdetect.
        frame = self._frame(1920, 1080, 1662, 1044, 129, 36)
        x, y, w, h = detect(frame, 1920, 1080)
        self.assertEqual((y, h), (0, 1080),
                         "an unbalanced vertical bar must not be trusted")
        # The genuinely symmetric axis is still used.
        self.assertAlmostEqual(x, 129, delta=8)
        self.assertAlmostEqual(w, 1662, delta=16)
