#!/usr/bin/env python3
import argparse
import os
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, ROOT)

from server.app import app
from tools.send_keyboard_events_usb import cleanup as usb_cleanup
from tools.capture_card_manager import get_manager as _get_capture_manager


def main():
    parser = argparse.ArgumentParser(description="Guidenco REST server")
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=5000)
    parser.add_argument("--debug", action="store_true")
    args = parser.parse_args()

    print(f"Guidenco REST server starting on http://{args.host}:{args.port}")

    try:
        import gunicorn.app.base

        def _post_fork(server, worker):
            mgr = _get_capture_manager()
            mgr._running = False
            mgr.start()
            print(f"[worker] Capture manager started in worker {worker.pid}", flush=True)

        class _App(gunicorn.app.base.BaseApplication):
            def __init__(self, application, options=None):
                self.options = options or {}
                self.application = application
                super().__init__()
            def load_config(self):
                for k, v in self.options.items():
                    self.cfg.set(k.lower(), v)
            def load(self):
                return self.application

        options = {
            "bind": f"{args.host}:{args.port}",
            "workers": 1,
            "worker_class": "gthread",
            "threads": 4,
            "timeout": 300,
            "keepalive": 5,
            "loglevel": "info",
            "post_fork": _post_fork,
        }
        _App(app, options).run()
    finally:
        mgr = _get_capture_manager()
        try:
            mgr.stop()
        except Exception:
            pass
        usb_cleanup()


if __name__ == "__main__":
    main()