"""
rfb/server.py — the VNC (RFB 3.8) server.

One thread accepts connections; each client gets a thread that both reads its
messages and writes its updates, using select() so the two never race. That is
one thread per viewer rather than two, and viewers are few.

Updates are pull-based, as RFB intends: a client asks for an update, and it is
served as soon as the framebuffer has something the client has not seen. An
idle screen therefore costs nothing but a parked request.
"""

import logging
import os
import select
import socket
import struct
import threading

from . import des
from .encodings import (
    PSEUDO_DESKTOP_SIZE, desktop_size_rect, make_encoder, update_message,
)
from .pixels import NATIVE_FORMAT, PixelFormat, Translator, UnsupportedPixelFormat

logger = logging.getLogger("guidenco.rfb")

PROTOCOL_VERSION = b"RFB 003.008\n"

SEC_NONE = 1
SEC_VNC_AUTH = 2

# Client-to-server message types.
MSG_SET_PIXEL_FORMAT = 0
MSG_FIX_COLOUR_MAP = 1
MSG_SET_ENCODINGS = 2
MSG_UPDATE_REQUEST = 3
MSG_KEY_EVENT = 4
MSG_POINTER_EVENT = 5
MSG_CUT_TEXT = 6

HANDSHAKE_TIMEOUT_S = 20
#: The socket stays blocking with a timeout rather than going non-blocking.
#: A full-screen update is megabytes and will not fit in the send buffer, so a
#: non-blocking sendall() fails with EAGAIN partway through; blocking gives us
#: backpressure on slow clients instead. The timeout is what reaps a wedged one.
SEND_TIMEOUT_S = 30
#: How long to wait for the first captured frame before serving a placeholder
#: screen. A client connecting to a Pi with no HDMI signal should see something
#: and get the real size later, not hang.
FIRST_FRAME_WAIT_S = 10
PLACEHOLDER_SIZE = (640, 480)


class _Disconnect(Exception):
    """Raised internally to unwind a client thread cleanly."""


