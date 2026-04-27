"""
tools/send_keyboard_events_usb.py
Two HID interfaces:
  /dev/hidg0 — boot keyboard (8-byte report, no Report ID)
  /dev/hidg1 — absolute mouse (5-byte report, no Report ID)
Scrolling uses PageUp/PageDown keys on the keyboard interface.
"""
import errno, os, struct, time, threading

from utils import coord_to_abs

KB_DEVICE = '/dev/hidg0'
MS_DEVICE = '/dev/hidg1'
_lock = threading.Lock()

MOD_NONE=0x00; MOD_LCTRL=0x01; MOD_LSHIFT=0x02; MOD_LALT=0x04; MOD_LGUI=0x08

KEYMAP = {
    'a':(MOD_NONE,0x04),'b':(MOD_NONE,0x05),'c':(MOD_NONE,0x06),'d':(MOD_NONE,0x07),
    'e':(MOD_NONE,0x08),'f':(MOD_NONE,0x09),'g':(MOD_NONE,0x0a),'h':(MOD_NONE,0x0b),
    'i':(MOD_NONE,0x0c),'j':(MOD_NONE,0x0d),'k':(MOD_NONE,0x0e),'l':(MOD_NONE,0x0f),
    'm':(MOD_NONE,0x10),'n':(MOD_NONE,0x11),'o':(MOD_NONE,0x12),'p':(MOD_NONE,0x13),
    'q':(MOD_NONE,0x14),'r':(MOD_NONE,0x15),'s':(MOD_NONE,0x16),'t':(MOD_NONE,0x17),
    'u':(MOD_NONE,0x18),'v':(MOD_NONE,0x19),'w':(MOD_NONE,0x1a),'x':(MOD_NONE,0x1b),
    'y':(MOD_NONE,0x1c),'z':(MOD_NONE,0x1d),
    'A':(MOD_LSHIFT,0x04),'B':(MOD_LSHIFT,0x05),'C':(MOD_LSHIFT,0x06),'D':(MOD_LSHIFT,0x07),
    'E':(MOD_LSHIFT,0x08),'F':(MOD_LSHIFT,0x09),'G':(MOD_LSHIFT,0x0a),'H':(MOD_LSHIFT,0x0b),
    'I':(MOD_LSHIFT,0x0c),'J':(MOD_LSHIFT,0x0d),'K':(MOD_LSHIFT,0x0e),'L':(MOD_LSHIFT,0x0f),
    'M':(MOD_LSHIFT,0x10),'N':(MOD_LSHIFT,0x11),'O':(MOD_LSHIFT,0x12),'P':(MOD_LSHIFT,0x13),
    'Q':(MOD_LSHIFT,0x14),'R':(MOD_LSHIFT,0x15),'S':(MOD_LSHIFT,0x16),'T':(MOD_LSHIFT,0x17),
    'U':(MOD_LSHIFT,0x18),'V':(MOD_LSHIFT,0x19),'W':(MOD_LSHIFT,0x1a),'X':(MOD_LSHIFT,0x1b),
    'Y':(MOD_LSHIFT,0x1c),'Z':(MOD_LSHIFT,0x1d),
    '1':(MOD_NONE,0x1e),'2':(MOD_NONE,0x1f),'3':(MOD_NONE,0x20),'4':(MOD_NONE,0x21),
    '5':(MOD_NONE,0x22),'6':(MOD_NONE,0x23),'7':(MOD_NONE,0x24),'8':(MOD_NONE,0x25),
    '9':(MOD_NONE,0x26),'0':(MOD_NONE,0x27),
    '!':(MOD_LSHIFT,0x1e),'@':(MOD_LSHIFT,0x1f),'#':(MOD_LSHIFT,0x20),
    '$':(MOD_LSHIFT,0x21),'%':(MOD_LSHIFT,0x22),'^':(MOD_LSHIFT,0x23),
    '&':(MOD_LSHIFT,0x24),'*':(MOD_LSHIFT,0x25),'(':(MOD_LSHIFT,0x26),')':(MOD_LSHIFT,0x27),
    ' ':(MOD_NONE,0x2c),'\n':(MOD_NONE,0x28),'\t':(MOD_NONE,0x2b),
    '-':(MOD_NONE,0x2d),'_':(MOD_LSHIFT,0x2d),'=':(MOD_NONE,0x2e),'+':(MOD_LSHIFT,0x2e),
    '[':(MOD_NONE,0x2f),'{':(MOD_LSHIFT,0x2f),']':(MOD_NONE,0x30),'}':(MOD_LSHIFT,0x30),
    '\\':(MOD_NONE,0x31),'|':(MOD_LSHIFT,0x31),';':(MOD_NONE,0x33),':':(MOD_LSHIFT,0x33),
    "'":(MOD_NONE,0x34),'"':(MOD_LSHIFT,0x34),'`':(MOD_NONE,0x35),'~':(MOD_LSHIFT,0x35),
    ',':(MOD_NONE,0x36),'<':(MOD_LSHIFT,0x36),'.':(MOD_NONE,0x37),'>':(MOD_LSHIFT,0x37),
    '/':(MOD_NONE,0x38),'?':(MOD_LSHIFT,0x38),
}

