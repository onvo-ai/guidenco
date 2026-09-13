"""
tests/test_edid.py — the generated EDID is structurally valid.

An EDID with a bad checksum or a stray byte is rejected silently by the source:
the screen simply stays dark. So these assertions stand in for the feedback the
hardware will not give us.
"""

import unittest

from capture import edid


class ChecksumTest(unittest.TestCase):
    def test_both_blocks_sum_to_zero(self):
        blob = edid.build()
        self.assertEqual(len(blob), 256)
        for index in (0, 1):
            block = blob[index * 128:(index + 1) * 128]
            self.assertEqual(sum(block) % 256, 0,
                             f"block {index} checksum is wrong")


class BaseBlockTest(unittest.TestCase):
    def setUp(self):
        self.base = edid.build()[:128]

    def test_header(self):
        self.assertEqual(self.base[:8],
                         bytes([0x00, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0x00]))

    def test_digital_input_and_version(self):
        self.assertEqual(self.base[18:20], bytes([0x01, 0x03]))  # EDID 1.3
        self.assertEqual(self.base[20] & 0x80, 0x80)             # digital

    def test_declares_one_extension(self):
        self.assertEqual(self.base[126], 1)

    def test_preferred_timing_is_1080p30(self):
        dtd = self.base[54:72]
        clock_khz = int.from_bytes(dtd[0:2], "little") * 10
        h_active = dtd[2] | ((dtd[4] >> 4) << 8)
        v_active = dtd[5] | ((dtd[7] >> 4) << 8)
        self.assertEqual((clock_khz, h_active, v_active), (74250, 1920, 1080))


class CeaBlockTest(unittest.TestCase):
    def setUp(self):
        self.cea = edid.build()[128:]

    def test_tag_and_version(self):
        self.assertEqual(self.cea[0], 0x02)
        self.assertEqual(self.cea[1], 0x03)

    def test_advertises_1080p30_as_native(self):
        formats = self._video_formats()
        self.assertIn(34, formats)

    def test_never_advertises_1080p60(self):
        # The Pi Zero 2 W has two CSI lanes. 1080p60 needs more, so a source
        # that picks it sends a signal the adapter cannot carry.
        self.assertNotIn(16, self._video_formats())

    def _video_formats(self) -> list[int]:
        offset, end = 4, self.cea[2]
        found = []
        while offset < end:
            header = self.cea[offset]
            tag, length = header >> 5, header & 0x1F
            if tag == 2:                       # video data block
                found = [b & 0x7F for b in self.cea[offset + 1:offset + 1 + length]]
            offset += 1 + length
        return found

    def test_carries_the_hdmi_vendor_block(self):
        offset, end = 4, self.cea[2]
        ouis = []
        while offset < end:
            header = self.cea[offset]
            tag, length = header >> 5, header & 0x1F
            if tag == 3:
                ouis.append(bytes(self.cea[offset + 1:offset + 4]))
            offset += 1 + length
        self.assertIn(bytes([0x03, 0x0C, 0x00]), ouis)


class TimingMathTest(unittest.TestCase):
    def test_splits_values_across_the_shared_high_byte(self):
        dtd = edid.detailed_timing(
            pixel_clock_khz=74250,
            h_active=1920, h_front=88, h_sync=44, h_blank=280,
            v_active=1080, v_front=4, v_sync=5, v_blank=45,
            width_mm=520, height_mm=290)
        self.assertEqual(len(dtd), edid.DESCRIPTOR)
        self.assertEqual(dtd[2], 1920 & 0xFF)
        self.assertEqual(dtd[3], 280 & 0xFF)
        self.assertEqual(dtd[4], (1920 >> 8) << 4 | (280 >> 8))
        self.assertEqual(dtd[8], 88)
        self.assertEqual(dtd[9], 44)
        self.assertEqual(dtd[10], (4 << 4) | 5)

    def test_rejects_a_clock_it_cannot_represent(self):
        with self.assertRaises(ValueError):
            edid.detailed_timing(
                pixel_clock_khz=74251,
                h_active=1920, h_front=88, h_sync=44, h_blank=280,
                v_active=1080, v_front=4, v_sync=5, v_blank=45,
                width_mm=520, height_mm=290)


class HexFormatTest(unittest.TestCase):
    def test_sixteen_bytes_a_line(self):
        lines = edid.to_hex(edid.build()).strip().splitlines()
        self.assertEqual(len(lines), 16)
        self.assertTrue(all(len(line) == 32 for line in lines))
        self.assertEqual(bytes.fromhex("".join(lines)), edid.build())


if __name__ == "__main__":
    unittest.main()
