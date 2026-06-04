# pi-agent/portal/cloud.py
"""Device registration and claim-status polling."""
import json
import logging
import os
import time
import urllib.request
import uuid

logger = logging.getLogger("guidenco.portal.cloud")

DEVICE_ENV = "/etc/guidenco/device.env"


def _load_env(path: str) -> dict[str, str]:
    env: dict[str, str] = {}
    try:
        with open(path) as fh:
            for line in fh:
                line = line.strip()
                if "=" in line and not line.startswith("#"):
                    k, v = line.split("=", 1)
                    env[k] = v
    except FileNotFoundError:
        pass
    return env


def register(cloud_url: str) -> tuple[str, str]:
    """
    POST /api/devices/claim-init.
    Returns (device_id, pairing_code).
    Writes DEVICE_ID + CLOUD_URL to DEVICE_ENV; does NOT write DEVICE_TOKEN yet.
    """
    env = _load_env(DEVICE_ENV)
    device_id = env.get("DEVICE_ID") or str(uuid.uuid4())

    data = json.dumps({"device_id": device_id}).encode()
    req = urllib.request.Request(
        f"{cloud_url}/api/devices/claim-init",
        data=data,
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=15) as resp:
        body = json.loads(resp.read())

    code: str = body["code"]

    # Persist device_id and cloud URL for guidenco.service
    os.makedirs(os.path.dirname(DEVICE_ENV), exist_ok=True)
    existing = _load_env(DEVICE_ENV)
    existing["DEVICE_ID"] = device_id
    existing["CLOUD_URL"] = cloud_url
    _write_env(DEVICE_ENV, existing)

    logger.info(f"Registered device {device_id}, code={code}")
    return device_id, code


def poll_until_claimed(cloud_url: str, device_id: str, on_claimed: callable) -> None:
    """
    Polls GET /api/devices/claim-status every 5 s in the calling thread.
    Calls on_claimed(token) when status == 'claimed'.
    Stops on 'expired' or after 15 minutes.
    """
    deadline = time.time() + 900  # 15 min
    while time.time() < deadline:
        time.sleep(5)
        try:
            url = f"{cloud_url}/api/devices/claim-status?device_id={device_id}"
            with urllib.request.urlopen(url, timeout=10) as resp:
                body = json.loads(resp.read())
            status = body.get("status", "")
            if status == "claimed":
                token: str = body.get("device_token", "")
                _append_env(DEVICE_ENV, {"DEVICE_TOKEN": token})
                logger.info("Device claimed — token saved")
                on_claimed(token)
                return
            elif status == "expired":
                logger.warning("Pairing code expired")
                return
        except Exception:
            logger.debug("poll_until_claimed: request failed, retrying")


def _write_env(path: str, data: dict[str, str]) -> None:
    with open(path, "w") as fh:
        for k, v in data.items():
            fh.write(f"{k}={v}\n")


def _append_env(path: str, data: dict[str, str]) -> None:
    with open(path, "a") as fh:
        for k, v in data.items():
            fh.write(f"{k}={v}\n")
