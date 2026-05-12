from flask import Response, request, stream_with_context

from .helpers import err, ok, stream_headers
from .streaming import (
    run_agent_stream,
    request_agent_cancel,
    subscribe_global_stream,
    enqueue,
    get_queue_state,
)


def register_routes(app, agent_run):

    @app.route("/agent/action")
    def action():
        """Backward-compatible SSE endpoint. Enqueues the goal and streams
        global agent events until this specific job completes."""
        q = request.args.get("q", "").strip()
        if not q:
            return err("Missing ?q= parameter")
        instructions = request.args.get("instructions", "")
        return Response(
            stream_with_context(run_agent_stream(q, agent_run, instructions=instructions)),
            mimetype="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )

    @app.route("/agent/stream")
    def agent_stream():
        """Always-on global SSE stream. Sends all agent events to every connected client,
        regardless of who triggered the agent. The frontend subscribes to this on mount."""
        return Response(
            stream_with_context(subscribe_global_stream()),
            mimetype="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )

    @app.route("/agent/queue", methods=["POST"])
    def agent_queue_post():
        """Enqueue a new agent job. Returns the job_id immediately."""
        q = (request.form.get("q") or request.args.get("q", "")).strip()
        if not q:
            try:
                body = request.get_json(silent=True) or {}
                q = body.get("q", "").strip()
            except Exception:
                pass
        if not q:
            return err("Missing q parameter")
        instructions = (
            request.form.get("instructions")
            or request.args.get("instructions", "")
            or (request.get_json(silent=True) or {}).get("instructions", "")
        )
        job_id = enqueue(q, instructions)
        return ok(job_id=job_id)

    @app.route("/agent/queue", methods=["GET"])
    def agent_queue_get():
        """Return current queue state."""
        return ok(**get_queue_state())

    @app.route("/agent/stop", methods=["POST", "GET"])
    def action_stop():
        return ok(cancelled=bool(request_agent_cancel()))
