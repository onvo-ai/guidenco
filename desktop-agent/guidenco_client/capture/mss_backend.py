"""Cross-platform screen capture using mss + Pillow."""
import io

import mss
from PIL import Image


class MssCapture:
    """Captures the primary monitor. Frames are downscaled to <= 1280 px wide
    for streaming. The full-resolution screen size is preserved separately for
    input-coordinate scaling."""

    def __init__(self, max_width: int = 1280, jpeg_quality: int = 70) -> None:
        self._sct = mss.mss()
        # monitors[0] is the "all monitors" virtual, monitors[1] is primary
        self._monitor = self._sct.monitors[1]
        self._max_width = max_width
        self._jpeg_quality = jpeg_quality

    @property
    def screen_size(self) -> tuple[int, int]:
        """Real (un-downscaled) screen dimensions of the primary monitor."""
        return self._monitor["width"], self._monitor["height"]

    def _grab(self) -> Image.Image:
        raw = self._sct.grab(self._monitor)
        img = Image.frombytes("RGB", raw.size, raw.bgra, "raw", "BGRX")
        if img.width > self._max_width:
            ratio = self._max_width / img.width
            new_h = int(img.height * ratio)
            img = img.resize((self._max_width, new_h), Image.BILINEAR)
        return img

    def get_frame_jpeg(self) -> bytes:
        img = self._grab()
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=self._jpeg_quality)
        return buf.getvalue()

    def close(self) -> None:
        self._sct.close()
