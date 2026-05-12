import collections
import io
import json
import os
import queue
import sys
import threading
import uuid

from .helpers import TEMP_DIR, sse_event, multipart_chunk

VIZ_PREFIX = "__GUIDENCO_VIZ__"

# ── Thread-local stdout proxy ─────────────────────────────────────────────────

class _FanoutStdout:
    """Routes prints from the agent worker thread to that thread's assigned writer.
    All other threads keep their original stdout."""

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


# ── Global broadcast ──────────────────────────────────────────────────────────

_subs: list = []
_subs_lock = threading.Lock()


def _broadcast(raw_sse: str):
    with _subs_lock:
        for q in list(_subs):
            try:
                q.put_nowait(raw_sse)
            except queue.Full:
                pass


def _subscribe_global() -> queue.Queue:
    q = queue.Queue(maxsize=1000)
    with _subs_lock:
        _subs.append(q)
    return q


def _unsubscribe_global(q: queue.Queue):
    with _subs_lock:
        try:
            _subs.remove(q)
        except ValueError:
            pass


class _BroadcastWriter(io.TextIOBase):
    """Routes agent worker stdout lines to the global broadcast channel."""

    def write(self, s):
        if s and s.strip():
            _broadcast_message(s.rstrip())
        return len(s)

    def flush(self):
        pass


