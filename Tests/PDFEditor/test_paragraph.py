import ctypes as c
from contextlib import closing
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
import pypdfium2 as pdf
import pypdfium2.raw as raw

ROOT = Path(__file__).resolve().parents[2]
WORKER = ROOT / 'Tools/pdf/worker.py'
LINES = ['The quick brown fox jumps', 'over the lazy dog and keeps', 'running to the end.']


def add_text(doc, page, text, x, y, size=12, matrix=None):
    obj = pdf.PdfObject(raw.FPDFPageObj_NewTextObj(doc, b'Helvetica', size), pdf=doc)
    value = text.encode('utf-16-le') + b'\0\0'
    assert raw.FPDFText_SetText(obj, c.cast(c.create_string_buffer(value), c.POINTER(c.c_ushort)))
    raw.FPDFPageObj_SetFillColor(obj, 200, 30, 40, 255)
    obj.transform(matrix or pdf.PdfMatrix(1, 0, 0, 1, x, y)); page.insert_obj(obj)


class PDFParagraphTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(); self.dir = Path(self.temp.name)
        self.source = self.dir / '문단.pdf'
        with pdf.PdfDocument.new() as doc:
            page = doc.new_page(400, 500)
            background = pdf.PdfObject(raw.FPDFPageObj_CreateNewRect(0, 0, 400, 500), pdf=doc)
            raw.FPDFPageObj_SetFillColor(background, 240, 240, 240, 255); raw.FPDFPath_SetDrawMode(background, raw.FPDF_FILLMODE_WINDING, 0); page.insert_obj(background)
            for i, line in enumerate(LINES): add_text(doc, page, line, 50, 400 - i * 15)
            add_text(doc, page, 'Footer', 50, 100)
            add_text(doc, page, 'Rotated', 0, 0, matrix=pdf.PdfMatrix(0, 1, -1, 0, 300, 200))
            page.gen_content(); doc.save(self.source)
        self.original = self.source.read_bytes()

    def tearDown(self): self.temp.cleanup()

    def run_worker(self, action, **args):
        result = subprocess.run([sys.executable, str(WORKER)], input=json.dumps({'action': action, 'input': str(self.source), **args}), text=True, capture_output=True)
        return json.loads(result.stdout)

    def ok(self, action, **args):
        result = self.run_worker(action, **args); self.assertTrue(result['ok'], result); return result['data']

    def texts(self, path):
        data = self.ok('inspect', input=str(path), page=0)
        return [o for o in data['objects'] if o['type'] == 'text']

    def paragraph(self, text, **extra):
        out = self.dir / 'paragraph.pdf'
        self.ok('edit', output=str(out), operations=[{'op': 'set_paragraph', 'page': 0, 'objects': [1, 2, 3], 'text': text, **extra}])
        self.assertEqual(self.source.read_bytes(), self.original)
        return out

    def test_inspect_exposes_text_matrix(self):
        line = self.texts(self.source)[0]
        self.assertEqual(line['matrix'][4:], [50, 400])

    def test_unchanged_paragraph_keeps_lines_spacing_color_and_order(self):
        out = self.paragraph(' '.join(LINES))
        lines = self.texts(out)[:3]
        self.assertEqual([o['text'] for o in lines], LINES)
        self.assertEqual([o['matrix'][5] for o in lines], [400, 385, 370])
        self.assertTrue(all(o['fill'] == '#c81e28' and o['matrix'][4] == 50 for o in lines))
        objects = self.ok('inspect', input=str(out), page=0)['objects']
        self.assertEqual(objects[0]['type'], 'path')  # background stays behind the text
        self.assertEqual([o['text'] for o in objects if o['type'] == 'text'][3:], ['Footer', 'Rotated'])

    def test_longer_text_reflows_within_original_width(self):
        width = max(o['bounds'][2] for o in self.texts(self.source)[:3]) - 50
        text = ' '.join(LINES) + ' Then it rests in the shade of an old tree.'
        out = self.paragraph(text)
        lines = [o for o in self.texts(out) if o['text'] not in ('Footer', 'Rotated')]
        self.assertGreater(len(lines), 3)
        self.assertEqual(' '.join(o['text'] for o in lines), text)
        self.assertTrue(all(o['bounds'][2] - 50 <= width * 1.02 + 0.5 for o in lines))
        self.assertEqual([o['matrix'][5] for o in lines], [400 - 15 * i for i in range(len(lines))])

    def test_hard_breaks_blank_lines_and_long_words(self):
        out = self.paragraph('First line\n\nSupercalifragilisticexpialidocious' * 1 + 'X' * 40, width=120)
        lines = [o for o in self.texts(out) if o['text'] not in ('Footer', 'Rotated')]
        self.assertEqual(lines[0]['text'], 'First line')
        self.assertEqual(lines[1]['matrix'][5], 370)  # blank line keeps its space
        self.assertTrue(all(o['bounds'][2] - 50 <= 120 * 1.02 + 0.5 for o in lines))
        self.assertGreater(len(lines), 3)

    def test_multiline_add_text_with_wrapping(self):
        out = self.dir / 'added.pdf'
        self.ok('edit', output=str(out), operations=[{'op': 'add_text', 'page': 0, 'text': 'alpha beta gamma delta\nepsilon', 'x': 30, 'y': 60, 'size': 10, 'width': 60}])
        added = [o for o in self.texts(out)][5:]
        self.assertEqual(' '.join(o['text'] for o in added), 'alpha beta gamma delta epsilon')
        self.assertEqual(added[-1]['text'], 'epsilon'); self.assertEqual(added[1]['matrix'][5], 48)

    def test_korean_paragraph_wraps_by_word_and_character(self):
        fonts = [Path(p) for p in ('/System/Library/Fonts/Supplemental/Arial Unicode.ttf', '/usr/share/fonts/truetype/nanum/NanumGothic.ttf', '/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc', 'C:/Windows/Fonts/malgun.ttf')]
        font = next((p for p in fonts if p.exists()), None)
        if font is None: self.skipTest('Korean font unavailable')
        text = '한국어 문단을 원래 폭 안에서 다시 배치합니다. 띄어쓰기없이아주길게이어지는낱말도글자단위로나눕니다.'
        out = self.paragraph(text, font=str(font), width=150)
        lines = [o for o in self.texts(out) if o['text'] not in ('Footer', 'Rotated')]
        self.assertGreater(len(lines), 2)
        self.assertEqual(''.join(o['text'] for o in lines).replace(' ', ''), text.replace(' ', ''))
        self.assertTrue(all(o['bounds'][2] - 50 <= 150 * 1.02 + 0.5 for o in lines))
        self.ok('render', input=str(out), page=0)

    def test_sequential_font_replacements_in_saved_copies_keep_their_glyphs(self):
        # Regression: a second edit loaded a same-named replacement font, which PDFium
        # silently swapped for the earlier subset and rendered the wrong glyphs.
        first, second, third = self.dir / 'first.pdf', self.dir / 'second.pdf', self.dir / 'third.pdf'
        self.ok('edit', output=str(first), operations=[{'op': 'set_text', 'page': 0, 'object': 1, 'text': 'The quick fXx'}])
        self.ok('edit', input=str(first), output=str(second), operations=[{'op': 'set_text', 'page': 0, 'object': 4, 'text': 'Footer nZte'}])
        self.ok('edit', input=str(second), output=str(third), operations=[{'op': 'set_paragraph', 'page': 0, 'objects': [2, 3], 'text': 'Jumped over\nquietly'}])
        texts = [o['text'] for o in self.texts(third)]
        for expected in ['The quick fXx', 'Footer nZte', 'Jumped over', 'quietly']: self.assertIn(expected, texts)

    def test_invalid_paragraphs_are_rejected_without_output(self):
        target = self.dir / 'bad.pdf'
        for op in [{'objects': [0], 'text': 'x'}, {'objects': [5], 'text': 'x'}, {'objects': [1, 1], 'text': 'x'},
                   {'objects': [1], 'text': '  \n '}, {'objects': [1], 'text': 'tab\there'}, {'objects': [], 'text': 'x'}]:
            result = self.run_worker('edit', output=str(target), operations=[{'op': 'set_paragraph', 'page': 0, **op}])
            self.assertFalse(result['ok'], op); self.assertFalse(target.exists())
        result = self.run_worker('edit', output=str(target), operations=[{'op': 'set_paragraph', 'page': 0, 'objects': [1], 'text': 'x'}, {'op': 'delete', 'page': 0, 'object': 1}])
        self.assertFalse(result['ok']); self.assertFalse(target.exists())


if __name__ == '__main__':
    unittest.main()
