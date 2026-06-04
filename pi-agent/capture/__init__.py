"""
capture — persistent HDMI capture reader.

The CaptureManager runs a background thread that owns a capture backend (USB or
CSI, chosen by CAPTURE_TYPE), reads its MJPEG stream, and publishes each frame
to the latest-frame buffer and to any subscribers. Backends are restarted
automatically if they exit.

Public API:
    mgr = get_manager()
    mgr.start()
    frame = mgr.get_latest()          # most recent JPEG bytes
    q = mgr.subscribe();  mgr.unsubscribe(q)
"""

import logging
import queue
import threading
import time

from config import CAPTURE_TYPE
from .base import CaptureBackend, iter_mjpeg
from .usb import UsbBackend
from .csi import CsiBackend

logger = logging.getLogger("guidenco.capture")

_BACKOFF_SECONDS = 2


def _make_backend() -> CaptureBackend:
    if CAPTURE_TYPE == "csi":
        return CsiBackend()
    return UsbBackend()


class CaptureManager:
    def __init__(self) -> None:
        self._latest: bytes | None = None
        self._lock = threading.Lock()
        self._subs: list[queue.Queue] = []
        self._sub_lock = threading.Lock()
        self._running = False
        self._thread: threading.Thread | None = None

    # ── Lifecycle ─────────────────────────────────────────────────────────────

    def start(self) -> None:
        if self._running:
            return
        self._running = True
        self._thread = threading.Thread(target=self._loop, daemon=True, name="capture")
        self._thread.start()

    def stop(self) -> None:
        self._running = False

    # ── Subscription ──────────────────────────────────────────────────────────

    def subscribe(self) -> queue.Queue:
        q: queue.Queue = queue.Queue(maxsize=2)
        with self._sub_lock:
            self._subs.append(q)
        return q

    def unsubscribe(self, q: queue.Queue) -> None:
        with self._sub_lock:
            try:
                self._subs.remove(q)
            except ValueError:
                pass

    def get_latest(self, timeout: float = 3.0) -> bytes | None:
        """Return the most recent frame, waiting up to *timeout* seconds."""
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            with self._lock:
                if self._latest:
                    return self._latest
            time.sleep(0.05)
        return None

    # ── Internals ─────────────────────────────────────────────────────────────

    def _publish(self, frame: bytes) -> None:
        with self._lock:
            self._latest = frame
        with self._sub_lock:
            subs = list(self._subs)
        for q in subs:
            try:
                q.put_nowait(frame)
            except queue.Full:
                # Drop the oldest queued frame so subscribers stay fresh.
                try:
                    q.get_nowait()
                    q.put_nowait(frame)
                except (queue.Empty, queue.Full):
                    pass

    def _loop(self) -> None:
        backend = _make_backend()
        logger.info("[capture] backend: %s", type(backend).__name__)

        while self._running:
            if not backend.prepare():
                time.sleep(_BACKOFF_SECONDS + 1)
                continue

            procs: list = []
            try:
                frame_proc, procs = backend.open()
                seen = 0
                for frame in iter_mjpeg(frame_proc.stdout):
                    if not self._running:
                        break
                    seen += 1
                    if seen <= backend.warmup_frames:
                        logger.debug("[capture] discarding warmup frame %d", seen)
                        continue
                    self._publish(frame)
            except Exception as exc:
                logger.error("[capture] loop error: %s", exc)
            finally:
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
