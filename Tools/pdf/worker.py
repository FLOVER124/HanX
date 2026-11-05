#!/usr/bin/env python3
"""One request per process. PDF coordinates are points, bottom-left, before rotation.
Objects are top-level content objects, addressed in the INPUT revision (not reindexed
between operations). A form is edited as a whole; shared nested content is untouched.
"""
from contextlib import closing
import base64
import csv
import ctypes as c
import hashlib
import io
import json
import math
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
# Bundled workers live inside signed app resources. Never mutate them on import.
sys.dont_write_bytecode = True
import tempfile

class PDFError(Exception):
    def __init__(self, message, code='invalid_argument'):
        super().__init__(message); self.code = code

def require(condition, message):
    if not condition: raise PDFError(message)

def number(value, name, minimum=-100000, maximum=100000):
    require(type(value) in (int,float) and math.isfinite(value) and minimum <= value <= maximum, f'{name}: 유효한 숫자를 입력하세요.')
    return value

def integer(value, name, maximum):
    require(type(value) is int and 0 <= value < maximum, f'{name}: 범위를 벗어났습니다.')
    return value

def check(ok, message):
    if not ok: raise PDFError(message, 'pdf_error')

def color(value):
    require(isinstance(value,str) and re.fullmatch(r'#?[0-9a-fA-F]{6}',value), '색상은 #RRGGBB 형식입니다.')
    v=value.lstrip('#'); return tuple(int(v[i:i+2],16) for i in (0,2,4))

def text_value(value):
    require(isinstance(value,str) and len(value)<=20000 and not any(ord(ch)<32 for ch in value), '텍스트는 줄바꿈 없는 한 줄(최대 20,000자)로 입력하세요.')
    return value

def set_text(obj, text):
    buffer=c.create_string_buffer(text.encode('utf-16-le')+b'\0\0')
    check(raw.FPDFText_SetText(obj,c.cast(buffer,c.POINTER(c.c_ushort))), '텍스트를 수정하지 못했습니다.')

def font_info(obj):
    font=raw.FPDFTextObj_GetFont(obj)
    def name(getter):
        size=getter(font,None,0)
        if not 0<size<4096:return ''
        buffer=c.create_string_buffer(size);getter(font,buffer,size);return buffer.value.decode('utf-8','replace')
    flags=raw.FPDFFont_GetFlags(font)
    base=name(raw.FPDFFont_GetBaseFontName);family=name(raw.FPDFFont_GetFamilyName);weight=raw.FPDFFont_GetWeight(font) or 400
    if not family or base=='Untitled':
        try:
            from fontTools.ttLib import TTFont
            size=c.c_size_t();raw.FPDFFont_GetFontData(font,None,0,c.byref(size))
            if 0<size.value<2*1024*1024:
                data=(c.c_ubyte*size.value)();raw.FPDFFont_GetFontData(font,data,size.value,c.byref(size))
                with TTFont(io.BytesIO(bytes(data))) as embedded:
                    base=embedded['name'].getDebugName(6) or base;family=embedded['name'].getDebugName(1) or family
                    weight=getattr(embedded.get('OS/2'),'usWeightClass',weight)
        except Exception:pass
    if weight in (350,400) and re.search(r'(bold|black|heavy|demi|semibold|PB$)',base,re.I):weight=700
    return {'name':base,'family':family,'weight':weight,'italic':bool(flags&64),'serif':bool(flags&2)}

