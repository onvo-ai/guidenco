from flask import Response, request, stream_with_context

from .helpers import err, ok
from .streaming import run_agent_stream, request_agent_cancel


def register_routes(app, agent_run):
    @app.route("/agent/action")
    def action():
        q = request.args.get("q", "").strip()
        if not q:
            return err("Missing ?q= parameter")
        instructions = request.args.get("instructions", "")
        return Response(
            stream_with_context(run_agent_stream(q, agent_run, instructions=instructions)),
            mimetype="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )

    @app.route("/agent/stop", methods=["POST", "GET"])
    def action_stop():
        return ok(cancelled=bool(request_agent_cancel()))

