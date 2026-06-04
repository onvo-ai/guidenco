#!/usr/bin/env bash
# hotspot.sh start|stop — manages the Guidenco-Setup access point.
# Uses a virtual uap0 interface so wlan0 remains a WPA client (concurrent AP+station).
set -euo pipefail

IFACE_AP="uap0"
IFACE_CLIENT="wlan0"
AP_IP="192.168.4.1"
SSID="Guidenco-Setup"
HOSTAPD_CONF="/tmp/guidenco-hostapd.conf"
DNSMASQ_CONF="/tmp/guidenco-dnsmasq.conf"
DNSMASQ_PID="/tmp/guidenco-dnsmasq.pid"

start() {
  # Virtual AP interface (Broadcom on Pi 4 supports concurrent AP+station)
  iw dev "$IFACE_CLIENT" interface add "$IFACE_AP" type __ap
  ip link set dev "$IFACE_AP" up
  ip addr add "${AP_IP}/24" dev "$IFACE_AP"

  cat > "$HOSTAPD_CONF" <<EOF
interface=$IFACE_AP
driver=nl80211
ssid=$SSID
hw_mode=g
channel=6
ieee80211n=1
wmm_enabled=0
auth_algs=1
ignore_broadcast_ssid=0
EOF

  cat > "$DNSMASQ_CONF" <<EOF
interface=$IFACE_AP
bind-interfaces
dhcp-range=192.168.4.2,192.168.4.20,255.255.255.0,1h
# Redirect ALL DNS queries to the portal — triggers captive portal detection
address=/#/$AP_IP
EOF

  hostapd -B "$HOSTAPD_CONF"
  dnsmasq --conf-file="$DNSMASQ_CONF" --pid-file="$DNSMASQ_PID"
}

stop() {
  pkill -f "hostapd.*guidenco-hostapd" 2>/dev/null || true
  if [[ -f "$DNSMASQ_PID" ]]; then
    kill "$(cat "$DNSMASQ_PID")" 2>/dev/null || true
    rm -f "$DNSMASQ_PID"
  fi
  # Remove virtual AP interface
  ip link set dev "$IFACE_AP" down 2>/dev/null || true
  iw dev "$IFACE_AP" del 2>/dev/null || true
}

case "${1:-}" in
  start) start ;;
  stop)  stop  ;;
  *) echo "Usage: $0 {start|stop}" >&2; exit 1 ;;
esac