def font_for(doc, text, explicit=None, original=None):
    # Newly inserted text uses a complete local font; subset fonts are not assumed
    # to contain characters absent from the source. Never silently drop glyphs.
    if not explicit and original is None and all(32<=ord(ch)<127 for ch in text):
        font=raw.FPDFText_LoadStandardFont(doc,b'Helvetica'); check(font,'글꼴을 열지 못했습니다.'); return font, None
    from fontTools.ttLib import TTFont
    preferred=font_info(original) if original is not None else {}
    if original is not None and not explicit:
        handle=raw.FPDFTextObj_GetFont(original);size=c.c_size_t()
        if raw.FPDFFont_GetFontData(handle,None,0,c.byref(size)) and 0<size.value<50*1024*1024:
            data=(c.c_ubyte*size.value)()
            if raw.FPDFFont_GetFontData(handle,data,size.value,c.byref(size)):
                try:
                    with TTFont(io.BytesIO(bytes(data))) as parsed:
                        preferred['width']=getattr(parsed.get('OS/2'),'usWidthClass',5)
                        embedded_type=raw.FPDF_FONT_TRUETYPE if 'glyf' in parsed else raw.FPDF_FONT_TYPE1
                        valid=('glyf' in parsed or 'CFF ' in parsed) and set(map(ord,text)).issubset(parsed.getBestCmap() or {})
                    if valid:
                        with TTFont(io.BytesIO(bytes(data))) as embedded:
                            for table in embedded['cmap'].tables:
                                if table.isUnicode():table.cmap={code:glyph for code,glyph in table.cmap.items() if code in set(map(ord,text))}
                            stream=io.BytesIO();embedded.save(stream);binary=stream.getvalue()
                        data=(c.c_ubyte*len(binary)).from_buffer_copy(binary)
                        font=raw.FPDFText_LoadFont(doc,data,len(binary),embedded_type,1)
                        if font:return font,data
                except Exception:pass
    from fonts import candidates as matched_fonts
    candidates=[explicit] if explicit else matched_fonts(preferred)+[
        '/System/Library/Fonts/Supplemental/Arial Unicode.ttf',
        '/System/Library/Fonts/Supplemental/AppleGothic.ttf',
        str(Path(os.environ.get('WINDIR','C:/Windows'))/'Fonts/malgun.ttf'),
        '/usr/share/fonts/truetype/nanum/NanumGothic.ttf',
        '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf']
    for candidate in candidates:
        face=0
        if isinstance(candidate,tuple):candidate,face=candidate
        if not candidate or not Path(candidate).is_file(): continue
        try:
            if Path(candidate).stat().st_size>200*1024*1024:
                if explicit:raise PDFError('글꼴 파일이 너무 큽니다.')
                continue
            with TTFont(candidate,fontNumber=face) as parsed:
                if not set(map(ord,text)).issubset(parsed.getBestCmap() or {}): continue
                require('glyf' in parsed or 'CFF ' in parsed,'TrueType 또는 OpenType 글꼴을 선택하세요.')
                font_type=raw.FPDF_FONT_TRUETYPE if 'glyf' in parsed else raw.FPDF_FONT_TYPE1
                if 'CFF ' in parsed:
                    names=parsed['name'];ps=names.getDebugName(6) or names.getDebugName(4) or 'HanXReplacement'
                    cff=parsed['CFF '].cff;cff.fontNames=[re.sub(r'[^A-Za-z0-9_-]','',ps)]
                    top=cff.topDictIndex[0];top.FamilyName=names.getDebugName(1) or ps;top.FullName=names.getDebugName(4) or ps
                    top.Weight='Bold' if getattr(parsed.get('OS/2'),'usWeightClass',400)>=600 else 'Regular'
                for table in parsed['cmap'].tables:
                    if table.isUnicode():table.cmap={code:glyph for code,glyph in table.cmap.items() if code in set(map(ord,text))}
                if getattr(parsed.get('OS/2'),'fsType',0) & 0x100:
                    output=io.BytesIO(); parsed.save(output); data=output.getvalue()
                else:
                    from fontTools.subset import Subsetter
                    subset=Subsetter();subset.options.name_IDs=[1,2,4,6,16,17];subset.options.name_legacy=True;subset.options.name_languages=['*']; subset.populate(text=text); subset.subset(parsed)
                    output=io.BytesIO(); parsed.save(output); data=output.getvalue()
            buffer=(c.c_ubyte*len(data)).from_buffer_copy(data)
            font=raw.FPDFText_LoadFont(doc,buffer,len(data),font_type,1)
            if font: return font,buffer
        except PDFError: raise
        except Exception: continue
    raise PDFError('이 문자를 지원하는 TTF 글꼴을 선택하세요. 한글은 한글 글꼴이 필요합니다.','missing_font')

