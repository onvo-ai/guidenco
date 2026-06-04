"""guidenco-client — CLI entry point.

Subcommands:
  init   Pair with the cloud (prints a code, polls until the dashboard claims
         it) and then enters the connection loop.
  run    Use existing config (~/.config/guidenco-client/device.json) to enter
         the connection loop.

With no subcommand: runs `run` if config exists, otherwise `init`.
"""
import argparse
import asyncio
import json
import logging
import os
import sys
import time
import uuid
from pathlib import Path

import requests

from .capture import CaptureSource
from .connection import ConnectionClient
from .input import InputSink

logger = logging.getLogger("guidenco_client.main")

CONFIG_DIR = Path.home() / ".config" / "guidenco-client"
CONFIG_FILE = CONFIG_DIR / "device.json"
CLAIM_POLL_INTERVAL = 2  # seconds


def _load_config() -> dict | None:
    if not CONFIG_FILE.exists():
        return None
    try:
        return json.loads(CONFIG_FILE.read_text())
    except Exception:
        return None


def _save_config(cfg: dict) -> None:
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    CONFIG_FILE.write_text(json.dumps(cfg, indent=2))


def _prompt_cloud_url() -> str:
    env_url = os.environ.get("GUIDENCO_CLOUD_URL")
    if env_url:
        return env_url
    raw = input("Cloud URL (e.g. https://guidenco.app): ").strip()
    if not raw:
        sys.exit("Cloud URL is required.")
    return raw


def cmd_init(_args: argparse.Namespace) -> None:
    cloud_url = _prompt_cloud_url().rstrip("/")
    device_id = str(uuid.uuid4())

    print(f"Requesting pairing code from {cloud_url} ...")
    try:
        r = requests.post(
            f"{cloud_url}/api/devices/claim-init",
            json={"device_id": device_id},
            timeout=15,
        )
        r.raise_for_status()
        code = r.json()["code"]
    except Exception as exc:
        sys.exit(f"Failed to request pairing code: {exc}")

    print()
    print(f"  Pairing code: {code}")
    print()
    print("Open Guidenco in your browser → + Add Device → Self → choose this OS")
    print("→ enter the code above and a name for this device.")
    print()
    print("Waiting for pairing ...", end="", flush=True)

    token = _poll_claim_status(cloud_url, device_id)
    print()  # newline after dots

    _save_config({
        "cloud_url": cloud_url,
        "device_id": device_id,
        "device_token": token,
    })
    print("Paired! Starting client (Ctrl-C to stop) ...")
    asyncio.run(_run_loop(cloud_url, token))


def _poll_claim_status(cloud_url: str, device_id: str) -> str:
    while True:
        try:
            r = requests.get(
                f"{cloud_url}/api/devices/claim-status",
                params={"device_id": device_id},
                timeout=10,
            )
            if r.status_code == 200:
                data = r.json()
                status = data.get("status")
                if status == "claimed":
                    return data["device_token"]
                if status == "expired":
                    sys.exit("\nPairing code expired. Run `guidenco-client init` again.")
        except Exception:
            pass  # transient network error — keep polling
        print(".", end="", flush=True)
        time.sleep(CLAIM_POLL_INTERVAL)


def cmd_run(_args: argparse.Namespace) -> None:
    cfg = _load_config()
    if not cfg:
        sys.exit("Not paired yet — run `guidenco-client init` first.")
    asyncio.run(_run_loop(cfg["cloud_url"], cfg["device_token"]))


async def _run_loop(cloud_url: str, device_token: str) -> None:
    capture = CaptureSource()
    sw, sh = capture.screen_size
    logger.info(f"primary screen size: {sw}x{sh}")
    input_sink = InputSink(screen_width=sw, screen_height=sh)
    client = ConnectionClient(cloud_url, device_token, capture, input_sink)
    try:
        await client.run_forever()
    finally:
        capture.close()


def main() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )
    p = argparse.ArgumentParser(prog="guidenco-client")
    sub = p.add_subparsers(dest="cmd")
    sub.add_parser("init", help="Pair with the cloud and start the client").set_defaults(func=cmd_init)
    sub.add_parser("run",  help="Run the client using saved config").set_defaults(func=cmd_run)
    args = p.parse_args()
    if args.cmd:
        args.func(args)
    else:
        (cmd_run if _load_config() else cmd_init)(args)


if __name__ == "__main__":
    main()
