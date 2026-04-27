import io
import json
import os
import queue
import sys
import threading

from flask import Response, stream_with_context

from .helpers import TEMP_DIR, sse_event, stream_headers, multipart_chunk, MULTIPART_BOUNDARY

VIZ_PREFIX = "__GUIDENCO_VIZ__"


class QueueWriter(io.TextIOBase):
    def __init__(self, q):
        self._q = q
    def write(self, s):
        if s and s.strip():
            self._q.put(s.rstrip())
        return len(s)
    def flush(self):
        pass


class _FanoutStdout:
    """Thread-local stdout that routes prints from the agent worker to its
    own queue, and leaves other threads' stdout untouched. Safe under the
    gthread worker model where multiple requests share a process."""

    def __init__(self, original):
        self._original = original
        self._local = threading.local()

    def bind(self, writer):
        self._local.writer = writer

    def unbind(self):
        if hasattr(self._local, "writer"):
            del self._local.writer

    def write(self, s):
        w = getattr(self._local, "writer", None)
        return (w or self._original).write(s)

    def flush(self):
        w = getattr(self._local, "writer", None)
        (w or self._original).flush()


_stdout_proxy = None
_proxy_lock = threading.Lock()


def _install_stdout_proxy():
    global _stdout_proxy
    with _proxy_lock:
        if _stdout_proxy is None:
            _stdout_proxy = _FanoutStdout(sys.stdout)
            sys.stdout = _stdout_proxy
    return _stdout_proxy


# At most one agent may run at a time — it drives singleton HID state.
_agent_run_lock = threading.Lock()
_active_cancel_event = None
_active_lock = threading.Lock()


def request_agent_cancel():
    """Signal any currently-running agent stream to stop after its current step."""
    with _active_lock:
        ev = _active_cancel_event
    if ev is not None:
        ev.set()
        return True
    return False


def run_agent_stream(goal, agent_run, instructions=""):
    global _active_cancel_event
    proxy = _install_stdout_proxy()
    q = queue.Queue()
    error_box = []
    cancel_event = threading.Event()

    if not _agent_run_lock.acquire(blocking=False):
        request_agent_cancel()
        if not _agent_run_lock.acquire(blocking=True, timeout=10):
            yield sse_event({"type": "error", "message": "Previous agent did not stop in time."})
            return

    with _active_lock:
        _active_cancel_event = cancel_event

    def _worker():
        proxy.bind(QueueWriter(q))
        try:
            agent_run(goal, cancel_event=cancel_event, instructions=instructions)
        except TypeError:
            try:
                agent_run(goal)
            except Exception as e:
                error_box.append(str(e))
        except Exception as e:
            error_box.append(str(e))
        finally:
            proxy.unbind()
            q.put(None)

    t = threading.Thread(target=_worker, daemon=True, name="guidenco-run")
    t.start()

    try:
        yield sse_event({"type": "start", "goal": goal})
        while True:
            try:
                msg = q.get(timeout=120)
            except queue.Empty:
                cancel_event.set()
                yield sse_event({"type": "error", "message": "Agent timed out"})
                break
            if msg is None:
                if error_box:
                    yield sse_event({"type": "error", "message": error_box[0]})
                else:
                    yield sse_event({"type": "done"})
                break
            if isinstance(msg, str) and msg.startswith(VIZ_PREFIX):
                try:
                    payload = json.loads(msg[len(VIZ_PREFIX):])
                    path = payload.get("path")
                    if isinstance(path, str) and path.startswith(TEMP_DIR + os.sep):
                        payload["url"] = f"/api/temp/{os.path.basename(path)}"
                        if payload.get("kind") == "prompt_image":
                            try:
                                from PIL import Image
                                with Image.open(path) as img:
                                    img = img.convert("RGB")
                                    w = max(1, img.width // 4)
                                    h = max(1, img.height // 4)
                                    thumb = img.resize((w, h), Image.LANCZOS)
                                    import io as _io
                                    buf = _io.BytesIO()
                                    thumb.save(buf, "JPEG", quality=60)
                                    thumb_name = f"thumb_{os.path.basename(path)}"
                                    thumb_path = os.path.join(TEMP_DIR, thumb_name)
                                    with open(thumb_path, "wb") as tf:
                                        tf.write(buf.getvalue())
                                    payload["url"] = f"/api/temp/{thumb_name}"
                            except Exception as exc:
                                print(f"[streaming] thumbnail failed: {exc}")
                    yield sse_event({"type": "viz", "payload": payload})
                    yield ": keep-alive\n\n"
                    continue
                except Exception as exc:
                    yield sse_event({"type": "log", "message": f"[viz parse failed] {exc}"})
            yield sse_event({"type": "log", "message": msg})
            yield ": keep-alive\n\n"
    except GeneratorExit:
        # Client disconnected — cancel the agent so it doesn't keep driving HID.
        cancel_event.set()
        raise
    finally:
        cancel_event.set()
        t.join(timeout=5)
        with _active_lock:
            if _active_cancel_event is cancel_event:
                _active_cancel_event = None
        _agent_run_lock.release()


_NO_SIGNAL_JPEG = None

def make_no_signal_jpeg():
    global _NO_SIGNAL_JPEG
    if _NO_SIGNAL_JPEG:
        return _NO_SIGNAL_JPEG
    try:
        from PIL import Image, ImageDraw, ImageFont
        from config import NATIVE_W, NATIVE_H
        img = Image.new("RGB", (NATIVE_W, NATIVE_H), color=(10, 10, 10))
        draw = ImageDraw.Draw(img)
        try:
            font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 120)
            small = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 48)
        except Exception:
            font = small = ImageFont.load_default()
        text = "NO SIGNAL"
        bbox = draw.textbbox((0, 0), text, font=font)
        tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
        draw.text(((NATIVE_W - tw) // 2, (NATIVE_H - th) // 2 - 60), text, fill=(200, 200, 200), font=font)
        sub = "Capture card has no HDMI input"
        sb = draw.textbbox((0, 0), sub, font=small)
        sw = sb[2] - sb[0]
        draw.text(((NATIVE_W - sw) // 2, NATIVE_H // 2 + 80), sub, fill=(120, 120, 120), font=small)
        import io as _io
        buf = _io.BytesIO()
        img.save(buf, "JPEG", quality=60)
        _NO_SIGNAL_JPEG = buf.getvalue()
    except Exception:
        _NO_SIGNAL_JPEG = b"\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00\xff\xd9"
    return _NO_SIGNAL_JPEG


def iter_capture_stream_safe(fps):
    from tools.capture_card_manager import get_manager
    mgr = get_manager()
    sub = mgr.subscribe()
    try:
        while True:
            try:
                frame = sub.get(timeout=5)
            except queue.Empty:
                yield multipart_chunk(make_no_signal_jpeg(), "image/jpeg")
                continue
            yield multipart_chunk(frame, "image/jpeg")
            while True:
                try:
                    sub.get_nowait()
                except queue.Empty:
                    break
    finally:
        mgr.unsubscribe(sub)