class ClientSession:
    def __init__(self, sock: socket.socket, address, server: "VncServer") -> None:
        self.sock = sock
        self.address = address
        self.server = server
        self.framebuffer = server.framebuffer
        self.input = server.input

        self.buffer = bytearray()
        self.encodings: list[int] = []
        self.translator = Translator(NATIVE_FORMAT)
        self.encoder = None
        self.update_pending = False

        self.width, self.height = 0, 0
        self.generation = -1
        self.sent_versions: list[int] = []
        self.running = True

    # ── Socket helpers ────────────────────────────────────────────────────────

    def _recv_exact(self, count: int) -> bytes:
        data = bytearray()
        while len(data) < count:
            chunk = self.sock.recv(count - len(data))
            if not chunk:
                raise _Disconnect("client closed during handshake")
            data += chunk
        return bytes(data)

    def _send(self, data: bytes) -> None:
        try:
            self.sock.sendall(data)
        except TimeoutError:
            raise _Disconnect(f"client did not read {len(data)} bytes within "
                              f"{SEND_TIMEOUT_S}s")

    # ── Handshake ─────────────────────────────────────────────────────────────

    def handshake(self) -> None:
        self.sock.settimeout(HANDSHAKE_TIMEOUT_S)
        self._send(PROTOCOL_VERSION)
        version = self._recv_exact(12)
        logger.info("[rfb] %s speaks %s", self.address[0], version.decode(errors="replace").strip())

        self._authenticate()

        self._recv_exact(1)          # ClientInit shared-flag; we always share
        width, height = self._await_geometry()
        self.width, self.height = width, height
        self.generation = self.framebuffer.generation

        name = self.server.name.encode()
        self._send(struct.pack(">HH", width, height)
                   + NATIVE_FORMAT.pack()
                   + struct.pack(">I", len(name)) + name)
        logger.info("[rfb] %s connected — %dx%d", self.address[0], width, height)

    def _authenticate(self) -> None:
        password = self.server.password
        offered = SEC_VNC_AUTH if password else SEC_NONE
        self._send(bytes([1, offered]))
        chosen = self._recv_exact(1)[0]
        if chosen != offered:
            self._send(struct.pack(">I", 1))
            self._send_reason("unsupported security type")
            raise _Disconnect(f"client chose security type {chosen}, we offered {offered}")

        if offered == SEC_VNC_AUTH:
            challenge = os.urandom(16)
            self._send(challenge)
            response = self._recv_exact(16)
            if response != des.vnc_response(password, challenge):
                logger.warning("[rfb] %s failed authentication", self.address[0])
                self._send(struct.pack(">I", 1))
                self._send_reason("authentication failed")
                raise _Disconnect("bad password")

        self._send(struct.pack(">I", 0))

    def _send_reason(self, reason: str) -> None:
        """RFB 3.8 attaches a human-readable reason to a failed SecurityResult."""
        try:
            encoded = reason.encode()
            self._send(struct.pack(">I", len(encoded)) + encoded)
        except OSError:
            pass

    def _await_geometry(self) -> tuple[int, int]:
        """Block briefly for a real frame so we can advertise the true size."""
        deadline = threading.Event()
        for _ in range(int(FIRST_FRAME_WAIT_S * 10)):
            if self.framebuffer.width and self.framebuffer.height:
                return self.framebuffer.width, self.framebuffer.height
            deadline.wait(0.1)
        logger.warning("[rfb] no captured frame yet — advertising %dx%d placeholder",
                       *PLACEHOLDER_SIZE)
        return PLACEHOLDER_SIZE

    # ── Main loop ─────────────────────────────────────────────────────────────

    def run(self) -> None:
        try:
            self.handshake()
            self.sock.settimeout(SEND_TIMEOUT_S)
            while self.running and self.server.running:
                # Poll briefly while an update is owed so latency stays low;
                # otherwise idle until the client says something. recv() only
                # runs once select says data is waiting, so it never blocks.
                timeout = 0.01 if self.update_pending else 0.5
                readable, _, _ = select.select([self.sock], [], [], timeout)
                if readable:
                    self._read_available()
                    self._drain_messages()
                if self.update_pending:
                    self._service_update()
        except _Disconnect as exc:
            logger.info("[rfb] %s disconnected: %s", self.address[0], exc)
        except (OSError, ConnectionError) as exc:
            logger.info("[rfb] %s connection ended: %s", self.address[0], exc)
        except Exception:
            logger.exception("[rfb] %s client error", self.address[0])
        finally:
            self.close()

    def close(self) -> None:
        self.running = False
        try:
            self.sock.close()
        except OSError:
            pass
        self.server.forget(self)

    # ── Reading client messages ───────────────────────────────────────────────

    def _read_available(self) -> None:
        try:
            chunk = self.sock.recv(65536)
        except BlockingIOError:
            return
        except TimeoutError:
            raise _Disconnect("client stopped responding")
        if not chunk:
            raise _Disconnect("client closed")
        self.buffer += chunk

    def _drain_messages(self) -> None:
        """Consume every complete message sitting in the buffer."""
        while self.buffer:
            consumed = self._handle_one(self.buffer)
            if consumed == 0:
                return               # partial message — wait for more bytes
            del self.buffer[:consumed]

    def _handle_one(self, buf: bytearray) -> int:
        """Handle the message at the head of *buf*; return bytes consumed."""
        kind = buf[0]

        if kind == MSG_SET_PIXEL_FORMAT:
            if len(buf) < 20:
                return 0
            self._set_pixel_format(bytes(buf[4:20]))
            return 20

        if kind == MSG_SET_ENCODINGS:
            if len(buf) < 4:
                return 0
            count = struct.unpack(">H", buf[2:4])[0]
            size = 4 + count * 4
            if len(buf) < size:
                return 0
            self._set_encodings(struct.unpack(f">{count}i", buf[4:size]))
            return size

        if kind == MSG_UPDATE_REQUEST:
            if len(buf) < 10:
                return 0
            incremental = buf[1]
            if not incremental:
                # A full-update request: forget what we think the client has.
                self.sent_versions = []
            self.update_pending = True
            return 10

        if kind == MSG_KEY_EVENT:
            if len(buf) < 8:
                return 0
            down, keysym = struct.unpack(">B2xI", buf[1:8])
            self.input.key(keysym, bool(down))
            return 8

        if kind == MSG_POINTER_EVENT:
            if len(buf) < 6:
                return 0
            mask, x, y = struct.unpack(">BHH", buf[1:6])
            self.input.pointer(x, y, self.width, self.height, mask)
            return 6

        if kind == MSG_CUT_TEXT:
            if len(buf) < 8:
                return 0
            length = struct.unpack(">I", buf[4:8])[0]
            if len(buf) < 8 + length:
                return 0
            return 8 + length        # clipboard is out of scope for a HID bridge

        if kind == MSG_FIX_COLOUR_MAP:
            if len(buf) < 6:
                return 0
            count = struct.unpack(">H", buf[4:6])[0]
            size = 6 + count * 6
            return size if len(buf) >= size else 0

        raise _Disconnect(f"unknown client message type {kind}")

    def _set_pixel_format(self, raw: bytes) -> None:
        fmt = PixelFormat.unpack(raw)
        try:
            self.translator = Translator(fmt)
        except UnsupportedPixelFormat as exc:
            raise _Disconnect(f"unsupported pixel format: {exc}")
        logger.info("[rfb] %s pixel format: %s", self.address[0], self.translator)
        self._rebuild_encoder()

    def _set_encodings(self, encodings) -> None:
        self.encodings = list(encodings)
        self._rebuild_encoder()
        logger.info("[rfb] %s encoder: %s", self.address[0],
                    type(self.encoder).__name__)

    def _rebuild_encoder(self) -> None:
        # ZRLE's zlib stream is per-connection state, so changing either the
        # encoding set or the pixel format has to start a fresh one — and the
        # client must be resent everything in the new terms.
        self.encoder = make_encoder(self.encodings, self.translator)
        self.sent_versions = []

    # ── Writing updates ───────────────────────────────────────────────────────

    def _service_update(self) -> None:
        if self.encoder is None:
            self.encoder = make_encoder(self.encodings, self.translator)

        generation, width, height, runs = self.framebuffer.snapshot(self.sent_versions)
        rects = []

        if generation != self.generation or (width, height) != (self.width, self.height):
            if width and height:
                self.generation = generation
                self.width, self.height = width, height
                if PSEUDO_DESKTOP_SIZE in self.encodings:
                    rects.append(desktop_size_rect(width, height))
                    self.sent_versions = []
                    generation, width, height, runs = self.framebuffer.snapshot([])
                else:
                    logger.warning("[rfb] %s cannot be told about the %dx%d resize "
                                   "(no DesktopSize support) — reconnect to resync",
                                   self.address[0], width, height)
                    raise _Disconnect("resolution changed, client cannot resize")

        stride = width * 3
        for top, rows, pixels, versions in runs:
            rects.append(self.encoder.encode(0, top, width, rows, pixels, stride))
            self._record(versions)

        if not rects:
            return                   # nothing new; keep the request parked
        self._send(update_message(rects))
        self.update_pending = False

    def _record(self, versions) -> None:
        if len(self.sent_versions) != self.framebuffer.band_count:
            self.sent_versions = [-1] * self.framebuffer.band_count
        for band, version in versions:
            if band < len(self.sent_versions):
                self.sent_versions[band] = version


