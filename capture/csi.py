"""
capture/csi.py — HDMI-to-CSI adapter backend (Toshiba TC358743).

The TC358743 sits on the CSI ribbon cable and needs negotiation before it
delivers frames:

  • EDID must be advertised to the HDMI source so it knows our capabilities.
  • DV (digital video) timings must be latched once from the live signal.

Both of these generate V4L2_EVENT_SOURCE_CHANGE events that abort the next
frame's DMA mid-transfer, so we latch them exactly once and only redo setup
after a signal loss. Draining pending events before each start is still worth
doing, but it cannot save the first frame: starting the stream is itself what
emits the event, so the first buffer always arrives half-written and is dropped
by --stream-skip instead.

ffmpeg's v4l2 demuxer mishandles V4L2_BUF_FLAG_ERROR (it re-queues the bad
buffer and loops on a partial frame forever), so we stream raw frames via
v4l2-ctl — which re-applies timings on error — and pipe them into ffmpeg purely
to convert the adapter's native pixel format (usually UYVY) into MJPEG.
This is the one capture path that pays for an encode; USB cards pass through.
"""

import glob
import logging
import os
import re
import subprocess
import time

from config import VIDEO_DEV, CAPTURE_W, CAPTURE_H, STREAM_W, STREAM_H, STREAM_FPS
from .base import CaptureBackend, encode_outputs

logger = logging.getLogger("guidenco.capture.csi")

EDID_1080P30 = "/etc/guidenco/edid_1080p30.hex"

_V4L2_TO_FFMPEG_FMT = {
    "UYVY": "uyvy422", "YUYV": "yuyv422", "BGR3": "bgr24",
    "RGB3": "rgb24", "NV12": "nv12", "YU12": "yuv420p", "MJPG": "mjpeg",
}


def _find_subdev() -> str | None:
    """Return the /dev/v4l-subdevN node for the TC358743 (EDID lives there)."""
    for subdev in sorted(glob.glob("/dev/v4l-subdev*")):
        try:
            r = subprocess.run(["v4l2-ctl", "-d", subdev, "--info"],
                              capture_output=True, timeout=3)
            if b"tc358743" in (r.stdout + r.stderr).lower():
                return subdev
        except Exception:
            pass

    try:
        r = subprocess.run(["media-ctl", "--print-topology"],
                          capture_output=True, timeout=5)
        lines = r.stdout.decode(errors="replace").splitlines()
        for i, line in enumerate(lines):
            if "tc358743" in line.lower():
                for j in range(i, min(i + 5, len(lines))):
                    m = re.search(r"/dev/v4l-subdev\d+", lines[j])
                    if m:
                        return m.group(0)
    except Exception:
        pass

    return "/dev/v4l-subdev0" if os.path.exists("/dev/v4l-subdev0") else None


def _drain_source_change_events(dev: str, timeout: float = 3.0) -> None:
    """
    Subscribe to source-change events, drain any pending ones, then close — so
    the next VIDIOC_STREAMON doesn't see a stale event and abort frame 0's DMA.
    """
    try:
        import fcntl, struct, select

        V4L2_EVENT_SOURCE_CHANGE = 5
        VIDIOC_SUBSCRIBE_EVENT   = 0x4020565A
        VIDIOC_DQEVENT           = 0x80685659

        fd = os.open(dev, os.O_RDWR | os.O_NONBLOCK)
        try:
            sub = struct.pack("III5I", V4L2_EVENT_SOURCE_CHANGE, 0, 0, 0, 0, 0, 0, 0)
            try:
                fcntl.ioctl(fd, VIDIOC_SUBSCRIBE_EVENT, sub)
            except OSError:
                pass

            deadline = time.monotonic() + timeout
            drained = 0
            while time.monotonic() < deadline:
                r, _, _ = select.select([fd], [], [], 0.05)
                if not r:
                    if drained:
                        break
                    continue
                try:
                    fcntl.ioctl(fd, VIDIOC_DQEVENT, bytearray(104))
                    drained += 1
                except OSError:
                    break
            if drained:
                logger.debug("[csi] drained %d source-change event(s)", drained)
        finally:
            os.close(fd)
    except Exception as e:
        logger.debug("[csi] event-drain skipped: %s", e)


