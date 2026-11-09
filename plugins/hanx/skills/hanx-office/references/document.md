# 문서 (HWP / DOCX / HWPX / HWPML)

## 만들기: `hanx_create`

`spec`에 `kind: "document"`와 `text` 또는 `blocks`를 지정합니다. 출력 확장자로 형식을 정합니다(`.hwp`, `.docx`, `.hwpx`, `.hml`/`.xml`은 HWPML, `.hanx`).

```json
{
  "kind": "document",
  "blocks": [
    {"type": "paragraph", "text": "분기 보고서", "alignment": "center", "style": {"bold": true, "size": 18}},
    {"type": "paragraph", "runs": [{"text": "매출은 "}, {"text": "12% 증가", "bold": true, "color": "C00000"}, {"text": "했습니다."}]},
    {"type": "table", "columnWidths": [120, 80], "rows": [["항목", "금액"], ["매출", "1,200"], ["합계", {"text": "1,200"}]]},
    {"type": "image", "path": "/절대/경로/그림.png", "width": 200, "height": 150}
  ]
}
```

- 문단: `text` 또는 `runs: [{text,font,size,bold,italic,underline,strike,color,highlight}]`, 문단 공통 글자 속성 `style`, 정렬 `alignment` (`left/right/center/justify/distribute`).
- 표: 각 셀은 문자열, `{text}` 또는 `{blocks:[...]}`. `columnWidths`, 셀의 `rowSpan`/`colSpan`.
- 그림: `{type:"image",path,width,height}`. 상대 경로면 `baseDirectory`를 지정합니다.
- 여러 구역: `sections: [{page,blocks,header,footer}]`. page는 `width/height/marginTop/marginBottom/marginLeft/marginRight` (pt).
- 양식: `"template": "letter"` (편지지) 또는 `"template": "labels"` (A4 라벨).
- `hanx_read`의 `data.model`을 고친 뒤 `{kind:"document",model:...}`로 다시 만들 수 있습니다.

## 수정: `hanx_edit`의 `operations`

| op | 필드 |
| --- | --- |
| `replace_text` | `find`, `replace` (여러 런·표·머리말/꼬리말 포함, 나머지 서식 유지) |
| `append_paragraph` | `section`(기본 0), `text`/`runs`/`style`/`alignment` |
| `append_block` | `section`, `block`(블록 명세) |
| `insert_block` | `section`, `block`(삽입 인덱스), `value`(블록 명세) |
| `delete_block` | `section`, `block` |
| `set_paragraph` | `section`, `block`, `text`/`runs`/`style`/`alignment` |
| `style_paragraph` | `section`, `block`, `style` (`verticalAlign`, `spacing` 포함) |
| `set_paragraph_layout` | `section`, `block`, `alignment`, `indentLeft`, `indentRight`, `firstLine`, `spaceBefore`, `spaceAfter`, `lineSpacing`(`kind`: multiple/percentOfSize/exact/atLeast, `value`), `pageBreakBefore` |
| `set_cell` | `section`, `block`(표 인덱스), `row`, `column`, `text` |
| `set_page` | `section`, `page` |
| `insert_page_break`, `insert_divider`, `set_section_text` | 문서 구조 편집 |

예:

```json
[
  {"op": "replace_text", "find": "2025년", "replace": "2026년"},
  {"op": "set_cell", "section": 0, "block": 2, "row": 1, "column": 1, "text": "1,350"},
  {"op": "append_paragraph", "text": "작성: 재무팀", "alignment": "right"}
]
```

블록 인덱스는 `hanx_read` 결과로 먼저 확인하세요.

## 변환: `hanx_convert`

HWP ↔ DOCX ↔ HWPX ↔ HWPML, 문서·시트·슬라이드 → PDF, PDF → DOCX/HWP/HWPX(본문 텍스트 + 복잡한 영역은 이미지). ZIP 문서 → `.xml`은 Flat OPC, `xmlFormat: "hwpml"`이면 HWPML.

## 제한

암호화 문서, 변경 추적, 복잡한 떠 있는 개체 등은 완전히 재현하지 않습니다. 원본의 다른 파트를 보존해야 하면 `hanx_package_patch`를 쓰세요. 디지털 서명은 수정 후 무효가 됩니다.
