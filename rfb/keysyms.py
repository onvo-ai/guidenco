"""
rfb/keysyms.py — X11 keysyms (what VNC sends) to USB HID usage codes.

VNC never sends characters. It sends X11 keysyms with separate down and up
events, and the client is responsible for sequencing modifiers. So a key event
maps to at most one HID usage plus, for characters that need it on a US layout,
an implied Shift.

The implied Shift matters: a well-behaved client sends Shift_L down before the
'A' keysym, in which case ours is redundant and harmless. A client that
synthesises text without modifier events — some automation libraries do — would
otherwise type lowercase. Asserting it covers both.

Layout note: this is a US layout. The target machine decides what a scan code
means, so a target set to a non-US layout will produce different punctuation.
That is inherent to HID injection, not something this bridge can fix.
"""

# ── HID modifier bits (byte 0 of the boot keyboard report) ────────────────────
MOD_LCTRL, MOD_LSHIFT, MOD_LALT, MOD_LGUI = 0x01, 0x02, 0x04, 0x08
MOD_RCTRL, MOD_RSHIFT, MOD_RALT, MOD_RGUI = 0x10, 0x20, 0x40, 0x80

#: keysym → modifier bit. These never occupy a key slot in the report.
MODIFIERS = {
    0xFFE1: MOD_LSHIFT, 0xFFE2: MOD_RSHIFT,
    0xFFE3: MOD_LCTRL,  0xFFE4: MOD_RCTRL,
    0xFFE9: MOD_LALT,   0xFFEA: MOD_RALT,
    0xFFE7: MOD_LGUI,   0xFFE8: MOD_RGUI,   # Meta_L / Meta_R
    0xFFEB: MOD_LGUI,   0xFFEC: MOD_RGUI,   # Super_L / Super_R
    0xFE03: MOD_RALT,                        # ISO_Level3_Shift (AltGr)
}

# ── Printable US-layout characters → (usage, needs_shift) ─────────────────────
_UNSHIFTED = {
    "a": 0x04, "b": 0x05, "c": 0x06, "d": 0x07, "e": 0x08, "f": 0x09, "g": 0x0A,
    "h": 0x0B, "i": 0x0C, "j": 0x0D, "k": 0x0E, "l": 0x0F, "m": 0x10, "n": 0x11,
    "o": 0x12, "p": 0x13, "q": 0x14, "r": 0x15, "s": 0x16, "t": 0x17, "u": 0x18,
    "v": 0x19, "w": 0x1A, "x": 0x1B, "y": 0x1C, "z": 0x1D,
    "1": 0x1E, "2": 0x1F, "3": 0x20, "4": 0x21, "5": 0x22,
    "6": 0x23, "7": 0x24, "8": 0x25, "9": 0x26, "0": 0x27,
    " ": 0x2C, "-": 0x2D, "=": 0x2E, "[": 0x2F, "]": 0x30, "\\": 0x31,
    ";": 0x33, "'": 0x34, "`": 0x35, ",": 0x36, ".": 0x37, "/": 0x38,
}

#: Shifted character → the key that produces it.
_SHIFTED = {
    "!": "1", "@": "2", "#": "3", "$": "4", "%": "5",
    "^": "6", "&": "7", "*": "8", "(": "9", ")": "0",
    "_": "-", "+": "=", "{": "[", "}": "]", "|": "\\",
    ":": ";", '"': "'", "~": "`", "<": ",", ">": ".", "?": "/",
}

# ── Non-printable keys: keysym → usage ────────────────────────────────────────
_SPECIAL = {
    0xFF08: 0x2A,  # BackSpace
    0xFF09: 0x2B,  # Tab
    0xFE20: 0x2B,  # ISO_Left_Tab (shift-tab; client sends Shift itself)
    0xFF0D: 0x28,  # Return
    0xFF8D: 0x58,  # KP_Enter
    0xFF1B: 0x29,  # Escape
    0xFFFF: 0x4C,  # Delete
    0xFF63: 0x49,  # Insert
    0xFF50: 0x4A,  # Home
    0xFF57: 0x4D,  # End
    0xFF55: 0x4B,  # Page_Up
    0xFF56: 0x4E,  # Page_Down
    0xFF51: 0x50,  # Left
    0xFF52: 0x52,  # Up
    0xFF53: 0x4F,  # Right
    0xFF54: 0x51,  # Down
    0xFF13: 0x48,  # Pause
    0xFF14: 0x47,  # Scroll_Lock
    0xFF61: 0x46,  # Print
    0xFF15: 0x46,  # Sys_Req — same physical key as Print
    0xFFE5: 0x39,  # Caps_Lock
    0xFF7F: 0x53,  # Num_Lock
    0xFF67: 0x65,  # Menu / Application
    # Numeric keypad
    0xFFAA: 0x55, 0xFFAB: 0x57, 0xFFAD: 0x56, 0xFFAF: 0x54, 0xFFAE: 0x63,
    0xFFAC: 0x63,  # KP_Separator
    0xFFB0: 0x62, 0xFFB1: 0x59, 0xFFB2: 0x5A, 0xFFB3: 0x5B, 0xFFB4: 0x5C,
    0xFFB5: 0x5D, 0xFFB6: 0x5E, 0xFFB7: 0x5F, 0xFFB8: 0x60, 0xFFB9: 0x61,
}
# F1–F12 are contiguous in both spaces, and so are F13–F24.
_SPECIAL.update({0xFFBE + n: 0x3A + n for n in range(12)})
_SPECIAL.update({0xFFCA + n: 0x68 + n for n in range(12)})


def _build_table() -> dict[int, tuple[int, bool]]:
    table: dict[int, tuple[int, bool]] = {}
    for char, usage in _UNSHIFTED.items():
        table[ord(char)] = (usage, False)
    for char, base in _SHIFTED.items():
        table[ord(char)] = (_UNSHIFTED[base], True)
    for char in "abcdefghijklmnopqrstuvwxyz":
        table[ord(char.upper())] = (_UNSHIFTED[char], True)
    for keysym, usage in _SPECIAL.items():
        table[keysym] = (usage, False)
    return table


#: keysym → (HID usage code, whether Shift must be asserted)
KEYSYM_TO_USAGE = _build_table()


def lookup(keysym: int) -> tuple[int, bool] | None:
    """
    Resolve a keysym to (usage, needs_shift), or None if we can't type it.

    Unicode keysyms above the Latin-1 range use the 0x01000000 + codepoint
    encoding; those that land on a US key (rare, but clients do emit them for
    plain ASCII) are folded back here.
    """
    entry = KEYSYM_TO_USAGE.get(keysym)
    if entry is not None:
        return entry
    if 0x01000000 <= keysym <= 0x0110FFFF:
        return KEYSYM_TO_USAGE.get(keysym - 0x01000000)
    return None