def _query_dv_timings() -> tuple[int, int] | None:
    """
    Size of the signal currently arriving, or None if there isn't one.

    The adapter reports a stale set of timings when nothing is connected, so a
    zero width — not just the exit status — is what says "no signal".
    """
    try:
        r = subprocess.run(["v4l2-ctl", "-d", VIDEO_DEV, "--query-dv-timings"],
                          capture_output=True, timeout=5)
    except Exception:
        return None
    out = (r.stdout + r.stderr).decode(errors="replace")
    if r.returncode != 0 or "no-link" in out.lower():
        return None
    width = re.search(r"Active width:\s*(\d+)", out)
    height = re.search(r"Active height:\s*(\d+)", out)
    if not (width and height):
        return None
    w, h = int(width.group(1)), int(height.group(1))
    return (w, h) if w and h else None


def _query_fmt() -> tuple[str, int, int]:
    """Current device pixel format + size, as (ffmpeg_pix_fmt, w, h)."""
    try:
        r = subprocess.run(["v4l2-ctl", "-d", VIDEO_DEV, "--get-fmt-video"],
                          capture_output=True, timeout=5)
        out = r.stdout.decode(errors="replace")
        w = h = None
        v4l2_fmt = None
        for line in out.splitlines():
            if "Width/Height" in line:
                parts = line.split(":")[1].strip().split("/")
                w, h = int(parts[0]), int(parts[1])
            elif "Pixel Format" in line:
                m = re.search(r"'(\w+)'", line)
                if m:
                    v4l2_fmt = m.group(1)
        ffmpeg_fmt = _V4L2_TO_FFMPEG_FMT.get(v4l2_fmt or "", "uyvy422")
        logger.info("[csi] device fmt=%s → ffmpeg %s, %sx%s", v4l2_fmt, ffmpeg_fmt, w, h)
        return ffmpeg_fmt, (w or CAPTURE_W), (h or CAPTURE_H)
    except Exception as e:
        logger.warning("[csi] fmt query failed (%s); defaulting to uyvy422", e)
        return "uyvy422", CAPTURE_W, CAPTURE_H


