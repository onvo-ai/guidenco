from flask import request

from utils import scale
from .helpers import ok
from tools.send_keyboard_events_usb import send_keyboard_events as send_usb


def register_routes(app):
    @app.route("/keyboard/key")
    def test_key():
        k = request.args.get("k", "").strip()
        if not k:
            from .helpers import err
            return err("Missing ?k= parameter")
        results = send_usb([{"type": "key", "key": k}])
        return ok(results=results, key=k)

    @app.route("/keyboard/type")
    def test_type():
        text = request.args.get("text", "")
        if not text:
            from .helpers import err
            return err("Missing ?text= parameter")
        results = send_usb([{"type": "type", "text": text}])
        return ok(results=results, typed=text)

    @app.route("/mouse/move")
    def test_mouse_move():
        x = scale(request.args.get("x", 500))
        y = scale(request.args.get("y", 500))
        results = send_usb([{"type": "mouse_move", "x": x, "y": y}])
        return ok(results=results, coord={"x": x, "y": y})

    @app.route("/mouse/click")
    def test_mouse_click():
        b = request.args.get("b", "left").lower()
        btn_map = {"left": 1, "middle": 2, "right": 3}
        button = btn_map.get(b, 1)
        x = request.args.get("x")
        y = request.args.get("y")
        actions = []
        if x and y:
            sx = scale(int(x))
            sy = scale(int(y))
            actions.append({"type": "mouse_move", "x": sx, "y": sy})
        atype = "right_click" if button == 3 else "double_click" if b == "double" else "left_click"
        action = {"type": atype}
        if x and y:
            action["x"] = sx
            action["y"] = sy
        actions.append(action)
        results = send_usb(actions)
        return ok(results=results, button=b)

    @app.route("/mouse/drag")
    def test_mouse_drag():
        x1 = scale(request.args.get("x1", 500))
        y1 = scale(request.args.get("y1", 500))
        x2 = scale(request.args.get("x2", 500))
        y2 = scale(request.args.get("y2", 500))
        results = send_usb([{"type": "drag", "x1": x1, "y1": y1, "x2": x2, "y2": y2}])
        return ok(results=results, from_coord={"x": x1, "y": y1}, to_coord={"x": x2, "y": y2})