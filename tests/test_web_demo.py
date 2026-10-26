"""Compare the browser codec's output bytes with the existing CLI."""

import base64
import hashlib
import io
import json
import shutil
import subprocess
import tempfile
import unittest
import zipfile
from pathlib import Path

from PIL import Image

from test_cursor_upscale import ani_fixture, dib_fixture, pack_cur
from utils.cli import upscale_cursor_file


@unittest.skipUnless(shutil.which("node"), "Node.js is required for browser codec parity checks")
class WebDemoTests(unittest.TestCase):
    def test_cursor_bytes_and_results_match_cli(self):
        fixtures = []
        for bits, legacy in ((1, False), (4, False), (8, False), (24, False), (32, False), (32, True)):
            fixtures.append((dib_fixture(bits=bits, legacy_alpha=legacy)[0], False, [2, 5, 10]))
        for mode in ("1", "L", "LA", "P", "RGB", "RGBA", "I;16"):
            image = Image.new("RGBA", (5, 4), (21, 73, 151, 127))
            image.putpixel((0, 0), (17, 33, 71, 0))
            image.putpixel((1, 0), (1, 2, 3, 1))
            image = image.convert(mode)
            buffer = io.BytesIO()
            image.save(buffer, format="PNG")
            png = pack_cur([(5, 4, 1, 1, buffer.getvalue())])
            fixtures.append((png, False, [2, 5]))
        small, _ = dib_fixture(width=16, height=16)
        large, _ = dib_fixture(width=32, height=32, bits=24)
        multi = pack_cur([(16, 16, 1, 1, small[22:]), (32, 32, 1, 1, large[22:])])
        fixtures.extend([(multi, False, [2, 5, 10]), (ani_fixture([png, small]), True, [2, 5, 10])])
        for size, scales in (((32, 33), [2, 5, 10]), ((128, 128), [2]), ((129, 129), [2, 5, 10])):
            data, _ = dib_fixture(width=size[0], height=size[1])
            fixtures.extend([(data, False, scales), (ani_fixture([small, data]), True, scales)])
        fixtures.extend([(b"broken", False, [2, 5, 10]), (b"broken", True, [2])])

        cases, expected = [], []
        with tempfile.TemporaryDirectory() as temp:
            for index, (data, animated, scales) in enumerate(fixtures):
                source = Path(temp) / f"cursor{index}.{'ani' if animated else 'cur'}"
                source.write_bytes(data)
                results = upscale_cursor_file(source, source, scales)
                output = results[0].output
                expected.append({"statuses": [result.status for result in results],
                                 "hash": hashlib.sha256(output.read_bytes()).hexdigest() if output else None})
                cases.append({"data": base64.b64encode(data).decode(), "animated": animated, "scales": scales})
            script = Path(__file__).with_name("web_demo.mjs")
            run = subprocess.run(["node", str(script)], input=json.dumps(cases), capture_output=True, text=True)
        self.assertEqual(run.returncode, 0, run.stderr)
        actual = json.loads(run.stdout)
        for index, result in enumerate(actual["results"]):
            with self.subTest(case=index):
                self.assertEqual(result, expected[index])
        with zipfile.ZipFile(io.BytesIO(base64.b64decode(actual["zip"]))) as archive:
            self.assertIsNone(archive.testzip())
            self.assertEqual(archive.namelist(), ["pack_upscaled/하위/Arrow.cur", "pack_upscaled/install.inf"])
            self.assertEqual(archive.read(archive.namelist()[0]), fixtures[0][0])
            self.assertEqual(archive.read(archive.namelist()[1]), 'pointer="하위/Arrow.cur"'.encode())
