import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
import pypdfium2 as pdf
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
WORKER = ROOT / 'Tools/pdf/worker.py'


class PDFImageFormatTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(); self.dir = Path(self.temp.name)
        self.source = self.dir / 'blank.pdf'
        with pdf.PdfDocument.new() as doc: doc.new_page(400, 500); doc.save(self.source)

    def tearDown(self): self.temp.cleanup()

    def add(self, image, name):
        out = self.dir / (name + '.pdf')
        result = subprocess.run([sys.executable, str(WORKER)], input=json.dumps({'action': 'edit', 'input': str(self.source), 'output': str(out), 'operations': [{'op': 'add_image', 'page': 0, 'image': str(image), 'x': 10, 'y': 10, 'width': 100, 'height': 80}]}), text=True, capture_output=True)
        return json.loads(result.stdout), out

    def placed(self, out):
        with pdf.PdfDocument(out) as doc:
            image = next(o for o in doc[0].get_objects() if o.type == 3)
            return image.get_px_size()

    def test_webp_avif_gif_and_bmp_are_accepted(self):
        for fmt in ('WEBP', 'AVIF', 'GIF', 'BMP'):
            path = self.dir / ('picture.' + fmt.lower())
            try: Image.new('RGB', (60, 40), 'orange').save(path, fmt)
            except (KeyError, OSError): continue  # encoder not available in this Pillow
            result, out = self.add(path, fmt)
            self.assertTrue(result['ok'], (fmt, result)); self.assertEqual(self.placed(out), (60, 40))

    def test_large_photo_is_scaled_and_rotated_not_rejected(self):
        path = self.dir / 'photo.jpg'
        exif = Image.Exif(); exif[0x0112] = 6  # stored sideways, displayed rotated 90 degrees
        Image.new('RGB', (9000, 5000), 'green').save(path, quality=60, exif=exif)
        result, out = self.add(path, 'photo')
        self.assertTrue(result['ok'], result)
        width, height = self.placed(out)
        self.assertLess(width, height)  # orientation applied
        self.assertLessEqual(width * height, 40_000_000)

    def test_unreadable_file_reports_formats(self):
        path = self.dir / 'vector.svg'; path.write_text('<svg xmlns="http://www.w3.org/2000/svg"/>')
        result, out = self.add(path, 'svg')
        self.assertFalse(result['ok']); self.assertIn('WebP', result['error']['message']); self.assertFalse(out.exists())


if __name__ == '__main__':
    unittest.main()
