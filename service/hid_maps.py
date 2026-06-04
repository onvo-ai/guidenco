# tools/hid_maps.py
"""
HID Keyboard and Mouse codes, key mappings, and modifier definitions.
Separating these configs makes tools and action scripts more modular and easier to read.
"""

MOD_NONE = 0x00
MOD_LCTRL = 0x01
MOD_LSHIFT = 0x02
MOD_LALT = 0x04
MOD_LGUI = 0x08

KEYMAP = {
    'a': (MOD_NONE, 0x04), 'b': (MOD_NONE, 0x05), 'c': (MOD_NONE, 0x06), 'd': (MOD_NONE, 0x07),
    'e': (MOD_NONE, 0x08), 'f': (MOD_NONE, 0x09), 'g': (MOD_NONE, 0x0a), 'h': (MOD_NONE, 0x0b),
    'i': (MOD_NONE, 0x0c), 'j': (MOD_NONE, 0x0d), 'k': (MOD_NONE, 0x0e), 'l': (MOD_NONE, 0x0f),
    'm': (MOD_NONE, 0x10), 'n': (MOD_NONE, 0x11), 'o': (MOD_NONE, 0x12), 'p': (MOD_NONE, 0x13),
    'q': (MOD_NONE, 0x14), 'r': (MOD_NONE, 0x15), 's': (MOD_NONE, 0x16), 't': (MOD_NONE, 0x17),
    'u': (MOD_NONE, 0x18), 'v': (MOD_NONE, 0x19), 'w': (MOD_NONE, 0x1a), 'x': (MOD_NONE, 0x1b),
    'y': (MOD_NONE, 0x1c), 'z': (MOD_NONE, 0x1d),
    'A': (MOD_LSHIFT, 0x04), 'B': (MOD_LSHIFT, 0x05), 'C': (MOD_LSHIFT, 0x06), 'D': (MOD_LSHIFT, 0x07),
    'E': (MOD_LSHIFT, 0x08), 'F': (MOD_LSHIFT, 0x09), 'G': (MOD_LSHIFT, 0x0a), 'H': (MOD_LSHIFT, 0x0b),
    'I': (MOD_LSHIFT, 0x0c), 'J': (MOD_LSHIFT, 0x0d), 'K': (MOD_LSHIFT, 0x0e), 'L': (MOD_LSHIFT, 0x0f),
    'M': (MOD_LSHIFT, 0x10), 'N': (MOD_LSHIFT, 0x11), 'O': (MOD_LSHIFT, 0x12), 'P': (MOD_LSHIFT, 0x13),
    'Q': (MOD_LSHIFT, 0x14), 'R': (MOD_LSHIFT, 0x15), 'S': (MOD_LSHIFT, 0x16), 'T': (MOD_LSHIFT, 0x17),
    'U': (MOD_LSHIFT, 0x18), 'V': (MOD_LSHIFT, 0x19), 'W': (MOD_LSHIFT, 0x1a), 'X': (MOD_LSHIFT, 0x1b),
    'Y': (MOD_LSHIFT, 0x1c), 'Z': (MOD_LSHIFT, 0x1d),
    '1': (MOD_NONE, 0x1e), '2': (MOD_NONE, 0x1f), '3': (MOD_NONE, 0x20), '4': (MOD_NONE, 0x21),
    '5': (MOD_NONE, 0x22), '6': (MOD_NONE, 0x23), '7': (MOD_NONE, 0x24), '8': (MOD_NONE, 0x25),
    '9': (MOD_NONE, 0x26), '0': (MOD_NONE, 0x27),
    '!': (MOD_LSHIFT, 0x1e), '@': (MOD_LSHIFT, 0x1f), '#': (MOD_LSHIFT, 0x20),
    '$': (MOD_LSHIFT, 0x21), '%': (MOD_LSHIFT, 0x22), '^': (MOD_LSHIFT, 0x23),
    '&': (MOD_LSHIFT, 0x24), '*': (MOD_LSHIFT, 0x25), '(': (MOD_LSHIFT, 0x26), ')': (MOD_LSHIFT, 0x27),
    ' ': (MOD_NONE, 0x2c), '\n': (MOD_NONE, 0x28), '\t': (MOD_NONE, 0x2b),
    '-': (MOD_NONE, 0x2d), '_': (MOD_LSHIFT, 0x2d), '=': (MOD_NONE, 0x2e), '+': (MOD_LSHIFT, 0x2e),
    '[': (MOD_NONE, 0x2f), '{': (MOD_LSHIFT, 0x2f), ']': (MOD_NONE, 0x30), '}': (MOD_LSHIFT, 0x30),
    '\\': (MOD_NONE, 0x31), '|': (MOD_LSHIFT, 0x31), ';': (MOD_NONE, 0x33), ':': (MOD_LSHIFT, 0x33),
    "'": (MOD_NONE, 0x34), '"': (MOD_LSHIFT, 0x34), '`': (MOD_NONE, 0x35), '~': (MOD_LSHIFT, 0x35),
    ',': (MOD_NONE, 0x36), '<': (MOD_LSHIFT, 0x36), '.': (MOD_NONE, 0x37), '>': (MOD_LSHIFT, 0x37),
    '/': (MOD_NONE, 0x38), '?': (MOD_LSHIFT, 0x38),
}

