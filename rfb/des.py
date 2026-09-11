"""
rfb/des.py — minimal DES, needed only for VNC Authentication.

VNC Auth is a DES-ECB challenge-response: the server sends 16 random bytes, the
client encrypts them with the password as key, and the server checks the result.
DES is not in the Python standard library and pulling a crypto package onto the
Pi would mean pip, a venv and a compiler for the sake of one 8-byte block
cipher — so it lives here, in about a hundred lines of table lookups.

This is NOT a general-purpose crypto module. VNC Auth is weak by construction
(8-byte key, unauthenticated, replayable) and is used here only because it is
what every VNC client speaks. Treat port 5900 as a trusted-network service.
"""

# ── Permutation tables (FIPS 46-3) ────────────────────────────────────────────

_PC1 = [57, 49, 41, 33, 25, 17,  9,  1, 58, 50, 42, 34, 26, 18,
        10,  2, 59, 51, 43, 35, 27, 19, 11,  3, 60, 52, 44, 36,
        63, 55, 47, 39, 31, 23, 15,  7, 62, 54, 46, 38, 30, 22,
        14,  6, 61, 53, 45, 37, 29, 21, 13,  5, 28, 20, 12,  4]

_PC2 = [14, 17, 11, 24,  1,  5,  3, 28, 15,  6, 21, 10,
        23, 19, 12,  4, 26,  8, 16,  7, 27, 20, 13,  2,
        41, 52, 31, 37, 47, 55, 30, 40, 51, 45, 33, 48,
        44, 49, 39, 56, 34, 53, 46, 42, 50, 36, 29, 32]

_IP = [58, 50, 42, 34, 26, 18, 10, 2, 60, 52, 44, 36, 28, 20, 12, 4,
       62, 54, 46, 38, 30, 22, 14, 6, 64, 56, 48, 40, 32, 24, 16, 8,
       57, 49, 41, 33, 25, 17,  9, 1, 59, 51, 43, 35, 27, 19, 11, 3,
       61, 53, 45, 37, 29, 21, 13, 5, 63, 55, 47, 39, 31, 23, 15, 7]

_FP = [40, 8, 48, 16, 56, 24, 64, 32, 39, 7, 47, 15, 55, 23, 63, 31,
       38, 6, 46, 14, 54, 22, 62, 30, 37, 5, 45, 13, 53, 21, 61, 29,
       36, 4, 44, 12, 52, 20, 60, 28, 35, 3, 43, 11, 51, 19, 59, 27,
       34, 2, 42, 10, 50, 18, 58, 26, 33, 1, 41,  9, 49, 17, 57, 25]

_E = [32,  1,  2,  3,  4,  5,  4,  5,  6,  7,  8,  9,
       8,  9, 10, 11, 12, 13, 12, 13, 14, 15, 16, 17,
      16, 17, 18, 19, 20, 21, 20, 21, 22, 23, 24, 25,
      24, 25, 26, 27, 28, 29, 28, 29, 30, 31, 32,  1]

_P = [16, 7, 20, 21, 29, 12, 28, 17, 1, 15, 23, 26, 5, 18, 31, 10,
       2, 8, 24, 14, 32, 27,  3,  9, 19, 13, 30,  6, 22, 11,  4, 25]

_SHIFTS = [1, 1, 2, 2, 2, 2, 2, 2, 1, 2, 2, 2, 2, 2, 2, 1]

