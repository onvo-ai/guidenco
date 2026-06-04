"""
capture.py — persistent HDMI capture reader.

Supports two hardware backends, selected via the CAPTURE_TYPE env var:

  usb_capture   — USB HDMI capture card (Macrosilicon, em28xx, etc.)
                  Device exposes MJPEG natively; ffmpeg reads it directly.

  csi_tc358743  — HDMI-to-CSI adapter (TC358743 chip on the CSI ribbon cable).
                  Requires dtoverlay=tc358743 in config.txt and a one-time EDID
                  advertisement so the HDMI source knows our capabilities.
                  ffmpeg reads raw frames; the driver handles timing negotiation.
"""

import logging
import os
import queue
import subprocess
import threading
import time

from config import (
    CAPTURE_TYPE, NATIVE_W, NATIVE_H, STREAM_W, STREAM_H, VIDEO_DEV,
    STREAM_FPS,
)

logger = logging.getLogger("guidenco.capture")

_FPS            = STREAM_FPS  # capture/encode rate
_FFMPEG_QUALITY = 6           # mjpeg -q:v  (1=best, 31=worst)


def _find_tc358743_subdev() -> str | None:
    """
    Return the /dev/v4l-subdevN node for the TC358743, or None if not found.
    The EDID must be set on the subdevice (not the unicam /dev/videoN node).
    """
    import glob
    for subdev in sorted(glob.glob("/dev/v4l-subdev*")):
        try:
            r = subprocess.run(
                ["v4l2-ctl", "-d", subdev, "--info"],
                capture_output=True, timeout=3,
            )
            if b"tc358743" in r.stdout.lower() or b"tc358743" in r.stderr.lower():
                return subdev
        except Exception:
            pass

    # Fallback: check media topology for tc358743 entity name
    try:
        r = subprocess.run(["media-ctl", "--print-topology"],
                           capture_output=True, timeout=5)
        lines = r.stdout.decode(errors="replace").splitlines()
        for i, line in enumerate(lines):
            if "tc358743" in line.lower():
                # Look ahead for the device node name
                for j in range(i, min(i + 5, len(lines))):
                    import re
                    m = re.search(r"/dev/v4l-subdev\d+", lines[j])
                    if m:
                        return m.group(0)
    except Exception:
        pass

    # Last resort: assume subdev0 if it exists (common single-camera Pi setups)
    if os.path.exists("/dev/v4l-subdev0"):
        return "/dev/v4l-subdev0"

    return None


# Track whether the one-time CSI setup (EDID + timings) has already been done.
# Every call to --set-dv-bt-timings generates a V4L2 source-change event that
# aborts the very next frame capture.  We only want to do it once (or after a
# signal loss), not on every ffmpeg restart.
_csi_initialized = False


def _drain_source_change_events(dev: str, timeout: float = 3.0) -> None:
    """
    Open the v4l2 device, subscribe to source-change events, drain any pending
    ones, then close.  This clears the event queue so the next VIDIOC_STREAMON
    won't see a stale event and abort the DMA transfer mid-frame.
    """
    try:
        import fcntl, struct, select

        V4L2_EVENT_SOURCE_CHANGE = 5
        VIDIOC_SUBSCRIBE_EVENT   = 0x4020565a
        VIDIOC_DQEVENT           = 0x80685659
        VIDIOC_UNSUBSCRIBE_EVENT = 0x4020565b

        fd = os.open(dev, os.O_RDWR | os.O_NONBLOCK)
        try:
            # struct v4l2_event_subscription { __u32 type; __u32 id; __u32 flags; __u32 reserved[5]; }
            sub = struct.pack("III5I", V4L2_EVENT_SOURCE_CHANGE, 0, 0, 0, 0, 0, 0, 0)
            try:
                fcntl.ioctl(fd, VIDIOC_SUBSCRIBE_EVENT, sub)
            except OSError:
                pass

            # Drain pending events (VIDIOC_DQEVENT struct is 104 bytes on arm32)
            deadline = time.monotonic() + timeout
            drained = 0
            while time.monotonic() < deadline:
                r, _, _ = select.select([fd], [], [], 0.05)
                if not r:
                    if drained > 0:
                        break   # no more events
                    continue
                try:
                    fcntl.ioctl(fd, VIDIOC_DQEVENT, bytearray(104))
                    drained += 1
                except OSError:
                    break
            if drained:
                logger.debug("[capture] drained %d source-change event(s)", drained)
        finally:
            os.close(fd)
    except Exception as e:
        logger.debug("[capture] event-drain skipped: %s", e)


