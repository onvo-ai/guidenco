"""
api/tunnel.py — a temporary Cloudflare quick tunnel.

Runs `cloudflared tunnel --url http://127.0.0.1:<port>` and scrapes the
hostname Cloudflare assigns. Quick tunnels need no Cloudflare account and no
DNS setup; the trade is that the hostname is new every time the process starts,
which is why the BLE service exists to tell you the current one.

Security note, because this changes the threat model completely: the tunnel
publishes a service that can type on and click the target machine to the open
internet. A random hostname is not a secret worth relying on. main.py therefore
refuses to start the tunnel without an API token, rather than warning about it.
"""

import logging
import re
import shutil
import subprocess
import threading
import time

logger = logging.getLogger("guidenco.tunnel")

#: cloudflared announces the hostname on stderr inside a boxed banner, but its
#: logs also mention its own infrastructure hosts on the same domain — notably
#: api.trycloudflare.com, which it contacts to register. Matching that instead
#: produces a URL that looks plausible and goes nowhere, so they are excluded
#: by name rather than by guessing at the shape of a real hostname.
_INFRASTRUCTURE_HOSTS = ("api", "update", "www")
_URL_PATTERN = re.compile(r"https://([a-z0-9-]+)\.trycloudflare\.com")


def extract_url(line: str) -> str | None:
    """The assigned tunnel URL from a line of cloudflared output, if any."""
    match = _URL_PATTERN.search(line)
    if not match or match.group(1) in _INFRASTRUCTURE_HOSTS:
        return None
    return match.group(0)


STARTUP_TIMEOUT_S = 45


class Tunnel:
    def __init__(self, port: int, on_url=None) -> None:
        self.port = port
        self.url: str | None = None
        self._on_url = on_url
        self._process: subprocess.Popen | None = None
        self._stop = threading.Event()

    @staticmethod
    def available() -> bool:
        return shutil.which("cloudflared") is not None

    def start(self) -> None:
        if not self.available():
            logger.error("[tunnel] cloudflared is not installed — no public URL. "
                         "Install it and restart, or set TUNNEL_ENABLED=off.")
            return
        threading.Thread(target=self._run_forever, daemon=True, name="tunnel").start()

    def stop(self) -> None:
        self._stop.set()
        self._terminate()

    # ── Internals ─────────────────────────────────────────────────────────────

    def _terminate(self) -> None:
        process, self._process = self._process, None
        if process is None:
            return
        try:
            process.terminate()
            process.wait(timeout=5)
        except Exception:
            try:
                process.kill()
            except Exception:
                pass

    def _run_forever(self) -> None:
        backoff = 5
        while not self._stop.is_set():
            try:
                self._run_once()
            except Exception as exc:
                logger.error("[tunnel] failed: %s", exc)
            if self._stop.is_set():
                return
            # A dropped tunnel means a NEW hostname on reconnect, so clear the
            # old one rather than leaving a dead URL on display.
            self._set_url(None)
            logger.warning("[tunnel] disconnected — retrying in %ds", backoff)
            self._stop.wait(backoff)
            backoff = min(backoff * 2, 60)

    def _run_once(self) -> None:
        command = [
            "cloudflared", "tunnel",
            "--no-autoupdate",
            "--url", f"http://127.0.0.1:{self.port}",
        ]
        logger.info("[tunnel] starting cloudflared for port %d", self.port)
        # Hold a local reference throughout: stop() clears self._process from
        # another thread, and a shutdown arriving mid-read would otherwise turn
        # an orderly exit into an AttributeError in the log.
        process = subprocess.Popen(
            command, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True)
        self._process = process

        deadline = time.monotonic() + STARTUP_TIMEOUT_S
        for line in process.stderr:
            if self._stop.is_set():
                break
            found = extract_url(line)
            if found and not self.url:
                self._set_url(found)
            elif not self.url and time.monotonic() > deadline:
                logger.warning("[tunnel] no URL after %ds; still watching",
                               STARTUP_TIMEOUT_S)
                deadline = float("inf")
        process.wait()
        self._terminate()

    def _set_url(self, url: str | None) -> None:
        self.url = url
        if url:
            logger.info("[tunnel] public URL: %s", url)
            logger.info("[tunnel] MCP endpoint: %s/mcp", url)
        if self._on_url:
            try:
                self._on_url(url)
            except Exception:
                logger.exception("[tunnel] URL callback failed")
