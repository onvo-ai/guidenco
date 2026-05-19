from utils import scale

CLICK_TYPES = {"left_click", "right_click", "double_click"}
VIZ_PREFIX = "__GUIDENCO_VIZ__"


def _int(v, default=500):
    if isinstance(v, list):
        v = v[0] if v else default
    try:
        return int(v)
    except (TypeError, ValueError):
        return default


def _unpack_xy(args, default=500):
    """VLM sometimes returns {'x': [xval, yval]} instead of {'x': xval, 'y': yval}.
    Normalize to separate x, y values."""
    xv = args.get("x", default)
    yv = args.get("y")
    if isinstance(xv, list) and len(xv) >= 2 and yv is None:
        return _int(xv[0], default), _int(xv[1], default)
    return _int(xv, default), _int(yv, default) if yv is not None else default


def _unpack_drag(args):
    """Handle VLM drag argument variants:
    - Standard:          {x1, y1, x2, y2}
    - All-in-one:        {x1: [x1,y1,x2,y2]}
    - Per-point packed:  {x1: [x1,y1], x2: [x2,y2]}
    - Row-packed:        {x1: [x1,y1], y1: [x2,y2]}
    """
    x1v = args.get("x1")
    y1v = args.get("y1")
    x2v = args.get("x2")
    y2v = args.get("y2")

    if isinstance(x1v, list) and len(x1v) >= 4:
        return _int(x1v[0]), _int(x1v[1]), _int(x1v[2]), _int(x1v[3])
    if isinstance(x1v, list) and len(x1v) >= 2 and isinstance(x2v, list) and len(x2v) >= 2:
        return _int(x1v[0]), _int(x1v[1]), _int(x2v[0]), _int(x2v[1])
    if isinstance(x1v, list) and len(x1v) >= 2 and isinstance(y1v, list) and len(y1v) >= 2:
        return _int(x1v[0]), _int(x1v[1]), _int(y1v[0]), _int(y1v[1])
    if isinstance(x1v, list) and len(x1v) >= 2:
        return _int(x1v[0]), _int(x1v[1]), _int(x2v, 500), _int(y2v, 500)
    return _int(x1v, 500), _int(y1v, 500), _int(x2v, 500), _int(y2v, 500)


def _unpack_amount(args, default=-3):
    """VLM sometimes packs amount into the x array or returns it as a list.
    Also handles the case where amount is in a list."""
    av = args.get("amount")
    xv = args.get("x")
    if isinstance(xv, list) and len(xv) >= 3 and av is None:
        return _int(xv[2], default)
    if isinstance(av, list):
        return _int(av[0], default) if av else default
    if av is not None:
        return _int(av, default)
    return default


def action_to_usb_actions(action):
    """Convert a raw VLM action (coord-space 1-1000) into USB HID actions.
    Coordinates are passed through in coord-space; the USB layer converts
    them directly to HID absolute values (0-32767) without any pixel step."""
    t = action.get("type")

    if t in ("left_click", "right_click", "double_click"):
        x = scale(_int(action.get("x"), 500))
        y = scale(_int(action.get("y"), 500))
        atype = "right_click" if t == "right_click" else "double_click" if t == "double_click" else "left_click"
        return [
            {"type": "mouse_move", "x": x, "y": y},
            {"type": atype, "x": x, "y": y},
        ]

    if t == "hover":
        x = scale(_int(action.get("x"), 500))
        y = scale(_int(action.get("y"), 500))
        return [{"type": "mouse_move", "x": x, "y": y}]

    if t == "drag":
        x1 = scale(_int(action.get("x1"), 500))
        y1 = scale(_int(action.get("y1"), 500))
        x2 = scale(_int(action.get("x2"), 500))
        y2 = scale(_int(action.get("y2"), 500))
        return [{"type": "drag", "x1": x1, "y1": y1, "x2": x2, "y2": y2}]

    if t == "scroll":
        x = scale(_int(action.get("x"), 500))
        y = scale(_int(action.get("y"), 500))
        amount = _int(action.get("amount"), 3)
        return [{"type": "scroll", "x": x, "y": y, "amount": amount}]

    if t == "key":
        return [{"type": "key", "key": action.get("key", "")}]

    if t in ("type", "type_text"):
        return [{"type": "type", "text": action.get("text", "")}]

    return None