def fill(obj):
    values=[c.c_uint() for _ in range(4)]
    if raw.FPDFPageObj_GetFillColor(obj,*[c.byref(v) for v in values]):
        return '#'+''.join(f'{v.value:02x}' for v in values[:3])
    return None

def inspect_page(doc, index, revision):
    index=integer(index,'page',len(doc))
    with closing(doc[index]) as page:
        width,height=page.get_size()
        require(0<width<=30000 and 0<height<=30000,'PDF 페이지 크기가 지원 범위를 벗어났습니다.')
        entries=[]
        with closing(page.get_textpage()) as textpage:
            for i,obj in enumerate(page.get_objects(max_depth=1,textpage=textpage)):
                require(i<50000,'페이지 개체가 너무 많습니다.')
                bounds=list(obj.get_bounds()); points=[]
                for x,y in [(bounds[0],bounds[1]),(bounds[0],bounds[3]),(bounds[2],bounds[1]),(bounds[2],bounds[3])]:
                    dx,dy=c.c_int(),c.c_int()
                    check(raw.FPDF_PageToDevice(page,0,0,1000000,1000000,0,x,y,c.byref(dx),c.byref(dy)),'페이지 좌표 변환에 실패했습니다.')
                    points.append((dx.value/1000000,dy.value/1000000))
                item={'id':i,'type':{1:'text',2:'path',3:'image',4:'shading',5:'form'}.get(obj.type,'unknown'), 'bounds':bounds,
                      'viewBounds':[min(p[0] for p in points),min(p[1] for p in points),max(p[0] for p in points),max(p[1] for p in points)],'fill':fill(obj)}
                if obj.type==raw.FPDF_PAGEOBJ_TEXT:
                    item['font']=font_info(obj); item['text']=obj.extract(); item['searchText']=raw.FPDFTextObj_GetTextRenderMode(obj)==3; size=c.c_float()
                    if raw.FPDFTextObj_GetFontSize(obj,c.byref(size)): item['size']=size.value
                entries.append(item)
        return {'kind':'pdf','page':index,'pageCount':len(doc),'width':width,'height':height,'rotation':page.get_rotation(),'objects':entries,'revision':revision}

def render_page(page, scale):
    width,height=page.get_size(); require(width>0 and height>0,'잘못된 페이지 크기입니다.')
    scale=min(scale, math.sqrt(16000000/(width*height)), 12000/max(width,height))
    bitmap=page.render(scale=scale)
    try: return bitmap.to_pil().copy()
    finally: bitmap.close()

def page_point(page, x, y):
    px,py=c.c_double(),c.c_double()
    check(raw.FPDF_DeviceToPage(page,0,0,1000000,1000000,0,round(x*1000000),round(y*1000000),c.byref(px),c.byref(py)), 'OCR 좌표를 변환하지 못했습니다.')
    return px.value,py.value

