"""
Tests for on-demand capture.

The pipeline runs only while something is reading it, and a requested frame is
one taken after the request. Both matter: the first for cost, the second
because a screenshot that predates the question can send an agent clicking at
something that has already changed.
"""

import os
import sys
import threading
import time
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import config                                                      # noqa: E402
from capture import CaptureManager                                 # noqa: E402
from capture.base import CaptureBackend                            # noqa: E402


class ScriptedBackend(CaptureBackend):
    """
    A backend that records how often it is started and emits numbered frames.

    Start-up is deliberately not instantaneous, mirroring a CSI adapter that
    must negotiate before its first frame.
    """

    def __init__(self, startup: float = 0.05, interval: float = 0.05) -> None:
        self.startup = startup
        self.interval = interval
        self.opens = 0
        self.closed = threading.Event()
        self._stop = threading.Event()

    def open(self):
        self.opens += 1
        read_fd, write_fd = os.pipe()
        reader = os.fdopen(read_fd, "rb")
        self._stop.clear()

        def feed():
            time.sleep(self.startup)
            n = 0
            try:
                while not self._stop.is_set():
                    # A recognisable frame: valid JPEG delimiters, unique body.
                    os.write(write_fd, b"\xff\xd8" + f"{n:06d}".encode() * 60 + b"\xff\xd9")
                    n += 1
                    time.sleep(self.interval)
            except (BrokenPipeError, OSError):
                pass
            finally:
                self.closed.set()
                try:
                    os.close(write_fd)
                except OSError:
                    pass

        threading.Thread(target=feed, daemon=True).start()
        return reader, [], 320, 240


class OnDemandTest(unittest.TestCase):
    def setUp(self):
        self._idle = config.CAPTURE_IDLE_TIMEOUT_S
        config.CAPTURE_IDLE_TIMEOUT_S = 1          # keep the tests quick
        self.backend = ScriptedBackend()
        self.manager = CaptureManager(backend=self.backend)
        self.manager.start()

    def tearDown(self):
        config.CAPTURE_IDLE_TIMEOUT_S = self._idle
        self.manager.stop()

    def test_starting_the_manager_does_not_start_capturing(self):
        time.sleep(0.3)
        self.assertFalse(self.manager.capturing,
                         "the pipeline must not run until something asks for a frame")
        self.assertEqual(self.backend.opens, 0)

    def test_asking_for_a_frame_starts_the_pipeline(self):
        frame = self.manager.frame(timeout=5)
        self.assertIsNotNone(frame)
        self.assertTrue(self.manager.capturing)
        self.assertEqual(self.backend.opens, 1)

    def test_a_returned_frame_is_newer_than_the_request(self):
        self.manager.frame(timeout=5)
        before = self.manager.framebuffer.sequence
        frame = self.manager.frame(timeout=5)
        self.assertIsNotNone(frame)
        self.assertGreater(self.manager.framebuffer.sequence, before,
                           "a requested frame must be captured after the request, "
                           "not read back from the framebuffer")

    def test_consecutive_requests_reuse_a_warm_pipeline(self):
        for _ in range(4):
            self.assertIsNotNone(self.manager.frame(timeout=5))
        self.assertEqual(self.backend.opens, 1,
                         "a burst of requests must not restart the pipeline each time")

    def test_it_shuts_down_once_idle(self):
        self.manager.frame(timeout=5)
        self.assertTrue(self.manager.capturing)
        deadline = time.monotonic() + 8
        while self.manager.capturing and time.monotonic() < deadline:
            time.sleep(0.2)
        self.assertFalse(self.manager.capturing,
                         "the pipeline must stop when nobody is reading")

    def test_it_restarts_after_going_idle(self):
        self.manager.frame(timeout=5)
        deadline = time.monotonic() + 8
        while self.manager.capturing and time.monotonic() < deadline:
            time.sleep(0.2)
        self.assertFalse(self.manager.capturing)
        self.assertIsNotNone(self.manager.frame(timeout=10))
        self.assertEqual(self.backend.opens, 2)

    def test_a_hold_keeps_it_running_past_the_idle_window(self):
        with self.manager.hold():
            time.sleep(config.CAPTURE_IDLE_TIMEOUT_S + 1.5)
            self.assertTrue(self.manager.capturing,
                            "a stream in progress must not be reaped")
        deadline = time.monotonic() + 8
        while self.manager.capturing and time.monotonic() < deadline:
            time.sleep(0.2)
        self.assertFalse(self.manager.capturing, "and must stop once released")

    def test_geometry_survives_the_pipeline_stopping(self):
        self.manager.frame(timeout=5)
        self.assertEqual((self.manager.framebuffer.width,
                          self.manager.framebuffer.height), (320, 240))
        deadline = time.monotonic() + 8
        while self.manager.capturing and time.monotonic() < deadline:
            time.sleep(0.2)
        # Coordinates are validated against these even while idle, so losing
        # them would make the first click after a pause fail.
        self.assertEqual((self.manager.framebuffer.width,
                          self.manager.framebuffer.height), (320, 240))

    def test_concurrent_requests_start_only_one_pipeline(self):
        results = []
        def ask():
            results.append(self.manager.frame(timeout=10))
        threads = [threading.Thread(target=ask) for _ in range(5)]
        for t in threads: t.start()
        for t in threads: t.join(timeout=15)
        self.assertTrue(all(r is not None for r in results))
        self.assertEqual(self.backend.opens, 1,
                         "a thundering herd must not spawn several pipelines")


class RateCapTest(unittest.TestCase):
    """
    STREAM_FPS has to reach ffmpeg as a filter. Passing -framerate on a
    rawvideo input declares what the input is, it does not limit anything, so
    without the filter every frame the device produces gets encoded.
    """

    def test_the_fps_filter_is_emitted(self):
        from capture.base import encode_outputs
        args = encode_outputs(0, 0, 10)
        self.assertIn("-vf", args)
        self.assertIn("fps=10", args[args.index("-vf") + 1])

    def test_scaling_and_capping_combine_into_one_filter_chain(self):
        from capture.base import encode_outputs
        args = encode_outputs(1280, 720, 5)
        chain = args[args.index("-vf") + 1]
        self.assertIn("fps=5", chain)
        self.assertIn("scale=1280:720", chain)

    def test_no_filter_when_neither_is_requested(self):
        from capture.base import encode_outputs
        self.assertNotIn("-vf", encode_outputs(0, 0, 0))


if __name__ == "__main__":
    unittest.main()
