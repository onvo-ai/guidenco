import json
import os

from flask import jsonify

TEMP_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "temp")
os.makedirs(TEMP_DIR, exist_ok=True)

def ok(data=None, **kw):
    body = {"status": "ok"}
    if data is not None:
        body["data"] = data
    body.update(kw)
    return jsonify(body)

def err(msg, code=400):
    return jsonify({"status": "error", "message": msg}), code

def sse_event(data):
    return f"data: {json.dumps(data)}\n\n"

def stream_headers():
    return {
        "Cache-Control": "no-cache",
        "Pragma": "no-cache",
        "X-Accel-Buffering": "no",
    }

MULTIPART_BOUNDARY = "frame"

def multipart_chunk(frame, mimetype):
    return (
        f"--{MULTIPART_BOUNDARY}\r\n"
        f"Content-Type: {mimetype}\r\n"
        f"Content-Length: {len(frame)}\r\n\r\n"
    ).encode("ascii") + frame + b"\r\n"

def parse_fps(value, default, minimum=1, maximum=30):
    try:
        fps = int(value)
    except (TypeError, ValueError):
        return default
    return max(minimum, min(maximum, fps))