NAMED_KEYS = {
    'esc':(MOD_NONE,0x29),'escape':(MOD_NONE,0x29),'backspace':(MOD_NONE,0x2a),
    'tab':(MOD_NONE,0x2b),'return':(MOD_NONE,0x28),'enter':(MOD_NONE,0x28),
    'space':(MOD_NONE,0x2c),'delete':(MOD_NONE,0x4c),
    'home':(MOD_NONE,0x4a),'end':(MOD_NONE,0x4d),
    'pageup':(MOD_NONE,0x4b),'pagedown':(MOD_NONE,0x4e),
    'left':(MOD_NONE,0x50),'right':(MOD_NONE,0x4f),'up':(MOD_NONE,0x52),'down':(MOD_NONE,0x51),
    'f1':(MOD_NONE,0x3a),'f2':(MOD_NONE,0x3b),'f3':(MOD_NONE,0x3c),'f4':(MOD_NONE,0x3d),
    'f5':(MOD_NONE,0x3e),'f6':(MOD_NONE,0x3f),'f7':(MOD_NONE,0x40),'f8':(MOD_NONE,0x41),
    'f9':(MOD_NONE,0x42),'f10':(MOD_NONE,0x43),'f11':(MOD_NONE,0x44),'f12':(MOD_NONE,0x45),
}
MOD_NAMES = {
    'cmd':MOD_LGUI,'super':MOD_LGUI,'win':MOD_LGUI,
    'ctrl':MOD_LCTRL,'control':MOD_LCTRL,
    'alt':MOD_LALT,'option':MOD_LALT,
    'shift':MOD_LSHIFT,
}

KB_RELEASE    = bytes([0,0,0,0,0,0,0,0])      # 8 bytes
MOUSE_RELEASE = bytes([0,0,0,0,0])            # 5 bytes
BTN_LEFT=0x01; BTN_RIGHT=0x02; BTN_MIDDLE=0x04
BTN_MAP={1:BTN_LEFT,2:BTN_MIDDLE,3:BTN_RIGHT}

_kb_fd = None
_ms_fd = None
_cur_x = 0; _cur_y = 0
_held_btn = 0
_last_ax = 0; _last_ay = 0  # last absolute position actually sent to HID

_GADGET_DIR = '/sys/kernel/config/usb_gadget/hid_keyboard'


def _host_state():
    """Read the gadget UDC state. Returns string like 'configured', 'suspended',
    'not attached', or None if unreadable."""
    try:
        udc_dir = '/sys/class/udc'
        udcs = os.listdir(udc_dir)
        if not udcs:
            return None
        with open(os.path.join(udc_dir, udcs[0], 'state')) as f:
            return f.read().strip()
    except Exception:
        return None


def _close_fds():
    global _kb_fd, _ms_fd
    for name, fd in (('kb', _kb_fd), ('ms', _ms_fd)):
        if fd:
            try:
                fd.close()
            except Exception:
                pass
    _kb_fd = None
    _ms_fd = None


