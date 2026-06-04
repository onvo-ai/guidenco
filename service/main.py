#!/usr/bin/env python3
"""
main.py — Guidenco Pi service entry point.

Starts the capture card reader and the cloud relay WebSocket client.
All agent / LLM logic runs in the web server — the Pi is pure I/O.
"""

import json
import logging
import signal
import sys
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)

logger = logging.getLogger("guidenco")


def _start_snapshot_server(mgr):
    """
    Tiny HTTP server on port 8001.
      GET  /snapshot        — latest JPEG frame
      POST /action          — execute a HID action inside the live service process
                              body: JSON action dict (same schema as ws_client uses)
    """
    class _H(BaseHTTPRequestHandler):
        def log_message(self, *a): pass  # silence access log

        def do_GET(self):
            if self.path != '/snapshot':
                self.send_error(404); return
            frame = mgr.get_latest(timeout=3.0)
            if frame is None:
                self.send_error(503, 'No frame yet'); return
            self.send_response(200)
            self.send_header('Content-Type', 'image/jpeg')
            self.send_header('Content-Length', str(len(frame)))
            self.end_headers()
            self.wfile.write(frame)

        def do_POST(self):
            if self.path != '/action':
                self.send_error(404); return
            length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(length)
            try:
                action = json.loads(body)
            except Exception:
                self.send_error(400, 'Bad JSON'); return
            from actions import execute as _exec
            result = _exec(action)
            resp = json.dumps({'result': result}).encode()
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(resp)))
            self.end_headers()
            self.wfile.write(resp)
    srv = HTTPServer(('0.0.0.0', 8001), _H)
    t = threading.Thread(target=srv.serve_forever, daemon=True, name='snapshot-srv')
    t.start()
    logger.info("[main] snapshot server listening on :8001/snapshot")


def main():
    from capture import get_manager
    from ws_client import start_in_thread
    from actions import cleanup

    # Start capture card reader
    mgr = get_manager()
    mgr.start()
    logger.info("[main] capture manager started")

    # Local snapshot HTTP server (port 8001) — for debugging and self-tests
    _start_snapshot_server(mgr)

    # Connect to cloud relay
    start_in_thread()
    logger.info("[main] relay started — waiting for commands")

    def _shutdown(sig, frame):
        logger.info("[main] shutting down")
        mgr.stop()
        cleanup()
        sys.exit(0)

    signal.signal(signal.SIGTERM, _shutdown)
    signal.signal(signal.SIGINT,  _shutdown)

    # Block main thread
    signal.pause()


if __name__ == "__main__":
    main()
