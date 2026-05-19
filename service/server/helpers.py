import json
import os

from flask import jsonify

from config import TEMP_DIR

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

