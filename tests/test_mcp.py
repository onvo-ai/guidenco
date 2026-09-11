"""
Tests for the MCP endpoint.

Speaks the wire protocol over a real socket rather than calling the handler
directly, so the HTTP-level requirements of the Streamable HTTP transport —
status codes, session headers, Origin validation — are actually exercised.
"""

import base64
import json
import os
import sys
import threading
import unittest
import urllib.error
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import config                                                      # noqa: E402
from api.mcp import (                                              # noqa: E402
    INVALID_PARAMS, LATEST_PROTOCOL, METHOD_NOT_FOUND, SUPPORTED_PROTOCOLS,
    origin_allowed, protocol_version_ok,
)
from api.server import ApiServer                                   # noqa: E402
from capture.framebuffer import Framebuffer                        # noqa: E402
from tests.test_api import RecordingGadget                         # noqa: E402


class GuardTest(unittest.TestCase):
    def test_absent_origin_is_allowed(self):
        # Claude and curl send no Origin at all.
        self.assertTrue(origin_allowed(None))

    def test_a_remote_web_origin_is_refused(self):
        # A page on the open web must not be able to drive a LAN device.
        self.assertFalse(origin_allowed("https://evil.example"))
        self.assertFalse(origin_allowed("http://192.168.0.99"))

    def test_localhost_origins_are_allowed(self):
        self.assertTrue(origin_allowed("http://localhost:3000"))
        self.assertTrue(origin_allowed("http://127.0.0.1:8080"))

    def test_absent_protocol_version_is_allowed(self):
        # The spec says to assume 2025-03-26 when the header is missing.
        self.assertTrue(protocol_version_ok(None))

    def test_supported_versions_are_accepted(self):
        for version in SUPPORTED_PROTOCOLS:
            self.assertTrue(protocol_version_ok(version), version)

    def test_an_unknown_version_is_refused(self):
        self.assertFalse(protocol_version_ok("1999-01-01"))


class TunnelUrlTest(unittest.TestCase):
    """
    cloudflared mentions its own hosts on the same domain as the tunnel it
    assigns, and picking the wrong one yields a URL that looks right and works
    for nobody.
    """

    def test_the_assigned_hostname_is_found(self):
        from api.tunnel import extract_url
        line = ("2026-09-11T13:10:27Z INF |  https://samba-peer-protective-ton."
                "trycloudflare.com  |")
        self.assertEqual(extract_url(line),
                         "https://samba-peer-protective-ton.trycloudflare.com")

    def test_cloudflareds_own_api_host_is_ignored(self):
        from api.tunnel import extract_url
        self.assertIsNone(extract_url(
            "INF Requesting new quick Tunnel on trycloudflare.com... "
            "url=https://api.trycloudflare.com"))

    def test_other_infrastructure_hosts_are_ignored(self):
        from api.tunnel import extract_url
        for host in ("update", "www"):
            self.assertIsNone(extract_url(f"see https://{host}.trycloudflare.com"), host)

    def test_unrelated_lines_yield_nothing(self):
        from api.tunnel import extract_url
        self.assertIsNone(extract_url("INF Starting tunnel tunnelID=abc123"))


