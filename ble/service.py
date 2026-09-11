"""
ble/service.py — a BLE GATT peripheral for setup over Web Bluetooth.

Solves the chicken-and-egg problem: to put the Pi on your Wi-Fi you need to
reach the Pi, and to reach the Pi it needs to be on your Wi-Fi. Bluetooth needs
no network at all, so a browser can configure it from across the room.

Exposes one service with four characteristics:

    status     read, notify   JSON: wifi state, IP, and the current tunnel URL
    networks   read           JSON: nearby SSIDs from the last scan
    scan       write          write anything to trigger a fresh scan
    wifi       write          JSON {"ssid": "...", "psk": "..."} to join

The Wi-Fi password is write-only and never read back, so a browser that pairs
later cannot retrieve it.

This is the one component with a dependency beyond the standard library: BlueZ
is driven over D-Bus, which needs python3-dbus and python3-gi from apt. Both
are packaged for Raspberry Pi OS, so there is still no pip involved.
"""

import json
import logging
import re
import subprocess
import threading

logger = logging.getLogger("guidenco.ble")

SERVICE_UUID = "6e6c1000-b5a3-f393-e0a9-e50e24dcca9e"
STATUS_UUID = "6e6c1001-b5a3-f393-e0a9-e50e24dcca9e"
NETWORKS_UUID = "6e6c1002-b5a3-f393-e0a9-e50e24dcca9e"
SCAN_UUID = "6e6c1003-b5a3-f393-e0a9-e50e24dcca9e"
WIFI_UUID = "6e6c1004-b5a3-f393-e0a9-e50e24dcca9e"

#: BLE attribute reads are capped by the negotiated MTU. Rather than implement
#: long reads, payloads are kept small and the client re-reads after a notify.
MAX_PAYLOAD = 512


def _encode(value) -> bytes:
    """Compact JSON, the only form these characteristics ever carry."""
    return json.dumps(value, separators=(",", ":")).encode()


def _run(*args: str, timeout: float = 25.0) -> tuple[int, str]:
    try:
        result = subprocess.run(args, capture_output=True, timeout=timeout)
        return result.returncode, (result.stdout + result.stderr).decode(errors="replace")
    except Exception as exc:
        return 1, str(exc)


# ── Wi-Fi, via NetworkManager ─────────────────────────────────────────────────

def scan_networks() -> list[dict]:
    """Nearby networks, strongest first, de-duplicated by SSID."""
    _run("nmcli", "device", "wifi", "rescan", timeout=30)
    code, out = _run("nmcli", "-t", "-f", "SSID,SIGNAL,SECURITY", "device", "wifi", "list")
    if code != 0:
        logger.warning("[ble] wifi scan failed: %s", out.strip()[:200])
        return []
    seen: dict[str, dict] = {}
    for line in out.splitlines():
        # nmcli escapes colons inside fields with a backslash.
        parts = re.split(r"(?<!\\):", line)
        if len(parts) < 3:
            continue
        ssid = parts[0].replace("\\:", ":").strip()
        if not ssid:
            continue
        try:
            signal = int(parts[1])
        except ValueError:
            signal = 0
        entry = {"ssid": ssid, "signal": signal,
                 "secure": bool(parts[2].strip() and parts[2].strip() != "--")}
        if ssid not in seen or signal > seen[ssid]["signal"]:
            seen[ssid] = entry
    return sorted(seen.values(), key=lambda n: -n["signal"])[:20]


def join_network(ssid: str, psk: str | None) -> tuple[bool, str]:
    if psk:
        code, out = _run("nmcli", "device", "wifi", "connect", ssid,
                         "password", psk, timeout=60)
    else:
        code, out = _run("nmcli", "device", "wifi", "connect", ssid, timeout=60)
    message = out.strip().splitlines()[-1] if out.strip() else ""
    if code == 0:
        logger.info("[ble] joined %s", ssid)
        return True, message or f"connected to {ssid}"
    logger.warning("[ble] could not join %s: %s", ssid, message[:200])
    return False, message or "connection failed"


