# pi-agent/portal/wifi.py
"""WiFi scanning and connection helpers (wpa_supplicant / iwlist)."""
import logging
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
    Write wpa_supplicant.conf, reconfigure the interface, wait for association,
    then confirm internet by pinging 1.1.1.1.
    Returns True if internet is reachable after connection.
    """
    config = (
        "ctrl_interface=DIR=/var/run/wpa_supplicant GROUP=netdev\n"
        "update_config=1\n"
        "country=US\n\n"
        "network={\n"
        f'    ssid="{ssid}"\n'
        f'    psk="{password}"\n'
        "    key_mgmt=WPA-PSK\n"
        "}\n"
    )
    try:
        with open(WPA_CONF, "w") as fh:
            fh.write(config)
        subprocess.run(
            ["wpa_cli", "-i", "wlan0", "reconfigure"],
            capture_output=True, timeout=10,
        )
        # Give wpa_supplicant time to associate and DHCP client time to get IP
        time.sleep(20)
        return _ping_ok("1.1.1.1") or _ping_ok("8.8.8.8")
    except Exception:
        logger.exception("WiFi connect failed")
        return False


def _ping_ok(host: str) -> bool:
    r = subprocess.run(
        ["ping", "-c1", "-W3", host],
        capture_output=True, timeout=8,
    )
    return r.returncode == 0