class McpTestCase(unittest.TestCase):
    TOKEN = ""

    def setUp(self):
        import hid
        self.hid = hid
        self.gadget = RecordingGadget()
        self.gadget.install(hid)
        hid.set_screen(1920, 1080)

        self._old_token = config.API_TOKEN
        config.API_TOKEN = self.TOKEN

        self.framebuffer = Framebuffer(1920, 1080)
        self.jpeg = b"\xff\xd8" + b"realframe" * 60 + b"\xff\xd9"
        self.framebuffer.update(self.jpeg)
        self.server = ApiServer(self.framebuffer, "127.0.0.1", 0)
        self.port = self.server.server_port
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.session = None

    def tearDown(self):
        config.API_TOKEN = self._old_token
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=5)
        self.hid._enabled = False

    # ── Wire helpers ──────────────────────────────────────────────────────────

    def post(self, payload, session=None, headers=None, token=None, method="POST"):
        request = urllib.request.Request(
            f"http://127.0.0.1:{self.port}/mcp",
            data=json.dumps(payload).encode() if payload is not None else None,
            method=method)
        request.add_header("Content-Type", "application/json")
        request.add_header("Accept", "application/json, text/event-stream")
        if session or self.session:
            request.add_header("Mcp-Session-Id", session or self.session)
        if token or self.TOKEN:
            request.add_header("Authorization", f"Bearer {token or self.TOKEN}")
        for key, value in (headers or {}).items():
            request.add_header(key, value)
        with urllib.request.urlopen(request, timeout=10) as response:
            body = response.read()
            return response.status, dict(response.headers), (json.loads(body) if body else None)

    def initialize(self):
        status, headers, body = self.post({
            "jsonrpc": "2.0", "id": 1, "method": "initialize",
            "params": {"protocolVersion": LATEST_PROTOCOL,
                       "capabilities": {}, "clientInfo": {"name": "test", "version": "1"}},
        })
        self.session = headers.get("Mcp-Session-Id")
        return status, headers, body

    def call_tool(self, name, arguments=None, request_id=99):
        _, _, body = self.post({
            "jsonrpc": "2.0", "id": request_id, "method": "tools/call",
            "params": {"name": name, "arguments": arguments or {}},
        })
        return body


class LifecycleTest(McpTestCase):
    def test_initialize_returns_a_session_and_capabilities(self):
        status, headers, body = self.initialize()
        self.assertEqual(status, 200)
        self.assertIn("Mcp-Session-Id", headers)
        result = body["result"]
        self.assertEqual(result["protocolVersion"], LATEST_PROTOCOL)
        self.assertIn("tools", result["capabilities"])
        self.assertEqual(result["serverInfo"]["name"], "guidenco")

    def test_initialize_carries_instructions_for_the_model(self):
        _, _, body = self.initialize()
        instructions = body["result"]["instructions"]
        self.assertIn("screenshot", instructions.lower())

    def test_an_older_protocol_version_is_echoed_back(self):
        _, _, body = self.post({
            "jsonrpc": "2.0", "id": 1, "method": "initialize",
            "params": {"protocolVersion": "2024-11-05", "capabilities": {}},
        })
        self.assertEqual(body["result"]["protocolVersion"], "2024-11-05")

    def test_an_unknown_protocol_version_falls_back_to_ours(self):
        _, _, body = self.post({
            "jsonrpc": "2.0", "id": 1, "method": "initialize",
            "params": {"protocolVersion": "1999-01-01", "capabilities": {}},
        })
        self.assertEqual(body["result"]["protocolVersion"], LATEST_PROTOCOL)

    def test_a_notification_gets_202_with_no_body(self):
        self.initialize()
        status, _, body = self.post({"jsonrpc": "2.0", "method": "notifications/initialized"})
        self.assertEqual(status, 202)
        self.assertIsNone(body)

    def test_ping_is_answered(self):
        self.initialize()
        _, _, body = self.post({"jsonrpc": "2.0", "id": 7, "method": "ping"})
        self.assertEqual(body["id"], 7)
        self.assertEqual(body["result"], {})

    def test_an_expired_session_gets_404_so_the_client_reinitialises(self):
        self.initialize()
        with self.assertRaises(urllib.error.HTTPError) as caught:
            self.post({"jsonrpc": "2.0", "id": 2, "method": "tools/list"},
                      session="deadbeefdeadbeefdeadbeefdeadbeef")
        self.assertEqual(caught.exception.code, 404)

    def test_delete_ends_the_session(self):
        self.initialize()
        status, _, _ = self.post(None, method="DELETE")
        self.assertEqual(status, 204)

    def test_get_reports_no_sse_stream(self):
        with self.assertRaises(urllib.error.HTTPError) as caught:
            urllib.request.urlopen(f"http://127.0.0.1:{self.port}/mcp", timeout=5)
        self.assertEqual(caught.exception.code, 405)

    def test_an_unsupported_protocol_header_is_rejected(self):
        with self.assertRaises(urllib.error.HTTPError) as caught:
            self.post({"jsonrpc": "2.0", "id": 1, "method": "ping"},
                      headers={"MCP-Protocol-Version": "1999-01-01"})
        self.assertEqual(caught.exception.code, 400)

    def test_a_web_origin_is_refused(self):
        with self.assertRaises(urllib.error.HTTPError) as caught:
            self.post({"jsonrpc": "2.0", "id": 1, "method": "ping"},
                      headers={"Origin": "https://evil.example"})
        self.assertEqual(caught.exception.code, 403)

    def test_malformed_json_is_a_parse_error(self):
        request = urllib.request.Request(f"http://127.0.0.1:{self.port}/mcp",
                                         data=b"{not json", method="POST")
        request.add_header("Content-Type", "application/json")
        with self.assertRaises(urllib.error.HTTPError) as caught:
            urllib.request.urlopen(request, timeout=5)
        self.assertEqual(caught.exception.code, 400)

    def test_an_unknown_method_is_reported_as_such(self):
        self.initialize()
        _, _, body = self.post({"jsonrpc": "2.0", "id": 3, "method": "resources/list"})
        self.assertEqual(body["error"]["code"], METHOD_NOT_FOUND)


