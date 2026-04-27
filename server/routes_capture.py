from flask import Response, request, stream_with_context

from .helpers import err, ok, parse_fps, stream_headers
from .streaming import iter_capture_stream_safe, MULTIPART_BOUNDARY
from tools.capture_card_manager import get_manager


def register_routes(app):
    @app.route("/display/screenshot")
    def screenshot():
        mgr = get_manager()
        if not mgr._running:
            mgr.start()
        frame = mgr.get_frame(timeout=10)
        if not frame:
            return err("No frame from capture card", 500)
        resp = Response(frame, mimetype="image/jpeg")
        resp.headers["Cache-Control"] = "no-store"
        return resp

    @app.route("/display/stream")
    def stream():
        fps = parse_fps(request.args.get("fps"), 15)
        return Response(
            stream_with_context(iter_capture_stream_safe(fps)),
            mimetype=f"multipart/x-mixed-replace; boundary={MULTIPART_BOUNDARY}",
            headers=stream_headers(),
        )