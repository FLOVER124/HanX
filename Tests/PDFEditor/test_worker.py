import ctypes as c
import importlib.util
import io
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
import pypdfium2 as pdf
import pypdfium2.raw as raw
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
WORKER = ROOT / 'Tools/pdf/worker.py'

class PDFEditorTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.dir = Path(self.temp.name)
        self.source = self.dir / '한글 원본.pdf'
        with pdf.PdfDocument.new() as doc:
            page = doc.new_page(400, 500)
            obj = pdf.PdfObject(raw.FPDFPageObj_NewTextObj(doc, b'Helvetica', 20), pdf=doc)
            value = 'Original text'.encode('utf-16-le') + b'\0\0'
            self.assertTrue(raw.FPDFText_SetText(obj, c.cast(c.create_string_buffer(value), c.POINTER(c.c_ushort))))
            obj.transform(pdf.PdfMatrix(1, 0, 0, 1, 40, 420)); page.insert_obj(obj)
            shape = pdf.PdfObject(raw.FPDFPageObj_CreateNewRect(70, 120, 120, 60), pdf=doc)
            raw.FPDFPageObj_SetFillColor(shape, 20, 120, 200, 255)
            raw.FPDFPath_SetDrawMode(shape, raw.FPDF_FILLMODE_WINDING, 0); page.insert_obj(shape)
            image = pdf.PdfImage.new(doc)
            bitmap = pdf.PdfBitmap.from_pil(Image.new('RGB', (40, 30), 'red'))
            image.set_bitmap(bitmap); image.set_matrix(pdf.PdfMatrix(60, 0, 0, 45, 250, 100)); page.insert_obj(image)
            page.gen_content(); doc.new_page(200, 300); doc.save(self.source)
        self.original = self.source.read_bytes()
    def tearDown(self): self.temp.cleanup()
    def run_worker(self, action, **args):
        result = subprocess.run([sys.executable, str(WORKER)], input=json.dumps({'action': action, 'input':str(self.source), **args}), text=True, capture_output=True)
        self.assertTrue(result.stdout, result.stderr)
        return json.loads(result.stdout)
    def ok(self, action, **args):
        result = self.run_worker(action, **args)
        self.assertTrue(result['ok'], result)
        return result['data']
    def test_inspect_render(self):
        result = self.ok('inspect', page=0)
        self.assertEqual(result['pageCount'], 2)
        self.assertEqual([o['type'] for o in result['objects']], ['text','path','image'])
        self.assertEqual(result['objects'][0]['text'], 'Original text')
        self.assertTrue(self.ok('render', page=0)['image'].startswith('data:image/png;base64,'))
    def test_text_move_delete_roundtrip_preserves_other_page(self):
        out = self.dir / '수정 결과.pdf'
        self.ok('edit', output=str(out), operations=[{'op':'set_text','page':0,'object':0,'text':'Updated'}, {'op':'transform','page':0,'object':1,'dx':30,'dy':20}, {'op':'delete','page':0,'object':2}])
        data = self.ok('inspect', input=str(out), page=0)
        self.assertEqual(data['objects'][0]['text'], 'Updated')
        self.assertEqual(len(data['objects']),2)
        self.assertAlmostEqual(data['objects'][1]['bounds'][0],100,delta=1)
        self.assertEqual(self.ok('inspect',input=str(out),page=1)['width'],200)
        self.assertEqual(self.source.read_bytes(), self.original)
    def test_atomic_invalid_batch_no_output(self):
        out = self.dir / 'bad.pdf'
        self.assertFalse(self.run_worker('edit', output=str(out), operations=[{'op':'delete','page':0,'object':0},{'op':'delete','page':0,'object':999}])['ok'])
        self.assertFalse(out.exists())
        self.assertEqual(self.source.read_bytes(),self.original)
    def test_overwrite_and_revision_protection(self):
        self.assertFalse(self.run_worker('edit',output=str(self.source),operations=[{'op':'delete','page':0,'object':1}])['ok'])
        out=self.dir/'stale.pdf'
        self.assertFalse(self.run_worker('edit',output=str(out),revision='outdated',operations=[{'op':'delete','page':0,'object':1}])['ok'])
    def test_replacement_image_and_color(self):
        image=self.dir/'새 그림.png'; Image.new('RGB',(30,60),'blue').save(image)
        out=self.dir/'image.pdf'
        self.ok('edit',output=str(out),operations=[{'op':'replace_image','page':0,'object':2,'image':str(image)}, {'op':'set_fill','page':0,'object':1,'color':'#00ff00'}])
        data=self.ok('inspect',input=str(out),page=0)
        self.assertEqual(data['objects'][1]['fill'],'#00ff00')
        self.assertEqual(data['objects'][2]['bounds'],self.ok('inspect',page=0)['objects'][2]['bounds'])
    def test_add_and_invalid_dimensions(self):
        out=self.dir/'added.pdf'
        self.ok('edit',output=str(out),operations=[{'op':'add_text','page':0,'text':'Added','x':30,'y':300,'size':18},{'op':'add_rect','page':0,'x':10,'y':10,'width':20,'height':30,'color':'#ff0000'}])
        self.assertEqual(len(self.ok('inspect',input=str(out),page=0)['objects']),5)
        self.assertFalse(self.run_worker('edit',output=str(self.dir/'bad.pdf'),operations=[{'op':'transform','page':0,'object':0,'scaleX':0}])['ok'])
    def test_page_rotation_bounds(self):
        rotated=self.dir/'rotated.pdf'
        with pdf.PdfDocument(self.source) as doc:
            doc[0].set_rotation(90); doc.save(rotated)
        data=self.ok('inspect',input=str(rotated),page=0)
        self.assertEqual(data['rotation'],90)
        for o in data['objects']:
            self.assertTrue(all(0<=n<=1 for n in o['viewBounds']))
    def test_korean_text_and_object_order(self):
        font=Path('/System/Library/Fonts/Supplemental/Arial Unicode.ttf')
        if not font.exists(): self.skipTest('Korean TTF fixture unavailable')
        out=self.dir/'한글 수정.pdf'
        self.ok('edit',output=str(out),operations=[{'op':'set_text','page':0,'object':0,'text':'한글 수정 테스트','font':str(font)}])
        result=self.ok('inspect',input=str(out),page=0)
        self.assertEqual(result['objects'][0]['text'],'한글 수정 테스트')
        self.assertEqual([o['type'] for o in result['objects']],['text','path','image'])
        self.ok('render',input=str(out),page=0)
    def test_embedded_font_and_compatible_new_glyphs_keep_family(self):
        font=Path('/System/Library/Fonts/Supplemental/Arial Unicode.ttf')
        if not font.exists():self.skipTest('Korean TTF fixture unavailable')
        before=self.dir/'embedded.pdf';after=self.dir/'matched.pdf'
        self.ok('edit',output=str(before),operations=[{'op':'set_text','page':0,'object':0,'text':'물리학 화학','font':str(font)}])
        original=self.ok('inspect',input=str(before),page=0)['objects'][0]['font']
        self.ok('edit',input=str(before),output=str(after),operations=[{'op':'set_text','page':0,'object':0,'text':'화학 물리'}])
        edited=self.ok('inspect',input=str(after),page=0)['objects'][0]
        self.assertEqual(edited['font']['family'],original['family']);self.assertIn('화학',edited['text'])

    def test_deleted_object_ids_do_not_shift_in_batch(self):
        out=self.dir/'batch.pdf'
        self.ok('edit',output=str(out),operations=[{'op':'delete','page':0,'object':0},{'op':'delete','page':0,'object':2}])
        self.assertEqual([o['type'] for o in self.ok('inspect',input=str(out),page=0)['objects']],['path'])
    def test_invalid_text_and_image_leave_output_absent(self):
        for op in [{'op':'set_text','text':'line 1\nline 2'}, {'op':'replace_image','image':str(self.dir/'missing.png')}, {'op':'set_fill','color':'bad'}]:
            result=self.run_worker('edit',output=str(self.dir/'invalid.pdf'),operations=[dict(page=0,object=0,**op)])
            self.assertFalse(result['ok']); self.assertFalse((self.dir/'invalid.pdf').exists())

    def clipped_fixture(self):
        # Build a minimal clipped, stroked text stream without depending on a writer.
        stream=b'q 30 390 40 70 re W n BT /F1 30 Tf 1 0 0 RG 3 w 1 Tr 40 420 Td (Original) Tj ET Q'
        objects=[b'<< /Type /Catalog /Pages 2 0 R >>', b'<< /Type /Pages /Kids [3 0 R] /Count 1 >>', b'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 500] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>', b'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', b'<< /Length '+str(len(stream)).encode()+b' >>\nstream\n'+stream+b'\nendstream']
        data=b'%PDF-1.7\n'; offsets=[0]
        for i,obj in enumerate(objects,1):
            offsets.append(len(data));data+=str(i).encode()+b' 0 obj\n'+obj+b'\nendobj\n'
        xref=len(data);data+=b'xref\n0 6\n0000000000 65535 f \n'+b''.join(f'{offset:010d} 00000 n \n'.encode() for offset in offsets[1:])+b'trailer << /Size 6 /Root 1 0 R >>\nstartxref\n'+str(xref).encode()+b'\n%%EOF'
        file=self.dir/'clipped.pdf';file.write_bytes(data);return file
    def test_clipped_move_preserves_visible_pixels(self):
        source=self.clipped_fixture();out=self.dir/'clipped-move.pdf'
        self.ok('edit',input=str(source),output=str(out),operations=[{'op':'transform','page':0,'object':0,'dx':100}])
        counts=[]
        for file in [source,out]:
            with pdf.PdfDocument(file) as doc:
                image=doc[0].render().to_pil().convert('RGB')
                counts.append(sum(1 for value in image.getchannel('G').tobytes() if value<240))
        self.assertGreater(counts[0],100);self.assertAlmostEqual(counts[0],counts[1],delta=5)
    def test_clipped_text_font_replacement_is_rejected(self):
        source=self.clipped_fixture();out=self.dir/'unsafe.pdf'
        self.assertFalse(self.run_worker('edit',input=str(source),output=str(out),operations=[{'op':'set_text','page':0,'object':0,'text':'Changed'}])['ok'])
        self.assertFalse(out.exists())

    def test_text_edit_preserves_cmyk_surrounding_artwork(self):
        source=self.clipped_fixture()
        data=source.read_bytes()
        old=b'q 30 390 40 70 re W n BT /F1 30 Tf 1 0 0 RG 3 w 1 Tr 40 420 Td (Original) Tj ET Q'
        stream=b'q 1 0 0 0 k 40 100 120 80 re f BT /F1 20 Tf 40 420 Td (Original) Tj ET Q'
        # Rebuild offsets using the existing fixture builder's objects through PDFium.
        # A compact standalone PDF needs correct xref offsets for the changed stream.
        objects=[b'<< /Type /Catalog /Pages 2 0 R >>',b'<< /Type /Pages /Kids [3 0 R] /Count 1 >>',b'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 500] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',b'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',b'<< /Length '+str(len(stream)).encode()+b' >>\nstream\n'+stream+b'\nendstream']
        data=b'%PDF-1.7\n';offsets=[]
        for i,obj in enumerate(objects,1):offsets.append(len(data));data+=str(i).encode()+b' 0 obj\n'+obj+b'\nendobj\n'
        xref=len(data);data+=b'xref\n0 6\n0000000000 65535 f \n'+b''.join(f'{offset:010d} 00000 n \n'.encode() for offset in offsets)+b'trailer << /Size 6 /Root 1 0 R >>\nstartxref\n'+str(xref).encode()+b'\n%%EOF'
        source.write_bytes(data);out=self.dir/'color-edited.pdf'
        self.ok('edit',input=str(source),output=str(out),operations=[{'op':'set_text','page':0,'object':1,'text':'Changed'}])
        with pdf.PdfDocument(source) as before,pdf.PdfDocument(out) as after:
            self.assertEqual(before[0].render().to_pil().getpixel((60,350)),after[0].render().to_pil().getpixel((60,350)))

    def test_search_layer_preserves_pixels_and_positions_on_rotated_scan(self):
        scan=self.dir/'scan.pdf';out=self.dir/'searchable.pdf'
        with pdf.PdfDocument(self.source) as doc:
            page=doc[0];text=next(page.get_objects(max_depth=1));page.remove_obj(text);text.close();page.set_rotation(90);page.gen_content();doc.save(scan)
        region=[0.13,0.29,0.64,0.36]
        self.ok('edit',input=str(scan),output=str(out),operations=[{'op':'add_ocr_layer','page':0,'regions':[{'text':'Searchable scan','viewBounds':region}]}])
        data=self.ok('inspect',input=str(out),page=0);layer=data['objects'][-1]
        self.assertEqual(layer['text'],'Searchable scan');self.assertTrue(layer['searchText'])
        for actual,wanted in zip(layer['viewBounds'],region): self.assertAlmostEqual(actual,wanted,delta=.003)
        self.assertEqual(self.ok('render',input=str(scan),page=0)['image'],self.ok('render',input=str(out),page=0)['image'])
        again=self.run_worker('edit',input=str(out),output=str(self.dir/'duplicate.pdf'),operations=[{'op':'add_ocr_layer','page':0,'regions':[{'text':'Searchable scan','viewBounds':region}]}]);self.assertFalse(again['ok'])
    def test_ocr_layer_invalid_region_is_atomic(self):
        out=self.dir/'invalid-region.pdf';result=self.run_worker('edit',output=str(out),operations=[{'op':'add_ocr_layer','page':1,'regions':[{'text':'bad','viewBounds':[0.4,0.2,0.3,0.5]}]}]);self.assertFalse(result['ok']);self.assertFalse(out.exists())

    def test_ocr_missing_language_is_error(self):
        result=self.run_worker('ocr',page=0,language='does_not_exist')
        self.assertFalse(result['ok'])

if __name__=='__main__': unittest.main()