class ToolListTest(McpTestCase):
    def test_every_tool_has_a_name_description_and_schema(self):
        self.initialize()
        _, _, body = self.post({"jsonrpc": "2.0", "id": 2, "method": "tools/list"})
        tools = body["result"]["tools"]
        self.assertGreaterEqual(len(tools), 8)
        for tool in tools:
            self.assertIn("name", tool)
            self.assertTrue(tool.get("description"), tool["name"])
            self.assertEqual(tool["inputSchema"]["type"], "object", tool["name"])

    def test_the_expected_tools_are_present(self):
        self.initialize()
        _, _, body = self.post({"jsonrpc": "2.0", "id": 2, "method": "tools/list"})
        names = {tool["name"] for tool in body["result"]["tools"]}
        self.assertEqual(names, {
            "screenshot", "get_status", "move_mouse", "click", "drag",
            "scroll", "type_text", "press_key",
        })

    def test_required_arguments_are_declared(self):
        self.initialize()
        _, _, body = self.post({"jsonrpc": "2.0", "id": 2, "method": "tools/list"})
        schemas = {t["name"]: t["inputSchema"] for t in body["result"]["tools"]}
        self.assertEqual(set(schemas["click"]["required"]), {"x", "y"})
        self.assertEqual(set(schemas["scroll"]["required"]), {"x", "y", "amount"})
        self.assertEqual(set(schemas["drag"]["required"]),
                         {"from_x", "from_y", "to_x", "to_y"})
        self.assertEqual(schemas["type_text"]["required"], ["text"])