def add_search_layer(doc, page, regions, fonts, font_path=None):
    require(isinstance(regions,list) and 0<len(regions)<=10000,'추가할 인식 영역이 없거나 너무 많습니다.')
    with closing(page.get_textpage()) as tp:
        require(not tp.get_text_bounded().strip(),'이미 선택 가능한 텍스트가 있는 페이지입니다. 검색 텍스트를 중복 추가하지 않습니다.')
    valid=[]
    for region in regions:
        require(isinstance(region,dict),'잘못된 문자 인식 영역입니다.')
        text=text_value(region.get('text')); box=region.get('viewBounds')
        require(text.strip() and isinstance(box,list) and len(box)==4,'인식한 텍스트 또는 좌표가 없습니다.')
        l,t,r,b=[number(v,'viewBounds',0,1) for v in box]
        require(r>l and b>t,'인식 영역의 크기가 잘못됐습니다.')
        valid.append((text,l,t,r,b))
    chars=''.join(sorted({ch for text,*_ in valid for ch in text}))
    font,buffer=font_for(doc,chars,font_path); fonts.append((font,buffer))
    for text,l,t,r,b in valid:
        obj=pdf.PdfObject(raw.FPDFPageObj_CreateTextObj(doc,font,16),pdf=doc)
        set_text(obj,text);page.insert_obj(obj);x0,y0,x1,y1=obj.get_bounds()
        require(x1>x0 and y1>y0,'인식한 문자의 표시 영역을 계산하지 못했습니다.')
        p=page_point(page,l,b);right=page_point(page,r,b);top=page_point(page,l,t)
        a=(right[0]-p[0])/(x1-x0);bv=(right[1]-p[1])/(x1-x0)
        cv=(top[0]-p[0])/(y1-y0);d=(top[1]-p[1])/(y1-y0)
        obj.set_matrix(pdf.PdfMatrix(a,bv,cv,d,p[0]-a*x0-cv*y0,p[1]-bv*x0-d*y0))
        check(raw.FPDFTextObj_SetTextRenderMode(obj,3),'검색 텍스트를 만들지 못했습니다.')

