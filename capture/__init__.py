"""
capture — on-demand HDMI capture.

The pipeline runs only while something is reading from it. Ask for a frame and
it starts, stays warm briefly in case more requests follow, and shuts down when
nobody is asking.

That is not only about cost, though the cost is real: a CSI adapter delivers raw
frames, so every one has to be compressed in software, and a Pi Zero holds three
of its four cores doing that continuously. It is mostly about freshness. A
pipeline running in the background hands you whichever frame happened to land
last, up to a frame-interval stale. Capturing on request returns an image taken
*after* you asked for it, which is what "what is on screen right now" should
mean when the next thing you do is click on it.

Public API:
    mgr = get_manager()
    mgr.start()                     # begins the idle reaper, not the capture
    frame = mgr.frame()             # starts capture if needed, returns a fresh frame
    with mgr.hold(): ...            # keeps it running, for streaming
    fb = mgr.framebuffer            # geometry and the last frame seen
"""

import contextlib
import logging
import threading
import time

# Imported as a module, not as names: these two are read on every request, and
# binding them at import time would make them impossible to change at runtime
# or to exercise in a test without restarting the process.
import config
from config import CAPTURE_TYPE
from .base import CaptureBackend, iter_mjpeg
from .framebuffer import Framebuffer
from .letterbox import detect

logger = logging.getLogger("guidenco.capture")

_BACKOFF_SECONDS = 2

#: How often to re-check for letterbox bars. They appear and vanish when the
#: source changes display arrangement without changing capture resolution —
#: switching between mirrored and extended, for instance — which no other
#: signal would tell us about. The clock lives on the manager rather than on a
#: single run: on-demand capture stops and restarts the pipeline constantly, and
#: a per-run clock would re-run this ffmpeg pass on every cold start.
_LETTERBOX_RECHECK_S = 60

#: How often the reaper looks for an idle pipeline.
_REAP_INTERVAL_S = 1.0


def _make_backend() -> CaptureBackend:
    if CAPTURE_TYPE == "csi":
        from .csi import CsiBackend
        return CsiBackend()
    if CAPTURE_TYPE == "test":
        from .test_source import TestBackend
        return TestBackend()
    from .usb import UsbBackend
    return UsbBackend()


