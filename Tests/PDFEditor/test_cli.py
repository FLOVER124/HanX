import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from PIL import Image, ImageDraw, ImageFont
import pypdfium2 as pdf
import test_worker

BIN=os.environ.get('HANX_PDF_TEST_CLI')
@unittest.skipUnless(BIN,'Set HANX_PDF_TEST_CLI to the freshly compiled test CLI')
class PDFCLITests(unittest.TestCase):
    def setUp(self):
        self.fixture=test_worker.PDFEditorTests();self.fixture.setUp();self.source=self.fixture.source
    def tearDown(self):self.fixture.tearDown()
    def cli(self,*args,input=None):
        result=subprocess.run([BIN,*map(str,args)],input=json.dumps(input) if input is not None else None,text=True,capture_output=True,timeout=180)
        return json.loads(result.stdout)
    def test_cli_edit_and_ocr(self):
        before=self.cli('pdf','inspect',self.source,'--page','0');self.assertTrue(before['ok'],before)
        output=self.fixture.dir/'CLI 수정.pdf'
        result=self.cli('pdf','edit',self.source,'--ops','-','--output',output,'--revision',before['data']['revision'],input=[{'op':'set_text','page':0,'object':0,'text':'CLI edit'}]);self.assertTrue(result['ok'],result)
        self.assertEqual(self.cli('pdf','inspect',output)['data']['objects'][0]['text'],'CLI edit')
        self.assertFalse(self.cli('pdf','inspect',self.source,'--page','-1')['ok'])
        if hasattr(os,'uname') and os.uname().sysname=='Darwin':
            ocr=self.cli('pdf','ocr',self.source,'--language','eng');self.assertTrue(ocr['ok'],ocr);self.assertIn('Original',ocr['data']['text'])
    @unittest.skipUnless(hasattr(os,'uname') and os.uname().sysname=='Darwin','native Vision test')
    def test_searchable_ocr_mixed_document(self):
        mixed=self.fixture.dir/'scan.pdf';output=self.fixture.dir/'searchable.pdf'
        image=Image.new('RGB',(900,260),'white');ImageDraw.Draw(image).text((50,70),'HanX searchable page',font=ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf',64),fill='black')
        with pdf.PdfDocument(self.source) as doc:
            page=doc[1];obj=pdf.PdfImage.new(doc);bitmap=pdf.PdfBitmap.from_pil(image);obj.set_bitmap(bitmap);obj.set_matrix(pdf.PdfMatrix(180,0,0,52,10,200));page.insert_obj(obj);page.gen_content();doc.save(mixed)
        original=mixed.read_bytes();result=self.cli('pdf','searchable',mixed,'--all-pages','--language','eng','--output',output)
        self.assertTrue(result['ok'],result);self.assertEqual(result['data']['skippedTextPages'],[0]);self.assertEqual(result['data']['recognizedPages'],[1]);self.assertEqual(mixed.read_bytes(),original)
        printed=self.cli('pdf','inspect',output,'--page','1')['data']['objects'];self.assertIn('searchable',' '.join(o.get('text','') for o in printed).lower())
        self.assertEqual(self.cli('pdf','render',mixed,'--page','1')['data']['image'],self.cli('pdf','render',output,'--page','1')['data']['image'])
        no_output=self.fixture.dir/'no-duplicate.pdf';result=self.cli('pdf','searchable',output,'--all-pages','--output',no_output);self.assertFalse(result['ok']);self.assertFalse(no_output.exists())

    def test_mcp_discovery_and_read(self):
        requests=[{'jsonrpc':'2.0','id':1,'method':'initialize','params':{'protocolVersion':'2025-11-25','capabilities':{},'clientInfo':{'name':'pdf-test','version':'1'}}},{'jsonrpc':'2.0','method':'notifications/initialized'},{'jsonrpc':'2.0','id':2,'method':'tools/list'},{'jsonrpc':'2.0','id':3,'method':'tools/call','params':{'name':'hanx_pdf_inspect','arguments':{'input':str(self.source),'page':'0'}}}]
        result=subprocess.run([BIN,'mcp'],input='\n'.join(map(json.dumps,requests))+'\n',text=True,capture_output=True,timeout=60)
        messages=[json.loads(line) for line in result.stdout.splitlines()]
        tools=next(m['result']['tools'] for m in messages if m.get('id')==2)
        self.assertTrue({'hanx_pdf_inspect','hanx_pdf_edit','hanx_pdf_render','hanx_pdf_ocr'}.issubset({t['name'] for t in tools}))
        response=next(m for m in messages if m.get('id')==3)
        self.assertNotIn('error',response);self.assertFalse(response['result'].get('isError',False),response)

if __name__=='__main__':unittest.main()