_S = [
    [14, 4, 13, 1, 2, 15, 11, 8, 3, 10, 6, 12, 5, 9, 0, 7,
      0, 15, 7, 4, 14, 2, 13, 1, 10, 6, 12, 11, 9, 5, 3, 8,
      4, 1, 14, 8, 13, 6, 2, 11, 15, 12, 9, 7, 3, 10, 5, 0,
     15, 12, 8, 2, 4, 9, 1, 7, 5, 11, 3, 14, 10, 0, 6, 13],
    [15, 1, 8, 14, 6, 11, 3, 4, 9, 7, 2, 13, 12, 0, 5, 10,
      3, 13, 4, 7, 15, 2, 8, 14, 12, 0, 1, 10, 6, 9, 11, 5,
      0, 14, 7, 11, 10, 4, 13, 1, 5, 8, 12, 6, 9, 3, 2, 15,
     13, 8, 10, 1, 3, 15, 4, 2, 11, 6, 7, 12, 0, 5, 14, 9],
    [10, 0, 9, 14, 6, 3, 15, 5, 1, 13, 12, 7, 11, 4, 2, 8,
     13, 7, 0, 9, 3, 4, 6, 10, 2, 8, 5, 14, 12, 11, 15, 1,
     13, 6, 4, 9, 8, 15, 3, 0, 11, 1, 2, 12, 5, 10, 14, 7,
      1, 10, 13, 0, 6, 9, 8, 7, 4, 15, 14, 3, 11, 5, 2, 12],
    [7, 13, 14, 3, 0, 6, 9, 10, 1, 2, 8, 5, 11, 12, 4, 15,
     13, 8, 11, 5, 6, 15, 0, 3, 4, 7, 2, 12, 1, 10, 14, 9,
     10, 6, 9, 0, 12, 11, 7, 13, 15, 1, 3, 14, 5, 2, 8, 4,
      3, 15, 0, 6, 10, 1, 13, 8, 9, 4, 5, 11, 12, 7, 2, 14],
    [2, 12, 4, 1, 7, 10, 11, 6, 8, 5, 3, 15, 13, 0, 14, 9,
     14, 11, 2, 12, 4, 7, 13, 1, 5, 0, 15, 10, 3, 9, 8, 6,
      4, 2, 1, 11, 10, 13, 7, 8, 15, 9, 12, 5, 6, 3, 0, 14,
     11, 8, 12, 7, 1, 14, 2, 13, 6, 15, 0, 9, 10, 4, 5, 3],
    [12, 1, 10, 15, 9, 2, 6, 8, 0, 13, 3, 4, 14, 7, 5, 11,
     10, 15, 4, 2, 7, 12, 9, 5, 6, 1, 13, 14, 0, 11, 3, 8,
      9, 14, 15, 5, 2, 8, 12, 3, 7, 0, 4, 10, 1, 13, 11, 6,
      4, 3, 2, 12, 9, 5, 15, 10, 11, 14, 1, 7, 6, 0, 8, 13],
    [4, 11, 2, 14, 15, 0, 8, 13, 3, 12, 9, 7, 5, 10, 6, 1,
     13, 0, 11, 7, 4, 9, 1, 10, 14, 3, 5, 12, 2, 15, 8, 6,
      1, 4, 11, 13, 12, 3, 7, 14, 10, 15, 6, 8, 0, 5, 9, 2,
      6, 11, 13, 8, 1, 4, 10, 7, 9, 5, 0, 15, 14, 2, 3, 12],
    [13, 2, 8, 4, 6, 15, 11, 1, 10, 9, 3, 14, 5, 0, 12, 7,
      1, 15, 13, 8, 10, 3, 7, 4, 12, 5, 6, 11, 0, 14, 9, 2,
      7, 11, 4, 1, 9, 12, 14, 2, 0, 6, 10, 13, 15, 3, 5, 8,
      2, 1, 14, 7, 4, 10, 8, 13, 15, 12, 9, 0, 3, 5, 6, 11],
]


# ── Bit helpers ───────────────────────────────────────────────────────────────

def _bits(data: bytes) -> list[int]:
    return [(byte >> (7 - i)) & 1 for byte in data for i in range(8)]


def _bytes(bits: list[int]) -> bytes:
    return bytes(
        sum(bit << (7 - i) for i, bit in enumerate(bits[n:n + 8]))
        for n in range(0, len(bits), 8)
    )


def _permute(bits: list[int], table: list[int]) -> list[int]:
    return [bits[i - 1] for i in table]


def _subkeys(key: bytes) -> list[list[int]]:
    cd = _permute(_bits(key), _PC1)
    c, d = cd[:28], cd[28:]
    keys = []
    for shift in _SHIFTS:
        c = c[shift:] + c[:shift]
        d = d[shift:] + d[:shift]
        keys.append(_permute(c + d, _PC2))
    return keys


def _feistel(right: list[int], subkey: list[int]) -> list[int]:
    expanded = [a ^ b for a, b in zip(_permute(right, _E), subkey)]
    out: list[int] = []
    for box in range(8):
        chunk = expanded[box * 6:box * 6 + 6]
        row = (chunk[0] << 1) | chunk[5]
        col = (chunk[1] << 3) | (chunk[2] << 2) | (chunk[3] << 1) | chunk[4]
        value = _S[box][row * 16 + col]
        out += [(value >> (3 - i)) & 1 for i in range(4)]
    return _permute(out, _P)


def encrypt_block(key: bytes, block: bytes) -> bytes:
    """Encrypt one 8-byte block with an 8-byte key."""
    if len(key) != 8 or len(block) != 8:
        raise ValueError("DES operates on 8-byte keys and blocks")
    keys = _subkeys(key)
    bits = _permute(_bits(block), _IP)
    left, right = bits[:32], bits[32:]
    for subkey in keys:
        left, right = right, [a ^ b for a, b in zip(left, _feistel(right, subkey))]
    return _bytes(_permute(right + left, _FP))


# ── VNC-specific key handling ─────────────────────────────────────────────────

_REVERSED = bytes(int(f"{b:08b}"[::-1], 2) for b in range(256))


def vnc_key(password: str) -> bytes:
    """
    Turn a VNC password into a DES key.

    VNC truncates or zero-pads the password to 8 bytes and then reverses the bit
    order within each byte. The reversal is not a security measure — it is an
    accident of the original implementation that every client now reproduces.
    """
    raw = password.encode("latin-1", errors="replace")[:8].ljust(8, b"\x00")
    return bytes(_REVERSED[b] for b in raw)


def vnc_response(password: str, challenge: bytes) -> bytes:
    """The 16-byte response a client owes for a 16-byte VNC Auth challenge."""
    if len(challenge) != 16:
        raise ValueError("VNC Auth challenge must be 16 bytes")
    key = vnc_key(password)
    return encrypt_block(key, challenge[:8]) + encrypt_block(key, challenge[8:])