def _make_thumb(path, payload):
    try:
        from PIL import Image
        import io as _io
        with Image.open(path) as img:
            img = img.convert("RGB")
            w = max(1, img.width // 4)
            h = max(1, img.height // 4)
            thumb = img.resize((w, h), Image.LANCZOS)
            buf = _io.BytesIO()
            thumb.save(buf, "JPEG", quality=60)
            thumb_name = f"thumb_{os.path.basename(path)}"
            thumb_path = os.path.join(TEMP_DIR, thumb_name)
            with open(thumb_path, "wb") as tf:
                tf.write(buf.getvalue())
            payload["url"] = f"/api/temp/{thumb_name}"
    except Exception as exc:
        print(f"[streaming] thumbnail failed: {exc}")


def _broadcast_message(msg: str):
    """Parse one stdout line and broadcast the appropriate SSE event."""
    if msg.startswith(VIZ_PREFIX):
        try:
            payload = json.loads(msg[len(VIZ_PREFIX):])
            path = payload.get("path")
            if isinstance(path, str) and path.startswith(TEMP_DIR + os.sep):
                payload["url"] = f"/api/temp/{os.path.basename(path)}"
                if payload.get("kind") == "prompt_image":
                    _make_thumb(path, payload)
            raw = sse_event({"type": "viz", "payload": payload})
        except Exception as exc:
            raw = sse_event({"type": "log", "message": f"[viz parse failed] {exc}"})
    else:
        raw = sse_event({"type": "log", "message": msg})
    _broadcast(raw)
    _broadcast(": keep-alive\n\n")


# ── Job queue ─────────────────────────────────────────────────────────────────

_pending_jobs: collections.deque = collections.deque()
_pending_lock = threading.Lock()
_job_ready = threading.Event()
_current_job: dict | None = None
_current_lock = threading.Lock()
_active_cancel_event = None
_active_lock = threading.Lock()
_agent_run_fn = None
_processor_started = False
_processor_lock = threading.Lock()


def enqueue(goal: str, instructions: str = "") -> str:
    job_id = str(uuid.uuid4())[:8]
    with _pending_lock:
        _pending_jobs.append({"id": job_id, "goal": goal, "instructions": instructions})
    _job_ready.set()
    _broadcast_queue_state()
    return job_id


def get_queue_state() -> dict:
    with _current_lock:
        current = _current_job.copy() if _current_job else None
    with _pending_lock:
        pending = [j.copy() for j in _pending_jobs]
    return {"current": current, "pending": pending}


def _broadcast_queue_state():
    _broadcast(sse_event({"type": "viz", "payload": {"kind": "queue_state", **get_queue_state()}}))


def request_agent_cancel():
    with _active_lock:
        ev = _active_cancel_event
    if ev is not None:
        ev.set()
        return True
    return False


def _processor():
    global _current_job, _active_cancel_event
    proxy = _install_stdout_proxy()
    while True:
        _job_ready.wait()
        while True:
            with _pending_lock:
                if not _pending_jobs:
                    _job_ready.clear()
                    break
                job = _pending_jobs.popleft()

            with _current_lock:
                _current_job = job

            cancel_event = threading.Event()
            with _active_lock:
                _active_cancel_event = cancel_event

            _broadcast(sse_event({"type": "start", "goal": job["goal"], "job_id": job["id"]}))
            _broadcast_queue_state()

            error_box = []
            proxy.bind(_BroadcastWriter())
            try:
                _agent_run_fn(job["goal"], cancel_event=cancel_event, instructions=job["instructions"])
            except TypeError:
                try:
                    _agent_run_fn(job["goal"])
                except Exception as e:
                    error_box.append(str(e))
            except Exception as e:
                error_box.append(str(e))
            finally:
                proxy.unbind()

            if error_box:
                _broadcast(sse_event({"type": "error", "message": error_box[0], "job_id": job["id"]}))
            else:
                _broadcast(sse_event({"type": "done", "job_id": job["id"]}))

            with _current_lock:
                _current_job = None
            with _active_lock:
                if _active_cancel_event is cancel_event:
                    _active_cancel_event = None

            _broadcast_queue_state()


def start_processor(agent_run):
    global _agent_run_fn, _processor_started
    with _processor_lock:
        if _processor_started:
            return
        _agent_run_fn = agent_run
        _processor_started = True
    t = threading.Thread(target=_processor, daemon=True, name="guidenco-queue-processor")
    t.start()


def start_processor_in_worker(agent_run):
    """Called in the post_fork hook so the processor runs in the worker process.
    Threads do not survive fork, so we must (re)start here unconditionally."""
    global _agent_run_fn, _processor_started
    _agent_run_fn = agent_run
    _processor_started = True
    t = threading.Thread(target=_processor, daemon=True, name="guidenco-queue-processor")
    t.start()


# ── SSE streaming generators ──────────────────────────────────────────────────

def subscribe_global_stream():
    """Generator for /api/agent/stream — streams all events indefinitely.
    Sends current queue state on connect so the frontend always gets fresh state."""
    q = _subscribe_global()
    try:
        yield sse_event({"type": "viz", "payload": {"kind": "queue_state", **get_queue_state()}})
        while True:
            try:
                raw = q.get(timeout=30)
                yield raw
            except queue.Empty:
                yield ": keep-alive\n\n"
    except GeneratorExit:
        pass
    finally:
        _unsubscribe_global(q)


def run_agent_stream(goal, agent_run, instructions=""):
    """Backward-compatible generator for /api/agent/action.
    Enqueues the job and streams global events until that specific job is done."""
    job_id = enqueue(goal, instructions)

    q = _subscribe_global()
    try:
        yield sse_event({"type": "queued", "job_id": job_id, "goal": goal})
        yield sse_event({"type": "viz", "payload": {"kind": "queue_state", **get_queue_state()}})
        while True:
            try:
                raw = q.get(timeout=600)
            except queue.Empty:
                yield sse_event({"type": "error", "message": "Timed out waiting for job", "job_id": job_id})
                break
            yield raw
            # Close this stream when our specific job finishes
            try:
                if raw.startswith("data: "):
                    data = json.loads(raw[6:].strip())
                    if data.get("job_id") == job_id and data.get("type") in ("done", "error"):
                        break
            except Exception:
                pass
    except GeneratorExit:
        pass
    finally:
        _unsubscribe_global(q)


# ── Capture card streaming ────────────────────────────────────────────────────

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
