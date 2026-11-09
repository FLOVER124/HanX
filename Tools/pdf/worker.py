#!/usr/bin/env python3
"""One request per process. PDF coordinates are points, bottom-left, before rotation.
Objects are top-level content objects, addressed in the INPUT revision (not reindexed
between operations). A form is edited as a whole; shared nested content is untouched.
Page operations form their own batch and apply in order.
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

def paragraph_value(value):
    require(isinstance(value,str) and value.strip() and len(value)<=20000 and value.count('\n')<1000 and not any(ord(ch)<32 and ch!='\n' for ch in value), '문단 텍스트는 비어 있지 않은 최대 20,000자, 1,000줄 이하여야 합니다.')
    return value.replace('\r','')

def text_width(doc, font, size, text):
    if not text: return 0.0
    obj=raw.FPDFPageObj_CreateTextObj(doc,font,size); check(obj,'텍스트 폭을 계산하지 못했습니다.')
    try:
        set_text(obj,text); box=[c.c_float() for _ in range(4)]
        check(raw.FPDFPageObj_GetBounds(obj,*[c.byref(v) for v in box]),'텍스트 폭을 계산하지 못했습니다.')
        return box[2].value  # origin to right edge, as laid out from the line start
    finally: raw.FPDFPageObj_Destroy(obj)

def wrap(measure, text, width):
    # Greedy word wrap; explicit newlines are hard breaks. A word wider than the
    # column (common for long Korean runs without spaces) breaks by character.
    lines=[]
    for hard in text.split('\n'):
        line=''
        for token in re.findall(r'\S+\s*',hard):
            if measure((line+token).rstrip())<=width: line+=token; continue
            if line: lines.append(line.rstrip()); line=''
            if measure(token.rstrip())<=width: line=token; continue
            for ch in token:
                if line.strip() and measure((line+ch).rstrip())>width: lines.append(line.rstrip()); line=''
                line+=ch
        lines.append(line.rstrip())
    return lines

def place_lines(doc, page, index, lines, font, size, matrix, leading, rgba, mode=0):
    # Lines share the source scale; each baseline steps down by `leading` points.
    for i,line in enumerate(lines):
        if not line: continue
        obj=pdf.PdfObject(raw.FPDFPageObj_CreateTextObj(doc,font,size),pdf=doc)
        set_text(obj,line); obj.set_matrix(pdf.PdfMatrix(matrix.a,0,0,matrix.d,matrix.e,matrix.f-i*leading))
        raw.FPDFPageObj_SetFillColor(obj,*rgba); raw.FPDFTextObj_SetTextRenderMode(obj,mode)
        if index is None: page.insert_obj(obj)
        else:
            check(raw.FPDFPage_InsertObjectAtIndex(page,obj,index),'텍스트 삽입에 실패했습니다.')
            obj._detach_finalizer(); obj.page=page; index+=1

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

def tag_font(font, source, text):
    # PDFium reuses an already loaded font with the same PostScript name, even if
    # it is a different subset. Name each subset uniquely (PDF subset tag style),
    # derived from the source font and the characters it must contain.
    names=font['name']; base=re.sub(r'^[A-Z]{6}\+','',names.getDebugName(6) or 'HanXFont')
    base=re.sub(r'[^A-Za-z0-9_-]','',base) or 'HanXFont'
    digest=hashlib.sha256(source+b'\0'+''.join(sorted(set(text))).encode('utf-8')).digest()
    value=''.join(chr(65+b%26) for b in digest[:6])+'+'+base[:56]
    records=[record for record in names.names if record.nameID==6]
    for record in records: record.string=value
    if not records: names.setName(value,6,3,1,0x409)
    if 'CFF ' in font: font['CFF '].cff.fontNames=[value]

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
                            tag_font(embedded,bytes(data),text)
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
                identity=f'{candidate}:{face}:{Path(candidate).stat().st_size}'.encode()
                if getattr(parsed.get('OS/2'),'fsType',0) & 0x100:
                    tag_font(parsed,identity,text)
                    output=io.BytesIO(); parsed.save(output); data=output.getvalue()
                else:
                    from fontTools.subset import Subsetter
                    subset=Subsetter();subset.options.name_IDs=[1,2,4,6,16,17];subset.options.name_legacy=True;subset.options.name_languages=['*']; subset.populate(text=text); subset.subset(parsed)
                    tag_font(parsed,identity,text)
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

def view_bounds(page, bounds):
    points=[]
    for x,y in [(bounds[0],bounds[1]),(bounds[0],bounds[3]),(bounds[2],bounds[1]),(bounds[2],bounds[3])]:
        dx,dy=c.c_int(),c.c_int()
        check(raw.FPDF_PageToDevice(page,0,0,1000000,1000000,0,x,y,c.byref(dx),c.byref(dy)),'페이지 좌표 변환에 실패했습니다.')
        points.append((dx.value/1000000,dy.value/1000000))
    return [min(p[0] for p in points),min(p[1] for p in points),max(p[0] for p in points),max(p[1] for p in points)]

ANNOT_TYPES={1:'note',2:'link',3:'freetext',4:'line',5:'square',6:'circle',7:'polygon',8:'polyline',9:'highlight',10:'underline',11:'squiggly',12:'strikeout',13:'stamp',14:'caret',15:'ink',16:'popup',17:'attachment',18:'sound',19:'movie',20:'widget',21:'screen',22:'printermark',23:'trapnet',24:'watermark',25:'3d',26:'richmedia',27:'xfawidget',28:'redact'}
# Subtypes PDFium can draw (and regenerate) without an existing appearance stream.
CREATABLE={'note':1,'square':5,'circle':6,'highlight':9,'underline':10,'squiggly':11,'strikeout':12}
MARKUP=('highlight','underline','squiggly','strikeout')
DEFAULT_COLOR={'highlight':'#ffe14d','note':'#ffd54f'}
FIELD_TYPES={1:'button',2:'checkbox',3:'radio',4:'combobox',5:'listbox',6:'text',7:'signature'}
ANNOT_OPS=('add_annotation','set_annotation','delete_annotation'); FIELD_OPS=('set_field',)

def wide(getter, *args):
    size=getter(*args,None,0)
    if not 2<size<=4000000: return ''
    buffer=(c.c_ushort*(size//2))(); getter(*args,buffer,size)
    return bytes(buffer)[:size-2].decode('utf-16-le','replace')

def widestring(text):
    buffer=c.create_string_buffer(text.encode('utf-16-le')+b'\0\0'); return buffer,c.cast(buffer,c.POINTER(c.c_ushort))

def field_info(form, annot):
    kind=FIELD_TYPES.get(raw.FPDFAnnot_GetFormFieldType(form,annot),'unknown'); flags=raw.FPDFAnnot_GetFormFieldFlags(form,annot)
    info={'type':kind,'name':wide(raw.FPDFAnnot_GetFormFieldName,form,annot),'value':wide(raw.FPDFAnnot_GetFormFieldValue,form,annot),'readOnly':bool(flags&1),'required':bool(flags&2)}
    label=wide(raw.FPDFAnnot_GetFormFieldAlternateName,form,annot)
    if label: info['label']=label
    if kind in ('checkbox','radio'):
        info['checked']=bool(raw.FPDFAnnot_IsChecked(form,annot)); info['exportValue']=wide(raw.FPDFAnnot_GetFormFieldExportValue,form,annot)
    elif kind in ('combobox','listbox'):
        count=max(0,min(raw.FPDFAnnot_GetOptionCount(form,annot),1000))
        info['options']=[{'label':wide(raw.FPDFAnnot_GetOptionLabel,form,annot,k),'selected':bool(raw.FPDFAnnot_IsOptionSelected(form,annot,k))} for k in range(count)]
        info['editable']=kind=='combobox' and bool(flags&(1<<18)); info['multiple']=kind=='listbox' and bool(flags&(1<<21))
    elif kind=='text':
        info['multiline']=bool(flags&(1<<12)); info['password']=bool(flags&(1<<13))
    return info

def annot_color(annot):
    # PDFium only reports /C for annotations without an appearance stream. Callers
    # pass annotations whose appearance is discarded (inspect never saves).
    values=[c.c_uint() for _ in range(4)]
    raw.FPDFAnnot_SetAP(annot,raw.FPDF_ANNOT_APPEARANCEMODE_NORMAL,None)
    if raw.FPDFAnnot_GetColor(annot,raw.FPDFANNOT_COLORTYPE_Color,*[c.byref(v) for v in values]):
        return '#'+''.join(f'{v.value:02x}' for v in values[:3]),round(values[3].value/255,3)
    return None,None

def read_annotations(doc, page):
    form=doc.formenv.raw if doc.formenv else None; entries=[]
    for i in range(min(raw.FPDFPage_GetAnnotCount(page),5000)):
        annot=raw.FPDFPage_GetAnnot(page,i)
        if not annot: continue
        try:
            kind=ANNOT_TYPES.get(raw.FPDFAnnot_GetSubtype(annot),'unknown'); rect=raw.FS_RECTF()
            # Popups belong to their parent note; they keep their index but are not listed.
            if kind=='popup' or not raw.FPDFAnnot_GetRect(annot,rect): continue
            bounds=[min(rect.left,rect.right),min(rect.bottom,rect.top),max(rect.left,rect.right),max(rect.bottom,rect.top)]
            item={'id':i,'type':kind,'bounds':bounds,'viewBounds':view_bounds(page,bounds),'hidden':bool(raw.FPDFAnnot_GetFlags(annot)&2)}
            if kind=='widget':
                if form: item['field']=field_info(form,annot)
            else:
                item['contents']=wide(raw.FPDFAnnot_GetStringValue,annot,b'Contents'); item['author']=wide(raw.FPDFAnnot_GetStringValue,annot,b'T')
                item['color'],opacity=annot_color(annot)
                if opacity is not None: item['opacity']=opacity
                item['editable']=kind in CREATABLE
            if kind=='link':
                link=raw.FPDFAnnot_GetLink(annot); action=raw.FPDFLink_GetAction(link) if link else None
                if action and raw.FPDFAction_GetType(action)==raw.PDFACTION_URI:
                    size=raw.FPDFAction_GetURIPath(doc,action,None,0)
                    if 0<size<=65536:
                        buffer=c.create_string_buffer(size); raw.FPDFAction_GetURIPath(doc,action,buffer,size); item['uri']=buffer.value.decode('utf-8','replace')
            entries.append(item)
        finally: raw.FPDFPage_CloseAnnot(annot)
    return entries

def rect_value(value, name='rect'):
    require(isinstance(value,list) and len(value)==4,f'{name}: [왼쪽, 아래, 오른쪽, 위] 좌표를 지정하세요.')
    l,b,r,t=[number(v,name) for v in value]; require(r>l and t>b,f'{name}: 크기가 잘못됐습니다.')
    return l,b,r,t

def annotation_text(value, name):
    require(isinstance(value,str) and len(value)<=20000 and not any(ord(ch)<32 and ch not in '\n\t' for ch in value),f'{name}: 최대 20,000자의 텍스트를 입력하세요.')
    return value

def style_annotation(annot, kind, op, creating):
    # Drop the old appearance first: PDFium will not restyle an annotation that has
    # one, and regenerates it from the new colour and geometry before saving.
    raw.FPDFAnnot_SetAP(annot,raw.FPDF_ANNOT_APPEARANCEMODE_NORMAL,None)
    if creating or 'color' in op or 'opacity' in op:
        # A new annotation may already carry PDFium's default colour; use ours instead.
        current,alpha=(None,None) if creating else annot_color(annot)
        rgb=color(op.get('color',current or DEFAULT_COLOR.get(kind,'#e53935')))
        opacity=number(op.get('opacity',alpha if alpha is not None else 1),'opacity',0,1)
        check(raw.FPDFAnnot_SetColor(annot,raw.FPDFANNOT_COLORTYPE_Color,*rgb,round(opacity*255)),'주석 색상을 바꾸지 못했습니다.')
    for key,field in (('contents',b'Contents'),('author',b'T')):
        if key in op:
            text_buffer,value=widestring(annotation_text(op[key],key)); check(raw.FPDFAnnot_SetStringValue(annot,field,value),'주석 내용을 바꾸지 못했습니다.')
    if 'rect' in op:
        require(kind not in MARKUP,'형광펜·밑줄·취소선 주석은 위치를 바꿀 수 없습니다. 삭제 후 다시 추가하세요.')
        l,b,r,t=rect_value(op['rect']); check(raw.FPDFAnnot_SetRect(annot,raw.FS_RECTF(l,t,r,b)),'주석 위치를 바꾸지 못했습니다.')
    from datetime import datetime,timezone
    keep,stamp=widestring(datetime.now(timezone.utc).strftime("D:%Y%m%d%H%M%SZ")); raw.FPDFAnnot_SetStringValue(annot,b'M',stamp)

def add_annotation(page, op):
    kind=op.get('type'); require(kind in CREATABLE,'type: '+', '.join(CREATABLE)+' 중 하나를 지정하세요.')
    annot=raw.FPDFPage_CreateAnnot(page,CREATABLE[kind]); check(annot,'주석을 만들지 못했습니다.')
    try:
        if kind in MARKUP:
            rects=op.get('rects'); require(isinstance(rects,list) and 0<len(rects)<=500,'rects: 표시할 영역 배열을 지정하세요.')
            boxes=[rect_value(r,'rects') for r in rects]
            for l,b,r,t in boxes: check(raw.FPDFAnnot_AppendAttachmentPoints(annot,raw.FS_QUADPOINTSF(l,t,r,t,l,b,r,b)),'주석 영역을 추가하지 못했습니다.')
            l,b,r,t=min(x[0] for x in boxes),min(x[1] for x in boxes),max(x[2] for x in boxes),max(x[3] for x in boxes)
            check(raw.FPDFAnnot_SetRect(annot,raw.FS_RECTF(l,t,r,b)),'주석 위치를 지정하지 못했습니다.')
        else:
            l,b,r,t=rect_value(op.get('rect')); check(raw.FPDFAnnot_SetRect(annot,raw.FS_RECTF(l,t,r,b)),'주석 위치를 지정하지 못했습니다.')
        raw.FPDFAnnot_SetFlags(annot,raw.FPDF_ANNOT_FLAG_PRINT)
        style_annotation(annot,kind,{k:v for k,v in op.items() if k!='rect'},True)
    finally: raw.FPDFPage_CloseAnnot(annot)

def set_field(form, page, annot, op):
    require(raw.FPDFAnnot_GetSubtype(annot)==raw.FPDF_ANNOT_WIDGET,'양식 필드를 선택하세요.')
    info=field_info(form,annot); kind=info['type']
    require(not info['readOnly'],'읽기 전용 양식 필드입니다.')
    labels=[o['label'] for o in info.get('options',[])]
    check(raw.FORM_SetFocusedAnnot(form,annot),'양식 필드를 선택하지 못했습니다.')
    try:
        if kind=='text' or kind=='combobox' and info['editable'] and op.get('value') not in labels:
            value=op.get('value'); require(isinstance(value,str) and len(value)<=20000 and not any(ord(ch)<32 and not (ch=='\n' and info.get('multiline')) for ch in value),'value: 입력할 텍스트를 지정하세요.')
            raw.FORM_SelectAllText(form,page); keep,buffer=widestring(value); raw.FORM_ReplaceSelection(form,page,buffer); expected=('value',value)
        elif kind in ('checkbox','radio'):
            want=op.get('checked'); require(type(want) is bool,'checked: true 또는 false를 지정하세요.')
            require(want or kind=='checkbox','라디오 버튼은 같은 그룹의 다른 항목을 선택해 해제합니다.')
            if info['checked']!=want: raw.FORM_OnChar(form,page,0x20,0)
            expected=('checked',want)
        elif kind=='combobox':
            value=op.get('value'); require(value in labels,'value: 목록에 있는 항목을 지정하세요.')
            check(raw.FORM_SetIndexSelected(form,page,labels.index(value),1),'항목을 선택하지 못했습니다.'); expected=('value',value)
        elif kind=='listbox':
            values=op.get('values'); require(isinstance(values,list) and all(v in labels for v in values) and (info['multiple'] or len(values)==1),'values: 목록에 있는 항목 배열을 지정하세요.')
            for k,label in enumerate(labels):
                if (label in values)!=info['options'][k]['selected']: check(raw.FORM_SetIndexSelected(form,page,k,label in values),'항목을 선택하지 못했습니다.')
            expected=('values',values)
        else: raise PDFError('이 양식 필드는 값을 바꿀 수 없습니다: '+kind)
    finally: raw.FORM_ForceToKillFocus(form)
    after=field_info(form,annot); key,value=expected
    actual=[o['label'] for o in after.get('options',[]) if o['selected']] if key=='values' else after.get(key)
    if key=='values': value=[label for label in labels if label in value]
    require(actual==value,'양식 필드에 값을 넣지 못했습니다. 길이 제한이나 입력 형식을 확인하세요.')

def inspect_page(doc, index, revision):
    index=integer(index,'page',len(doc))
    with closing(doc[index]) as page:
        width,height=page.get_size()
        require(0<width<=30000 and 0<height<=30000,'PDF 페이지 크기가 지원 범위를 벗어났습니다.')
        entries=[]
        with closing(page.get_textpage()) as textpage:
            for i,obj in enumerate(page.get_objects(max_depth=1,textpage=textpage)):
                require(i<50000,'페이지 개체가 너무 많습니다.')
                bounds=list(obj.get_bounds())
                item={'id':i,'type':{1:'text',2:'path',3:'image',4:'shading',5:'form'}.get(obj.type,'unknown'), 'bounds':bounds,'viewBounds':view_bounds(page,bounds),'fill':fill(obj)}
                if obj.type==raw.FPDF_PAGEOBJ_TEXT:
                    item['font']=font_info(obj); item['text']=obj.extract(); item['matrix']=list(obj.get_matrix().get()); item['searchText']=raw.FPDFTextObj_GetTextRenderMode(obj)==3; size=c.c_float()
                    if raw.FPDFTextObj_GetFontSize(obj,c.byref(size)): item['size']=size.value
                entries.append(item)
        return {'kind':'pdf','page':index,'pageCount':len(doc),'width':width,'height':height,'rotation':page.get_rotation(),'objects':entries,'annotations':read_annotations(doc,page),'revision':revision}

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

PAGE_OPS=('rotate_page','delete_page','move_page','duplicate_page','insert_blank_page','import_pages')
MAX_PAGES=10000

def modify_pages(doc, ops):
    # Page operations run in order; each index refers to the document produced
    # by the previous page operation. Page content, annotations and resources
    # are carried with the page; nothing is rasterized.
    for op in ops:
        action=op.get('op')
        if action=='rotate_page':
            pi=integer(op.get('page'),'page',len(doc)); angle=op.get('rotation',90)
            require(angle in (90,180,270,-90,-180,-270),'rotation: 90, 180, 270(또는 음수) 중 하나를 지정하세요.')
            with closing(doc[pi]) as page: page.set_rotation((page.get_rotation()+angle)%360)
        elif action=='delete_page':
            pi=integer(op.get('page'),'page',len(doc)); require(len(doc)>1,'마지막 남은 페이지는 삭제할 수 없습니다.')
            doc.del_page(pi)
        elif action=='move_page':
            pi=integer(op.get('page'),'page',len(doc)); to=integer(op.get('to'),'to',len(doc))
            if pi!=to: check(raw.FPDF_MovePages(doc,(c.c_int*1)(pi),1,to),'페이지를 이동하지 못했습니다.')
        elif action=='duplicate_page':
            pi=integer(op.get('page'),'page',len(doc)); require(len(doc)<MAX_PAGES,'페이지 수가 지원 범위를 벗어납니다.')
            doc.import_pages(doc,[pi],pi+1)
        elif action=='insert_blank_page':
            at=integer(op.get('at',len(doc)),'at',len(doc)+1); require(len(doc)<MAX_PAGES,'페이지 수가 지원 범위를 벗어납니다.')
            with closing(doc[max(0,at-1)]) as neighbor: width,height=neighbor.get_size()
            width=number(op.get('width',width),'width',1,30000); height=number(op.get('height',height),'height',1,30000)
            doc.new_page(width,height,at).close()
        elif action=='import_pages':
            require(isinstance(op.get('source'),str),'가져올 PDF 경로를 지정하세요.')
            source=Path(op['source']); require(source.is_file() and source.suffix.lower()=='.pdf' and source.stat().st_size<=512*1024*1024,'가져올 PDF를 읽을 수 없거나 512 MB를 초과합니다.')
            at=integer(op.get('at',len(doc)),'at',len(doc)+1)
            try: other=pdf.PdfDocument(source.read_bytes())
            except pdf.PdfiumError: raise PDFError('가져올 PDF를 열지 못했습니다. 암호가 걸린 PDF는 먼저 암호를 해제하세요.')
            with other:
                require(raw.FPDF_GetDocPermissions(other) & 16,'가져올 PDF는 내용 복사가 허용되지 않습니다.')
                selection=op.get('pages',list(range(len(other))))
                require(isinstance(selection,list) and 0<len(selection)<=MAX_PAGES,'pages는 가져올 페이지 번호 배열입니다.')
                selection=[integer(i,'pages',len(other)) for i in selection]
                require(len(doc)+len(selection)<=MAX_PAGES,'페이지 수가 지원 범위를 벗어납니다.')
                doc.import_pages(other,selection,at)
        else: raise PDFError('지원하지 않는 PDF 작업: '+str(action))

def set_paragraph(doc, page, pi, op, objects, removed, fonts):
    # Replace horizontal text lines with the same text reflowed in their column.
    # Lines are placed from the first baseline with the source line spacing.
    ids=op.get('objects')
    require(isinstance(ids,list) and 0<len(ids)<=500 and len(set(map(str,ids)))==len(ids),'objects는 문단을 이루는 텍스트 개체 번호 배열입니다.')
    members=[]
    for oi in ids:
        oi=integer(oi,'objects',len(objects[pi])); require((pi,oi) not in removed,'이미 삭제된 개체입니다.'); obj=objects[pi][oi]
        require(obj.type==raw.FPDF_PAGEOBJ_TEXT,'문단 편집에는 텍스트 개체만 선택하세요.')
        clip=raw.FPDFPageObj_GetClipPath(obj)
        require((not clip or raw.FPDFClipPath_CountPaths(clip)<=0) and raw.FPDFTextObj_GetTextRenderMode(obj) in (0,3),'잘린 영역이나 외곽선이 있는 텍스트는 문단으로 편집할 수 없습니다.')
        m=obj.get_matrix()
        require(abs(m.b)<1e-6 and abs(m.c)<1e-6 and m.a>0 and m.d>0,'회전하거나 기울어진 텍스트는 문단으로 편집할 수 없습니다.')
        members.append((oi,obj,m))
    text=paragraph_value(op.get('text'))
    first=max(members,key=lambda item:(round(item[2].f,1),-item[2].e))[1]
    scale=first.get_matrix(); size=c.c_float(); check(raw.FPDFTextObj_GetFontSize(first,c.byref(size)),'텍스트 크기를 읽지 못했습니다.')
    size=number(op.get('size',size.value),'size',1,1000)
    bounds=[obj.get_bounds() for _,obj,_ in members]
    left=min(m.e for *_,m in members); width=number(op.get('width',max(b[2] for b in bounds)-left),'width',1,30000)
    baselines=sorted({round(m.f,2) for *_,m in members},reverse=True)
    gaps=sorted(a-b for a,b in zip(baselines,baselines[1:]) if a-b>size*scale.d*0.5)
    leading=number(op.get('lineHeight',gaps[len(gaps)//2] if gaps else size*scale.d*1.2),'lineHeight',0.1,3000)
    font,buffer=font_for(doc,text.replace('\n',''),op.get('font'),original=first); fonts.append((font,buffer))
    cache={}
    # Source lines were measured by ink bounds; allow a little slack so an
    # unchanged paragraph keeps its original line breaks.
    lines=wrap(lambda t:cache.setdefault(t,text_width(doc,font,size,t)*scale.a),text,width*1.02+0.5)
    rgba=[c.c_uint() for _ in range(4)]
    if not raw.FPDFPageObj_GetFillColor(first,*[c.byref(v) for v in rgba]): rgba=[c.c_uint(0),c.c_uint(0),c.c_uint(0),c.c_uint(255)]
    mode=raw.FPDFTextObj_GetTextRenderMode(first)
    targets={c.cast(obj.raw,c.c_void_p).value for _,obj,_ in members}
    order=list(page.get_objects(max_depth=1))
    index=min(i for i,o in enumerate(order) if c.cast(o.raw,c.c_void_p).value in targets)
    for oi,obj,_ in members: page.remove_obj(obj); obj.close(); removed.add((pi,oi))
    place_lines(doc,page,index,lines,font,size,pdf.PdfMatrix(scale.a,0,0,scale.d,left,max(m.f for *_,m in members)),leading,[v.value for v in rgba],mode)

def modify(doc, ops):
    require(isinstance(ops,list) and 0<len(ops)<=1000,'operations는 1~1000개의 작업 배열이어야 합니다.')
    require(all(isinstance(op,dict) for op in ops),'잘못된 PDF 작업입니다.')
    if any(op.get('op') in PAGE_OPS for op in ops):
        require(all(op.get('op') in PAGE_OPS for op in ops),'페이지 작업과 개체 작업은 별도 요청으로 실행하세요.')
        return modify_pages(doc,ops)
    pages={}; objects={}; removed=set(); fonts=[]; annot_counts={}; doomed=set(); annotated=set()
    form=doc.formenv.raw if doc.formenv else None
    try:
        for op in ops:
            require(isinstance(op,dict),'잘못된 PDF 작업입니다.')
            pi=integer(op.get('page'),'page',len(doc))
            if pi not in pages:
                pages[pi]=doc[pi]; objects[pi]=list(pages[pi].get_objects(max_depth=1)); annot_counts[pi]=raw.FPDFPage_GetAnnotCount(pages[pi])
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
            elif action in ANNOT_OPS+FIELD_OPS:
                annotated.add(pi)
                if action=='add_annotation': add_annotation(page,op); continue
                ai=integer(op.get('annotation'),'annotation',annot_counts[pi]); require((pi,ai) not in doomed,'이미 삭제된 주석입니다.')
                annot=raw.FPDFPage_GetAnnot(page,ai); check(annot,'주석을 읽지 못했습니다.')
                try:
                    kind=ANNOT_TYPES.get(raw.FPDFAnnot_GetSubtype(annot),'unknown')
                    if action=='set_field': require(form,'양식 기능을 준비하지 못했습니다.'); set_field(form,page,annot,op)
                    elif action=='set_annotation':
                        require(kind in CREATABLE,'이 종류의 주석은 내용과 모양을 바꿀 수 없습니다: '+kind); style_annotation(annot,kind,op,False)
                    else:
                        require(kind not in ('widget','popup'),'양식 필드는 삭제할 수 없습니다.'); doomed.add((pi,ai))
                        popup=raw.FPDFAnnot_GetLinkedAnnot(annot,b'Popup')
                        if popup:
                            index=raw.FPDFPage_GetAnnotIndex(page,popup); raw.FPDFPage_CloseAnnot(popup)
                            if index>=0: doomed.add((pi,index))
                finally: raw.FPDFPage_CloseAnnot(annot)
            elif action=='set_paragraph':
                set_paragraph(doc,page,pi,op,objects,removed,fonts)
            elif action=='set_fill':
                require(obj.type in (raw.FPDF_PAGEOBJ_TEXT,raw.FPDF_PAGEOBJ_PATH),'텍스트 또는 도형을 선택하세요.')
                check(raw.FPDFPageObj_SetFillColor(obj,*color(op.get('color')),round(number(op.get('opacity',1),'opacity',0,1)*255)),'색상을 변경하지 못했습니다.')
            elif action in ('replace_image','add_image'):
                if action=='replace_image': require(obj.type==raw.FPDF_PAGEOBJ_IMAGE,'이미지 개체를 선택하세요.')
                require(isinstance(op.get('image'),str),'이미지 경로를 지정하세요.')
                image_path=Path(op['image']); require(image_path.is_file() and image_path.stat().st_size<=100*1024*1024,'이미지를 읽을 수 없거나 너무 큽니다.')
                try: opened=Image.open(image_path)
                except Exception: raise PDFError('그림을 읽을 수 없습니다. PNG, JPEG, WebP, AVIF, GIF, BMP, TIFF 형식을 사용하세요.')
                with opened as image:
                    # Large photos are scaled to 40 million pixels instead of being rejected;
                    # camera rotation is applied and animated images use their first frame.
                    from PIL import ImageOps
                    limit=40000000
                    if image.width*image.height>limit:
                        factor=math.sqrt(limit/(image.width*image.height)); image.draft('RGB',(int(image.width*factor),int(image.height*factor)))
                    image=ImageOps.exif_transpose(image.convert('RGBA'))
                    if image.width*image.height>limit:
                        factor=math.sqrt(limit/(image.width*image.height)); image=image.resize((max(1,int(image.width*factor)),max(1,int(image.height*factor))),Image.LANCZOS)
                    bitmap=pdf.PdfBitmap.from_pil(image)
                    try:
                        if action=='add_image': obj=pdf.PdfImage.new(doc)
                        obj.set_bitmap(bitmap,pages=[page])
                    finally: bitmap.close()
                if action=='add_image':
                    obj.set_matrix(pdf.PdfMatrix(number(op.get('width',200),'width',1,30000),0,0,number(op.get('height',150),'height',1,30000),number(op.get('x',40),'x'),number(op.get('y',40),'y'))); page.insert_obj(obj)
            elif action=='add_ocr_layer':
                add_search_layer(doc,page,op.get('regions'),fonts,op.get('font'))
            elif action=='add_text':
                text=paragraph_value(op.get('text')); font,buffer=font_for(doc,text.replace('\n',''),op.get('font')); fonts.append((font,buffer))
                size=number(op.get('size',18),'size',1,1000); lines=text.split('\n')
                if op.get('width') is not None:
                    width=number(op.get('width'),'width',1,30000); cache={}
                    lines=wrap(lambda t:cache.setdefault(t,text_width(doc,font,size,t)),text,width)
                leading=number(op.get('lineHeight',size*1.2),'lineHeight',0.1,3000)
                place_lines(doc,page,None,lines,font,size,pdf.PdfMatrix(1,0,0,1,number(op.get('x',40),'x'),number(op.get('y',40),'y')),leading,(*color(op.get('color','#202632')),255))
            elif action=='add_rect':
                obj=pdf.PdfObject(raw.FPDFPageObj_CreateNewRect(number(op.get('x'),'x'),number(op.get('y'),'y'),number(op.get('width'),'width',1,30000),number(op.get('height'),'height',1,30000)),pdf=doc)
                raw.FPDFPageObj_SetFillColor(obj,*color(op.get('color','#dbeafe')),255); raw.FPDFPath_SetDrawMode(obj,raw.FPDF_FILLMODE_WINDING,0); page.insert_obj(obj)
            else: raise PDFError('지원하지 않는 PDF 작업: '+str(action))
        # Annotation indices refer to the input; remove from the end so earlier indices stay valid.
        for pi,ai in sorted(doomed,reverse=True): check(raw.FPDFPage_RemoveAnnot(pages[pi],ai),'주석을 삭제하지 못했습니다.')
        for pi in annotated:
            # Rendering builds missing appearance streams for new or restyled annotations,
            # so other viewers show them without regenerating.
            pages[pi].render(scale=0.05,may_draw_forms=False).close()
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
        kinds={op.get('op') for op in request.get('operations') or [] if isinstance(op,dict)} if action=='edit' and isinstance(request.get('operations'),list) else set()
        # Form filling needs the form environment before any page is loaded.
        # Rendering also draws form fields with their current values.
        if action=='inspect' or kinds & set(FIELD_OPS) or action in ('render','ocr') and doc.get_formtype()!=raw.FORMTYPE_NONE: doc.init_forms()
        if action in ('inspect','ocr','ocr_plan','layout','text'): require(permissions & 16,'이 PDF는 내용 추출이 허용되지 않습니다.')
        if action=='ocr_plan':
            indices=range(len(doc)) if request.get('allPages') is True else [integer(request.get('page',0),'page',len(doc))]
            require(len(indices)<=1000,'한 번에 최대 1000페이지까지 처리할 수 있습니다.')
            eligible=[];skipped=[]
            for index in indices:
                with closing(doc[index]) as page, closing(page.get_textpage()) as tp:
                    (skipped if tp.get_text_bounded().strip() else eligible).append(index)
            return {'pages':eligible,'skippedPages':skipped,'revision':revision}
        if action=='layout':
            from layout import read_layout
            return read_layout(doc,render_page)
        if action=='text':
            pages=[]
            for index in range(len(doc)):
                with closing(doc[index]) as page, closing(page.get_textpage()) as tp:
                    pages.append(tp.get_text_range().replace('\r\n','\n').replace('\t',' '))
            return {'text':'\n'.join(pages)}
        if action=='inspect': return inspect_page(doc,request.get('page',0),revision)
        if action in ('render','ocr'):
            with closing(doc[integer(request.get('page',0),'page',len(doc))]) as page:
                if action=='ocr': return ocr_page(page,request.get('language','kor+eng'))
                image=render_page(page,number(request.get('scale',1.5),'scale',0.1,4)); buffer=io.BytesIO(); image.save(buffer,format='PNG')
                return {'image':'data:image/png;base64,'+base64.b64encode(buffer.getvalue()).decode(),'width':image.width,'height':image.height,'revision':revision}
        if action=='edit':
            require(permissions & 8 or not kinds-set(ANNOT_OPS+FIELD_OPS),'이 PDF는 편집이 허용되지 않습니다.')
            if kinds & set(ANNOT_OPS): require(permissions & 32,'이 PDF는 주석 추가·수정이 허용되지 않습니다.')
            if kinds & set(FIELD_OPS): require(permissions & (32|256),'이 PDF는 양식 입력이 허용되지 않습니다.')
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
                return {'path':str(output.resolve()),'kind':'pdf','bytes':output.stat().st_size,'pageCount':len(doc)}
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
