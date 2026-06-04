"""Input injection — backend selected by sys.platform."""
import sys

if sys.platform in ("darwin", "linux", "win32"):
    from .pynput_backend import PynputInput as InputSink
else:
    raise RuntimeError(f"Unsupported platform: {sys.platform}")

__all__ = ["InputSink"]
