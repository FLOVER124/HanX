import errno,json,os,pathlib,pty,select,shlex,shutil,subprocess,tempfile,termios,time,unicodedata,unittest
BIN=pathlib.Path(os.environ.get('HANX_BIN','build/hanx-cli')).resolve()

class Terminal:
    def __init__(self,args,binary=BIN,env=None):
        self.master,self.slave=pty.openpty();self.before=termios.tcgetattr(self.slave)
        self.p=subprocess.Popen([str(binary),*args],stdin=self.slave,stdout=self.slave,stderr=self.slave,env=env)
        self.output=b''
    def until(self,marker):
        deadline=time.monotonic()+15
        while marker.encode() not in self.output:
            if time.monotonic()>deadline:raise AssertionError('Prompt missing: '+marker+'\n'+self.output.decode(errors='replace'))
            if select.select([self.master],[],[],.1)[0]:
                try:chunk=os.read(self.master,65536)
                except OSError as e:
                    if e.errno==errno.EIO:break
                    raise
                self.output+=chunk
            elif self.p.poll() is not None:raise AssertionError(self.output.decode(errors='replace'))
    def send(self,text):os.write(self.master,text.encode())
    def finish(self):
        deadline = time.monotonic() + 15
        while self.p.poll() is None:
            if time.monotonic() > deadline:
                raise AssertionError('Conversion did not finish: ' + self.output.decode(errors='replace'))
            if select.select([self.master], [], [], .1)[0]:
                self.output += os.read(self.master, 65536)

        after=termios.tcgetattr(self.slave)
        # Darwin may set PENDIN when restoring canonical input to reprocess queued bytes.
        before=list(self.before);after[3]&=~termios.PENDIN;before[3]&=~termios.PENDIN
        assert after==before,'Terminal settings were not restored'
        return self.p.returncode
    def close(self):
        if self.p.poll() is None:self.p.kill();self.p.wait()
        os.close(self.master);os.close(self.slave)

