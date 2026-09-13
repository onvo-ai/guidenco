"""
hid — drive the target machine's mouse and keyboard over the USB HID gadget.

The API sends intent — click here, type this, press ctrl+c — so this module
owns the sequencing that turns intent into HID reports.

Two gadget interfaces are used, matching hid-gadget-setup.sh:
    /dev/hidg0  boot keyboard, 8-byte report: modifiers, reserved, 6 key slots
    /dev/hidg1  absolute mouse, 6-byte report: buttons, X (LE16), Y (LE16), wheel

Pointer moves are interpolated rather than teleported. That is not cosmetic: a
cursor that jumps never crosses the pixels in between, so hover states never
fire, menus that open on hover stay shut, and drag-and-drop frequently fails
outright because applications decide a drag has begun by observing motion while
a button is held.

When the gadget is absent every entry point raises InputUnavailable, and
/health reports input as unavailable rather than silently doing nothing.
"""

import errno
import logging
import math
import os
import struct
import threading
import time

from config import (
    ABS_MAX, HID_ENABLED, MOUSE_SMOOTH, MOUSE_MOVE_BASE_MS,
    MOUSE_MOVE_PER_ROOT_PX_MS, MOUSE_MOVE_MAX_MS, MOUSE_STEP_MS,
)
from .keys import CHARS, MOD_LSHIFT, UnknownKey, parse_combo

logger = logging.getLogger("guidenco.hid")

KB_DEVICE = "/dev/hidg0"
MS_DEVICE = "/dev/hidg1"
_GADGET_DIR = "/sys/kernel/config/usb_gadget/hid_keyboard"

KB_RELEASE = b"\x00" * 8

#: HID orders the button bits left, right, middle.
BUTTONS = {"left": 0x01, "right": 0x02, "middle": 0x04}

# Delay between a press and its release. Too short and some applications drop
# the event; this sits comfortably inside what a real click looks like.
_PRESS_MS = 90

# Pause after the pointer arrives, before the button goes down.
#
# Clicks on macOS intermittently do nothing the first time and work when
# repeated, most often on a control that has just appeared. The press used to
# go out in the same breath as the last move, which gives the host no chance to
# process the motion and settle on what is under the cursor before it has to
# hit-test the press. A hand does not arrive and press in the same instant
# either.
#
# This is a considered guess at that race rather than a proven cure: the
# failure is intermittent and resisted isolation, partly because a captured
# frame does not reliably show where the pointer actually is. It costs a fifth
# of a second per click and makes the sequence more like a real one, so it is
# worth keeping whether or not it turns out to be the whole story.
_HOVER_MS = 150

_KEYSTROKE_MS = 12

_lock = threading.RLock()
_kb_fd = None
_ms_fd = None
_enabled = False
_reason = "not initialised"

_buttons = 0
_x = 0                            # last position, in absolute HID units
_y = 0
_frame = (0, 0)                   # full captured frame, the space callers use
_active = (0, 0, 0, 0)            # the screen within it, as (x, y, w, h)


class InputUnavailable(RuntimeError):
    """The USB HID gadget is not usable on this machine."""


# ── Lifecycle ─────────────────────────────────────────────────────────────────

def available() -> bool:
    return _enabled


def status() -> dict:
    x, y, w, h = _active
    return {
        "available": _enabled, "detail": _reason,
        "keyboard": KB_DEVICE, "mouse": MS_DEVICE,
        "frame": {"width": _frame[0], "height": _frame[1]},
        # Exposed because a mismatch between these two is invisible in a
        # screenshot but shifts every click, so it should be inspectable.
        "active_area": {"x": x, "y": y, "width": w, "height": h},
        "letterboxed": (x, y, w, h) != (0, 0, _frame[0], _frame[1]),
    }


def set_screen(width: int, height: int,
               active: tuple[int, int, int, int] | None = None) -> None:
    """
    Tell the module what pixel space incoming coordinates are in.

    *width*/*height* describe the whole captured frame, which is what callers
    see and measure against. *active* is the part of it that is actually the
    target's screen; it differs when the source is letterboxed, and pointer
    position must be a fraction of that rather than of the frame.
    """
    global _frame, _active
    _frame = (width, height)
    _active = active if active else (0, 0, width, height)


def init() -> bool:
    global _enabled, _reason
    with _lock:
        if HID_ENABLED == "off":
            _enabled, _reason = False, "disabled by configuration"
            logger.info("[hid] disabled by config — screen only")
            return False
        if not (os.path.exists(KB_DEVICE) and os.path.exists(MS_DEVICE)):
            _enabled = False
            _reason = (f"{KB_DEVICE} and {MS_DEVICE} are missing — the USB gadget "
                       "is not bound. On a Pi Zero the single USB port cannot be "
                       "both a HID gadget and a capture-card host.")
            (logger.error if HID_ENABLED == "on" else logger.warning)("[hid] %s", _reason)
            return False
        try:
            _open()
        except Exception as exc:
            _enabled, _reason = False, f"could not open gadget devices: {exc}"
            logger.error("[hid] %s", _reason)
            return False
        _enabled, _reason = True, "ready"
        logger.info("[hid] gadget ready (%s, %s)", KB_DEVICE, MS_DEVICE)
        return True


