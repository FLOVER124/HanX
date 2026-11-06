import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
WORKER = ROOT / 'Tools/pdf/worker.py'


def build_form(path):
    """Minimal AcroForm: text, checkbox, combo box fields and a note (PDFium cannot create fields)."""
    objs=[]
    def add(s): objs.append(s); return len(objs)
    font=add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>')
    onap=add('<< /Length 0 >>\nstream\n\nendstream')
    # 3 page, 4 pages placeholders filled later
    page_n=len(objs)+1+5  # after the five annotations below
    fields=[]
    def widget(extra,rect): return add(f'<< /Type /Annot /Subtype /Widget /Rect [{rect}] /P {page_n} 0 R /F 4 /MK << /BC [0 0 0] /BG [1 1 1] >> {extra} >>')
    name=widget('/FT /Tx /T (name) /V (Kim) /DA (/Helv 12 Tf 0 g)','50 700 250 720')
    agree=widget('/FT /Btn /T (agree) /V /Off /AS /Off /AP << /N << /Yes 2 0 R /Off 2 0 R >> >>','50 660 66 676')
    color=widget('/FT /Ch /Ff 131072 /T (color) /Opt [(Red) (Green) (Blue)] /V (Green) /DA (/Helv 12 Tf 0 g)','50 620 200 640')
    locked=widget('/FT /Tx /Ff 1 /T (locked) /V (fixed) /DA (/Helv 12 Tf 0 g)','50 580 200 600')
    note=add(f'<< /Type /Annot /Subtype /Text /Rect [300 700 320 720] /Contents (Check this) /C [1 1 0] /T (Reviewer) /P {page_n} 0 R >>')
    annots=[name,agree,color,locked,note]
    assert page_n==len(objs)+1
    page=add(f'<< /Type /Page /Parent {page_n+2} 0 R /MediaBox [0 0 400 800] /Resources << /Font << /Helv {font} 0 R >> >> /Contents {page_n+1} 0 R /Annots [{" ".join(f"{a} 0 R" for a in annots)}] >>')
    content='BT /Helv 14 Tf 50 750 Td (Form fixture) Tj ET'
    add(f'<< /Length {len(content)} >>\nstream\n{content}\nendstream')
    pages=add(f'<< /Type /Pages /Kids [{page} 0 R] /Count 1 >>')
    acro=add(f'<< /Fields [{name} 0 R {agree} 0 R {color} 0 R {locked} 0 R] /DA (/Helv 0 Tf 0 g) /DR << /Font << /Helv {font} 0 R >> >> >>')
    cat=add(f'<< /Type /Catalog /Pages {pages} 0 R /AcroForm {acro} 0 R >>')
    out=b'%PDF-1.7\n'; offsets=[]
    for i,o in enumerate(objs,1):
        offsets.append(len(out)); out+=f'{i} 0 obj\n{o}\nendobj\n'.encode('latin-1')
    xref=len(out); out+=f'xref\n0 {len(objs)+1}\n0000000000 65535 f \n'.encode()+''.join(f'{o:010d} 00000 n \n' for o in offsets).encode()
    out+=f'trailer\n<< /Size {len(objs)+1} /Root {cat} 0 R >>\nstartxref\n{xref}\n%%EOF\n'.encode()
    Path(path).write_bytes(out)


class PDFAnnotationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(); self.dir = Path(self.temp.name)
        self.source = self.dir / '양식.pdf'; build_form(self.source); self.original = self.source.read_bytes()

    def tearDown(self): self.temp.cleanup()

    def run_worker(self, action, **args):
        result = subprocess.run([sys.executable, str(WORKER)], input=json.dumps({'action': action, 'input': str(self.source), **args}), text=True, capture_output=True)
        return json.loads(result.stdout)

    def ok(self, action, **args):
        result = self.run_worker(action, **args); self.assertTrue(result['ok'], result); return result['data']

    def edit(self, operations, source=None, name='out.pdf'):
        out = self.dir / name
        self.ok('edit', input=str(source or self.source), output=str(out), operations=operations)
        self.assertEqual(self.source.read_bytes(), self.original)
        return out, {a['id']: a for a in self.ok('inspect', input=str(out), page=0)['annotations']}

    def test_inspect_lists_fields_and_notes(self):
        annotations = self.ok('inspect', page=0)['annotations']
        name, agree, color, locked, note = annotations
        self.assertEqual(name['field'], {'type': 'text', 'name': 'name', 'value': 'Kim', 'readOnly': False, 'required': False, 'multiline': False, 'password': False})
        self.assertEqual((agree['field']['type'], agree['field']['checked']), ('checkbox', False))
        self.assertEqual([o['label'] for o in color['field']['options']], ['Red', 'Green', 'Blue'])
        self.assertTrue(color['field']['options'][1]['selected'])
        self.assertTrue(locked['field']['readOnly'])
        self.assertEqual((note['type'], note['contents'], note['author'], note['color']), ('note', 'Check this', 'Reviewer', '#ffff00'))
        self.assertEqual(name['bounds'], [50, 700, 250, 720])
        self.assertTrue(all(0 <= v <= 1 for v in name['viewBounds']))

    def test_fill_text_checkbox_and_choice_fields(self):
        out, after = self.edit([
            {'op': 'set_field', 'page': 0, 'annotation': 0, 'value': '홍길동'},
            {'op': 'set_field', 'page': 0, 'annotation': 1, 'checked': True},
            {'op': 'set_field', 'page': 0, 'annotation': 2, 'value': 'Blue'},
        ])
        self.assertEqual(after[0]['field']['value'], '홍길동')
        self.assertTrue(after[1]['field']['checked'])
        self.assertEqual(after[2]['field']['value'], 'Blue')
        _, cleared = self.edit([{'op': 'set_field', 'page': 0, 'annotation': 1, 'checked': False}, {'op': 'set_field', 'page': 0, 'annotation': 0, 'value': ''}], source=out, name='cleared.pdf')
        self.assertFalse(cleared[1]['field']['checked']); self.assertEqual(cleared[0]['field']['value'], '')

    def test_add_restyle_and_delete_annotations(self):
        out, after = self.edit([
            {'op': 'add_annotation', 'page': 0, 'type': 'highlight', 'rects': [[50, 745, 150, 765], [50, 725, 120, 742]], 'contents': '중요'},
            {'op': 'add_annotation', 'page': 0, 'type': 'note', 'rect': [320, 600, 340, 620], 'contents': '메모', 'author': 'HanX', 'color': '#2874ef'},
            {'op': 'add_annotation', 'page': 0, 'type': 'square', 'rect': [40, 560, 260, 610], 'opacity': 0.5},
            {'op': 'set_annotation', 'page': 0, 'annotation': 4, 'contents': 'Checked', 'color': '#00ff00'},
        ])
        added = [a for a in after.values() if a['id'] >= 5]
        self.assertEqual([a['type'] for a in added], ['highlight', 'note', 'square'])
        self.assertEqual(added[0]['bounds'], [50, 725, 150, 765]); self.assertEqual(added[0]['color'], '#ffe14d'); self.assertEqual(added[0]['contents'], '중요')
        self.assertEqual((added[1]['contents'], added[1]['author'], added[1]['color']), ('메모', 'HanX', '#2874ef'))
        self.assertEqual(added[2]['opacity'], 0.502)
        self.assertEqual((after[4]['contents'], after[4]['color']), ('Checked', '#00ff00'))
        # Appearance streams are written so other viewers can draw new annotations.
        self.assertGreaterEqual(out.read_bytes().count(b'/AP'), 4)
        _, deleted = self.edit([{'op': 'delete_annotation', 'page': 0, 'annotation': 4}, {'op': 'delete_annotation', 'page': 0, 'annotation': 5}], source=out, name='deleted.pdf')
        self.assertEqual([a['type'] for a in deleted.values()], ['widget'] * 4 + ['note', 'square'])
        self.ok('render', input=str(out), page=0)

    def test_annotation_and_field_errors_leave_no_output(self):
        target = self.dir / 'bad.pdf'
        for op in [{'op': 'set_field', 'annotation': 3, 'value': 'x'}, {'op': 'set_field', 'annotation': 2, 'value': 'Purple'},
                   {'op': 'set_field', 'annotation': 1, 'value': 'x'}, {'op': 'set_field', 'annotation': 4, 'value': 'x'},
                   {'op': 'delete_annotation', 'annotation': 0}, {'op': 'set_annotation', 'annotation': 9},
                   {'op': 'add_annotation', 'type': 'stamp', 'rect': [0, 0, 1, 1]}, {'op': 'add_annotation', 'type': 'highlight', 'rects': []},
                   {'op': 'add_annotation', 'type': 'note', 'rect': [10, 10, 5, 5]}, {'op': 'set_field', 'annotation': 0, 'value': 'a\nb'}]:
            result = self.run_worker('edit', output=str(target), operations=[{'page': 0, **op}])
            self.assertFalse(result['ok'], op); self.assertFalse(target.exists())
        result = self.run_worker('edit', output=str(target), operations=[{'op': 'delete_annotation', 'page': 0, 'annotation': 4}, {'op': 'set_annotation', 'page': 0, 'annotation': 4, 'contents': 'x'}])
        self.assertFalse(result['ok']); self.assertFalse(target.exists())


if __name__ == '__main__':
    unittest.main()
