"""Local outline-font matching. Never downloads fonts."""
from pathlib import Path
import io,json,os,re,sys,tempfile,difflib

def normalized(name):return re.sub(r'[^\w]','',re.sub(r'^[A-Z]{6}\+','',name or '').casefold())
def score(candidate, preferred):
 names=[normalized(n) for n in candidate['names']]; targets=[normalized(preferred.get(k,'')) for k in ['name','family']]; targets=[n for n in targets if n]
 similarity=max((difflib.SequenceMatcher(None,a,b).ratio() for a in names for b in targets),default=0)
 return (similarity*100 if similarity>=.65 else similarity*8)-abs(candidate['weight']-preferred.get('weight',400))/15-abs(candidate['width']-preferred.get('width',5))*3-(15 if candidate['italic']!=preferred.get('italic',False) else 0)-(8 if candidate['serif']!=preferred.get('serif',False) else 0)
def candidates(preferred):
 from fontTools.ttLib import TTFont,TTCollection
 roots=[Path('/System/Library/Fonts'),Path('/Library/Fonts'),Path.home()/'Library/Fonts',Path(os.environ.get('WINDIR','C:/Windows'))/'Fonts',Path('/usr/share/fonts'),Path('/usr/local/share/fonts'),Path.home()/'.local/share/fonts']
 if os.environ.get('HANX_PDF_FONT_DIR'):roots=[Path(os.environ['HANX_PDF_FONT_DIR'])]
 files=sorted({str(p) for root in roots if root.is_dir() for p in root.rglob('*') if p.suffix.lower() in ('.ttf','.otf','.ttc')})
 signature=[(f,Path(f).stat().st_mtime_ns) for f in files];cache=Path(tempfile.gettempdir())/('hanx-font-index-v3-'+str(os.getuid() if hasattr(os,'getuid') else os.getpid())+'.json')
 try:
  data=json.loads(cache.read_text());assert data['signature']==[list(s) for s in signature];items=data['items']
 except Exception:
  items=[]
  for file in files:
   try:
    count=1
    if Path(file).suffix.lower()=='.ttc':
     with TTCollection(file,lazy=True) as collection:count=len(collection.fonts)
    for face in range(count):
     with TTFont(file,lazy=True,fontNumber=face) as font:
      if 'glyf' not in font and 'CFF ' not in font:continue
      names=list({n.toUnicode() for n in font['name'].names if n.nameID in (1,4,6,16)})
      style=font.get('OS/2');items.append({'path':file,'face':face,'names':names,'weight':getattr(style,'usWeightClass',400),'width':getattr(style,'usWidthClass',5),'italic':bool(getattr(style,'fsSelection',0)&1),'serif':getattr(getattr(style,'panose',None),'bSerifStyle',0) in range(2,11)})
   except Exception:continue
  try:cache.write_text(json.dumps({'signature':signature,'items':items}))
  except OSError:pass
 return [(item['path'],item['face']) for item in sorted(items,key=lambda c:score(c,preferred),reverse=True)]
