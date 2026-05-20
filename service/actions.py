"""
actions.py — Execute computer-use actions via USB HID.

Receives action dicts from the cloud relay (sent by the web server's agent loop).
Coordinates are fractional (0.0–1.0); converted to coord-space (0–1000) then
to USB HID absolute range (0–32767).

Action types:
  click / right_click / double_click  — {type, x, y}
  drag                                 — {type, x1, y1, x2, y2}
  scroll                               — {type, x, y, direction, amount}
  type                                 — {type, text}
  key                                  — {type, key}  e.g. "Return", "ctrl+c"
  mouse_move                           — {type, x, y}
  wait                                 — {type, seconds}
  done                                 — {type}  (no-op; signals end of task)
"""

import errno
import logging
import struct
import threading
import time

from config import COORD_SPACE, ABS_MAX
from hid_maps import (
    MOD_NONE, KEYMAP, NAMED_KEYS, MOD_NAMES, KB_RELEASE,
    BTN_LEFT, BTN_RIGHT, BTN_MAP,
)

logger = logging.getLogger("guidenco.actions")

KB_DEVICE = "/dev/hidg0"
MS_DEVICE = "/dev/hidg1"

_lock   = threading.Lock()
_kb_fd  = None
_ms_fd  = None
_cur_x  = 0
_cur_y  = 0
_held_btn = 0
_GADGET_DIR = "/sys/kernel/config/usb_gadget/hid_keyboard"


# ── Coordinate helpers ────────────────────────────────────────────────────────

def _frac_to_coord(v: float) -> int:
    """Convert fractional 0.0–1.0 to coord-space 0–1000."""
    return max(0, min(COORD_SPACE, int(v * COORD_SPACE)))

def _coord_to_abs(coord: int) -> int:
    coord = max(0, min(COORD_SPACE, coord))
    return max(0, min(ABS_MAX, round(coord * ABS_MAX / COORD_SPACE)))


# ── HID device I/O ────────────────────────────────────────────────────────────

def _host_state():
    try:
        import os
        udc_dir = "/sys/class/udc"
        udcs = os.listdir(udc_dir)
        if not udcs:
            return None
        with open(os.path.join(udc_dir, udcs[0], "state")) as f:
            return f.read().strip()
    except Exception:
        return None


def _close_fds():
    global _kb_fd, _ms_fd
    for fd in (_kb_fd, _ms_fd):
        if fd:
            try:
                fd.close()
            except Exception:
                pass
    _kb_fd = None
    _ms_fd = None


def _wakeup_host() -> bool:
    try:
        import os
        udcs = os.listdir("/sys/class/udc")
        if not udcs:
            return False
        udc = udcs[0]
        _close_fds()
        with open(f"{_GADGET_DIR}/UDC", "w") as f:
            f.write("\n")
        time.sleep(0.3)
        with open(f"{_GADGET_DIR}/UDC", "w") as f:
            f.write(udc)
        for _ in range(30):
            time.sleep(0.1)
            if _host_state() == "configured":
                time.sleep(0.8)
                return True
        return False
    except Exception as e:
        logger.error(f"[hid] wakeup failed: {e}")
        return False


def _open_dev(path: str):
    for attempt in range(8):
        try:
            return open(path, "wb", buffering=0)
        except OSError as e:
            if e.errno in (errno.ESHUTDOWN, errno.ENODEV, errno.EPIPE, errno.ENOENT):
                time.sleep(1)
            else:
                raise
    raise RuntimeError(f"Cannot open {path}")


def _open():
    global _kb_fd, _ms_fd
    import os
    for attr, path in (("_kb_fd", KB_DEVICE), ("_ms_fd", MS_DEVICE)):
        fd = globals()[attr]
        if fd:
            try:
                os.fstat(fd.fileno())
                continue
            except OSError:
                globals()[attr] = None
        globals()[attr] = _open_dev(path)


def _w(target: str, data: bytes, _retried=False):
    fd = _kb_fd if target == "kb" else _ms_fd
    try:
        fd.write(data)
        fd.flush()
    except OSError as e:
        if _retried:
            raise
        if not _wakeup_host():
            raise
        _open()
        _w(target, data, _retried=True)


# ── Keyboard helpers ──────────────────────────────────────────────────────────

def _press_key(mod, code, delay=0.05):
    if mod and code:
        _w("kb", bytes([mod, 0, 0, 0, 0, 0, 0, 0]))
        time.sleep(0.02)
    _w("kb", bytes([mod, 0, code, 0, 0, 0, 0, 0]))
    time.sleep(delay)
    _w("kb", KB_RELEASE)
    time.sleep(delay)


def _type_char(ch: str, delay=0.04):
    if ch in KEYMAP:
        mod, code = KEYMAP[ch]
        _press_key(mod, code, delay)
    else:
        logger.warning(f"[hid] unsupported char: {ch!r}")


def _press_combo(combo: str):
    parts = [p.strip().lower() for p in combo.split("+")]
    mod, code = MOD_NONE, None
    for p in parts:
        if p in MOD_NAMES:
            mod |= MOD_NAMES[p]
        elif p in NAMED_KEYS:
            code = code or NAMED_KEYS[p][1]
        elif p in KEYMAP:
            code = code or KEYMAP[p][1]
    if code:
        _press_key(mod, code)
    elif mod:
        _w("kb", bytes([mod, 0, 0, 0, 0, 0, 0, 0]))
        time.sleep(0.05)
        _w("kb", KB_RELEASE)


