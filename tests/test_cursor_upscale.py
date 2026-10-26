import io
import struct
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from PIL import Image

from utils import cursor_formats as cursor


SCRIPT = Path(__file__).resolve().parents[1] / "cursor_upscale.py"


def pack_cur(entries):
    """Build input containers independently of the production encoder."""
    directory = []
    payloads = []
    offset = 6 + 16 * len(entries)
    for width, height, hx, hy, payload in entries:
        directory.append(struct.pack(
            "<BBBBHHII", width % 256, height % 256, 0, 0,
            hx, hy, len(payload), offset,
        ))
        payloads.append(payload)
        offset += len(payload)
    return struct.pack("<HHH", 0, 2, len(entries)) + b"".join(directory + payloads)


def dib_fixture(width=3, height=2, bits=32, legacy_alpha=False):
    palette = [(0, 0, 0), (230, 80, 40)]
    rows = []
    pixels = []
    for y in range(height):
        row = bytearray((width * bits + 31) // 32 * 4)
        for x in range(width):
            if bits <= 8:
                index = (x + y) % 2
                rgb = palette[index]
                shift = 8 - bits - (x * bits % 8)
                row[x * bits // 8] |= index << shift
                alpha = 255
            else:
                rgb = (0, 0, 0) if (x, y) == (0, 0) else (20 + x, 70 + y, 150)
                alpha = 128 if bits == 32 and (x, y) == (1, 0) else 255
                raw_alpha = 0 if legacy_alpha or (x, y) == (0, 0) else alpha
                sample = bytes((rgb[2], rgb[1], rgb[0]))
                if bits == 32:
                    sample += bytes((raw_alpha,))
                start = x * (bits // 8)
                row[start:start + len(sample)] = sample
            if (x, y) == (0, 0):
                alpha = 0
            elif legacy_alpha:
                alpha = 255
            pixels.append((*rgb, alpha))
        rows.append(bytes(row))
    mask_stride = (width + 31) // 32 * 4
    mask = [bytes(mask_stride) for _ in range(height)]
    mask[0] = b"\x80" + bytes(mask_stride - 1)
    bitmap = b"".join(reversed(rows)) + b"".join(reversed(mask))
    colors = b"".join(bytes((b, g, r, 0)) for r, g, b in palette) if bits <= 8 else b""
    header = struct.pack(
        "<IiiHHIIiiII", 40, width, height * 2, 1, bits,
        0, len(bitmap), 0, 0, 2 if bits <= 8 else 0, 0,
    )
    expected = Image.new("RGBA", (width, height))
    expected.putdata(pixels)
    payload = header + colors + bitmap
    return pack_cur([(width, height, 1, 1, payload)]), expected


def pack_chunk(tag, payload):
    return tag + struct.pack("<I", len(payload)) + payload + bytes(len(payload) % 2)


def unpack_chunks(data, start=0):
    result = []
    while start < len(data):
        tag, size = struct.unpack_from("<4sI", data, start)
        end = start + 8 + size
        if end + size % 2 > len(data):
            raise AssertionError("Invalid output chunk boundary")
        result.append((tag, data[start + 8:end]))
        start = end + size % 2
    return result


def ani_fixture(frames, frame_count=None):
    count = len(frames) if frame_count is None else frame_count
    header = struct.pack("<9I", 36, count, 3, 3, 2, 24, 1, 6, 3)
    body = b"ACON" + pack_chunk(b"anih", header)
    body += pack_chunk(b"rate", struct.pack("<3I", 3, 9, 5))
    body += pack_chunk(b"seq ", struct.pack("<3I", 1, 0, 1))
    body += pack_chunk(b"LIST", b"INFO" + pack_chunk(b"INAM", b"odd"))
    body += pack_chunk(b"JUNK", b"abc")
    body += pack_chunk(b"LIST", b"fram" + b"".join(pack_chunk(b"icon", f) for f in frames))
    return b"RIFF" + struct.pack("<I", len(body)) + body


def cur_payloads(data):
    count = struct.unpack_from("<H", data, 4)[0]
    for index in range(count):
        length, offset = struct.unpack_from("<II", data, 14 + index * 16)
        yield data[offset:offset + length]


class CursorTests(unittest.TestCase):
    def assert_scaled_pixels(self, output, expected, scale):
        with Image.open(io.BytesIO(output)) as image:
            actual = image.convert("RGBA")
        self.assertEqual(actual.size, (expected.width * scale, expected.height * scale))
        self.assertEqual(struct.unpack_from("<HH", output, 10), (scale, scale))
        for y in range(actual.height):
            for x in range(actual.width):
                self.assertEqual(actual.getpixel((x, y)), expected.getpixel((x // scale, y // scale)))

    def test_bitmap_formats_preserve_pixels_alpha_and_hotspots(self):
        for bits, legacy in ((1, False), (4, False), (8, False), (24, False), (32, False), (32, True)):
            with self.subTest(bits=bits, legacy=legacy):
                data, expected = dib_fixture(width=5, height=4, bits=bits, legacy_alpha=legacy)
                self.assert_scaled_pixels(cursor.upscale_cur(data, 3), expected, 3)

    def test_png_image_scaling(self):
        image = Image.new("RGBA", (3, 2), (10, 30, 80, 128))
        image.putpixel((0, 0), (0, 0, 0, 0))
        buffer = io.BytesIO()
        image.save(buffer, format="PNG")
        data = pack_cur([(3, 2, 1, 1, buffer.getvalue())])
        self.assert_scaled_pixels(cursor.upscale_cur(data, 2), image, 2)

    def test_combined_cur_preserves_native_images_without_duplicates(self):
        small, _ = dib_fixture(width=16, height=16)
        large, _ = dib_fixture(width=32, height=32, bits=24)
        original = pack_cur([(16, 16, 1, 1, small[22:]), (32, 32, 1, 1, large[22:])])
        variants = [cursor.upscale_cur(original, scale) for scale in (2, 5)]
        combined = cursor.merge_cur_variants(original, variants)
        self.assertEqual(cursor.get_cursor_sizes(combined), ((16, 16), (32, 32), (64, 64), (80, 80), (160, 160)))
        self.assertEqual(struct.unpack_from("<H", combined, 4)[0], 5)
        self.assertEqual(list(cur_payloads(combined))[:2], list(cur_payloads(original)))

    def test_ani_preserves_original_frames_timing_and_other_chunks(self):
        first, _ = dib_fixture()
        second, _ = dib_fixture(bits=24)
        original = ani_fixture([first, second])
        variants = [cursor.upscale_ani(original, scale) for scale in (2, 5)]
        combined = cursor.merge_ani_variants(original, variants)
        self.assertEqual(struct.unpack_from("<I", combined, 4)[0], len(combined) - 8)
        before, after = unpack_chunks(original, 12), unpack_chunks(combined, 12)
        self.assertEqual([tag for tag, _ in before], [tag for tag, _ in after])
        for (tag, old), (_, new) in zip(before, after):
            if tag == b"anih":
                self.assertEqual(struct.unpack("<9I", new), (36, 2, 3, 0, 0, 0, 0, 6, 3))
            elif tag == b"LIST" and old[:4] == b"fram":
                for (_, old_frame), (_, new_frame) in zip(unpack_chunks(old, 4), unpack_chunks(new, 4)):
                    self.assertEqual(cursor.get_cursor_sizes(new_frame), ((3, 2), (6, 4), (15, 10)))
                    self.assertEqual(next(cur_payloads(new_frame)), next(cur_payloads(old_frame)))
            else:
                self.assertEqual(new, old)


class CliTests(unittest.TestCase):
    def run_cli(self, path, *args):
        return subprocess.run([sys.executable, str(SCRIPT), str(path), *args], capture_output=True, text=True)

    def test_non_square_sources_scale_by_default_for_cur_and_ani(self):
        for suffix in (".cur", ".ani"):
            for options in ((), ("--all",)):
                with self.subTest(suffix=suffix, options=options), tempfile.TemporaryDirectory() as temp:
                    source = Path(temp) / f"Person{suffix}"
                    frame, _ = dib_fixture(width=32, height=33)
                    original = ani_fixture([frame, frame]) if suffix == ".ani" else frame
                    source.write_bytes(original)
                    result = self.run_cli(source, *options)
                    self.assertEqual(result.returncode, 0, result.stderr)
                    output = source.with_name(f"Person_upscaled{suffix}").read_bytes()
                    sizes = ((32, 33), (64, 66), (160, 165)) if options else ((32, 33), (64, 66))
                    self.assertEqual(cursor.get_cursor_sizes(output, suffix == ".ani"), sizes)
                    self.assertEqual(source.read_bytes(), original)

    def test_one_folder_keeps_names_and_inf(self):
        with tempfile.TemporaryDirectory() as temp:
            source = Path(temp) / "pack" / "Windows"
            source.mkdir(parents=True)
            small, _ = dib_fixture(width=32, height=32)
            large, _ = dib_fixture(width=64, height=64)
            (source / "Normal.cur").write_bytes(small)
            (source / "Large.cur").write_bytes(large)
            inf = b'[Strings]\r\npointer="Normal.cur"\r\nhorz="Large.cur"\r\n'
            (source / "install.inf").write_bytes(inf)
            result = self.run_cli(source.parent, "--all")
            self.assertEqual(result.returncode, 0, result.stderr)
            output = Path(temp) / "pack_upscaled"
            self.assertEqual(sorted(path.name for path in Path(temp).iterdir()), ["pack", "pack_upscaled"])
            self.assertEqual((output / "Windows" / "install.inf").read_bytes(), inf)
            large_output = (output / "Windows" / "Large.cur").read_bytes()
            self.assertEqual(cursor.get_cursor_sizes(large_output), ((64, 64), (128, 128)))
            self.assertEqual(next(cur_payloads(large_output)), next(cur_payloads(large)))
            self.assertEqual(cursor.get_cursor_sizes((output / "Windows" / "Normal.cur").read_bytes()), ((32, 32), (64, 64), (160, 160)))
            self.assertIn("3 converted, 3 skipped, 0 failed", result.stdout)
            self.assertIn("Cursor files written: 2 (2 enlarged, 0 kept unchanged)", result.stdout)

    def test_output_limit_keeps_only_supported_scales(self):
        cases = (
            (16, ("--all",), (16, 32, 80, 160), "3 converted, 0 skipped, 0 failed"),
            (32, ("--all",), (32, 64, 160), "2 converted, 1 skipped, 0 failed"),
            (32, ("--scale", "8"), (32, 256), "1 converted, 0 skipped, 0 failed"),
            (128, (), (128, 256), "1 converted, 0 skipped, 0 failed"),
            (32, ("--scale", "10"), (32,), "0 converted, 1 skipped, 0 failed"),
        )
        for size, options, expected, summary in cases:
            with self.subTest(options=options, size=size), tempfile.TemporaryDirectory() as temp:
                source = Path(temp) / "arrow.cur"
                original, _ = dib_fixture(width=size, height=size)
                source.write_bytes(original)
                result = self.run_cli(source, *options)
                self.assertEqual(result.returncode, 0, result.stderr)
                output = source.with_name("arrow_upscaled.cur").read_bytes()
                self.assertEqual(cursor.get_cursor_sizes(output), tuple((side, side) for side in expected))
                self.assertIn(summary, result.stdout)

    def test_sources_that_cannot_fit_at_2x_fail_without_output(self):
        for suffix in (".cur", ".ani"):
            with self.subTest(suffix=suffix), tempfile.TemporaryDirectory() as temp:
                source = Path(temp) / f"large{suffix}"
                large, _ = dib_fixture(width=129, height=129)
                small, _ = dib_fixture(width=16, height=16)
                original = ani_fixture([small, large]) if suffix == ".ani" else large
                source.write_bytes(original)
                result = self.run_cli(source, "--all")
                self.assertEqual(result.returncode, 1)
                self.assertIn("0 converted, 0 skipped, 3 failed", result.stdout)
                self.assertIn("Source cursor cannot fit at 2x", result.stdout)
                self.assertFalse(source.with_name(f"large_upscaled{suffix}").exists())
                self.assertEqual(source.read_bytes(), original)

    def test_summary_verbose_and_bad_file_continuation(self):
        for options in ((), ("-v",)):
            with self.subTest(options=options), tempfile.TemporaryDirectory() as temp:
                source = Path(temp) / "pack"
                source.mkdir()
                original, _ = dib_fixture(width=32, height=32)
                (source / "arrow.cur").write_bytes(original)
                (source / "broken.cur").write_bytes(b"broken")
                result = self.run_cli(source, "--all", *options)
                self.assertEqual(result.returncode, 1)
                self.assertIn("Files: 2  |  Attempts: 6", result.stdout)
                self.assertIn("2 converted, 1 skipped, 3 failed", result.stdout)
                self.assertIn("Skipped by reason", result.stdout)
                self.assertIn("Failed by reason", result.stdout)
                for size in ("32x32", "64x64", "160x160", "320x320"):
                    self.assertIn(size, result.stdout)
                if options:
                    self.assertIn("OK:", result.stdout)
                    self.assertIn("SKIP:", result.stdout)
                    self.assertIn("ERROR:", result.stderr)
                    self.assertIn("broken.cur", result.stderr)
                else:
                    self.assertEqual(result.stderr, "")
                    self.assertNotIn("arrow.cur", result.stdout)
                    self.assertNotIn("broken.cur", result.stdout)
                output = Path(temp) / "pack_upscaled"
                self.assertEqual((output / "broken.cur").read_bytes(), b"broken")
                self.assertEqual(cursor.get_cursor_sizes((output / "arrow.cur").read_bytes()), ((32, 32), (64, 64), (160, 160)))

    def test_existing_cursor_and_mapping_files_are_never_overwritten(self):
        for name in ("Normal.cur", "install.inf"):
            with self.subTest(name=name), tempfile.TemporaryDirectory() as temp:
                source = Path(temp) / "pack"
                source.mkdir()
                original, _ = dib_fixture()
                (source / "Normal.cur").write_bytes(original)
                (source / "install.inf").write_bytes(b'pointer="Normal.cur"')
                output = Path(temp) / "pack_upscaled"
                output.mkdir()
                existing = output / name
                existing.write_bytes(b"existing output")
                result = self.run_cli(source, "--all")
                self.assertEqual(result.returncode, 1)
                self.assertEqual(existing.read_bytes(), b"existing output")
                self.assertEqual((source / "Normal.cur").read_bytes(), original)


if __name__ == "__main__":
    unittest.main()