def _require() -> None:
    if not _enabled:
        raise InputUnavailable(_reason)


# ── Device I/O ────────────────────────────────────────────────────────────────

def _host_state() -> str | None:
    try:
        udcs = os.listdir("/sys/class/udc")
        if not udcs:
            return None
        with open(os.path.join("/sys/class/udc", udcs[0], "state")) as f:
            return f.read().strip()
    except Exception:
        return None


def _close_fds() -> None:
    global _kb_fd, _ms_fd
    for fd in (_kb_fd, _ms_fd):
        if fd:
            try:
                fd.close()
            except Exception:
                pass
    _kb_fd = _ms_fd = None


def _wakeup_host() -> bool:
    """
    Re-bind the gadget to jolt a sleeping host awake.

    A suspended machine leaves writes failing with EAGAIN indefinitely.
    Unbinding and rebinding the UDC looks like a re-plug, which wakes it.
    """
    try:
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
    except Exception as exc:
        logger.error("[hid] wakeup failed: %s", exc)
        return False


def _open_dev(path: str):
    for _ in range(8):
        try:
            return open(path, "wb", buffering=0)
        except OSError as exc:
            if exc.errno in (errno.ESHUTDOWN, errno.ENODEV, errno.EPIPE, errno.ENOENT):
                time.sleep(1)
            else:
                raise
    raise RuntimeError(f"cannot open {path}")


def _open() -> None:
    global _kb_fd, _ms_fd
    if _kb_fd is None:
        _kb_fd = _open_dev(KB_DEVICE)
    if _ms_fd is None:
        _ms_fd = _open_dev(MS_DEVICE)


def _write(target: str, data: bytes, _retried: bool = False) -> None:
    fd = _kb_fd if target == "kb" else _ms_fd
    if fd is None:
        raise InputUnavailable("gadget device is not open")
    try:
        fd.write(data)
        fd.flush()
    except OSError as exc:
        if _retried or not _wakeup_host():
            raise InputUnavailable(f"write to the gadget failed: {exc}")
        _open()
        _write(target, data, _retried=True)


# ── Coordinates ───────────────────────────────────────────────────────────────

def _to_abs(value: float, origin: int, span: int) -> int:
    """
    A frame coordinate to the target's absolute HID range.

    The target places the pointer at this fraction of ITS screen, so the
    fraction has to be measured across the active area and offset by where that
    area starts. Measuring across the whole frame instead is correct only when
    there are no bars, and is wrong by up to a full bar-width at the edges —
    exact at the centre, worst where the buttons are.
    """
    if span <= 1:
        return 0
    fraction = (value - origin) / (span - 1)
    return max(0, min(ABS_MAX, round(fraction * ABS_MAX)))


def _mouse_report(buttons: int, x: int, y: int, wheel: int = 0) -> bytes:
    return struct.pack("<BHHb", buttons & 0x07, x, y, wheel)


def _emit(x: int, y: int, wheel: int = 0) -> None:
    global _x, _y
    _x, _y = x, y
    _write("ms", _mouse_report(_buttons, x, y, wheel))


# ── Pointer motion ────────────────────────────────────────────────────────────

def _ease_in_out_cubic(t: float) -> float:
    """Accelerate away, decelerate in — roughly how a hand moves."""
    return 4 * t * t * t if t < 0.5 else 1 - ((-2 * t + 2) ** 3) / 2


def _move_duration_ms(dx: int, dy: int) -> float:
    """
    How long a move of this distance should take.

    Scales with the square root of distance rather than linearly, echoing
    Fitts's law: long sweeps cover more ground per millisecond than short
    adjustments do.
    """
    span = max(_active[2], 1)
    pixels = math.hypot(dx, dy) / max(1, ABS_MAX) * span
    ms = MOUSE_MOVE_BASE_MS + MOUSE_MOVE_PER_ROOT_PX_MS * math.sqrt(max(pixels, 0.0))
    return min(ms, MOUSE_MOVE_MAX_MS)


def _glide(target_x: int, target_y: int) -> None:
    """Interpolate from the current position to the target with easing."""
    start_x, start_y = _x, _y
    dx, dy = target_x - start_x, target_y - start_y
    if dx == 0 and dy == 0:
        _emit(target_x, target_y)
        return

    duration = _move_duration_ms(dx, dy)
    steps = max(1, min(240, int(duration / MOUSE_STEP_MS)))
    step_seconds = (duration / steps) / 1000.0

    for step in range(1, steps + 1):
        progress = _ease_in_out_cubic(step / steps)
        _emit(round(start_x + dx * progress), round(start_y + dy * progress))
        if step < steps:
            time.sleep(step_seconds)
    # Land exactly on the target: rounding during the glide can leave us a unit
    # short, and a click must not be a pixel off.
    if (_x, _y) != (target_x, target_y):
        _emit(target_x, target_y)