def modify(doc, ops):
    require(isinstance(ops,list) and 0<len(ops)<=1000,'operations는 1~1000개의 작업 배열이어야 합니다.')
    pages={}; objects={}; removed=set(); fonts=[]
    try:
        for op in ops:
            require(isinstance(op,dict),'잘못된 PDF 작업입니다.')
            pi=integer(op.get('page'),'page',len(doc))
            if pi not in pages:
                pages[pi]=doc[pi]; objects[pi]=list(pages[pi].get_objects(max_depth=1))
            page=pages[pi]; action=op.get('op'); obj=None
            if action in ('delete','transform','set_text','set_fill','replace_image'):
                oi=integer(op.get('object'),'object',len(objects[pi])); require((pi,oi) not in removed,'이미 삭제된 개체입니다.'); obj=objects[pi][oi]
            if action=='delete':
                page.remove_obj(obj); obj.close(); removed.add((pi,oi))
            elif action=='transform':
                dx=number(op.get('dx',0),'dx'); dy=number(op.get('dy',0),'dy')
                sx=number(op.get('scaleX',1),'scaleX',0.01,100); sy=number(op.get('scaleY',1),'scaleY',0.01,100)
                angle=math.radians(number(op.get('rotation',0),'rotation',-3600,3600))
                l,b,r,t=obj.get_bounds(); cx,cy=(l+r)/2,(b+t)/2
                a,bv,cv,d=sx*math.cos(angle),sx*math.sin(angle),-sy*math.sin(angle),sy*math.cos(angle)
                matrix=pdf.PdfMatrix(a,bv,cv,d,cx+dx-a*cx-cv*cy,cy+dy-bv*cx-d*cy)
                obj.transform(matrix)
                raw.FPDFPageObj_TransformClipPath(obj,matrix.a,matrix.b,matrix.c,matrix.d,matrix.e,matrix.f)
            elif action=='set_text':
                require(obj.type==raw.FPDF_PAGEOBJ_TEXT,'텍스트 개체를 선택하세요.')
                text=text_value(op.get('text'))
                # Retain original style/font when the requested glyphs already occur
                # in the source object. Otherwise replace using a complete font.
                with closing(page.get_textpage()) as tp:
                    obj.textpage=tp; old=obj.extract()
                obj.textpage=None
                if not op.get('font') and not op.get('size') and set(text).issubset(set(old)):
                    set_text(obj,text)
                else:
                    clip=raw.FPDFPageObj_GetClipPath(obj)
                    require(not clip or raw.FPDFClipPath_CountPaths(clip)<=0,'잘린 영역이 있는 텍스트는 글꼴을 교체할 수 없습니다.')
                    require(raw.FPDFTextObj_GetTextRenderMode(obj) in (0,3),'외곽선 또는 클리핑 텍스트는 글꼴을 교체할 수 없습니다.')
                    size=c.c_float(); check(raw.FPDFTextObj_GetFontSize(obj,c.byref(size)),'텍스트 크기를 읽지 못했습니다.')
                    font,buffer=font_for(doc,text,op.get('font'),original=obj); fonts.append((font,buffer))
                    replacement=pdf.PdfObject(raw.FPDFPageObj_CreateTextObj(doc,font,number(op.get('size',size.value),'size',1,1000)),pdf=doc)
                    set_text(replacement,text); replacement.set_matrix(obj.get_matrix())
                    rgba=[c.c_uint() for _ in range(4)]
                    if raw.FPDFPageObj_GetFillColor(obj,*[c.byref(v) for v in rgba]): raw.FPDFPageObj_SetFillColor(replacement,*[v.value for v in rgba])
                    # Replacing in-place preserves z order, clipping and render mode:
                    # changing font via replacement cannot preserve arbitrary clipping.
                    # Insert at original z position using the index insertion API.
                    mode=raw.FPDFTextObj_GetTextRenderMode(obj)
                    require(mode in (0,1,2,3),'클리핑에 사용된 텍스트는 글꼴을 교체할 수 없습니다.')
                    raw.FPDFTextObj_SetTextRenderMode(replacement,mode)
                    current_index=next(i for i,o in enumerate(page.get_objects(max_depth=1)) if c.cast(o.raw,c.c_void_p).value==c.cast(obj.raw,c.c_void_p).value)
                    page.remove_obj(obj); obj.close()
                    check(raw.FPDFPage_InsertObjectAtIndex(page,replacement,current_index),'텍스트 삽입에 실패했습니다.')
                    replacement._detach_finalizer(); replacement.page=page
                    objects[pi][oi]=replacement
            elif action=='set_fill':
                require(obj.type in (raw.FPDF_PAGEOBJ_TEXT,raw.FPDF_PAGEOBJ_PATH),'텍스트 또는 도형을 선택하세요.')
                check(raw.FPDFPageObj_SetFillColor(obj,*color(op.get('color')),round(number(op.get('opacity',1),'opacity',0,1)*255)),'색상을 변경하지 못했습니다.')
            elif action in ('replace_image','add_image'):
                if action=='replace_image': require(obj.type==raw.FPDF_PAGEOBJ_IMAGE,'이미지 개체를 선택하세요.')
                require(isinstance(op.get('image'),str),'이미지 경로를 지정하세요.')
                image_path=Path(op['image']); require(image_path.is_file() and image_path.stat().st_size<=100*1024*1024,'이미지를 읽을 수 없거나 너무 큽니다.')
                with Image.open(image_path) as image:
                    require(image.width*image.height<=40000000,'이미지 해상도가 너무 큽니다.')
                    bitmap=pdf.PdfBitmap.from_pil(image.convert('RGBA'))
                    try:
                        if action=='add_image': obj=pdf.PdfImage.new(doc)
                        obj.set_bitmap(bitmap,pages=[page])
                    finally: bitmap.close()
                if action=='add_image':
                    obj.set_matrix(pdf.PdfMatrix(number(op.get('width',200),'width',1,30000),0,0,number(op.get('height',150),'height',1,30000),number(op.get('x',40),'x'),number(op.get('y',40),'y'))); page.insert_obj(obj)
            elif action=='add_ocr_layer':
                add_search_layer(doc,page,op.get('regions'),fonts,op.get('font'))
            elif action=='add_text':
                text=text_value(op.get('text')); font,buffer=font_for(doc,text,op.get('font')); fonts.append((font,buffer))
                obj=pdf.PdfObject(raw.FPDFPageObj_CreateTextObj(doc,font,number(op.get('size',18),'size',1,1000)),pdf=doc)
                set_text(obj,text); raw.FPDFPageObj_SetFillColor(obj,*color(op.get('color','#202632')),255)
                obj.transform(pdf.PdfMatrix(1,0,0,1,number(op.get('x',40),'x'),number(op.get('y',40),'y'))); page.insert_obj(obj)
            elif action=='add_rect':
                obj=pdf.PdfObject(raw.FPDFPageObj_CreateNewRect(number(op.get('x'),'x'),number(op.get('y'),'y'),number(op.get('width'),'width',1,30000),number(op.get('height'),'height',1,30000)),pdf=doc)
                raw.FPDFPageObj_SetFillColor(obj,*color(op.get('color','#dbeafe')),255); raw.FPDFPath_SetDrawMode(obj,raw.FPDF_FILLMODE_WINDING,0); page.insert_obj(obj)
            else: raise PDFError('지원하지 않는 PDF 작업: '+str(action))
        for page in pages.values():
            # PDFium can emit dirty streams without retaining inherited CMYK/ICC
            # paint state for untouched siblings. Materialize their visible colors
            # before regeneration; keep wrappers alive until generation completes.
            paint_objects=list(page.get_objects(max_depth=1))
            for item in paint_objects:
                if item.type not in (raw.FPDF_PAGEOBJ_PATH,raw.FPDF_PAGEOBJ_TEXT): continue
                for getter,setter in [(raw.FPDFPageObj_GetFillColor,raw.FPDFPageObj_SetFillColor),(raw.FPDFPageObj_GetStrokeColor,raw.FPDFPageObj_SetStrokeColor)]:
                    rgba=[c.c_uint() for _ in range(4)]
                    if getter(item,*[c.byref(v) for v in rgba]):
                        check(setter(item,*[v.value for v in rgba]),'기존 개체의 색상을 보존하지 못했습니다.')
            page.gen_content()
    finally:
        for page in pages.values(): page.close()
        # PDFium owns the font data after loading; keep the buffers for the batch.
        for font,_ in fonts: raw.FPDFFont_Close(font)

