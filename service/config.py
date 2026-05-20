import os

SCALE_RATIO = 1.0

NATIVE_W = 1920
NATIVE_H = 1080

SCALED_W = int(NATIVE_W * SCALE_RATIO)
SCALED_H = int(NATIVE_H * SCALE_RATIO)

COORD_SPACE = 1000

VIDEO_DEV = "/dev/video0"

# Project paths — single source of truth, shared across server, agent, and tools.
ROOT = os.path.dirname(os.path.abspath(__file__))
TEMP_DIR = os.path.join(ROOT, "temp")
SETTINGS_PATH = os.path.join(ROOT, "settings.json")

# Cloud relay — set via /etc/guidenco/device.env on the Pi
DEVICE_ID    = os.environ.get("DEVICE_ID", "")
DEVICE_TOKEN = os.environ.get("DEVICE_TOKEN", "")
CLOUD_URL    = os.environ.get("CLOUD_URL", "https://openclaw.ai")