def _wakeup_host():
    """Force a USB re-enumeration to wake a sleeping host.

    Unbinds and rebinds the gadget's UDC, which causes the host to
    see a disconnect/reconnect. Windows interprets this as a wake signal.
    """
    pre = _host_state()
    print(f"[usb-hid] wake: pre-state={pre!r}, re-enumerating gadget")
    try:
        udc_dir = '/sys/class/udc'
        udcs = os.listdir(udc_dir)
        if not udcs:
            print("[usb-hid] wake: no UDC available")
            return False
        udc = udcs[0]
        _close_fds()
        # NOTE: must write at least one byte. Python's f.write('') results in
        # zero bytes being written and configfs's UDC store handler is never
        # invoked, so the gadget stays bound and the rebind below fails with
        # EBUSY. Writing a newline triggers the unbind path.
        with open(os.path.join(_GADGET_DIR, 'UDC'), 'w') as f:
            f.write('\n')
        time.sleep(0.3)
        with open(os.path.join(_GADGET_DIR, 'UDC'), 'w') as f:
            f.write(udc)
        # Wait up to ~3s for the host to re-enumerate the gadget. Once we see
        # 'configured', give Windows a moment to finish resuming before
        # callers start streaming HID events at it.
        for _ in range(30):
            time.sleep(0.1)
            st = _host_state()
            if st == 'configured':
                print("[usb-hid] wake: re-enumerated, state=configured")
                time.sleep(0.8)
                return True
        post = _host_state()
        if post == 'not attached':
            print(
                "[usb-hid] wake: state still 'not attached' after rebind — "
                "host has cut VBUS (powered off, or sleep with USB power gated). "
                "Check Windows USB selective-suspend and BIOS 'wake on USB' settings."
            )
        else:
            print(f"[usb-hid] wake: timed out waiting for 'configured', last state={post!r}")
        return False
    except Exception as e:
        print(f"[usb-hid] wake: failed: {e}")
        return False


def _ensure_host_awake():
    """If the host isn't in 'configured' (i.e. is suspended or detached),
    force a re-enumeration so Windows wakes before we send HID events.
    Writes to /dev/hidg* succeed locally even when the host is asleep, so
    we cannot rely on write errors to detect this — check UDC state instead."""
    st = _host_state()
    if st == 'configured' or st is None:
        return False
    print(f"[usb-hid] host state={st!r}, waking before sending events")
    return _wakeup_host()


def _open_dev(path):
    for i in range(8):
        try:
            return open(path, 'wb', buffering=0)
        except OSError as e:
            print(f"[usb-hid] open({path}) attempt {i+1}/8 failed: {e}")
            if e.errno in (errno.ESHUTDOWN, errno.ENODEV, errno.EPIPE, errno.ENOENT):
                time.sleep(1)
            else:
                raise
    raise RuntimeError(f'Cannot open {path}')


def _open():
    global _kb_fd, _ms_fd
    for name, path, attr in (('kb', KB_DEVICE, '_kb_fd'), ('ms', MS_DEVICE, '_ms_fd')):
        fd = globals()[attr]
        if fd:
            try:
                os.fstat(fd.fileno())
                continue
            except OSError:
                print(f"[usb-hid] {attr} stale, reopening")
                globals()[attr] = None
        globals()[attr] = _open_dev(path)
        print(f"[usb-hid] Opened {path}")


def _w(target, data, _retried=False):
    """Write to keyboard ('kb') or mouse ('ms') HID endpoint."""
    fd = _kb_fd if target == 'kb' else _ms_fd
    try:
        fd.write(data)
        fd.flush()
    except OSError as e:
        if _retried:
            print(f"[usb-hid] _w({target}) failed after retry: {e}")
            raise
        print(f"[usb-hid] _w({target}) failed: {e}, attempting wakeup+retry")
        if not _wakeup_host():
            # Host unreachable — don't retry the write, it'll just fail again
            # with errno 108 and we'll thrash. Surface the original error.
            raise
        _open()
        _w(target, data, _retried=True)

def _press_key(mod, code, delay=0.05):
    if mod and code:
        # Press modifier alone first so Windows recognises it before the chord
        _w('kb', bytes([mod, 0x00, 0, 0, 0, 0, 0, 0]))
        time.sleep(0.02)
    _w('kb', bytes([mod, 0x00, code, 0, 0, 0, 0, 0]))
    time.sleep(delay)
    _w('kb', KB_RELEASE)
    time.sleep(delay)