# ── Mouse helpers ─────────────────────────────────────────────────────────────

def _mouse_abs(btn, ax, ay):
    global _last_ax, _last_ay
    ax = max(0, min(ABS_MAX, int(ax)))
    ay = max(0, min(ABS_MAX, int(ay)))
    _w("ms", struct.pack("<BHH", btn, ax, ay))


def _move_to(x: int, y: int, btn=None):
    global _cur_x, _cur_y
    _cur_x, _cur_y = x, y
    _mouse_abs(btn if btn is not None else _held_btn, _coord_to_abs(x), _coord_to_abs(y))


def _click(btn=BTN_LEFT, delay=0.05):
    ax, ay = _coord_to_abs(_cur_x), _coord_to_abs(_cur_y)
    _mouse_abs(btn, ax, ay)
    time.sleep(delay)
    _mouse_abs(0, ax, ay)
    time.sleep(delay)


# ── Public API ────────────────────────────────────────────────────────────────

def execute(action: dict) -> str:
    """
    Execute a single action dict. Returns 'ok' or an error string.
    Fractional coordinates (0.0–1.0) are accepted for x/y fields.
    """
    with _lock:
        st = _host_state()
        if st not in ("configured", None):
            _wakeup_host()
        _open()

        # Wake primer — silent F15 press
        _w("kb", bytes([0, 0, 0x68, 0, 0, 0, 0, 0]))
        time.sleep(0.02)
        _w("kb", KB_RELEASE)
        time.sleep(0.05)

        return _dispatch(action)


def _dispatch(action: dict) -> str:
    global _cur_x, _cur_y, _held_btn
    t = action.get("type", "")

    try:
        if t == "done":
            return "ok"

        elif t in ("click", "left_click"):
            x = _frac_to_coord(float(action.get("x", 0.5)))
            y = _frac_to_coord(float(action.get("y", 0.5)))
            _move_to(x, y); time.sleep(0.05)
            _held_btn = BTN_LEFT; _click(BTN_LEFT); _held_btn = 0

        elif t == "right_click":
            x = _frac_to_coord(float(action.get("x", 0.5)))
            y = _frac_to_coord(float(action.get("y", 0.5)))
            _move_to(x, y); time.sleep(0.05)
            _held_btn = BTN_RIGHT; _click(BTN_RIGHT); _held_btn = 0

        elif t == "double_click":
            x = _frac_to_coord(float(action.get("x", 0.5)))
            y = _frac_to_coord(float(action.get("y", 0.5)))
            _move_to(x, y); time.sleep(0.05)
            _held_btn = BTN_LEFT; _click(); time.sleep(0.08); _click(); _held_btn = 0

        elif t == "mouse_move":
            x = _frac_to_coord(float(action.get("x", 0.5)))
            y = _frac_to_coord(float(action.get("y", 0.5)))
            _move_to(x, y)

        elif t == "drag":
            x1 = _frac_to_coord(float(action.get("x1", action.get("startX", 0.0))))
            y1 = _frac_to_coord(float(action.get("y1", action.get("startY", 0.0))))
            x2 = _frac_to_coord(float(action.get("x2", action.get("endX", 1.0))))
            y2 = _frac_to_coord(float(action.get("y2", action.get("endY", 1.0))))
            _move_to(x1, y1); time.sleep(0.05)
            _held_btn = BTN_LEFT
            _mouse_abs(BTN_LEFT, _coord_to_abs(_cur_x), _coord_to_abs(_cur_y))
            time.sleep(0.05)
            _move_to(x2, y2, btn=BTN_LEFT); time.sleep(0.05)
            _held_btn = 0
            _mouse_abs(0, _coord_to_abs(_cur_x), _coord_to_abs(_cur_y)); time.sleep(0.05)

        elif t == "scroll":
            direction = action.get("direction", "down")
            amount    = min(abs(int(action.get("amount", 3))), 10)
            key_name  = "pagedown" if direction == "down" else "pageup"
            for _ in range(amount):
                _press_key(MOD_NONE, NAMED_KEYS[key_name][1])
                time.sleep(0.05)

        elif t == "type":
            for ch in str(action.get("text", "")):
                _type_char(ch)

        elif t == "key":
            _press_combo(str(action.get("key", "")))

        elif t == "wait":
            time.sleep(float(action.get("seconds", 1)))

        else:
            return f"error:unknown_type:{t}"

        return "ok"

    except Exception as exc:
        logger.exception(f"[actions] {t} failed: {exc}")
        return f"error:{exc}"


def cleanup():
    global _held_btn
    with _lock:
        try:
            _held_btn = 0
            if _ms_fd:
                _mouse_abs(0, _coord_to_abs(_cur_x), _coord_to_abs(_cur_y))
            if _kb_fd:
                _w("kb", KB_RELEASE)
        except Exception as e:
            logger.error(f"[actions] cleanup error: {e}")
        _close_fds()
