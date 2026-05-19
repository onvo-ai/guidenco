#!/usr/bin/env python3
"""
Persistent capture-card reader.

ffmpeg scales input by SCALE_RATIO (see config.py).
_latest is always a fresh JPEG ready to serve immediately.
"""

import logging
import os
import queue
import subprocess
import sys
import threading
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from config import SCALED_W, SCALED_H, NATIVE_W, NATIVE_H, VIDEO_DEV

logger = logging.getLogger("guidenco")

INPUT_RES  = f"{NATIVE_W}x{NATIVE_H}"
OUTPUT_RES = f"{SCALED_W}x{SCALED_H}"
FPS            = 30
FFMPEG_QUALITY = 4            # mjpeg -q:v  (1=best, 31=worst)


class CaptureCardManager:

    def __init__(self):
        self._latest   = None
        self._lock     = threading.Lock()
        self._subs: list[queue.Queue] = []
        self._sub_lock = threading.Lock()
        self._running  = False
        self._thread   = None

    # ── Lifecycle ─────────────────────────────────────────────────────────────

    def start(self):
        if self._running:
            return
        self._running = True
        self._thread  = threading.Thread(
            target=self._loop, daemon=True, name="capture-card"
        )
        self._thread.start()
        logger.info(f"[capture] started — {VIDEO_DEV} {INPUT_RES}→{OUTPUT_RES} @{FPS}fps")

    def stop(self):
        self._running = False

    # ── Public API ────────────────────────────────────────────────────────────

    def get_frame(self, timeout: float = 10.0) -> bytes | None:
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            with self._lock:
                if self._latest:
                    return self._latest
            time.sleep(0.02)
        return None

    def get_fresh_frame(self, timeout: float = 2.0) -> bytes | None:
        sub = self.subscribe()
        try:
            return sub.get(timeout=timeout)
        except queue.Empty:
            with self._lock:
                if self._latest:
                    return self._latest
            return None
        finally:
            self.unsubscribe(sub)

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

    # ── Internal ──────────────────────────────────────────────────────────────

    def _publish(self, frame: bytes) -> None:
        with self._lock:
            self._latest = frame
        with self._sub_lock:
            for sub in self._subs:
                if sub.full():
                    try:
                        sub.get_nowait()   # evict stale frame
                    except queue.Empty:
                        pass
                try:
                    sub.put_nowait(frame)
                except queue.Full:
                    pass

    def _loop(self) -> None:
        while self._running:
            try:
                self._run_ffmpeg()
            except Exception as exc:
                logger.error(f"[capture] error: {exc}")
            if self._running:
                time.sleep(2)

    def _run_ffmpeg(self) -> None:
        # ffmpeg reads MJPEG from the capture card, scales to 720p, outputs MJPEG.
        # Low-latency flags prevent ffmpeg from buffering several seconds before output.
        cmd = [
            "ffmpeg", "-loglevel", "error",
            # Aggressive low-latency — disable ALL buffering/delay tolerable.
            "-fflags", "nobuffer+discardcorrupt",
            "-flags", "low_delay",
            "-max_delay", "0",
            "-flush_packets", "1",
            "-avioflags", "direct",
            "-probesize", "32",
            "-analyzeduration", "0",
            "-f", "video4linux2",
            "-input_format", "mjpeg",
            "-video_size", INPUT_RES,
            "-framerate", str(FPS),
            "-thread_queue_size", "1",
            "-i", VIDEO_DEV,
            "-vf", f"scale={OUTPUT_RES.replace('x', ':')}:flags=fast_bilinear",
            "-vcodec", "mjpeg",
            "-q:v", str(FFMPEG_QUALITY),
            "-vsync", "0",                  # passthrough, no frame dup/drop
            "-f", "mjpeg",
            "-muxdelay", "0",
            "-muxpreload", "0",
            "-",
        ]
        proc = subprocess.Popen(
            cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, bufsize=0
        )
        buf = bytearray()
        try:
            while self._running:
                chunk = proc.stdout.read(65536)
                if not chunk:
                    break
                buf.extend(chunk)
                while True:
                    s = buf.find(b"\xff\xd8")
                    if s < 0:
                        if len(buf) > 2:
                            del buf[:-2]
                        break
                    e = buf.find(b"\xff\xd9", s + 2)
                    if e < 0:
                        if s > 0:
                            del buf[:s]
                        break
                    frame = bytes(buf[s : e + 2])
                    del buf[: e + 2]
                    if len(frame) >= 512:
                        self._publish(frame)
        finally:
            proc.stdout.close()
            if proc.poll() is None:
                proc.terminate()
                try:
                    proc.wait(timeout=2)
                except subprocess.TimeoutExpired:
                    proc.kill()


_manager = CaptureCardManager()

def get_manager() -> CaptureCardManager:
    return _manager
