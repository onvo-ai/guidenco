#!/usr/bin/env bash
# Guidenco Pi installer — Ubuntu Server, all Pi models
# Supports: USB HDMI capture cards  AND  HDMI-to-CSI adapters (TC358743)
# Usage:  curl -fsSL https://guidenco.app/install.sh | bash
set -euo pipefail

CLOUD_URL="${GUIDENCO_CLOUD_URL:-https://guidenco.app}"
REPO_TARBALL="${GUIDENCO_TARBALL:-https://github.com/YOUR_ORG/guidenco/archive/refs/heads/main.tar.gz}"
INSTALL_DIR="/opt/guidenco"
ENV_FILE="/etc/guidenco/device.env"
SERVICE_FILE="/etc/systemd/system/guidenco.service"
HID_SCRIPT="/usr/local/bin/guidenco-hid-setup"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BOLD='\033[1m'; NC='\033[0m'
info()  { echo -e "${GREEN}[guidenco]${NC} $*"; }
warn()  { echo -e "${YELLOW}[guidenco] WARN:${NC} $*"; }
error() { echo -e "${RED}[guidenco] ERROR:${NC} $*" >&2; exit 1; }
box()   {
  echo ""
  echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  while IFS= read -r line; do echo -e "  $line"; done <<< "$1"
  echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo ""
}

# ── 1. Preflight ──────────────────────────────────────────────────────────────
[[ "$(uname -s)" == "Linux" ]] || error "This script requires Linux (Ubuntu Server on Raspberry Pi)"
command -v sudo >/dev/null 2>&1 || error "sudo is required"
info "Checking connectivity to $CLOUD_URL..."
curl -fsSL --max-time 10 "$CLOUD_URL/api/health" >/dev/null 2>&1 \
  || error "Cannot reach $CLOUD_URL — check your internet connection"

# ── Update mode detection ─────────────────────────────────────────────────────
if [[ -f "$ENV_FILE" && -d "$INSTALL_DIR" ]]; then
  info "Existing install detected — updating service files..."
  UPDATE_MODE=1
else
  UPDATE_MODE=0
fi

# ── 2. System packages ────────────────────────────────────────────────────────
info "Installing system packages..."
sudo apt-get update -q -y
sudo apt-get install -y -q python3 python3-venv ffmpeg v4l-utils curl \
  libsrtp2-dev libopus-dev python3-dev pkg-config \
  libavformat-dev libavcodec-dev libavutil-dev libswscale-dev \
  libswresample-dev libavdevice-dev libavfilter-dev \
  python3-av python3-numpy python3-pillow

# ── 3. Hardware detection ─────────────────────────────────────────────────────

pi_model() {
  grep -oP "(?<=Model\s:\s).*" /proc/cpuinfo 2>/dev/null \
    || cat /proc/device-tree/model 2>/dev/null \
    || echo "unknown"
}

# Returns: usb_capture | csi_tc358743
detect_capture_type() {
  # Known USB HDMI capture card USB vendor IDs:
  #   534d = Macrosilicon (MS2109, MS2130)
  #   1de1 = Actions Semiconductor
  #   0bda = Realtek (some capture sticks)
  #   eb1a = eMPIA Technology (em28xx family)
  #   2040 = Hauppauge
  if lsusb 2>/dev/null | grep -qiE "534d:|1de1:|0bda:5846|eb1a:|2040:"; then
    echo "usb_capture"; return
  fi

  # Fallback: any USB-attached v4l2 device
  if v4l2-ctl --list-devices 2>/dev/null | grep -q "usb"; then
    echo "usb_capture"; return
  fi

  # Check for generic USB Video Class device
  if lsusb 2>/dev/null | grep -qi "video"; then
    echo "usb_capture"; return
  fi

  # No USB capture card found — assume CSI/HDMI-to-CSI adapter (TC358743)
  echo "csi_tc358743"
}

# Returns the first usable /dev/videoN
detect_video_dev() {
  for dev in /dev/video0 /dev/video1 /dev/video2 /dev/video3; do
    [[ -e "$dev" ]] && echo "$dev" && return
  done
  echo "/dev/video0"   # will be created after tc358743 module loads / reboot
}