def _type_char(ch, delay=0.04):
    if ch in KEYMAP:
        mod, code = KEYMAP[ch]
        _press_key(mod, code, delay)
    else:
        print(f"[usb-hid] Unsupported char: {ch!r}")

def _press_combo(combo_str):
    parts = [p.strip().lower() for p in combo_str.split('+')]
    mod = MOD_NONE; code = None
    for p in parts:
        if p in MOD_NAMES: mod |= MOD_NAMES[p]
        elif p in NAMED_KEYS: _, c = NAMED_KEYS[p]; code = code or c
        elif p in KEYMAP: _, c = KEYMAP[p]; code = code or c
        elif len(p)==1 and p in KEYMAP: _, c = KEYMAP[p]; code = code or c
    if code: _press_key(mod, code)
    elif mod: _w('kb', bytes([mod, 0, 0, 0, 0, 0, 0, 0])); time.sleep(0.05); _w('kb', KB_RELEASE)

def _mouse_abs(btn, ax, ay):
    """Send absolute mouse report on the dedicated mouse interface.
    Layout: [buttons(1) | X(2 LE) | Y(2 LE)] = 5 bytes (no Report ID)."""
    global _last_ax, _last_ay
    ax = max(0, min(32767, int(ax)))
    ay = max(0, min(32767, int(ay)))
    _last_ax, _last_ay = ax, ay
    data = struct.pack('<BHH', btn, ax, ay)
    _w('ms', data)

def _move_to(tx, ty, btn=None):
    """Move cursor to coord-space position (0-1000)."""
    global _cur_x, _cur_y
    _cur_x = int(tx)
    _cur_y = int(ty)
    ax = coord_to_abs(_cur_x)
    ay = coord_to_abs(_cur_y)
    if btn is None:
        btn = _held_btn
    _mouse_abs(btn, ax, ay)

def _click(btn=BTN_LEFT, delay=0.05):
    ax = coord_to_abs(_cur_x)
    ay = coord_to_abs(_cur_y)
    _mouse_abs(btn, ax, ay)
    time.sleep(delay)
    _mouse_abs(0, ax, ay)
    time.sleep(delay)

