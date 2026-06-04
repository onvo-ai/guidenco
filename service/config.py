import os

# Video capture device
VIDEO_DEV    = os.environ.get("VIDEO_DEV", "/dev/video0")
# "usb_capture"   — USB HDMI capture card (e.g. Macrosilicon MS2109)
# "csi_tc358743"  — HDMI-to-CSI adapter using the TC358743 chip
CAPTURE_TYPE = os.environ.get("CAPTURE_TYPE", "usb_capture")
NATIVE_W  = 1920   # TC358743 capture resolution (hardware, do not change)
NATIVE_H  = 1080
STREAM_W  = 960    # WebRTC stream width  — 960×540 keeps VP8 SW-encode within Pi Zero 2W budget
STREAM_H  = 540    # WebRTC stream height — 56% more pixels than 480p, half the cost of 720p

STREAM_FPS   = int(os.environ.get("STREAM_FPS", "10"))

# USB HID coordinate space (0–1000 maps to full screen)
COORD_SPACE = 1000
ABS_MAX     = 32767  # USB HID absolute mouse range

# Cloud relay — written to /etc/guidenco/device.env by install.sh
DEVICE_TOKEN = os.environ.get("DEVICE_TOKEN", "")
CLOUD_URL    = os.environ.get("CLOUD_URL", "https://guidenco.app")