class CaptureManager:
    def __init__(self, backend: CaptureBackend | None = None) -> None:
        self.framebuffer = Framebuffer()
        # The backend instance outlives individual runs on purpose: CsiBackend
        # remembers that it has already negotiated EDID and DV timings, so a
        # restart skips several seconds of re-negotiation.
        self._backend = backend
        self._lock = threading.RLock()
        self._thread: threading.Thread | None = None
        self._run_stop = threading.Event()
        self._shutdown = threading.Event()
        self._holders = 0
        self._last_used = 0.0
        self._detecting = False
        self._checked_at = 0.0
        self._reaper: threading.Thread | None = None

    # ── Lifecycle ─────────────────────────────────────────────────────────────

    def start(self) -> None:
        """Begin reaping idle pipelines. Does not itself start capturing."""
        with self._lock:
            if self._reaper is not None:
                return
            self._shutdown.clear()
            self._reaper = threading.Thread(target=self._reap_loop, daemon=True,
                                            name="capture-reaper")
            self._reaper.start()

    def stop(self) -> None:
        self._shutdown.set()
        self._run_stop.set()

    @property
    def capturing(self) -> bool:
        thread = self._thread
        return thread is not None and thread.is_alive()

    # ── Requesting frames ─────────────────────────────────────────────────────

    def frame(self, timeout: float | None = None) -> bytes | None:
        """
        A frame captured after this call was made.

        Starts the pipeline if it is not running. Waits for a genuinely new
        frame rather than returning whatever is already in the framebuffer, so
        the caller cannot be handed a stale image from a previous request.
        """
        if timeout is None:
            timeout = config.CAPTURE_WARMUP_S
        self._touch()
        # Read the baseline before starting, so a frame that arrives during
        # start-up still counts as newer than the request.
        baseline = self.framebuffer.sequence
        self._ensure_running()
        frame, _ = self.framebuffer.next_after(baseline, timeout=timeout)
        self._touch()
        return frame

    @contextlib.contextmanager
    def hold(self):
        """
        Keep the pipeline running for the duration of the block.

        Used by streaming, where stopping between frames would be absurd.
        """
        with self._lock:
            self._holders += 1
        self._touch()
        self._ensure_running()
        try:
            yield self
        finally:
            with self._lock:
                self._holders -= 1
            self._touch()

    def _touch(self) -> None:
        self._last_used = time.monotonic()

    # ── Running and reaping ───────────────────────────────────────────────────

    def _ensure_running(self) -> None:
        with self._lock:
            if self.capturing:
                return
            self._run_stop.clear()
            self._thread = threading.Thread(target=self._loop, daemon=True,
                                            name="capture")
            self._thread.start()

    def _reap_loop(self) -> None:
        while not self._shutdown.wait(_REAP_INTERVAL_S):
            with self._lock:
                idle = self._holders == 0 and self.capturing
                elapsed = time.monotonic() - self._last_used
            if idle and elapsed >= config.CAPTURE_IDLE_TIMEOUT_S:
                logger.info("[capture] idle for %.0fs — stopping the pipeline", elapsed)
                self._run_stop.set()

    def _check_letterbox(self, frame: bytes, width: int, height: int) -> None:
        if self._detecting:
            return                      # one at a time; they would agree anyway
        self._detecting = True
        # Stamped on the attempt, not the result: a detection that keeps failing
        # must not respawn ffmpeg on every frame.
        self._checked_at = time.monotonic()

        def work() -> None:
            try:
                area = detect(frame, width, height)
                # None means detection could not tell. Keep what we have: an
                # area detected earlier is far better than falling back to the
                # whole frame, which would put every click back off by a bar.
                if area is not None:
                    self.framebuffer.set_active(area)
            except Exception:
                logger.exception("[capture] letterbox detection failed")
            finally:
                self._detecting = False

        threading.Thread(target=work, daemon=True, name="letterbox").start()

    def _loop(self) -> None:
        if self._backend is None:
            self._backend = _make_backend()
        backend = self._backend
        logger.info("[capture] starting (%s)", type(backend).__name__)
        started = time.monotonic()

        while not self._run_stop.is_set() and not self._shutdown.is_set():
            if not backend.prepare():
                if self._run_stop.wait(_BACKOFF_SECONDS + 1):
                    break
                continue

            procs: list = []
            stream = None
            try:
                stream, procs, width, height = backend.open()
                logger.info("[capture] streaming %dx%d after %.1fs",
                            width, height, time.monotonic() - started)
                self.framebuffer.resize(width, height)
                for frame in iter_mjpeg(stream):
                    if self._run_stop.is_set() or self._shutdown.is_set():
                        break
                    self.framebuffer.update(frame)
                    now = time.monotonic()
                    if now - self._checked_at >= _LETTERBOX_RECHECK_S:
                        # Off the capture thread: detection spawns ffmpeg, and
                        # blocking here would stall the frame stream behind it.
                        self._check_letterbox(frame, width, height)
            except Exception as exc:
                logger.error("[capture] loop error: %s", exc)
            finally:
                if stream is not None:
                    try:
                        stream.close()
                    except Exception:
                        pass
                for p in procs:
                    try:
                        p.kill()
                        p.wait()
                    except Exception:
                        pass

            if self._run_stop.is_set() or self._shutdown.is_set():
                break
            # The stream ended on its own: the source was unplugged, changed
            # resolution, or ffmpeg died. Retry while someone still wants frames.
            if self._run_stop.wait(_BACKOFF_SECONDS):
                break

        logger.info("[capture] stopped")
        with self._lock:
            self._thread = None


_manager: CaptureManager | None = None
_manager_lock = threading.Lock()


def get_manager() -> CaptureManager:
    global _manager
    with _manager_lock:
        if _manager is None:
            _manager = CaptureManager()
    return _manager


__all__ = ["CaptureManager", "get_manager", "Framebuffer"]
