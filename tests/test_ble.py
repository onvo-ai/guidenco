"""
Tests for the Bluetooth setup service.

Only the behaviour is covered here, which is the point of keeping D-Bus out of
ble/service.py — none of this needs a Bluetooth adapter, or Linux.
"""

import json
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from ble.service import MAX_PAYLOAD, SetupService                  # noqa: E402


def a_state(**overrides):
    state = {
        "host": "pi4", "net": "wifi", "ssid": "Rons-network-2.4",
        "ip": "192.168.0.42", "signal": -29,
        "url": "https://ever-memory-reprint-array.trycloudflare.com",
        "screen": [1920, 1080], "input": True,
    }
    state.update(overrides)
    return state


class StatusPayloadTest(unittest.TestCase):
    """
    Every payload must be valid JSON, whatever it contains.

    The page does JSON.parse on this. An unparseable payload is not a degraded
    status, it is a blank screen with no explanation — strictly worse than a
    status that is missing a field.
    """

    def service(self, **overrides):
        return SetupService(lambda: a_state(**overrides))

    def test_a_normal_status_round_trips(self):
        payload = self.service().status_payload()
        self.assertLessEqual(len(payload), MAX_PAYLOAD)
        self.assertEqual(json.loads(payload)["host"], "pi4")

    def test_the_last_action_is_included_when_there_is_room(self):
        setup = self.service()
        setup.last_result = {"action": "scan", "found": 11}
        self.assertEqual(json.loads(setup.status_payload())["last_action"]["found"], 11)

    def test_a_long_nmcli_error_does_not_break_the_payload(self):
        setup = self.service()
        setup.last_result = {
            "action": "join", "ssid": "x", "ok": False,
            "detail": "Error: Connection activation failed: (7) Secrets were "
                      "required, but not provided. " * 8,
        }
        payload = setup.status_payload()
        self.assertLessEqual(len(payload), MAX_PAYLOAD)
        json.loads(payload)                       # must parse

    def test_an_absurd_ssid_still_yields_valid_json(self):
        setup = self.service(ssid="N" * 600)
        payload = setup.status_payload()
        self.assertLessEqual(len(payload), MAX_PAYLOAD)
        self.assertEqual(json.loads(payload)["host"], "pi4")

    def test_everything_oversized_at_once_still_parses(self):
        setup = self.service(ssid="S" * 400, url="https://" + "u" * 400 + ".com",
                             host="H" * 200)
        setup.last_result = {"action": "join", "detail": "D" * 400}
        payload = setup.status_payload()
        self.assertLessEqual(len(payload), MAX_PAYLOAD)
        json.loads(payload)

    def test_the_host_survives_trimming(self):
        # Whatever else goes, the page needs to identify which bridge this is.
        setup = self.service(ssid="S" * 900)
        self.assertEqual(json.loads(setup.status_payload())["host"], "pi4")


class NetworksPayloadTest(unittest.TestCase):
    def setUp(self):
        self.setup = SetupService(a_state)

    def test_an_empty_scan_is_an_empty_list(self):
        self.assertEqual(json.loads(self.setup.networks_payload()), [])

    def test_a_normal_scan_round_trips(self):
        self.setup.networks = [{"ssid": f"net{n}", "signal": 90 - n, "secure": True}
                               for n in range(8)]
        parsed = json.loads(self.setup.networks_payload())
        self.assertEqual(len(parsed), 8)

    def test_too_many_networks_are_trimmed_to_valid_json(self):
        self.setup.networks = [{"ssid": f"network-number-{n}", "signal": 90,
                                "secure": True} for n in range(60)]
        payload = self.setup.networks_payload()
        self.assertLessEqual(len(payload), MAX_PAYLOAD)
        parsed = json.loads(payload)
        self.assertGreater(len(parsed), 0)
        self.assertLess(len(parsed), 60)

    def test_reading_does_not_destroy_the_scan(self):
        # A read is a read. It must not quietly discard results.
        self.setup.networks = [{"ssid": f"network-number-{n}", "signal": 90,
                                "secure": True} for n in range(60)]
        self.setup.networks_payload()
        self.assertEqual(len(self.setup.networks), 60,
                         "the stored scan must survive being read")

    def test_the_strongest_networks_are_kept(self):
        self.setup.networks = [{"ssid": f"net-{n}", "signal": 100 - n, "secure": True}
                               for n in range(60)]
        parsed = json.loads(self.setup.networks_payload())
        self.assertEqual(parsed[0]["ssid"], "net-0", "strongest must be kept first")


if __name__ == "__main__":
    unittest.main()