# ── GATT peripheral ───────────────────────────────────────────────────────────

class SetupService:
    """
    Runs the BLE peripheral. Import-safe on machines without BlueZ: start()
    reports why it cannot run instead of raising at import time, so the rest of
    the service still works on a Pi with no Bluetooth.
    """

    def __init__(self, state_provider, adapter_name: str = "guidenco") -> None:
        self.state_provider = state_provider
        self.adapter_name = adapter_name
        self.networks: list[dict] = []
        self.last_result: dict = {}
        self._thread: threading.Thread | None = None
        self._notify = None

    # ── Payloads ──────────────────────────────────────────────────────────────

    def status_payload(self) -> bytes:
        """
        The status document, sized to fit one BLE attribute read.

        512 bytes is the hard ceiling for a BLE attribute value, so an
        over-long document has to be shortened — but by dropping whole fields,
        never by slicing bytes. Sliced JSON is invalid JSON, and the page would
        then render nothing at all rather than show a partial status, which is
        a far worse failure than a missing field.
        """
        state = dict(self.state_provider())
        state["last_action"] = self.last_result

        body = _encode(state)
        if len(body) <= MAX_PAYLOAD:
            return body

        # An nmcli failure message is the usual reason this overflows, and also
        # the least important thing here, so trim that first.
        action = dict(self.last_result)
        if isinstance(action.get("detail"), str):
            action["detail"] = action["detail"][:80]
            state["last_action"] = action
            body = _encode(state)
            if len(body) <= MAX_PAYLOAD:
                return body

        # Then shed fields in increasing order of how much they are missed.
        for field in ("last_action", "mac", "signal", "screen", "input"):
            state.pop(field, None)
            body = _encode(state)
            if len(body) <= MAX_PAYLOAD:
                return body

        # Nothing optional is left. Return the two things the page cannot work
        # without, dropping even the URL rather than emitting anything
        # unparseable.
        minimal = {"host": state.get("host"), "url": state.get("url")}
        body = _encode(minimal)
        if len(body) > MAX_PAYLOAD:
            minimal["url"] = None
            body = _encode(minimal)
        return body

    def networks_payload(self) -> bytes:
        """
        The scan results, sized to fit one BLE attribute read.

        Trims by dropping whole entries, weakest signal last, so the result is
        always valid JSON. Works on a copy, because a read must not quietly
        destroy the scan it is reporting.
        """
        networks = list(self.networks)
        body = _encode(networks)
        while len(body) > MAX_PAYLOAD and networks:
            networks.pop()
            body = _encode(networks)
        return body

    # ── Writes ────────────────────────────────────────────────────────────────

    def handle_scan(self, _value: bytes) -> None:
        def work():
            self.networks = scan_networks()
            self.last_result = {"action": "scan", "found": len(self.networks)}
            self._push_status()
        threading.Thread(target=work, daemon=True, name="ble-scan").start()

    def handle_wifi(self, value: bytes) -> None:
        try:
            payload = json.loads(value.decode())
            ssid = payload["ssid"]
        except Exception as exc:
            self.last_result = {"action": "join", "ok": False,
                                "detail": f"expected JSON with an ssid: {exc}"}
            self._push_status()
            return

        def work():
            ok, detail = join_network(ssid, payload.get("psk"))
            self.last_result = {"action": "join", "ssid": ssid, "ok": ok, "detail": detail}
            self._push_status()
        threading.Thread(target=work, daemon=True, name="ble-join").start()

    def _push_status(self) -> None:
        if self._notify:
            try:
                self._notify(self.status_payload())
            except Exception:
                logger.debug("[ble] no subscriber for status notification")

    # ── Lifecycle ─────────────────────────────────────────────────────────────

    def start(self) -> bool:
        try:
            from .bluez import run_peripheral
        except ImportError as exc:
            logger.warning("[ble] Bluetooth setup unavailable (%s). "
                           "Install python3-dbus and python3-gi to enable it.", exc)
            return False
        self._thread = threading.Thread(
            target=run_peripheral, args=(self,), daemon=True, name="ble")
        self._thread.start()
        return True
