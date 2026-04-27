from config import COORD_SPACE

ABS_MAX = 32767

def scale(val, lo=1, hi=COORD_SPACE):
    return max(lo, min(hi, int(val)))

def coord_to_abs(coord, max_coord=COORD_SPACE):
    coord = max(0, min(max_coord, int(coord)))
    return max(0, min(ABS_MAX, round(coord * ABS_MAX / max_coord)))