MODEL=$(pi_model)
info "Pi model: $MODEL"
CAPTURE_TYPE=$(detect_capture_type)
info "Detected capture hardware: $CAPTURE_TYPE"

# ── 4. CSI / TC358743 configuration ──────────────────────────────────────────
NEEDS_REBOOT=0

if [[ "$CAPTURE_TYPE" == "csi_tc358743" ]]; then
  info "Configuring HDMI-to-CSI adapter (TC358743)..."

  # Locate the Pi boot config (Ubuntu uses /boot/firmware/config.txt)
  CONFIG_TXT=""
  for candidate in /boot/firmware/config.txt /boot/config.txt; do
    [[ -f "$candidate" ]] && { CONFIG_TXT="$candidate"; break; }
  done
  [[ -n "$CONFIG_TXT" ]] || error "Cannot find Pi config.txt (tried /boot/firmware/config.txt and /boot/config.txt)"

  if ! grep -q "dtoverlay=tc358743" "$CONFIG_TXT"; then
    info "Adding tc358743 overlay to $CONFIG_TXT..."
    echo "" | sudo tee -a "$CONFIG_TXT" > /dev/null
    echo "# Guidenco: HDMI-to-CSI adapter" | sudo tee -a "$CONFIG_TXT" > /dev/null
    echo "dtoverlay=tc358743" | sudo tee -a "$CONFIG_TXT" > /dev/null
    NEEDS_REBOOT=1
  else
    info "tc358743 overlay already configured."
  fi

  # Ensure tc358743 kernel module loads on boot
  if ! grep -q "tc358743" /etc/modules 2>/dev/null; then
    echo "tc358743" | sudo tee -a /etc/modules > /dev/null
  fi

  # Attempt to load the module right now (no-op if not yet available via overlay)
  sudo modprobe tc358743 2>/dev/null || true
fi

VIDEO_DEV=$(detect_video_dev)
info "Video device: $VIDEO_DEV"

# ── 5. Download service ───────────────────────────────────────────────────────
info "Downloading Guidenco service..."
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
curl -fsSL "$REPO_TARBALL" -o "$TMP/guidenco.tar.gz"
tar -xzf "$TMP/guidenco.tar.gz" -C "$TMP"
EXTRACTED=$(find "$TMP" -maxdepth 1 -type d -name "guidenco-*" | head -1)
[[ -d "$EXTRACTED/service" ]] || error "Downloaded tarball has unexpected structure"
sudo mkdir -p "$INSTALL_DIR"
sudo rsync -a --delete "$EXTRACTED/service/" "$INSTALL_DIR/"

# ── 6. Python venv ────────────────────────────────────────────────────────────
info "Setting up Python environment..."
# --system-site-packages lets the venv reuse apt-installed av, numpy, pillow
# and avoids recompiling them (would exhaust /tmp which is tmpfs/213MB on Pi).
sudo python3 -m venv --system-site-packages "$INSTALL_DIR/venv"
sudo "$INSTALL_DIR/venv/bin/pip" install -q --upgrade pip
# Use /var/tmp (disk-backed) to avoid filling the RAM-backed /tmp
sudo TMPDIR=/var/tmp "$INSTALL_DIR/venv/bin/pip" install -q \
  --no-build-isolation \
  -r "$INSTALL_DIR/requirements.txt"

# ── 7. HID gadget ─────────────────────────────────────────────────────────────
info "Configuring USB HID gadget..."
sudo cp "$INSTALL_DIR/setup_hid_gadget.sh" "$HID_SCRIPT"
sudo chmod +x "$HID_SCRIPT"

# ── Update mode: restart and exit ─────────────────────────────────────────────
if [[ $UPDATE_MODE -eq 1 ]]; then
  # Preserve existing device credentials; update env vars that may have changed
  # (CAPTURE_TYPE / VIDEO_DEV can change if hardware was swapped)
  EXISTING_DEVICE_ID=$(grep "^DEVICE_ID=" "$ENV_FILE" | cut -d= -f2)
  EXISTING_TOKEN=$(grep "^DEVICE_TOKEN=" "$ENV_FILE" | cut -d= -f2 || true)
  {
    echo "DEVICE_ID=$EXISTING_DEVICE_ID"
    echo "CLOUD_URL=$CLOUD_URL"
    echo "CAPTURE_TYPE=$CAPTURE_TYPE"
    echo "VIDEO_DEV=$VIDEO_DEV"
    [[ -n "$EXISTING_TOKEN" ]] && echo "DEVICE_TOKEN=$EXISTING_TOKEN"
  } | sudo tee "$ENV_FILE" > /dev/null
  sudo systemctl restart guidenco.service
  info "Update complete."
  if [[ $NEEDS_REBOOT -eq 1 ]]; then
    warn "A reboot is required to activate the TC358743 overlay. Run: sudo reboot"
  fi
  exit 0