def send_keyboard_events(actions):
    with _lock:
        _ensure_host_awake()
        _open()
        results = []
        global _cur_x, _cur_y, _held_btn
        # Wake primer: tap F15 (HID code 0x68, no default Windows action) on
        # the boot-keyboard interface before every batch. An all-zeros report
        # ('no keys pressed') is filtered by Windows as a no-op and won't
        # wake the host; a real press+release registers as keyboard activity.
        # F15 is the standard "silent" wake key — power tools use it because
        # it has no Windows binding and won't disrupt focused apps.
        _w('kb', bytes([0, 0, 0x68, 0, 0, 0, 0, 0]))
        time.sleep(0.02)
        _w('kb', KB_RELEASE)
        time.sleep(0.05)
        if len(actions) > 1:
            _held_btn = 0
            _mouse_abs(0, coord_to_abs(_cur_x), coord_to_abs(_cur_y))
            _w('kb', KB_RELEASE)
        for action in actions:
            t = action.get('type')
            if not t:
                print(f"[usb-hid] Dropping action with no type: {action}")
                results.append({'action': action, 'status': 'error:no_type'})
                continue
            try:
                if t == 'type':
                    text = str(action.get('text',''))
                    if not text:
                        print(f"[usb-hid] type action missing text: {action}")
                        results.append({'action': action, 'status': 'error:missing_text'})
                        continue
                    for ch in text: _type_char(ch)

                elif t in ('key', 'enter'):
                    key = str(action.get('key', 'return')) if t == 'enter' else str(action.get('key', ''))
                    if not key:
                        print(f"[usb-hid] key action missing key: {action}")
                        results.append({'action': action, 'status': 'error:missing_key'})
                        continue
                    _press_combo(key)

                elif t == 'hotkey':
                    keys = action.get('keys',[])
                    if not keys:
                        print(f"[usb-hid] hotkey action missing keys: {action}")
                        results.append({'action': action, 'status': 'error:missing_keys'})
                        continue
                    _press_combo('+'.join(str(k) for k in keys))
                    time.sleep(0.1)

                elif t in ('left_click', 'click'):
                    x, y = int(action.get('x', _cur_x)), int(action.get('y', _cur_y))
                    print(f"[usb-hid] left_click at ({x},{y})")
                    _move_to(x, y)
                    time.sleep(0.05)
                    _held_btn = BTN_LEFT
                    _click(BTN_LEFT)
                    _held_btn = 0

                elif t == 'right_click':
                    x, y = int(action.get('x', _cur_x)), int(action.get('y', _cur_y))
                    print(f"[usb-hid] right_click at ({x},{y})")
                    _move_to(x, y)
                    time.sleep(0.05)
                    _held_btn = BTN_RIGHT
                    _click(BTN_RIGHT)
                    _held_btn = 0

                elif t == 'double_click':
                    x, y = int(action.get('x', _cur_x)), int(action.get('y', _cur_y))
                    print(f"[usb-hid] double_click at ({x},{y})")
                    _move_to(x, y)
                    time.sleep(0.05)
                    _held_btn = BTN_LEFT
                    _click()
                    time.sleep(0.08)
                    _click()
                    _held_btn = 0

                elif t == 'mouse_move':
                    mx, my = int(action.get('x', _cur_x)), int(action.get('y', _cur_y))
                    print(f"[usb-hid] mouse_move to ({mx},{my})")
                    _move_to(mx, my)

                elif t == 'mouse_down':
                    btn = BTN_MAP.get(action.get('button', 1), BTN_LEFT)
                    _held_btn = btn
                    print(f"[usb-hid] mouse_down button={btn}")
                    _mouse_abs(btn, coord_to_abs(_cur_x), coord_to_abs(_cur_y))
                    time.sleep(0.03)

                elif t == 'mouse_up':
                    _held_btn = 0
                    print(f"[usb-hid] mouse_up")
                    _mouse_abs(0, coord_to_abs(_cur_x), coord_to_abs(_cur_y))
                    time.sleep(0.03)

                elif t == 'scroll':
                    amt = int(action.get('amount', 0))
                    key_name = 'pagedown' if amt > 0 else 'pageup'
                    presses = min(abs(amt), 10)
                    print(f"[usb-hid] scroll amount={amt} -> {key_name} x{presses}")
                    for _ in range(presses):
                        _press_key(MOD_NONE, NAMED_KEYS[key_name][1])
                        time.sleep(0.05)

                elif t == 'drag':
                    x1 = int(action.get('x1', _cur_x))
                    y1 = int(action.get('y1', _cur_y))
                    x2 = int(action.get('x2', _cur_x))
                    y2 = int(action.get('y2', _cur_y))
                    print(f"[usb-hid] drag ({x1},{y1}) -> ({x2},{y2})")
                    _move_to(x1, y1)
                    time.sleep(0.05)
                    _held_btn = BTN_LEFT
                    _mouse_abs(BTN_LEFT, coord_to_abs(_cur_x), coord_to_abs(_cur_y))
                    time.sleep(0.05)
                    _move_to(x2, y2, btn=BTN_LEFT)
                    time.sleep(0.05)
                    _held_btn = 0
                    _mouse_abs(0, coord_to_abs(_cur_x), coord_to_abs(_cur_y))
                    time.sleep(0.05)

                elif t == 'wait':
                    secs = action.get('seconds', 1)
                    print(f"[usb-hid] wait {secs}s")
                    time.sleep(secs)

                else:
                    print(f"[usb-hid] Unknown action type: {t} in {action}")
                    results.append({'action': action, 'status': f'error:unknown_type {t}'})
                    continue

                results.append({'action': action, 'status': 'ok'})

            except Exception as e:
                print(f'[usb-hid] Exception processing {action}: {e}')
                import traceback
                traceback.print_exc()
                results.append({'action': action, 'status': f'error:{e}'})
        return results


def cleanup():
    global _held_btn, _cur_x, _cur_y
    with _lock:
        try:
            _held_btn = 0
            if _ms_fd:
                _mouse_abs(0, coord_to_abs(_cur_x), coord_to_abs(_cur_y))
            if _kb_fd:
                _w('kb', KB_RELEASE)
        except Exception as e:
            print(f"[usb-hid] cleanup error: {e}")
        _close_fds()
        print("[usb-hid] Closed devices, reset mouse + keyboard state")