class CsiBackend(CaptureBackend):
    def __init__(self) -> None:
        self._initialized = False
        self._edid_set = False

    def _load_driver(self) -> bool:
        """modprobe the adapter and wait for its video node to appear."""
        subprocess.run(["modprobe", "tc358743"], capture_output=True)

        for _ in range(10):
            if os.path.exists(VIDEO_DEV):
                return True
            time.sleep(0.5)
        logger.warning("[csi] device %s not found after modprobe", VIDEO_DEV)
        return False

    def ensure_link(self) -> bool:
        """Advertise EDID so the source starts sending. See advertise_edid()."""
        return self.advertise_edid()

    def advertise_edid(self) -> bool:
        """
        Tell the HDMI source what we accept, so that it enables its output.

        A source reads EDID back from the cable before it sends anything: with
        no EDID it decides nothing is plugged in and stays dark. So this cannot
        wait for the first frame request — by then the operator has already
        plugged the cable in and seen nothing happen.

        Idempotent. Only redone after a signal loss, because re-writing EDID
        emits a source-change event that costs the next frame.
        """
        if self._edid_set:
            return True
        if not self._load_driver():
            return False

        subdev = _find_subdev()
        if not subdev:
            logger.warning("[csi] TC358743 subdevice not found")
            return False

        # Capped at 1080p30 so the source doesn't pick 1080p60, which needs more
        # CSI lanes than the Pi Zero 2 W's two.
        edid_file = EDID_1080P30 if os.path.exists(EDID_1080P30) else None
        cmd = (["v4l2-ctl", "-d", subdev, f"--set-edid=pad=0,file={edid_file}"]
               if edid_file else
               ["v4l2-ctl", "-d", subdev, "--set-edid=type=hdmi"])
        r = subprocess.run(cmd, capture_output=True, timeout=5)
        if r.returncode != 0:
            logger.warning("[csi] could not set EDID on %s", subdev)
            return False

        if edid_file is None:
            logger.warning("[csi] %s is missing, so the generic EDID was used "
                           "— it does not cap the source at 1080p30",
                           EDID_1080P30)
        self._edid_set = True
        logger.info("[csi] EDID advertised on %s (%s)", subdev,
                    edid_file or "generic hdmi")
        return True

    def link_state(self) -> dict:
        """Whether EDID is out there and whether a signal came back."""
        state = {
            "negotiated": self._edid_set,
            "edid": (EDID_1080P30 if os.path.exists(EDID_1080P30)
                     else "generic hdmi"),
            "signal": False,
            "detail": "",
        }
        if not os.path.exists(VIDEO_DEV):
            state["detail"] = (f"{VIDEO_DEV} is not present — check the CSI "
                               f"ribbon cable and the boot overlay")
            return state

        timings = _query_dv_timings()
        if timings:
            state["signal"] = True
            state["detail"] = f"{timings[0]}x{timings[1]} from the source"
        elif not self._edid_set:
            state["detail"] = ("no EDID advertised yet, so the source has not "
                               "been told to send anything")
        else:
            state["detail"] = ("EDID is advertised but no signal is arriving — "
                               "check the HDMI cable and that the source is awake")
        return state

    def prepare(self) -> bool:
        """
        Ensure the adapter is negotiated. EDID + DV timings are latched once and
        remembered; we only redo setup after an actual signal loss.
        """
        if not self._load_driver():
            return False

        # Fast path: signal already negotiated — don't touch timings (would emit
        # a source-change event that corrupts the next frame).
        if self._initialized:
            if _query_dv_timings():
                _drain_source_change_events(VIDEO_DEV)
                return True
            logger.info("[csi] signal lost — re-initialising adapter")
            self._initialized = False
            # The source has gone; make it introduce itself again.
            self._edid_set = False

        # Usually already done at service start, in which case the source has
        # long since negotiated and there is nothing to wait for.
        was_advertised = self._edid_set
        self.advertise_edid()
        if not was_advertised:
            # Let the source re-negotiate with the new EDID before we latch.
            time.sleep(3)

        r = subprocess.run(["v4l2-ctl", "-d", VIDEO_DEV, "--set-dv-bt-timings", "query"],
                          capture_output=True, timeout=5)
        if r.returncode != 0:
            logger.debug("[csi] no DV signal yet on %s — will retry", VIDEO_DEV)
            return False

        time.sleep(2)
        _drain_source_change_events(VIDEO_DEV, timeout=3.0)
        self._initialized = True
        logger.info("[csi] adapter initialised: %s", VIDEO_DEV)
        return True

    def open(self) -> tuple[object, list[subprocess.Popen], int, int]:
        pix_fmt, w, h = _query_fmt()
        out_w, out_h = (STREAM_W, STREAM_H) if (STREAM_W and STREAM_H) else (w, h)
        v4l2_cmd = [
            "v4l2-ctl", "-d", VIDEO_DEV,
            "--stream-mmap=4",   # 4 DMA buffers — enough depth, ~25MB lighter than 8
            # Starting the stream is itself what emits the source-change event,
            # so no amount of draining beforehand saves the first buffer: its DMA
            # is aborted part-way and it arrives half-written. Throw the first two
            # away inside v4l2-ctl, before they can reach the encoder.
            "--stream-skip=2",
            "--stream-to=-",
        ]
        ffmpeg_cmd = [
            "ffmpeg", "-hide_banner", "-loglevel", "error",
            "-f", "rawvideo",
            "-pixel_format", pix_fmt,
            "-video_size", f"{w}x{h}",
            "-framerate", str(STREAM_FPS),
            "-i", "pipe:0",
        ] + encode_outputs(STREAM_W, STREAM_H, STREAM_FPS)

        v4l2_proc = subprocess.Popen(v4l2_cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
        ffmpeg_proc = subprocess.Popen(ffmpeg_cmd, stdin=v4l2_proc.stdout,
                                       stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
        # Let ffmpeg own the read end; SIGPIPE stops v4l2-ctl when ffmpeg exits.
        v4l2_proc.stdout.close()
        return ffmpeg_proc.stdout, [ffmpeg_proc, v4l2_proc], out_w, out_h
