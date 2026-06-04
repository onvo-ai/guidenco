# pi-agent/portal/wifi.py
"""WiFi scanning and connection helpers (wpa_supplicant / iwlist)."""
import logging
import os
import re
import subprocess
import time

logger = logging.getLogger("guidenco.portal.wifi")

WPA_CONF = "/etc/wpa_supplicant/wpa_supplicant.conf"


def scan() -> list[dict]:
    """Return list of {ssid, signal} dicts sorted strongest-first."""
    try:
        result = subprocess.run(
            ["iwlist", "wlan0", "scan"],
            capture_output=True, text=True, timeout=15,
        )
    except Exception:
        logger.exception("iwlist scan failed")
        return []

    if result.returncode != 0:
        logger.warning("iwlist returned %d: %s", result.returncode, result.stderr.strip())
        return []

    networks: list[dict] = []
    ssid: str | None = None
    signal: int = -100

    for line in result.stdout.splitlines():
        line = line.strip()
        if line.startswith("Cell "):
            if ssid is not None:
                networks.append({"ssid": ssid, "signal": signal})
            ssid = None
            signal = -100
        elif 'ESSID:"' in line:
            m = re.search(r'ESSID:"([^"]*)"', line)
            if m:
                ssid = m.group(1)
        elif "Signal level=" in line:
            m = re.search(r"Signal level=(-?\d+)", line)
            if m:
                signal = int(m.group(1))

    if ssid is not None:
        networks.append({"ssid": ssid, "signal": signal})

    # Deduplicate (keep highest signal), sort strongest-first, drop empty SSIDs
    seen: set[str] = set()
    unique: list[dict] = []
    for n in sorted(networks, key=lambda x: x["signal"], reverse=True):
        if n["ssid"] and n["ssid"] not in seen:
            seen.add(n["ssid"])
            unique.append(n)
    return unique


def connect(ssid: str, password: str) -> bool:
    """
    Write wpa_supplicant.conf using wpa_passphrase (safe SSID quoting, hashed PSK),
    reconfigure the interface, wait for association, then confirm internet.
    Returns True if internet is reachable after connection.
    """
    try:
        # wpa_passphrase handles SSID quoting and computes PSK hash
        wp = subprocess.run(
            ["wpa_passphrase", ssid, password],
            capture_output=True, text=True, timeout=5,
        )
        if wp.returncode != 0:
            logger.error("wpa_passphrase failed: %s", wp.stderr.strip())
            return False

        # Strip the plaintext #psk= comment so it isn't persisted
        network_block = "\n".join(
            line for line in wp.stdout.splitlines()
            if not line.strip().startswith("#psk=")
        )

        config = (
            "ctrl_interface=DIR=/var/run/wpa_supplicant GROUP=netdev\n"
            "update_config=1\n\n"
        ) + network_block + "\n"

        with open(WPA_CONF, "w") as fh:
            fh.write(config)
        os.chmod(WPA_CONF, 0o600)

        result = subprocess.run(
            ["wpa_cli", "-i", "wlan0", "reconfigure"],
            capture_output=True, timeout=10,
        )
        if result.returncode != 0:
            logger.warning("wpa_cli reconfigure returned %d: %s",
                           result.returncode, result.stderr.decode().strip())

        # Give wpa_supplicant time to associate and DHCP client time to get IP
        time.sleep(20)
        return _ping_ok("1.1.1.1") or _ping_ok("8.8.8.8")
    except Exception:
        logger.exception("WiFi connect failed")
        return False


def _ping_ok(host: str) -> bool:
    try:
        r = subprocess.run(
            ["ping", "-c1", "-W3", host],
            capture_output=True, timeout=8,
        )
        return r.returncode == 0
    except (OSError, subprocess.SubprocessError):
        logger.warning("ping to %s failed", host)
        return False