def ocr_page(page, language):
    require(isinstance(language,str) and re.fullmatch(r'[A-Za-z0-9_]+(?:\+[A-Za-z0-9_]+)*',language),'OCR 언어가 올바르지 않습니다.')
    engine=shutil.which('tesseract')
    if not engine: raise PDFError('로컬 OCR 엔진이 없습니다. Tesseract와 필요한 언어 데이터를 설치하세요.','missing_dependency')
    with tempfile.TemporaryDirectory(prefix='hanx-ocr-') as temp:
        image=render_page(page,3); image.save(Path(temp)/'page.png')
        result=subprocess.run([engine,str(Path(temp)/'page.png'),'stdout','-l',language,'tsv'],capture_output=True,text=True,encoding='utf-8',timeout=120)
        if result.returncode: raise PDFError('OCR을 실행하지 못했습니다. 언어 데이터를 확인하세요. '+result.stderr[-1500:],'ocr_error')
        words=[]; lines={}
        for row in csv.DictReader(io.StringIO(result.stdout),delimiter='\t'):
            text=(row.get('text') or '').strip()
            if not text: continue
            confidence=float(row['conf']);
            if confidence<0: continue
            x,y,w,h=[int(row[k]) for k in ('left','top','width','height')]
            words.append({'text':text,'confidence':confidence,'viewBounds':[x/image.width,y/image.height,(x+w)/image.width,(y+h)/image.height]})
            key=tuple(row[k] for k in ('block_num','par_num','line_num')); lines.setdefault(key,[]).append(text)
        return {'text':'\n'.join(' '.join(line) for line in lines.values()),'words':words,'language':language}

