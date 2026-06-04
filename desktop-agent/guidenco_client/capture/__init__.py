"""Screen capture — backend selected by sys.platform."""
import sys

if sys.platform in ("darwin", "linux", "win32"):
    from .mss_backend import MssCapture as CaptureSource
else:
    raise RuntimeError(f"Unsupported platform: {sys.platform}")

__all__ = ["CaptureSource"]