fi

# ── 8. Environment file (fresh install) ───────────────────────────────────────
DEVICE_ID=$(python3 -c "import uuid; print(str(uuid.uuid4()))")
sudo mkdir -p /etc/guidenco
{
  echo "DEVICE_ID=$DEVICE_ID"
  echo "CLOUD_URL=$CLOUD_URL"
  echo "CAPTURE_TYPE=$CAPTURE_TYPE"
  echo "VIDEO_DEV=$VIDEO_DEV"
} | sudo tee "$ENV_FILE" > /dev/null

# ── 9. Systemd service ────────────────────────────────────────────────────────
info "Installing systemd service..."
sudo cp "$INSTALL_DIR/guidenco.service" "$SERVICE_FILE"
sudo systemctl daemon-reload
sudo systemctl enable guidenco.service

# ── 10. Register with cloud ────────────────────────────────────────────────────
info "Registering device..."
RESPONSE=$(curl -fsSL -X POST "$CLOUD_URL/api/devices/claim-init" \
  -H "Content-Type: application/json" \
  -d "{\"device_id\":\"$DEVICE_ID\"}" 2>/dev/null) \
  || error "Failed to contact Guidenco cloud."
CODE=$(echo "$RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin)['code'])" 2>/dev/null) \
  || error "Unexpected response: $RESPONSE"

# ── 11. Show pairing code ──────────────────────────────────────────────────────
box "Guidenco installed!\n\n  To link this device:\n\n    1. Open: ${BOLD}$CLOUD_URL${NC}\n    2. Sign in and click ${BOLD}Add Device${NC}\n    3. Enter code: ${BOLD}${GREEN}$CODE${NC}\n\n  Code expires in 15 minutes."

# ── 12. Poll for claim ────────────────────────────────────────────────────────
info "Waiting for device to be linked..."
ELAPSED=0 DEVICE_TOKEN=""

while [[ $ELAPSED -lt 900 ]]; do
  sleep 5; ELAPSED=$((ELAPSED + 5))
  STATUS=$(curl -fsSL "$CLOUD_URL/api/devices/claim-status?device_id=$DEVICE_ID" 2>/dev/null || echo '{}')
  CLAIM=$(echo "$STATUS" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status',''))" 2>/dev/null || echo "")

  if [[ "$CLAIM" == "claimed" ]]; then
    DEVICE_TOKEN=$(echo "$STATUS" | python3 -c "import sys,json; print(json.load(sys.stdin)['device_token'])" 2>/dev/null) \
      || error "Could not parse device_token"
    break
  elif [[ "$CLAIM" == "expired" ]]; then
    error "Pairing code expired. Re-run this script."
  fi
done

[[ -n "$DEVICE_TOKEN" ]] || error "Timed out waiting for link (15 min). Re-run this script."

# ── 13. Save token and start ──────────────────────────────────────────────────
echo "DEVICE_TOKEN=$DEVICE_TOKEN" | sudo tee -a "$ENV_FILE" > /dev/null

if [[ $NEEDS_REBOOT -eq 1 ]]; then
  # Service can't start yet — tc358743 overlay needs a reboot first.
  # It's enabled so it will autostart after reboot.
  box "${GREEN}Device linked!${NC}\n\n  ${YELLOW}HDMI-to-CSI adapter requires a reboot.${NC}\n\n  Run:  sudo reboot\n\n  The Guidenco service will start automatically after reboot.\n  Open $CLOUD_URL to control it."
else
  sudo systemctl start guidenco.service
  box "${GREEN}Device linked!${NC}\n\n  Your Raspberry Pi is now connected.\n  Open $CLOUD_URL to control it."
fi
