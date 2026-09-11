"""
hid/keys.py — names and characters to USB HID usage codes.

The API takes intent rather than events: "type this string", "press ctrl+c".
So there are two lookups here — one from a character to the key that produces
it, and one from a key name to its usage code — plus the modifier names that
can prefix a combo.

Layout note: this is a US layout. The target machine decides what a scan code
means, so a target set to a different layout will produce different
punctuation. That is inherent to injecting HID scan codes and not something
this bridge can detect or correct.
"""

# ── Modifier bits (byte 0 of the boot keyboard report) ────────────────────────
MOD_LCTRL, MOD_LSHIFT, MOD_LALT, MOD_LGUI = 0x01, 0x02, 0x04, 0x08
MOD_RCTRL, MOD_RSHIFT, MOD_RALT, MOD_RGUI = 0x10, 0x20, 0x40, 0x80

#: Modifier names accepted in a combo, generously aliased. The GUI bit is the
#: same key whatever the platform calls it — Command, Super, Windows, Meta.
MODIFIERS = {
    "ctrl": MOD_LCTRL, "control": MOD_LCTRL,
    "shift": MOD_LSHIFT,
    "alt": MOD_LALT, "option": MOD_LALT, "opt": MOD_LALT,
    "cmd": MOD_LGUI, "command": MOD_LGUI, "super": MOD_LGUI,
    "win": MOD_LGUI, "windows": MOD_LGUI, "meta": MOD_LGUI, "gui": MOD_LGUI,
    "rctrl": MOD_RCTRL, "rshift": MOD_RSHIFT, "ralt": MOD_RALT,
    "altgr": MOD_RALT, "rcmd": MOD_RGUI,
}

# ── Characters, US layout ─────────────────────────────────────────────────────
_UNSHIFTED = {
    "a": 0x04, "b": 0x05, "c": 0x06, "d": 0x07, "e": 0x08, "f": 0x09, "g": 0x0A,
    "h": 0x0B, "i": 0x0C, "j": 0x0D, "k": 0x0E, "l": 0x0F, "m": 0x10, "n": 0x11,
    "o": 0x12, "p": 0x13, "q": 0x14, "r": 0x15, "s": 0x16, "t": 0x17, "u": 0x18,
    "v": 0x19, "w": 0x1A, "x": 0x1B, "y": 0x1C, "z": 0x1D,
    "1": 0x1E, "2": 0x1F, "3": 0x20, "4": 0x21, "5": 0x22,
    "6": 0x23, "7": 0x24, "8": 0x25, "9": 0x26, "0": 0x27,
    "\n": 0x28, "\t": 0x2B, " ": 0x2C,
    "-": 0x2D, "=": 0x2E, "[": 0x2F, "]": 0x30, "\\": 0x31,
    ";": 0x33, "'": 0x34, "`": 0x35, ",": 0x36, ".": 0x37, "/": 0x38,
}

#: Shifted character -> the unshifted key that produces it.
_SHIFTED = {
    "!": "1", "@": "2", "#": "3", "$": "4", "%": "5",
    "^": "6", "&": "7", "*": "8", "(": "9", ")": "0",
    "_": "-", "+": "=", "{": "[", "}": "]", "|": "\\",
    ":": ";", '"': "'", "~": "`", "<": ",", ">": ".", "?": "/",
}

# ── Named keys ────────────────────────────────────────────────────────────────
NAMED = {
    "return": 0x28, "enter": 0x28, "kp_enter": 0x58,
    "escape": 0x29, "esc": 0x29,
    "backspace": 0x2A, "bksp": 0x2A, "delete_back": 0x2A,
    "tab": 0x2B, "space": 0x2C, "spacebar": 0x2C,
    "capslock": 0x39,
    "printscreen": 0x46, "prtsc": 0x46, "scrolllock": 0x47, "pause": 0x48,
    "insert": 0x49, "home": 0x4A, "pageup": 0x4B, "pgup": 0x4B,
    "delete": 0x4C, "del": 0x4C, "forwarddelete": 0x4C,
    "end": 0x4D, "pagedown": 0x4E, "pgdn": 0x4E,
    "right": 0x4F, "left": 0x50, "down": 0x51, "up": 0x52,
    "numlock": 0x53, "menu": 0x65, "application": 0x65,
    "kp_divide": 0x54, "kp_multiply": 0x55, "kp_subtract": 0x56,
    "kp_add": 0x57, "kp_decimal": 0x63,
}
NAMED.update({f"f{n}": 0x39 + n for n in range(1, 13)})       # F1-F12  -> 0x3A-0x45
NAMED.update({f"f{n}": 0x68 + (n - 13) for n in range(13, 25)})  # F13-F24 -> 0x68-0x73
NAMED.update({f"kp{n}": 0x59 + (n - 1) for n in range(1, 10)})
NAMED["kp0"] = 0x62


def _build_chars() -> dict[str, tuple[int, bool]]:
    table: dict[str, tuple[int, bool]] = {}
    for char, usage in _UNSHIFTED.items():
        table[char] = (usage, False)
    for char, base in _SHIFTED.items():
        table[char] = (_UNSHIFTED[base], True)
    for char in "abcdefghijklmnopqrstuvwxyz":
        table[char.upper()] = (_UNSHIFTED[char], True)
    table["\r"] = table["\n"]
    return table


#: character -> (usage code, whether Shift is required)
CHARS = _build_chars()


class UnknownKey(ValueError):
    """Raised for a key name or character with no US-layout mapping."""


def parse_combo(combo: str) -> tuple[int, int]:
    """
    Turn "ctrl+shift+t" into (modifier_bits, usage_code).

    The final segment is the key itself and may be a name ("Return", "F5") or a
    single character ("t", "/"). Everything before it must be a modifier.
    """
    parts = [p.strip() for p in combo.split("+") if p.strip()]
    if not parts:
        raise UnknownKey("empty key combination")

    # A trailing "+" means the key IS plus, e.g. "ctrl++".
    if combo.rstrip().endswith("+") and len(parts) >= 1:
        parts.append("+")

    modifiers = 0
    for name in parts[:-1]:
        bit = MODIFIERS.get(name.lower())
        if bit is None:
            raise UnknownKey(f"unknown modifier {name!r} in {combo!r}")
        modifiers |= bit

    key = parts[-1]
    usage = NAMED.get(key.lower())
    if usage is not None:
        return modifiers, usage

    entry = CHARS.get(key) or CHARS.get(key.lower())
    if entry is None:
        raise UnknownKey(f"unknown key {key!r} in {combo!r}")
    usage, needs_shift = entry
    if needs_shift:
        modifiers |= MOD_LSHIFT
    return modifiers, usage