def tool_to_action(name, args):
    if name in ("left_click", "right_click", "double_click", "hover"):
        x, y = _unpack_xy(args)
        return {"type": "hover" if name == "hover" else name, "x": x, "y": y}
    if name == "drag":
        x1, y1, x2, y2 = _unpack_drag(args)
        return {"type": "drag", "x1": x1, "y1": y1, "x2": x2, "y2": y2}
    if name == "key":
        return {"type": "key", "key": args.get("key", "")}
    if name == "type_text":
        return {"type": "type", "text": args.get("text", "")}
    if name == "scroll":
        x, y = _unpack_xy(args)
        # LLM convention: negative = scroll down, positive = scroll up.
        # Driver convention: positive = PageDown (down), negative = PageUp (up).
        # Negate here to reconcile the two.
        amount = -_unpack_amount(args)
        return {"type": "scroll", "x": x, "y": y, "amount": amount}
    if name == "wait":
        try:
            seconds = float(args.get("seconds", 1))
        except (TypeError, ValueError):
            seconds = 1.0
        return {"type": "wait", "seconds": max(0.0, min(30.0, seconds))}
    return None


def _fix_coords(a):
    fixed = dict(a)
    fixed["x"] = scale(_int(fixed.get("x"), 500))
    fixed["y"] = scale(_int(fixed.get("y"), 500))
    if fixed["x"] == 0 or fixed["y"] == 0:
        return None
    atype = fixed.get("type")
    if atype == "hover":
        fixed["type"] = "mouse_move"
    elif atype == "right_click":
        fixed["button"] = 3
    elif atype == "double_click":
        fixed["button"] = 1
    return fixed


def normalize_actions(actions):
    fixed = []
    for a in actions:
        a = dict(a)
        atype = a.get("type")
        if atype == "drag":
            a["x1"] = scale(_int(a.get("x1"), 500))
            a["y1"] = scale(_int(a.get("y1"), 500))
            a["x2"] = scale(_int(a.get("x2"), 500))
            a["y2"] = scale(_int(a.get("y2"), 500))
            if a["x1"] == 0 or a["y1"] == 0 or a["x2"] == 0 or a["y2"] == 0:
                print(f"[agent] Dropping drag with zero coord: {a}")
                continue
            fixed.append(a)
        elif atype in ("hover", "scroll") or atype in CLICK_TYPES:
            result = _fix_coords(a)
            if result:
                fixed.append(result)
            else:
                print(f"[agent] Dropping {atype} with zero coord: {a}")
        else:
            fixed.append(a)
    return fixed


def describe_action(a):
    t = a.get("type")
    if t == "left_click":    return f"lclick({a.get('x')},{a.get('y')})"
    if t == "right_click":   return f"rclick({a.get('x')},{a.get('y')})"
    if t == "double_click":  return f"dblclick({a.get('x')},{a.get('y')})"
    if t == "hover":        return f"hover({a.get('x')},{a.get('y')})"
    if t == "mouse_move":   return f"move({a.get('x')},{a.get('y')})"
    if t == "drag":          return f"drag({a.get('x1')},{a.get('y1')}->{a.get('x2')},{a.get('y2')})"
    if t == "key":           return a.get("key", "?")
    if t == "type":          return f'type("{a.get("text","")}")'
    if t == "scroll":        return f"scroll({a.get('amount', 0)})"
    if t == "wait":          return f"wait({a.get('seconds', 2)}s)"
    import json
    return json.dumps(a)


def action_signature(actions):
    parts = []
    for a in actions:
        t = a.get("type", "")
        if t in CLICK_TYPES:          parts.append(f"click({a.get('x',0)},{a.get('y',0)})")
        elif t == "hover":            parts.append(f"hover({a.get('x',0)},{a.get('y',0)})")
        elif t == "mouse_move":       parts.append(f"move({a.get('x',0)},{a.get('y',0)})")
        elif t == "drag":             parts.append(f"drag({a.get('x1',0)},{a.get('y1',0)}->{a.get('x2',0)},{a.get('y2',0)})")
        elif t == "type":             parts.append(f"type({a.get('text','')})")
        elif t == "key":              parts.append(f"key({a.get('key','')})")
        elif t == "scroll":           parts.append(f"scroll({a.get('amount',0)})")
        elif t == "wait":             parts.append(f"wait({a.get('seconds',2)})")
    return "|".join(parts)