class Interactive(unittest.TestCase):
    def test_managed_launcher_displays_status_before_native_start(self):
        package = pathlib.Path(__file__).resolve().parents[2] / 'packaging' / 'npm'
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            for name in ['bin', 'lib']:
                shutil.copytree(package / name, root / name)
            shutil.copy(package / 'package.json', root)
            platform = subprocess.check_output(['node', '-p', 'process.platform+"-"+process.arch'], text=True).strip()
            executable = root / 'native' / platform / 'hanx'
            executable.parent.mkdir(parents=True)
            executable.write_text('#!/bin/sh\nprintf "native started\\n"\n')
            executable.chmod(0o755)
            for command in ['convert', '--convert']:
                with self.subTest(command=command):
                    terminal = Terminal([str(root / 'bin' / 'hanx.js'), command], binary=shutil.which('node'),
                                        env=dict(os.environ, XDG_DATA_HOME=str(root / 'state')))
                    try:
                        terminal.until('native started')
                        self.assertIn('파일 변환', terminal.output.decode().split('native started')[0])
                    finally:
                        terminal.close()

    def test_start_screen_differs_from_help(self):
        a=subprocess.run([str(BIN)],capture_output=True,text=True);b=subprocess.run([str(BIN),'--help'],capture_output=True,text=True)
        self.assertEqual(a.returncode,0);self.assertNotEqual(a.stdout,b.stdout);self.assertIn('hanx convert',a.stdout)
    def test_help_box_columns_align(self):
        output=subprocess.check_output([str(BIN),'--help'],text=True)
        width=lambda s:sum(2 if unicodedata.east_asian_width(c) in ('W','F') else 0 if unicodedata.combining(c) else 1 for c in s)
        lines=[line for line in output.splitlines() if line.startswith(('│','┌','├','└'))]
        self.assertEqual(len({width(line) for line in lines}),1)
        separators=[width(line[:line.index('│',1)]) for line in lines if line.startswith('│')]
        self.assertEqual(len(set(separators)),1)

    def test_non_terminal_does_not_hang(self):
        p=subprocess.run([str(BIN),'--convert'],input='',capture_output=True,text=True,timeout=3)
        self.assertNotEqual(p.returncode,0);self.assertIn('터미널',p.stdout+p.stderr)
    def test_shell_escaped_and_quoted_korean_input(self):
        with tempfile.TemporaryDirectory(prefix='한글 폴더 ') as d:
            for name in ['보고서 한글.txt',unicodedata.normalize('NFD','분해 한글.txt')]:
                p=pathlib.Path(d)/name;p.write_text('한글 내용')
                for value in [str(p),shlex.quote(str(p)),str(p).replace(' ','\\ '),p.as_uri()]:
                    r=subprocess.run([str(BIN),'read',value,'--text'],capture_output=True,text=True)
                    self.assertEqual(r.returncode,0,r.stdout);self.assertIn('한글 내용',r.stdout)
    def interact(self,source,keys='\x1b[B\r',drop=None,command='--convert'):
        t=Terminal([command])
        try:
            t.until('여기에 파일을 드래그 드롭한 후 Enter 키를 눌러주세요.')
            t.send((drop or str(source).replace(' ','\\ '))+'\n')
            t.until('↑ ↓');t.send(keys);code=t.finish();return code,t.output.decode(errors='replace')
        finally:t.close()
    def test_plain_convert_prompts_and_saves_document(self):
        with tempfile.TemporaryDirectory() as directory:
            source = pathlib.Path(directory) / '보고서 한글.txt'
            source.write_text('확인용 본문')
            code, transcript = self.interact(source, keys='\r', command='convert')
            self.assertEqual(code, 0, transcript)
            result = subprocess.check_output([str(BIN), 'read', str(source.with_suffix('.docx')), '--text'], text=True)
            self.assertIn('확인용 본문', result)

    def test_explicit_output_in_terminal_still_returns_json(self):
        with tempfile.TemporaryDirectory() as directory:
            source = pathlib.Path(directory) / 'input.txt'
            source.write_text('explicit output')
            target = source.with_suffix('.docx')
            terminal = Terminal(['convert', str(source), '--output', str(target)])
            try:
                terminal.until('"ok"')
                self.assertEqual(terminal.finish(), 0)
                self.assertTrue(json.loads(terminal.output)['ok'])
                self.assertTrue(target.is_file())
            finally:
                terminal.close()

    def test_drag_arrow_selection_saves_same_stem_and_never_executes_path(self):
        with tempfile.TemporaryDirectory(prefix='한글 변환 ') as d:
            p=pathlib.Path(d)/'보고서 $(touch HACKED).txt';p.write_text('드래그 변환 확인')
            code,_=self.interact(p,drop=shlex.quote(str(p)))
            self.assertEqual(code,0);out=p.with_suffix('.hanx');self.assertTrue(out.exists())
            r=subprocess.run([str(BIN),'read',str(out),'--text'],capture_output=True,text=True);self.assertIn('드래그 변환 확인',r.stdout)
            self.assertEqual(p.read_text(),'드래그 변환 확인');self.assertFalse(pathlib.Path('HACKED').exists())
    def test_existing_output_is_preserved(self):
        with tempfile.TemporaryDirectory() as d:
            p=pathlib.Path(d)/'한글.txt';p.write_text('source');out=p.with_suffix('.docx');out.write_bytes(b'keep')
            code,_=self.interact(p,keys='\r');self.assertNotEqual(code,0);self.assertEqual(out.read_bytes(),b'keep')
    def test_cancel_restores_terminal_and_writes_nothing(self):
        with tempfile.TemporaryDirectory() as d:
            p=pathlib.Path(d)/'한글.txt';p.write_text('source');code,_=self.interact(p,keys='\x03');self.assertEqual(code,130);self.assertEqual(list(pathlib.Path(d).iterdir()),[p])
    def test_up_arrow_wraps_to_last_format(self):
        with tempfile.TemporaryDirectory() as d:
            p=pathlib.Path(d)/'위쪽 선택.txt';p.write_text('위 방향키')
            code,_=self.interact(p,keys='\x1b[A\r');self.assertEqual(code,0);self.assertTrue(p.with_suffix('.xml').exists())
    def test_cancel_during_path_input_restores_terminal(self):
        t=Terminal(['--convert'])
        try:
            t.until('여기에 파일을 드래그 드롭한 후 Enter 키를 눌러주세요.');t.send('\x03');self.assertEqual(t.finish(),130)
        finally:t.close()
    def test_pdf_selection_exports_pdf_with_original_stem(self):
        with tempfile.TemporaryDirectory(prefix='한글 PDF ') as d:
            p=pathlib.Path(d)/'보고서.txt';p.write_text('한글 PDF 변환')
            code,_=self.interact(p,keys='\x1b[B'*4+'\r');self.assertEqual(code,0)
            self.assertTrue(p.with_suffix('.pdf').read_bytes().startswith(b'%PDF-'))
    def test_direct_input_argument_opens_format_picker(self):
        with tempfile.TemporaryDirectory() as d:
            p=pathlib.Path(d)/'직접 입력.txt';p.write_text('direct');t=Terminal(['convert',str(p)])
            try:
                t.until('↑ ↓');t.send('\r');self.assertEqual(t.finish(),0);self.assertTrue(p.with_suffix('.docx').exists())
            finally:t.close()
    def test_ctrl_c_during_conversion_interrupts_without_raw_terminal(self):
        with tempfile.TemporaryDirectory() as d:
            p=pathlib.Path(d)/'long.txt';p.write_text('Long PDF conversion line\n'*5000)
            t=Terminal(['--convert',str(p)])
            try:
                t.until('↑ ↓');t.send('\x1b[B\x1b[B\x1b[B\r');t.until('변환 중…')
                # Python's openpty has no controlling process group: send SIGINT
                # explicitly after confirming the terminal has canonical signals back.
                flags=termios.tcgetattr(t.slave)[3]
                self.assertTrue(flags & termios.ISIG);self.assertTrue(flags & termios.ICANON)
                t.p.send_signal(2);self.assertNotEqual(t.finish(),0);self.assertFalse(p.with_suffix('.pdf').exists())
            finally:t.close()
    def test_one_file_only(self):
        with tempfile.TemporaryDirectory() as d:
            p=pathlib.Path(d)/'한글.txt';p.write_text('source');t=Terminal(['--convert'])
            try:
                t.until('여기에 파일을 드래그 드롭한 후 Enter 키를 눌러주세요.');t.send(shlex.quote(str(p))+' '+shlex.quote(str(p))+'\n');self.assertNotEqual(t.finish(),0)
            finally:t.close()
if __name__=='__main__':unittest.main()