def _goto(x: float, y: float, smooth: bool | None) -> None:
    """Caller must hold the lock."""
    ax, ay, aw, ah = _active
    tx, ty = _to_abs(x, ax, aw), _to_abs(y, ay, ah)
    if MOUSE_SMOOTH if smooth is None else smooth:
        _glide(tx, ty)
    else:
        _emit(tx, ty)


def move(x: float, y: float, smooth: bool | None = None) -> None:
    """Move the pointer to a pixel position in the screen's coordinate space."""
    _require()
    with _lock:
        _goto(x, y, smooth)


# ── Buttons ───────────────────────────────────────────────────────────────────

def _button_bit(name: str) -> int:
    try:
        return BUTTONS[name]
    except KeyError:
        raise ValueError(f"unknown button {name!r}; expected one of {sorted(BUTTONS)}")


def click(x: float, y: float, button: str = "left", count: int = 1,
          smooth: bool | None = None) -> None:
    global _buttons
    _require()
    if not 1 <= count <= 3:
        raise ValueError("count must be 1, 2 or 3")
    bit = _button_bit(button)
    with _lock:
        _goto(x, y, smooth)
        time.sleep(_HOVER_MS / 1000.0)
        for n in range(count):
            _buttons = bit
            _emit(_x, _y)
            time.sleep(_PRESS_MS / 1000.0)
            _buttons = 0
            _emit(_x, _y)
            if n + 1 < count:
                time.sleep(0.06)   # inside every OS's double-click interval


def drag(from_x: float, from_y: float, to_x: float, to_y: float,
         button: str = "left", smooth: bool | None = None) -> None:
    """Press at one point, glide to another, release."""
    global _buttons
    _require()
    bit = _button_bit(button)
    with _lock:
        _goto(from_x, from_y, smooth)
        time.sleep(_HOVER_MS / 1000.0)
        _buttons = bit
        _emit(_x, _y)
        time.sleep(_PRESS_MS / 1000.0)
        _goto(to_x, to_y, smooth)
        time.sleep(_PRESS_MS / 1000.0)
        _buttons = 0
        _emit(_x, _y)


def scroll(x: float, y: float, amount: int, smooth: bool | None = None) -> None:
    """Scroll by a signed number of notches: positive up, negative down."""
    _require()
    amount = int(amount)
    if amount == 0:
        return
    step = 1 if amount > 0 else -1
    with _lock:
        _goto(x, y, smooth)
        for _ in range(abs(amount)):
            _emit(_x, _y, wheel=step)
            # A notch is an edge, not a state — clear it so the target does not
            # see one continuous scroll.
            _emit(_x, _y, wheel=0)
            time.sleep(0.02)


# ── Keyboard ──────────────────────────────────────────────────────────────────

def _kb_report(modifiers: int = 0, usage: int = 0) -> bytes:
    return struct.pack("8B", modifiers, 0, usage, 0, 0, 0, 0, 0)


def _tap(modifiers: int, usage: int, hold_ms: float = _KEYSTROKE_MS) -> None:
    _write("kb", _kb_report(modifiers, usage))
    time.sleep(hold_ms / 1000.0)
    _write("kb", KB_RELEASE)


def type_text(text: str) -> list[str]:
    """
    Type a string. Returns the characters that had no US-layout mapping.

    Unmappable characters are skipped rather than aborting the whole string, so
    one stray emoji in a sentence does not lose the sentence.
    """
    _require()
    skipped: list[str] = []
    with _lock:
        for char in text:
            entry = CHARS.get(char)
            if entry is None:
                skipped.append(char)
                continue
            usage, needs_shift = entry
            _tap(MOD_LSHIFT if needs_shift else 0, usage)
    return skipped


def press_key(combo: str) -> None:
    """Press a key or combination, e.g. "Return", "ctrl+c", "cmd+shift+4"."""
    _require()
    modifiers, usage = parse_combo(combo)
    with _lock:
        _tap(modifiers, usage, hold_ms=50)


# ── Shutdown ──────────────────────────────────────────────────────────────────

def release_all() -> None:
    global _buttons
    if not _enabled:
        return
    with _lock:
        _buttons = 0
        try:
            _write("kb", KB_RELEASE)
            _write("ms", _mouse_report(0, _x, _y))
        except InputUnavailable:
            pass


def cleanup() -> None:
    release_all()
    with _lock:
        _close_fds()


__all__ = [
    "InputUnavailable", "UnknownKey", "available", "status", "init", "set_screen",
    "move", "click", "drag", "scroll", "type_text", "press_key",
    "release_all", "cleanup", "BUTTONS",
]
