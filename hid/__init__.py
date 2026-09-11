"""
hid — replay VNC input on the target machine via the USB HID gadget.

VNC input is raw: PointerEvent carries an absolute position and a button
bitmask, KeyEvent carries one keysym going down or up. The client does all the
sequencing — a double click is two PointerEvent pairs, typing is a stream of
key downs and ups — so this module only has to hold the current hardware state
and push a report whenever it changes.

Two gadget interfaces are used, matching hid-gadget-setup.sh:
    /dev/hidg0  boot keyboard, 8-byte report: modifiers, reserved, 6 key slots
    /dev/hidg1  absolute mouse, 6-byte report: buttons, X (LE16), Y (LE16), wheel

When the gadget is absent — most often a Pi Zero whose one USB port is taken by
a capture card — every entry point becomes a no-op and the server runs as a
screen-only VNC endpoint.
"""

import errno
import logging
import os
import struct
import threading
import time

from config import ABS_MAX, HID_ENABLED
from rfb.keysyms import MODIFIERS, lookup

logger = logging.getLogger("guidenco.hid")

KB_DEVICE = "/dev/hidg0"
MS_DEVICE = "/dev/hidg1"
_GADGET_DIR = "/sys/kernel/config/usb_gadget/hid_keyboard"

KB_RELEASE = b"\x00" * 8
MAX_KEY_SLOTS = 6   # boot keyboard is 6-key rollover

#: VNC button bitmask positions. Bits 3-6 are wheel clicks, not real buttons:
#: the client presses and releases them to signal one notch of scrolling.
_BTN_LEFT, _BTN_MIDDLE, _BTN_RIGHT = 0x01, 0x02, 0x04
_WHEEL_UP, _WHEEL_DOWN = 0x08, 0x10

_lock = threading.RLock()
_kb_fd = None
_ms_fd = None
_enabled = False
_warned = False

# Current hardware state, mirrored so we only write when something changes.
_modifiers = 0
_keys: list[int] = []
_buttons = 0
_x = 0
_y = 0


# ── Availability ──────────────────────────────────────────────────────────────

def init() -> bool:
    """
    Open the gadget devices. Returns False when running screen-only.

    Called once at startup so the operator sees the verdict in the log rather
    than discovering it on the first click.
    """
    global _enabled
    with _lock:
        if HID_ENABLED == "off":
            logger.info("[hid] disabled by config — screen-only")
            _enabled = False
            return False
        if not (os.path.exists(KB_DEVICE) and os.path.exists(MS_DEVICE)):
            message = ("[hid] %s and %s missing — serving screen only, input will be "
                       "ignored. On a Pi Zero the single USB port cannot be both "
                       "a HID gadget and a capture-card host; use the HDMI-to-CSI "
                       "adapter if you need input.")
            if HID_ENABLED == "on":
                logger.error(message, KB_DEVICE, MS_DEVICE)
            else:
                logger.warning(message, KB_DEVICE, MS_DEVICE)
            _enabled = False
            return False
        try:
            _open()
        except Exception as exc:
            logger.error("[hid] could not open gadget devices (%s) — screen-only", exc)
            _enabled = False
            return False
        _enabled = True
        logger.info("[hid] gadget ready (%s, %s)", KB_DEVICE, MS_DEVICE)
        return True


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

    A suspended Windows machine leaves writes failing with EAGAIN forever.
    Unbinding and rebinding the UDC looks like a re-plug, which wakes it.
    """
    global _kb_fd, _ms_fd
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
    global _warned
    fd = _kb_fd if target == "kb" else _ms_fd
    if fd is None:
        return
    try:
        fd.write(data)
        fd.flush()
    except OSError as exc:
        if _retried or not _wakeup_host():
            if not _warned:
                logger.warning("[hid] write failed (%s) — is the target plugged in?", exc)
                _warned = True
            return
        _open()
        _write(target, data, _retried=True)


# ── Keyboard ──────────────────────────────────────────────────────────────────

def _keyboard_report(modifiers: int | None = None) -> bytes:
    slots = _keys[:MAX_KEY_SLOTS]
    padding = [0] * (MAX_KEY_SLOTS - len(slots))
    mods = _modifiers if modifiers is None else modifiers
    return struct.pack("8B", mods, 0, *slots, *padding)


def key(keysym: int, down: bool) -> None:
    """Handle one KeyEvent."""
    global _modifiers
    if not _enabled:
        return
    with _lock:
        modifier = MODIFIERS.get(keysym)
        if modifier is not None:
            _modifiers = (_modifiers | modifier) if down else (_modifiers & ~modifier)
            _write("kb", _keyboard_report())
            return

        entry = lookup(keysym)
        if entry is None:
            logger.debug("[hid] no mapping for keysym %#x", keysym)
            return
        usage, needs_shift = entry

        if down:
            if usage in _keys:
                return
            if len(_keys) >= MAX_KEY_SLOTS:
                # Boot keyboards hold six keys; drop the oldest rather than
                # silently swallowing the new one.
                _keys.pop(0)
            _keys.append(usage)
            # Assert Shift for characters that need it even if the client did
            # not send a Shift event of its own. Redundant when it did.
            _write("kb", _keyboard_report(_modifiers | (0x02 if needs_shift else 0)))
        else:
            if usage in _keys:
                _keys.remove(usage)
            _write("kb", _keyboard_report())


# ── Pointer ───────────────────────────────────────────────────────────────────

def _mouse_report(buttons: int, x: int, y: int, wheel: int = 0) -> bytes:
    return struct.pack("<BHHb", buttons & 0x07, x, y, wheel)


def _to_abs(value: int, span: int) -> int:
    if span <= 1:
        return 0
    return max(0, min(ABS_MAX, round(value * ABS_MAX / (span - 1))))


def pointer(x: int, y: int, width: int, height: int, button_mask: int) -> None:
    """
    Handle one PointerEvent.

    ``x``/``y`` are pixel coordinates in the framebuffer; the gadget reports an
    absolute position over the full 0-32767 HID range, so the target's own
    screen size never has to be known.
    """
    global _buttons, _x, _y
    if not _enabled:
        return
    with _lock:
        _x = _to_abs(x, width)
        _y = _to_abs(y, height)

        # HID button order is left, right, middle; VNC's is left, middle, right.
        hid_buttons = ((button_mask & _BTN_LEFT)
                       | ((button_mask & _BTN_RIGHT) >> 1)
                       | ((button_mask & _BTN_MIDDLE) << 1))

        newly = button_mask & ~_buttons
        _buttons = button_mask

        wheel = 0
        if newly & _WHEEL_UP:
            wheel = 1
        elif newly & _WHEEL_DOWN:
            wheel = -1

        _write("ms", _mouse_report(hid_buttons, _x, _y, wheel))
        if wheel:
            # A notch is an edge, not a state — clear it so the target does not
            # see one continuous scroll.
            _write("ms", _mouse_report(hid_buttons, _x, _y, 0))


# ── Lifecycle ─────────────────────────────────────────────────────────────────

def release_all() -> None:
    """Drop every held key and button — called when a client disconnects."""
    global _modifiers, _buttons
    if not _enabled:
        return
    with _lock:
        _modifiers = 0
        _keys.clear()
        _buttons = 0
        _write("kb", KB_RELEASE)
        _write("ms", _mouse_report(0, _x, _y))


def cleanup() -> None:
    release_all()
    with _lock:
        _close_fds()
