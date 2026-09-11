"""
capture — persistent HDMI capture reader.

The CaptureManager runs a background thread that owns a capture backend (USB,
CSI or the synthetic test source, chosen by CAPTURE_TYPE), reads its raw RGB24
stream, and writes each frame into the shared Framebuffer. Backends are
restarted automatically if they exit, which is what happens when the HDMI
source is unplugged or changes resolution.

Public API:
    mgr = get_manager()
    mgr.start()
    fb = mgr.framebuffer        # capture.framebuffer.Framebuffer
"""

import logging
import threading
import time

from config import CAPTURE_TYPE
from .base import CaptureBackend, iter_mjpeg
from .framebuffer import Framebuffer
from .letterbox import detect

logger = logging.getLogger("guidenco.capture")

_BACKOFF_SECONDS = 2

#: How often to re-check for letterbox bars. They appear and vanish when the
#: source changes display arrangement without changing capture resolution —
#: switching between mirrored and extended, for instance — which no other
#: signal would tell us about.
_LETTERBOX_RECHECK_S = 60


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
        self._backend = backend
        self._running = False
        self._detecting = False
        self._thread: threading.Thread | None = None

    def start(self) -> None:
        if self._running:
            return
        self._running = True
        self._thread = threading.Thread(target=self._loop, daemon=True, name="capture")
        self._thread.start()

    def stop(self) -> None:
        self._running = False

    def _check_letterbox(self, frame: bytes, width: int, height: int) -> None:
        if self._detecting:
            return                      # one at a time; they would agree anyway
        self._detecting = True

        def work() -> None:
            try:
                self.framebuffer.set_active(detect(frame, width, height))
            except Exception:
                logger.exception("[capture] letterbox detection failed")
            finally:
                self._detecting = False

        threading.Thread(target=work, daemon=True, name="letterbox").start()

    def _loop(self) -> None:
        backend = self._backend or _make_backend()
        logger.info("[capture] backend: %s", type(backend).__name__)

        while self._running:
            if not backend.prepare():
                time.sleep(_BACKOFF_SECONDS + 1)
                continue

            procs: list = []
            stream = None
            try:
                stream, procs, width, height = backend.open()
                logger.info("[capture] streaming %dx%d", width, height)
                self.framebuffer.resize(width, height)
                checked_at = 0.0
                for frame in iter_mjpeg(stream):
                    if not self._running:
                        break
                    self.framebuffer.update(frame)
                    now = time.monotonic()
                    if now - checked_at >= _LETTERBOX_RECHECK_S:
                        checked_at = now
                        # Off the capture thread: detection spawns ffmpeg, and
                        # blocking here would stall the frame stream behind it.
                        self._check_letterbox(frame, width, height)
                logger.info("[capture] stream ended — restarting")
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

            if self._running:
                time.sleep(_BACKOFF_SECONDS)


_manager: CaptureManager | None = None
_manager_lock = threading.Lock()


def get_manager() -> CaptureManager:
    global _manager
    with _manager_lock:
        if _manager is None:
            _manager = CaptureManager()
    return _manager


__all__ = ["CaptureManager", "get_manager", "Framebuffer"]
