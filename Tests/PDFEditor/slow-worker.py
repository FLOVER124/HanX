"""Test-only worker wrapper: expose a deterministic in-flight edit for close tests."""
import json,os,subprocess,sys,time
request=sys.stdin.buffer.read()
if json.loads(request).get('action')=='edit':time.sleep(1)
result=subprocess.run([sys.executable,os.environ['HANX_PDF_REAL_WORKER']],input=request,stdout=sys.stdout,stderr=sys.stderr)
sys.exit(result.returncode)
