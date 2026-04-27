#!/bin/bash
# USB HID Gadget: TWO interfaces — boot keyboard on hidg0, absolute mouse on hidg1.
#
# Why two interfaces (was previously one composite via Report IDs):
# Windows auto-enables "Allow this device to wake the computer" only when it
# recognizes a device as a true HID Boot Keyboard — meaning a dedicated
# interface with subclass=1 protocol=1 and an 8-byte fixed boot report (no
# Report IDs). With the old composite descriptor Windows treated us as a
# generic HID device and refused to wake from sleep, so HID writes returned
# EAGAIN forever. Separate interfaces matches what wireless KB receivers do.
#
# Idempotent: safe to run even if gadget is already configured.

GADGET=/sys/kernel/config/usb_gadget/hid_keyboard

modprobe libcomposite 2>/dev/null || true

# Always force-unbind so descriptor changes take effect after Pi reboot/crash
echo "" > "$GADGET/UDC" 2>/dev/null || true
sleep 0.3

# Remove config symlinks, function dirs — we recreate from scratch
rm -f "$GADGET/configs/c.1/hid.usb0" 2>/dev/null || true
rm -f "$GADGET/configs/c.1/hid.usb1" 2>/dev/null || true
rmdir "$GADGET/functions/hid.usb0" 2>/dev/null || true
rmdir "$GADGET/functions/hid.usb1" 2>/dev/null || true
rmdir "$GADGET/configs/c.1/strings/0x409" 2>/dev/null || true
rmdir "$GADGET/configs/c.1" 2>/dev/null || true
rmdir "$GADGET/strings/0x409" 2>/dev/null || true
rmdir "$GADGET" 2>/dev/null || true
sleep 0.2

mkdir -p "$GADGET"
mkdir -p "$GADGET/strings/0x409"
mkdir -p "$GADGET/configs/c.1/strings/0x409"
mkdir -p "$GADGET/functions/hid.usb0"   # keyboard
mkdir -p "$GADGET/functions/hid.usb1"   # mouse

_w() { echo "$1" > "$2" 2>/dev/null || true; }
# Mimic a Logitech Unifying Receiver — these ship with INF files that
# explicitly set wake-enable defaults, and Windows treats them as
# "wireless keyboard receiver" class which auto-allows wake.
_w 0x046d                "$GADGET/idVendor"     # Logitech, Inc.
_w 0xc52b                "$GADGET/idProduct"    # Logitech Unifying Receiver
_w 0x0200                "$GADGET/bcdDevice"
_w 0x0200                "$GADGET/bcdUSB"
_w "d5e4f3a2b1c07061"    "$GADGET/strings/0x409/serialnumber"
_w "Logitech"            "$GADGET/strings/0x409/manufacturer"
_w "USB Receiver"        "$GADGET/strings/0x409/product"
_w "HID"                 "$GADGET/configs/c.1/strings/0x409/configuration"
# bmAttributes 0xe0 = self-powered + remote wakeup capable.
# The Pi runs off its own PSU, so we ARE self-powered. Previously we
# (incorrectly) advertised bus-powered (0xa0); Windows uses this when
# deciding power-management policy for wake.
_w 0xe0                  "$GADGET/configs/c.1/bmAttributes"
_w 0                     "$GADGET/configs/c.1/MaxPower"

# --- Keyboard: HID Boot Keyboard (subclass 1, protocol 1, 8-byte report, no Report ID) ---
_w 1                     "$GADGET/functions/hid.usb0/protocol"
_w 1                     "$GADGET/functions/hid.usb0/subclass"
_w 8                     "$GADGET/functions/hid.usb0/report_length"

python3 - "$GADGET/functions/hid.usb0/report_desc" <<'PYEOF'
import sys
# Standard 6KRO boot keyboard. Report = 8 bytes:
#   modifier(1) + reserved(1) + key codes(6)
desc = bytes([
    0x05,0x01,        # Usage Page (Generic Desktop)
    0x09,0x06,        # Usage (Keyboard)
    0xa1,0x01,        # Collection (Application)
    0x05,0x07,        #   Usage Page (Key Codes)
    0x19,0xe0,0x29,0xe7,
    0x15,0x00,0x25,0x01,
    0x75,0x01,0x95,0x08,
    0x81,0x02,        #   Input: 8 modifier bits
    0x95,0x01,0x75,0x08,
    0x81,0x03,        #   Input: 1 reserved byte
    0x95,0x05,0x75,0x01,
    0x05,0x08,0x19,0x01,0x29,0x05,
    0x91,0x02,        #   Output: 5 LED bits
    0x95,0x01,0x75,0x03,
    0x91,0x03,        #   Output: 3 padding bits
    0x95,0x06,0x75,0x08,
    0x15,0x00,0x25,0x65,
    0x05,0x07,0x19,0x00,0x29,0x65,
    0x81,0x00,        #   Input: 6 key codes
    0xc0,
])
open(sys.argv[1], 'wb').write(desc)
print(f'keyboard report_desc: {len(desc)} bytes')
PYEOF

# --- Mouse: HID absolute pointer (no Report ID) ---
# subclass=0/protocol=0 because boot mouse is relative; we need absolute coords.
_w 0                     "$GADGET/functions/hid.usb1/protocol"
_w 0                     "$GADGET/functions/hid.usb1/subclass"
_w 5                     "$GADGET/functions/hid.usb1/report_length"

python3 - "$GADGET/functions/hid.usb1/report_desc" <<'PYEOF'
import sys
# Absolute mouse, no wheel. Report = 5 bytes:
#   buttons(1, low 3 bits) + X(2 LE, 0..32767) + Y(2 LE, 0..32767)
desc = bytes([
    0x05,0x01,        # Usage Page (Generic Desktop)
    0x09,0x02,        # Usage (Mouse)
    0xa1,0x01,        # Collection (Application)
    0x09,0x01,        #   Usage (Pointer)
    0xa1,0x00,        #   Collection (Physical)
    0x05,0x09,        #     Usage Page (Buttons)
    0x19,0x01,0x29,0x03,
    0x15,0x00,0x25,0x01,
    0x95,0x03,0x75,0x01,
    0x81,0x02,        #     3 button bits
    0x95,0x05,0x75,0x01,
    0x81,0x03,        #     5 padding bits
    0x05,0x01,        #     Usage Page (Generic Desktop)
    0x09,0x30,0x09,0x31,
    0x15,0x00,0x26,0xff,0x7f,
    0x35,0x00,0x46,0xff,0x7f,
    0x75,0x10,0x95,0x02,
    0x81,0x02,        #     X, Y abs (16-bit)
    0xc0,
    0xc0,
])
open(sys.argv[1], 'wb').write(desc)
print(f'mouse report_desc: {len(desc)} bytes')
PYEOF

# Order matters — keyboard first so Windows enumerates it as interface 0.
ln -sf "$GADGET/functions/hid.usb0" "$GADGET/configs/c.1/" 2>/dev/null || true
ln -sf "$GADGET/functions/hid.usb1" "$GADGET/configs/c.1/" 2>/dev/null || true

# Bind to UDC
UDC=$(ls /sys/class/udc | head -1)
echo "$UDC" > "$GADGET/UDC"
echo "HID gadget bound to $UDC (kbd=hidg0, mouse=hidg1)"

# Allow the guidenco service user (non-root) to rebind the UDC at runtime
# so it can re-enumerate the gadget to wake a sleeping host.
chmod 666 "$GADGET/UDC" 2>/dev/null || true