def _setup_csi_adapter() -> bool:
    """
    Prepare the TC358743 CSI adapter before opening the v4l2 device.

    Key design principle: EDID and DV-timings are set ONCE and remembered.
    Calling --set-dv-bt-timings on every loop iteration generates a
    V4L2_EVENT_SOURCE_CHANGE event that aborts the next frame DMA mid-transfer
    (resulting in a partial green frame).  We only redo setup when the signal
    is actually lost.

    Returns True if the device is ready to capture, False if no signal yet.
    """
    global _csi_initialized
    dev = VIDEO_DEV

    # Load module (no-op if already loaded)
    subprocess.run(["modprobe", "tc358743"], capture_output=True)

    # Wait briefly for the device node to appear
    for _ in range(10):
        if os.path.exists(dev):
            break
        time.sleep(0.5)
    else:
        logger.warning("[capture] CSI device %s not found after modprobe", dev)
        return False

    # ── Check if signal is still present without touching DV timings ──────────
    if _csi_initialized:
        r = subprocess.run(
            ["v4l2-ctl", "-d", VIDEO_DEV, "--query-dv-timings"],
            capture_output=True, timeout=5,
        )
        output = r.stdout.decode(errors="replace") + r.stderr.decode(errors="replace")
        if r.returncode == 0 and "Active width: 0" not in output and "no-link" not in output.lower():
            # Signal still there, timings already set — skip all setup to avoid
            # generating source-change events that would corrupt the next frame.
            _drain_source_change_events(dev)
            return True
        else:
            logger.info("[capture] Signal lost — re-initialising CSI adapter")
            _csi_initialized = False

    # ── First-time (or post-loss) setup ───────────────────────────────────────
    subdev = _find_tc358743_subdev()

    # Set EDID limited to 1080p30 so the HDMI source doesn't choose 1080p60
    # (which would require 3 CSI lanes — more than the Pi Zero 2W's 2 lanes).
    edid_set = False
    edid_30fps = "/etc/guidenco/edid_1080p30.hex"
    if subdev:
        edid_file = edid_30fps if os.path.exists(edid_30fps) else None
        cmd = (["v4l2-ctl", "-d", subdev, f"--set-edid=pad=0,file={edid_file}"]
               if edid_file else
               ["v4l2-ctl", "-d", subdev, "--set-edid=type=hdmi"])
        try:
            r = subprocess.run(cmd, capture_output=True, timeout=5)
            edid_set = (r.returncode == 0)
        except Exception:
            pass

    if not edid_set:
        logger.warning("[capture] Could not set EDID on %s", subdev or "unknown")

    # Wait for the HDMI source to re-negotiate with the new EDID
    time.sleep(3)

    # Latch DV timings exactly once — this generates a source-change event
    r = subprocess.run(
        ["v4l2-ctl", "-d", dev, "--set-dv-bt-timings", "query"],
        capture_output=True, timeout=5,
    )
    if r.returncode != 0:
        logger.debug("[capture] No DV signal yet on %s — will retry", dev)
        return False

    # Wait an additional moment for the source-change event to settle, then
    # drain it so it doesn't abort the first ffmpeg frame.
    time.sleep(2)
    _drain_source_change_events(dev, timeout=3.0)

    _csi_initialized = True
    logger.info("[capture] CSI adapter initialised: %s @ timings from source", dev)
    return True


_V4L2_TO_FFMPEG_FMT = {
    "UYVY": "uyvy422",
    "YUYV": "yuyv422",
    "BGR3": "bgr24",
    "RGB3": "rgb24",
    "NV12": "nv12",
    "YU12": "yuv420p",
    "MJPG": "mjpeg",
}


def _query_v4l2_fmt() -> tuple[str, int, int]:
    """
    Query the v4l2 device for its current pixel format, width, and height.
    Returns (ffmpeg_pix_fmt, width, height).
    Falls back to (uyvy422, NATIVE_W, NATIVE_H) if the query fails.
    """
    try:
        r = subprocess.run(
            ["v4l2-ctl", "-d", VIDEO_DEV, "--get-fmt-video"],
            capture_output=True, timeout=5,
        )
        out = r.stdout.decode(errors="replace")
        w = h = None
        v4l2_fmt = None
        for line in out.splitlines():
            if "Width/Height" in line:
                parts = line.split(":")[1].strip().split("/")
                w, h = int(parts[0]), int(parts[1])
            elif "Pixel Format" in line:
                import re
                m = re.search(r"'(\w+)'", line)
                if m:
                    v4l2_fmt = m.group(1)
        ffmpeg_fmt = _V4L2_TO_FFMPEG_FMT.get(v4l2_fmt or "", "uyvy422")
        logger.info("[capture] device fmt=%s → ffmpeg %s, %sx%s",
                    v4l2_fmt, ffmpeg_fmt, w, h)
        return ffmpeg_fmt, (w or NATIVE_W), (h or NATIVE_H)
    except Exception as e:
        logger.warning("[capture] fmt query failed (%s), defaulting to uyvy422", e)
        return "uyvy422", NATIVE_W, NATIVE_H