def run(request):
    require(isinstance(request,dict),'잘못된 요청입니다.')
    action=request.get('action')
    if action=='capabilities': return {'engine':'PDFium','version':str(pdf.PYPDFIUM_INFO),'ocrAvailable':bool(shutil.which('tesseract'))}
    require(isinstance(request.get('input'),str),'입력 PDF 경로를 지정하세요.')
    source=Path(request['input']); require(source.is_file() and source.stat().st_size<=512*1024*1024,'PDF를 읽을 수 없거나 512 MB를 초과합니다.')
    data=source.read_bytes(); revision=hashlib.sha256(data).hexdigest()
    require(request.get('revision',revision)==revision,'파일이 변경됐습니다. 개체 목록을 다시 읽으세요.')
    with pdf.PdfDocument(data) as doc:
        require(0<len(doc)<=10000,'페이지 수가 지원 범위를 벗어났습니다.')
        permissions=raw.FPDF_GetDocPermissions(doc)
        if action in ('inspect','ocr','ocr_plan'): require(permissions & 16,'이 PDF는 내용 추출이 허용되지 않습니다.')
        if action=='ocr_plan':
            indices=range(len(doc)) if request.get('allPages') is True else [integer(request.get('page',0),'page',len(doc))]
            require(len(indices)<=1000,'한 번에 최대 1000페이지까지 처리할 수 있습니다.')
            eligible=[];skipped=[]
            for index in indices:
                with closing(doc[index]) as page, closing(page.get_textpage()) as tp:
                    (skipped if tp.get_text_bounded().strip() else eligible).append(index)
            return {'pages':eligible,'skippedPages':skipped,'revision':revision}
        if action=='inspect': return inspect_page(doc,request.get('page',0),revision)
        if action in ('render','ocr'):
            with closing(doc[integer(request.get('page',0),'page',len(doc))]) as page:
                if action=='ocr': return ocr_page(page,request.get('language','kor+eng'))
                image=render_page(page,number(request.get('scale',1.5),'scale',0.1,4)); buffer=io.BytesIO(); image.save(buffer,format='PNG')
                return {'image':'data:image/png;base64,'+base64.b64encode(buffer.getvalue()).decode(),'width':image.width,'height':image.height,'revision':revision}
        if action=='edit':
            require(permissions & 8,'이 PDF는 편집이 허용되지 않습니다.')
            require(isinstance(request.get('output'),str),'저장 경로를 지정하세요.')
            output=Path(request['output']); require(output.suffix.lower()=='.pdf','저장 파일 확장자는 .pdf여야 합니다.')
            require(not output.exists() or request.get('force') is True,'저장 파일이 이미 있습니다. 덮어쓰려면 force를 지정하세요.')
            modify(doc,request.get('operations'))
            fd,temp=tempfile.mkstemp(prefix='.hanx-pdf-',suffix='.pdf',dir=output.parent); os.close(fd)
            try:
                doc.save(temp,flags=raw.FPDF_NO_INCREMENTAL)
                # Validate the newly generated file before touching the destination.
                with pdf.PdfDocument(temp) as saved: require(len(saved)==len(doc),'저장된 PDF 검증에 실패했습니다.')
                if request.get('force') is True: os.replace(temp,output)
                else:
                    # Exclusive creation also protects against a race after the check.
                    if os.name == 'nt': os.rename(temp,output)
                    else: os.link(temp,output)
                return {'path':str(output.resolve()),'kind':'pdf','bytes':output.stat().st_size}
            finally:
                if os.path.exists(temp): os.unlink(temp)
        raise PDFError('지원하지 않는 PDF 명령입니다.')

if __name__=='__main__':
    try:
        import pypdfium2 as pdf
        import pypdfium2.raw as raw
        from PIL import Image
        request=json.loads(sys.stdin.buffer.read(8*1024*1024+1))
        print(json.dumps({'ok':True,'data':run(request)},ensure_ascii=True,allow_nan=False))
    except ImportError:
        print(json.dumps({'ok':False,'error':{'code':'missing_dependency','message':'PDF 편집 엔진을 준비하세요: hanx pdf setup'}})); sys.exit(1)
    except Exception as error:
        print(json.dumps({'ok':False,'error':{'code':getattr(error,'code','pdf_error'),'message':str(error)}},ensure_ascii=True)); sys.exit(1)
