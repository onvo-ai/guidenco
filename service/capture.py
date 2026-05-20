"""
capture.py — persistent HDMI capture card reader.

Runs an ffmpeg subprocess that reads from /dev/video0 and emits MJPEG
frames as individual JPEG bytes. Subscribers get fresh frames via a
thread-safe queue.
"""

import logging
import queue
import subprocess
import threading
import time

from config import NATIVE_W, NATIVE_H, VIDEO_DEV

logger = logging.getLogger("guidenco.capture")

_FPS            = 10         # frames per second piped through ffmpeg
_FFMPEG_QUALITY = 4          # mjpeg -q:v  (1=best, 31=worst)


class CaptureManager:
    def __init__(self):
        self._latest: bytes | None = None
        self._lock   = threading.Lock()
        self._subs: list[queue.Queue] = []
        self._sub_lock = threading.Lock()
        self._running  = False
        self._thread: threading.Thread | None = None

    # ── Lifecycle ─────────────────────────────────────────────────────────────

    def start(self):
        if self._running:
            return
        self._running = True
        self._thread = threading.Thread(target=self._loop, daemon=True, name="capture")
        self._thread.start()

    def stop(self):
        self._running = False

    # ── Subscription ──────────────────────────────────────────────────────────

    def subscribe(self) -> queue.Queue:
        q: queue.Queue = queue.Queue(maxsize=2)
        with self._sub_lock:
            self._subs.append(q)
        return q

    def unsubscribe(self, q: queue.Queue):
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

    # ── Internal ──────────────────────────────────────────────────────────────

    def _publish(self, frame: bytes):
        with self._lock:
            self._latest = frame
        with self._sub_lock:
            for q in list(self._subs):
                try:
                    q.put_nowait(frame)
                except queue.Full:
                    try:
                        q.get_nowait()
                    except queue.Empty:
                        pass
                    try:
                        q.put_nowait(frame)
                    except queue.Full:
                        pass

    def _loop(self):
        cmd = [
            "ffmpeg", "-hide_banner", "-loglevel", "error",
            "-f", "v4l2",
            "-input_format", "mjpeg",
            "-video_size", f"{NATIVE_W}x{NATIVE_H}",
            "-framerate", str(_FPS),
            "-i", VIDEO_DEV,
            "-vf", f"scale={NATIVE_W}:{NATIVE_H}",
            "-q:v", str(_FFMPEG_QUALITY),
            "-f", "mjpeg", "-",
        ]
        while self._running:
            try:
                proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
                buf = b""
                while self._running:
                    chunk = proc.stdout.read(65536)
                    if not chunk:
                        break
                    buf += chunk
                    # Extract complete JPEG frames from the buffer
                    while True:
                        start = buf.find(b"\xff\xd8")
                        if start == -1:
                            buf = b""
                            break
                        end = buf.find(b"\xff\xd9", start + 2)
                        if end == -1:
                            buf = buf[start:]
                            break
                        frame = buf[start : end + 2]
                        buf = buf[end + 2:]
                        if len(frame) > 1000:
                            self._publish(frame)
            except Exception as exc:
                logger.error(f"[capture] ffmpeg loop error: {exc}")
            finally:
                try:
                    proc.kill()
                except Exception:
                    pass
            if self._running:
                time.sleep(2)


# Module-level singleton
_manager: CaptureManager | None = None
_manager_lock = threading.Lock()


def get_manager() -> CaptureManager:
    global _manager
    with _manager_lock:
        if _manager is None:
            _manager = CaptureManager()
    return _manager