def _encode_outputs() -> list[str]:
    """
    ffmpeg output stage: scale to STREAM_W×STREAM_H, encode as MJPEG to stdout.
    ws_client reads the JPEG stream and feeds it to aiortc for VP8 encoding —
    the codec path aiortc handles natively and reliably (no passthrough complexity).
    """
    return [
        "-vf", f"scale={STREAM_W}:{STREAM_H}:flags=fast_bilinear",
        "-q:v", str(_FFMPEG_QUALITY),
        "-f", "mjpeg", "pipe:1",
    ]


def _build_csi_procs():
    """
    For the TC358743 CSI backend, return a (v4l2_proc, ffmpeg_proc) pair.

    ffmpeg's v4l2 demuxer doesn't handle V4L2_BUF_FLAG_ERROR (set when a
    source-change event aborts a frame mid-DMA). It re-queues the errored
    buffer and keeps returning the same partial frame indefinitely.

    v4l2-ctl DOES handle V4L2_BUF_FLAG_ERROR: on error it re-applies DV
    timings and continues.  So we use v4l2-ctl to stream raw UYVY frames to
    stdout, then pipe into ffmpeg solely for raw→MJPEG conversion.

    Using --stream-mmap=8 gives 8 DMA buffers, which is enough depth for
    the source-change event to clear on its own (only frame 0 is ever bad).
    """
    pix_fmt, cap_w, cap_h = _query_v4l2_fmt()

    v4l2_cmd = [
        "v4l2-ctl",
        "-d", VIDEO_DEV,
        "--stream-mmap=4",  # 4 DMA buffers saves ~25MB RAM vs 8
        "--stream-to=-",    # stdout
    ]
    ffmpeg_cmd = [
        "ffmpeg", "-hide_banner", "-loglevel", "error",
        "-f", "rawvideo",
        "-pixel_format", pix_fmt,
        "-video_size", f"{cap_w}x{cap_h}",
        "-framerate", str(_FPS),
        "-i", "pipe:0",
    ] + _encode_outputs()
    v4l2_proc  = subprocess.Popen(v4l2_cmd,  stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
    ffmpeg_proc = subprocess.Popen(ffmpeg_cmd, stdin=v4l2_proc.stdout,
                                   stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
    v4l2_proc.stdout.close()   # let ffmpeg own the pipe; SIGPIPE kills v4l2 when ffmpeg exits
    return v4l2_proc, ffmpeg_proc


def _build_ffmpeg_cmd() -> list[str]:
    """Build the ffmpeg command for USB capture cards (MJPEG in → H264/MJPEG out)."""
    return [
        "ffmpeg", "-hide_banner", "-loglevel", "error",
        "-f", "v4l2",
        "-input_format", "mjpeg",
        "-video_size", f"{NATIVE_W}x{NATIVE_H}",
        "-framerate", str(_FPS),
        "-i", VIDEO_DEV,
    ] + _encode_outputs()


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
        while self._running:
            # CSI adapters need EDID + timing negotiation before capture starts.
            if CAPTURE_TYPE == "csi_tc358743":
                if not _setup_csi_adapter():
                    time.sleep(3)
                    continue

            v4l2_proc = None
            proc = None
            try:
                if CAPTURE_TYPE == "csi_tc358743":
                    # v4l2-ctl handles V4L2_BUF_FLAG_ERROR (source-change events)
                    # correctly; ffmpeg's v4l2 demuxer does not.  Stream raw UYVY
                    # via v4l2-ctl and encode to MJPEG via a separate ffmpeg process.
                    v4l2_proc, proc = _build_csi_procs()
                    # v4l2-ctl frame 0 is always partial (source-change on STREAMON).
                    # v4l2-ctl skips it and continues; ffmpeg sees clean frames from
                    # frame 1 onward, so no JPEG skipping is needed here.
                    skip_count = 1
                else:
                    proc = subprocess.Popen(
                        _build_ffmpeg_cmd(),
                        stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                    )
                    skip_count = 0

                buf = b""
                frames_seen = 0

                while self._running:
                    chunk = proc.stdout.read(65536)
                    if not chunk:
                        break
                    buf += chunk
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
                            frames_seen += 1
                            if frames_seen <= skip_count:
                                logger.debug("[capture] discarding frame %d (warmup)", frames_seen)
                                continue
                            self._publish(frame)
            except Exception as exc:
                logger.error(f"[capture] capture loop error: {exc}")
            finally:
                for p in (proc, v4l2_proc):
                    if p is None:
                        continue
                    try:
                        p.kill()
                        p.wait()
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