class ToolCallTest(McpTestCase):
    def setUp(self):
        super().setUp()
        self.initialize()

    def test_screenshot_returns_the_frame_as_an_image_block(self):
        body = self.call_tool("screenshot")
        content = body["result"]["content"]
        image = next(block for block in content if block["type"] == "image")
        self.assertEqual(image["mimeType"], "image/jpeg")
        self.assertEqual(base64.b64decode(image["data"]), self.jpeg,
                         "the frame must reach the model unmodified")

    def test_screenshot_also_states_the_coordinate_space(self):
        body = self.call_tool("screenshot")
        text = " ".join(b["text"] for b in body["result"]["content"] if b["type"] == "text")
        self.assertIn("1920x1080", text)

    def test_click_reaches_the_gadget(self):
        self.call_tool("click", {"x": 100, "y": 200, "smooth": False})
        self.assertIn(1, self.gadget.buttons)
        self.assertEqual(self.gadget.positions[-1],
                         (self.hid._to_abs(100, 0, 1920), self.hid._to_abs(200, 0, 1080)))

    def test_type_text_reports_skipped_characters(self):
        body = self.call_tool("type_text", {"text": "hi \U0001f600"})
        text = body["result"]["content"][0]["text"]
        self.assertIn("skipped", text.lower())

    def test_press_key_sets_the_modifier(self):
        self.call_tool("press_key", {"key": "cmd+shift+4"})
        from hid.keys import MOD_LGUI, MOD_LSHIFT
        self.assertEqual(self.gadget.keyboard[0][0], MOD_LGUI | MOD_LSHIFT)

    def test_scroll_emits_notches(self):
        self.call_tool("scroll", {"x": 10, "y": 10, "amount": -2, "smooth": False})
        self.assertEqual([w for w in self.gadget.wheels if w != 0], [-1, -1])

    def test_drag_holds_the_button_across_the_motion(self):
        self.call_tool("drag", {"from_x": 100, "from_y": 100,
                                "to_x": 900, "to_y": 700})
        held = [b for b in self.gadget.buttons if b == 1]
        self.assertGreater(len(held), 5)

    def test_get_status_returns_structured_content(self):
        body = self.call_tool("get_status")
        structured = body["result"]["structuredContent"]
        self.assertEqual(structured["screen"]["width"], 1920)
        self.assertIn("network", structured)

    def test_off_screen_coordinates_come_back_as_a_tool_error(self):
        # Not a JSON-RPC error: that would tear down the session over a
        # coordinate the model could simply correct.
        body = self.call_tool("click", {"x": 5000, "y": 10})
        self.assertNotIn("error", body)
        self.assertTrue(body["result"]["isError"])
        self.assertIn("outside", body["result"]["content"][0]["text"])

    def test_a_missing_argument_comes_back_as_a_tool_error(self):
        body = self.call_tool("click", {"x": 10})
        self.assertTrue(body["result"]["isError"])
        self.assertIn("y", body["result"]["content"][0]["text"])

    def test_the_session_survives_a_tool_error(self):
        self.call_tool("click", {"x": 5000, "y": 10})
        _, _, body = self.post({"jsonrpc": "2.0", "id": 50, "method": "ping"})
        self.assertEqual(body["result"], {}, "the session must still be usable")

    def test_an_unknown_tool_is_reported(self):
        body = self.call_tool("launch_missiles")
        self.assertEqual(body["error"]["code"], METHOD_NOT_FOUND)

    def test_a_bad_key_name_is_a_tool_error_not_a_protocol_error(self):
        # The model should see this and correct itself, not have the call fail.
        body = self.call_tool("press_key", {"key": "ctrl+wibble"})
        self.assertTrue(body["result"]["isError"])
        self.assertIn("wibble", body["result"]["content"][0]["text"])

    def test_input_unavailable_is_a_tool_error(self):
        self.hid._enabled = False
        body = self.call_tool("click", {"x": 5, "y": 5})
        self.assertTrue(body["result"]["isError"])
        self.assertIn("unavailable", body["result"]["content"][0]["text"].lower())


class McpAuthTest(McpTestCase):
    TOKEN = "mcp-secret"

    def test_the_right_token_works(self):
        status, _, _ = self.initialize()
        self.assertEqual(status, 200)

    def test_no_token_is_refused(self):
        request = urllib.request.Request(
            f"http://127.0.0.1:{self.port}/mcp",
            data=json.dumps({"jsonrpc": "2.0", "id": 1, "method": "ping"}).encode(),
            method="POST")
        request.add_header("Content-Type", "application/json")
        with self.assertRaises(urllib.error.HTTPError) as caught:
            urllib.request.urlopen(request, timeout=5)
        self.assertEqual(caught.exception.code, 401)


class RestSurfaceTest(McpTestCase):
    """Actions were removed from REST; only reads remain."""

    def test_read_endpoints_still_work(self):
        for path in ("/health", "/screenshot"):
            with urllib.request.urlopen(
                    f"http://127.0.0.1:{self.port}{path}", timeout=5) as response:
                self.assertEqual(response.status, 200, path)

    def test_the_old_rest_action_paths_are_gone(self):
        for path in ("/click", "/type", "/move"):
            request = urllib.request.Request(
                f"http://127.0.0.1:{self.port}{path}", data=b"{}", method="POST")
            with self.assertRaises(urllib.error.HTTPError) as caught:
                urllib.request.urlopen(request, timeout=5)
            self.assertEqual(caught.exception.code, 404, path)

    def test_the_index_advertises_the_mcp_endpoint(self):
        with urllib.request.urlopen(f"http://127.0.0.1:{self.port}/", timeout=5) as response:
            body = json.loads(response.read())
        self.assertEqual(body["mcp"], "/mcp")


if __name__ == "__main__":
    unittest.main()
