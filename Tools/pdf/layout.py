"""Reconstruct editable PDF text lines and preserve visual-only bands as images."""
import base64,io,math,re,unicodedata
import ctypes as c
import pypdfium2.raw as raw
from contextlib import closing

def read_layout(doc,render_page):
 pages=[]; total_images=0; total_text=0; math_fonts={}
 def math_text(obj,text):
  if any(ch=='\ufffd' or unicodedata.category(ch)=='Co' for ch in text):return True
  font=raw.FPDFTextObj_GetFont(obj)
  key=c.cast(font,c.c_void_p).value
  if key not in math_fonts:
   size=raw.FPDFFont_GetBaseFontName(font,None,0)
   name=c.create_string_buffer(size) if 0<size<4096 else None
   if name is not None:raw.FPDFFont_GetBaseFontName(font,name,size)
   math_fonts[key]=bool(name and re.search(rb'hwpeq|eqn|math|symbol',name.value,re.I))
  return math_fonts[key]
 def stacked(a,b):
  if not (a.get('math') and b.get('math')):return False
  x,y,r,t=a['rect'];X,Y,R,T=b['rect']
  return min(r,R)-max(x,X)>.3 and abs(y+t-Y-T)>3
 family='Arial'
 try:
  from fonts import candidates
  from fontTools.ttLib import TTFont
  for path,face in candidates({'family':'Myungjo','weight':400,'serif':True}):
   with TTFont(path,lazy=True,fontNumber=face) as font:
    if set(map(ord,'한글')).issubset(font.getBestCmap() or {}):family=font['name'].getDebugName(16) or font['name'].getDebugName(1) or 'Arial';break
 except Exception:pass
 for index in range(len(doc)):
  with closing(doc[index]) as page:
   width,height=page.get_size();bitmap=render_page(page,3)
   objects=[];background=None
   def device_point(x,y):
    dx,dy=c.c_int(),c.c_int();raw.FPDF_PageToDevice(page,0,0,round(width*1000),round(height*1000),0,x,y,c.byref(dx),c.byref(dy));return (dx.value/1000,dy.value/1000)
   with closing(page.get_textpage()) as tp:
    for obj in page.get_objects(max_depth=1,textpage=tp):
     # The bitmap and device-space bounds use the same crop box and rotation.
     l,b,r,t=obj.get_bounds();points=[]
     for x,y in [(l,b),(l,t),(r,b),(r,t)]:
      points.append(device_point(x,y))
     rect=[min(p[0] for p in points),min(p[1] for p in points),max(p[0] for p in points),max(p[1] for p in points)]
     a,y,z,v=rect;w=z-a;h=v-y
     if w<=.05 or h<=.05 or z<0 or a>width or v<0 or y>height:continue
     rgba=[c.c_uint() for _ in range(4)];raw.FPDFPageObj_GetFillColor(obj,*[c.byref(i) for i in rgba])
     # Recognize only an opaque, unstroked rectangular fill painted before
     # foreground content. Keep it as a background, not a band covering text.
     if obj.type==2 and not objects and rgba[3].value==255 and all(abs(a-b)<.5 for a,b in zip(rect,[0,0,width,height])) and raw.FPDFPath_CountSegments(obj)==5:
      fill,stroke=c.c_int(),c.c_int();raw.FPDFPath_GetDrawMode(obj,c.byref(fill),c.byref(stroke))
      matrix=obj.get_matrix();corners=[]
      for k in range(5):
       segment=raw.FPDFPath_GetPathSegment(obj,k);x,y=c.c_float(),c.c_float()
       if raw.FPDFPathSegment_GetType(segment) not in (raw.FPDF_SEGMENT_MOVETO,raw.FPDF_SEGMENT_LINETO):break
       raw.FPDFPathSegment_GetPoint(segment,c.byref(x),c.byref(y))
       corners.append(device_point(matrix.a*x.value+matrix.c*y.value+matrix.e,matrix.b*x.value+matrix.d*y.value+matrix.f))
      if fill.value and not stroke.value and len(corners)==5 and all(any(abs(x-a)<.5 and abs(y-b)<.5 for a,b in [(0,0),(width,0),(width,height),(0,height)]) for x,y in corners):
       color='#'+''.join(f'{i.value:02x}' for i in rgba[:3]);background=color if color!='#ffffff' else None;continue
     text=obj.extract() if obj.type==1 else ''
     if obj.type==1 and not text.strip():continue
     size=c.c_float();raw.FPDFTextObj_GetFontSize(obj,c.byref(size)) if obj.type==1 else None
     matrix=obj.get_matrix();size=max(1,size.value*math.hypot(matrix.a,matrix.b))
     objects.append(dict(rect=rect,text=text,size=size,type=obj.type,math=obj.type==1 and math_text(obj,text),color='#'+''.join(f'{i.value:02x}' for i in rgba[:3])))
   if not objects:
    objects=[dict(rect=[0,0,width,height],text='',size=1,type=3,color='#000000')]
   dividers=[o for o in objects if o['type']==2 and o['rect'][2]-o['rect'][0]<3 and o['rect'][3]-o['rect'][1]>height*.3 and width*.4<o['rect'][0]<width*.6]
   if len(dividers)==len(objects):dividers=[]
   split=bool(dividers);middle=(dividers[0]['rect'][0]+dividers[0]['rect'][2])/2 if split else width/2
   useful=[o for o in objects if o not in dividers]
   if split and (min(o['rect'][0] for o in useful)>=middle or max(o['rect'][2] for o in useful)<=middle):
    split=False;dividers=[];useful=objects
   left=max(0,min(o['rect'][0] for o in useful));right=min(width,max(o['rect'][2] for o in useful));top=max(0,min(o['rect'][1] for o in useful));bottom=min(height,max(o['rect'][3] for o in useful))
   if background:left,right,top,bottom=0,width,0,height
   body_top=min(o['rect'][1] for o in dividers) if split else top
   question_tops=[o['rect'][1] for o in useful if o['type']==1 and re.match(r'^\d{1,2}\.\s*$',o['text'])]
   if split and question_tops and min(question_tops)>body_top+height*.02:body_top=min(question_tops)-3
   body_bottom=max(o['rect'][3] for o in dividers) if split else bottom
   def picture(rect):
    nonlocal total_images
    a,b,c,d=rect;scale_x=bitmap.width/width;scale_y=bitmap.height/height
    crop=bitmap.crop((max(0,math.floor(a*scale_x)),max(0,math.floor(b*scale_y)),min(bitmap.width,math.ceil(c*scale_x)),min(bitmap.height,math.ceil(d*scale_y))))
    stream=io.BytesIO();crop.save(stream,format='PNG');total_images+=1
    return {'image':base64.b64encode(stream.getvalue()).decode(),'width':c-a,'height':d-b}
   def blocks(items,x0,x1,y0,y1):
    nonlocal total_text
    ordered=sorted(items,key=lambda o:(o['rect'][1],o['rect'][0]));bands=[]
    for obj in ordered:
     gap=obj['rect'][1]-bands[-1]['end'] if bands else math.inf
     joined_math=bool(bands and .7<gap<=4 and any(stacked(obj,other) for other in bands[-1]['items']))
     if gap>.7 and not joined_math:bands.append({'items':[obj],'top':obj['rect'][1],'end':obj['rect'][3]})
     else:bands[-1]['items'].append(obj);bands[-1]['end']=max(bands[-1]['end'],obj['rect'][3])
    result=[];last=y0
    for band in bands:
     entries=band['items'];a=max(x0,min(o['rect'][0] for o in entries));z=min(x1,max(o['rect'][2] for o in entries));t=max(y0,band['top']);b=min(y1,band['end'])
     if z<=a or b<=t:continue
     visual=any(o['type']!=1 or o['rect'][0]<x0 or o['rect'][2]>x1 for o in entries)
     in_order=sorted(entries,key=lambda o:o['rect'][0])
     right_edge=None
     for o in in_order:
      if right_edge is not None and o['rect'][0]-right_edge>max(20,o['size']*3):visual=True;break
      right_edge=max(right_edge,o['rect'][2]) if right_edge is not None else o['rect'][2]
     math_entries=[o for o in entries if o.get('math')]
     # Fractions and superscripts share x positions but have distinct baselines.
     # Preserve their relative placement instead of flattening the glyphs inline.
     visual=visual or any(stacked(o,other) for i,o in enumerate(math_entries) for other in math_entries[:i])
     runs=[]
     if visual:runs=[picture([a,t,z,b])]
     else:
      previous=None;previous_text=''
      for o in in_order:
       text=re.sub(r'\s+',' ',o['text'])
       if previous is not None and o['rect'][0]-previous>max(1,o['size']*.2) and not text.startswith(' ') and not previous_text.endswith(' '):text=' '+text
       if o.get('math'):
        if text.startswith(' '):runs.append({'text':' ','size':min(100,max(4,o['size'])),'color':o['color']})
        runs.append(picture(o['rect']))
       else:runs.append({'text':text,'size':min(100,max(4,o['size'])),'color':o['color'],'width':o['rect'][2]-o['rect'][0]});total_text+=len(text)
       previous=o['rect'][2];previous_text=text
     result.append({'runs':runs,'left':max(0,a-x0),'before':max(0,t-last),'height':max(1,b-t),'visual':visual});last=b
    return result
   header=[o for o in useful if o['rect'][3]<=body_top+.5];footer=[o for o in useful if o['rect'][1]>=body_bottom-.5]
   body=[o for o in useful if o not in header and o not in footer]
   page_data={'width':width,'height':height,'left':left,'right':width-right,'top':top,'bottom':max(0,height-bottom),'textFree':not any(o['type']==1 and o['text'].strip() for o in objects),'header':blocks(header,left,right,top,body_top),'columns':[],'footer':blocks(footer,left,right,body_bottom,bottom)}
   if background:page_data['background']=background
   if split:
    # Adjacent clips meet at the divider. A spanning diagram is preserved on
    # both sides, including the strip that would otherwise fall in a gutter.
    for x0,x1 in [(left,middle),(middle,right)]:
     items=[o for o in body if o['rect'][2]>x0 and o['rect'][0]<x1]
     page_data['columns'].append({'width':x1-x0,'blocks':blocks(items,x0,x1,body_top,body_bottom)})
   else:page_data['columns']=[{'width':right-left,'blocks':blocks(body,left,right,body_top,body_bottom)}]
   pages.append(page_data)
 return {'fontFamily':family,'pages':pages,'preservedVisuals':total_images,'editableCharacters':total_text}