NAMED_KEYS = {
    'esc': (MOD_NONE, 0x29), 'escape': (MOD_NONE, 0x29), 'backspace': (MOD_NONE, 0x2a),
    'tab': (MOD_NONE, 0x2b), 'return': (MOD_NONE, 0x28), 'enter': (MOD_NONE, 0x28),
    'space': (MOD_NONE, 0x2c), 'delete': (MOD_NONE, 0x4c),
    'home': (MOD_NONE, 0x4a), 'end': (MOD_NONE, 0x4d),
    'pageup': (MOD_NONE, 0x4b), 'pagedown': (MOD_NONE, 0x4e),
    'left': (MOD_NONE, 0x50), 'right': (MOD_NONE, 0x4f), 'up': (MOD_NONE, 0x52), 'down': (MOD_NONE, 0x51),
    'f1': (MOD_NONE, 0x3a), 'f2': (MOD_NONE, 0x3b), 'f3': (MOD_NONE, 0x3c), 'f4': (MOD_NONE, 0x3d),
    'f5': (MOD_NONE, 0x3e), 'f6': (MOD_NONE, 0x3f), 'f7': (MOD_NONE, 0x40), 'f8': (MOD_NONE, 0x41),
    'f9': (MOD_NONE, 0x42), 'f10': (MOD_NONE, 0x43), 'f11': (MOD_NONE, 0x44), 'f12': (MOD_NONE, 0x45),
}

MOD_NAMES = {
    'cmd': MOD_LGUI, 'super': MOD_LGUI, 'win': MOD_LGUI,
    'ctrl': MOD_LCTRL, 'control': MOD_LCTRL,
    'alt': MOD_LALT, 'option': MOD_LALT,
    'shift': MOD_LSHIFT,
}

# ── Browser KeyboardEvent.key → HID ───────────────────────────────────────────
# Manual mode (DeviceViewer.tsx) sends {type:'key', key:<e.key>, modifiers:{…}}.
# Printable keys arrive as their literal char (' ', 'a', 'A', '!') and resolve
# via KEYMAP.  These are the non-printable named keys that don't.
JS_NAMED = {
    'Enter': 0x28, 'Tab': 0x2b, 'Backspace': 0x2a, 'Escape': 0x29,
    'Delete': 0x4c, 'Insert': 0x49,
    'Home': 0x4a, 'End': 0x4d, 'PageUp': 0x4b, 'PageDown': 0x4e,
    'ArrowUp': 0x52, 'ArrowDown': 0x51, 'ArrowLeft': 0x50, 'ArrowRight': 0x4f,
    'CapsLock': 0x39, 'NumLock': 0x53, 'ScrollLock': 0x47,
    'PrintScreen': 0x46, 'Pause': 0x48, 'ContextMenu': 0x65,
    'F1': 0x3a, 'F2': 0x3b, 'F3': 0x3c, 'F4': 0x3d, 'F5': 0x3e, 'F6': 0x3f,
    'F7': 0x40, 'F8': 0x41, 'F9': 0x42, 'F10': 0x43, 'F11': 0x44, 'F12': 0x45,
}

# Standalone modifier keydowns (e.g. the Windows key pressed by itself to open
# the Start menu).  e.key for the Windows key is 'Meta'.
JS_MODIFIER_KEYS = {
    'Shift': MOD_LSHIFT, 'Control': MOD_LCTRL, 'Alt': MOD_LALT,
    'Meta': MOD_LGUI, 'OS': MOD_LGUI,
}

KB_RELEASE = bytes([0, 0, 0, 0, 0, 0, 0, 0])      # 8 bytes
MOUSE_RELEASE = bytes([0, 0, 0, 0, 0])            # 5 bytes

BTN_LEFT = 0x01
BTN_RIGHT = 0x02
BTN_MIDDLE = 0x04

BTN_MAP = {1: BTN_LEFT, 2: BTN_MIDDLE, 3: BTN_RIGHT}
