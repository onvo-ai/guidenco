import os

from flask import send_file, send_from_directory

from .helpers import ok, TEMP_DIR
from tools.capture_card_manager import get_manager

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STATIC_DIR = os.path.join(ROOT, "frontend", "dist")


def register_routes(app):
    @app.route("/")
    def index_page():
        return send_from_directory(STATIC_DIR, "index.html")

    @app.route("/<path:path>")
    def static_files(path):
        file_path = os.path.join(STATIC_DIR, path)
        if os.path.exists(file_path) and os.path.isfile(file_path):
            return send_from_directory(STATIC_DIR, path)
        return send_from_directory(STATIC_DIR, "index.html")

    @app.route("/status")
    def status():
        import os as _os
        mgr = get_manager()
        capture_status = {
            "device": "/dev/video0",
            "running": mgr._running,
            "has_frame": mgr._latest is not None,
            "note": "persistent ffmpeg; frame always ready",
        }
        hid = {
            "kb_mouse": {
                "device": "/dev/hidg0",
                "available": _os.path.exists("/dev/hidg0"),
                "note": "single device, Report ID 1=keyboard ID 2=mouse",
            }
        }
        return ok(hid=hid, capture=capture_status, temp_dir=TEMP_DIR)

    @app.route("/api/temp/<path:name>")
    def temp_file(name):
        name = os.path.basename(name or "")
        if not name:
            return {"status": "error", "message": "Not found"}, 404
        path = os.path.join(TEMP_DIR, name)
        if not os.path.isfile(path):
            return {"status": "error", "message": "Not found"}, 404
        return send_file(path)