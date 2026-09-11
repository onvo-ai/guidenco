"""
api/netinfo.py — what network the Pi is actually on, for /health.

Answers three questions: which interface carries traffic, whether it is wired
or wireless, and for wireless, which network and how strong the signal is.

Every lookup is best-effort and degrades to None. Raspberry Pi OS 13 ships
NetworkManager, older images use wpa_supplicant, and neither is guaranteed —
so each fact is gathered from whichever source answers first rather than
assuming a single stack.
"""

import os
import re
import socket
import subprocess


def _run(*args: str, timeout: float = 3.0) -> str:
    try:
        result = subprocess.run(args, capture_output=True, timeout=timeout)
        return result.stdout.decode(errors="replace").strip()
    except Exception:
        return ""


def _have_iproute() -> bool:
    return bool(_run("ip", "-V")) or os.path.exists("/sbin/ip") or os.path.exists("/usr/sbin/ip")


def _default_interface() -> str | None:
    """The interface the default route uses — the one actually carrying traffic."""
    out = _run("ip", "route", "get", "1.1.1.1")
    match = re.search(r"\bdev\s+(\S+)", out)
    if match:
        return match.group(1)
    out = _run("ip", "route", "show", "default")
    match = re.search(r"\bdev\s+(\S+)", out)
    return match.group(1) if match else None


def _is_wireless(interface: str) -> bool:
    # The kernel exposes a wireless/ directory only for 802.11 interfaces.
    return os.path.isdir(f"/sys/class/net/{interface}/wireless")


def _ipv4(interface: str) -> str | None:
    out = _run("ip", "-4", "-o", "addr", "show", "dev", interface)
    match = re.search(r"inet\s+(\d+\.\d+\.\d+\.\d+)", out)
    return match.group(1) if match else None


def _mac(interface: str) -> str | None:
    try:
        with open(f"/sys/class/net/{interface}/address") as f:
            return f.read().strip()
    except OSError:
        return None


def _ssid(interface: str) -> str | None:
    """SSID, from whichever tool is present."""
    out = _run("iwgetid", "-r")
    if out:
        return out

    # NetworkManager: the active connection on this device.
    out = _run("nmcli", "-t", "-f", "ACTIVE,SSID", "dev", "wifi")
    for line in out.splitlines():
        if line.startswith("yes:"):
            return line.split(":", 1)[1] or None

    out = _run("iw", "dev", interface, "link")
    match = re.search(r"^\s*SSID:\s*(.+)$", out, re.MULTILINE)
    if match:
        return match.group(1).strip()

    out = _run("wpa_cli", "-i", interface, "status")
    match = re.search(r"^ssid=(.+)$", out, re.MULTILINE)
    return match.group(1).strip() if match else None


def _signal_dbm(interface: str) -> int | None:
    out = _run("iw", "dev", interface, "link")
    match = re.search(r"signal:\s*(-?\d+)\s*dBm", out)
    if match:
        return int(match.group(1))
    # /proc/net/wireless reports link quality; column 4 is signal level in dBm.
    try:
        with open("/proc/net/wireless") as f:
            for line in f:
                if line.strip().startswith(f"{interface}:"):
                    fields = line.split()
                    if len(fields) > 3:
                        return int(float(fields[3]))
    except (OSError, ValueError):
        return None
    return None


def describe() -> dict:
    """A summary of the Pi's network attachment for /health."""
    info: dict = {
        "hostname": socket.gethostname(),
        "interface": None,
        "type": "unknown",
        "address": None,
        "mac": None,
        "ssid": None,
        "signal_dbm": None,
    }

    interface = _default_interface()
    if not interface:
        # "disconnected" is a claim about the network; "unknown" is a claim
        # about us. Only the first is warranted when the tooling is present and
        # simply reports no route.
        info["type"] = "disconnected" if _have_iproute() else "unknown"
        return info

    info["interface"] = interface
    info["address"] = _ipv4(interface)
    info["mac"] = _mac(interface)

    if _is_wireless(interface):
        info["type"] = "wifi"
        info["ssid"] = _ssid(interface)
        info["signal_dbm"] = _signal_dbm(interface)
    else:
        info["type"] = "ethernet"
    return info