class VncServer:
    def __init__(self, framebuffer, input_handler, host: str = "0.0.0.0",
                 port: int = 5900, password: str = "", max_clients: int = 4,
                 name: str = "guidenco") -> None:
        self.framebuffer = framebuffer
        self.input = input_handler
        self.host = host
        self.port = port
        self.password = password
        self.max_clients = max_clients
        self.name = name

        self.running = False
        self._sock: socket.socket | None = None
        self._clients: list[ClientSession] = []
        self._lock = threading.Lock()

    def start(self) -> int:
        """Bind and listen. Returns the bound port, useful when port is 0."""
        self._sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self._sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        self._sock.bind((self.host, self.port))
        self._sock.listen(8)
        self.port = self._sock.getsockname()[1]
        self.running = True
        if self.password:
            logger.info("[rfb] listening on %s:%d (password required)", self.host, self.port)
        else:
            logger.warning("[rfb] listening on %s:%d with NO PASSWORD — anyone who can "
                           "reach this port has full control. Set VNC_PASSWORD.",
                           self.host, self.port)
        return self.port

    def serve_forever(self) -> None:
        if not self.running:
            self.start()
        while self.running:
            try:
                sock, address = self._sock.accept()
            except OSError:
                if self.running:
                    logger.exception("[rfb] accept failed")
                return
            sock.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
            with self._lock:
                over_capacity = len(self._clients) >= self.max_clients
            if over_capacity:
                logger.warning("[rfb] refusing %s — %d clients already connected",
                               address[0], self.max_clients)
                sock.close()
                continue
            session = ClientSession(sock, address, self)
            with self._lock:
                self._clients.append(session)
            threading.Thread(target=session.run, daemon=True,
                             name=f"rfb-{address[0]}").start()

    def forget(self, session: ClientSession) -> None:
        with self._lock:
            if session in self._clients:
                self._clients.remove(session)
            remaining = len(self._clients)
        if remaining == 0:
            # Nobody is holding keys or buttons down any more. Without this a
            # client that dies mid-drag leaves the target's mouse button stuck.
            self.input.release_all()

    def stop(self) -> None:
        self.running = False
        with self._lock:
            clients = list(self._clients)
        for session in clients:
            session.close()
        if self._sock:
            try:
                self._sock.close()
            except OSError:
                pass
