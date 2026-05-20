import os

# Video capture device
VIDEO_DEV = os.environ.get("VIDEO_DEV", "/dev/video0")
NATIVE_W  = 1920
NATIVE_H  = 1080

# USB HID coordinate space (0–1000 maps to full screen)
COORD_SPACE = 1000
ABS_MAX     = 32767  # USB HID absolute mouse range

# Cloud relay — written to /etc/guidenco/device.env by install.sh
DEVICE_TOKEN = os.environ.get("DEVICE_TOKEN", "")
CLOUD_URL    = os.environ.get("CLOUD_URL", "https://guidenco.app")
