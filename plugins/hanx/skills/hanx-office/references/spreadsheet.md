# 스프레드시트 (XLSX / CSV / TSV)

`.xls` 바이너리는 지원하지 않습니다. 통합문서 최대 256시트, 저장 셀 합계 100,000개, 한 번의 조회·수정 최대 100,000셀.

## 읽기와 계산

- `hanx_sheet_read`: `input`, `sheet`(이름, 생략 시 첫 시트), `range`(예: `A1:D10`, 생략 시 사용 범위). 셀마다 `address`, `input`(수식 원문), `type`, `value`(계산값), `display`(서식 적용 문자열), `style`을 돌려줍니다. 넓은 시트는 범위를 지정하세요.
- `hanx_sheet_eval`: 파일을 바꾸지 않고 `formula`(`=`로 시작)를 계산합니다. `cell`로 기준 위치 지정. 계산 오류는 `type: "error"`와 `#DIV/0!` 같은 값으로 오며 도구 실패가 아닙니다.
- `hanx_sheet_recalculate`: 재계산한 결과를 새 `output`으로 저장합니다. `formulaErrors`를 확인하세요.
- `hanx_sheet_functions`: 등록된 함수 목록. WEBSERVICE, IMPORTCSV, IMPORTTEXT는 `#BLOCKED!`.

## 만들기: `hanx_create`

```json
{
  "kind": "spreadsheet",
  "sheets": [{
    "name": "매출",
    "rows": [["상품", "수량", "단가", "금액"], ["사과", 2, 1000, "=B2*C2"], ["배", 3, 2000, "=B3*C3"]],
    "cells": {"D4": {"input": "=SUM(D2:D3)", "style": {"bold": true, "numberFormat": "#,##0"}}},
    "frozenRows": 1,
    "columnWidths": {"A": 120},
    "charts": [{"kind": "column", "title": "금액", "range": "A1:D3"}]
  }],
  "definedNames": {"매출합계": "매출!D4"}
}
```

- `rows`는 A1부터 채우는 2차원 배열, `cells`는 주소별 덮어쓰기.
- 셀 값: 숫자, 불리언, 문자열(`=`로 시작하면 수식), null, 또는 `{input|value, style}`. `{value:"=텍스트"}`는 수식이 아닌 텍스트.
- 시트 옵션: `columnWidths`(pt), `rowHeights`(`"1"`부터, pt), `merges`, `frozenRows`, `frozenCols`, `charts`(column/bar/line/area/pie).

## 수정: `hanx_edit`의 `operations`

각 작업은 `op`와 선택 `sheet`(이름 또는 0부터 인덱스, 생략 시 첫 시트)를 가집니다.

| op | 필드 |
| --- | --- |
| `set_cell` | `cell`, `value` 또는 `input`, `style` |
| `set_range` | `start`, `values`(2차원) |
| `fill_formula` | `range`, `formula` (왼쪽 위 기준 상대 참조 이동, `$` 유지) |
| `fill_range` | `range`, `direction`(`down`/`right`) |
| `sort_range` | `range`, `keyColumn`, `ascending`, `header` |
| `style_range` | `range`, `style` |
| `clear_range` | `range` (서식은 유지) |
| `insert_row` / `delete_row` | `cell` (기준 셀 위에 삽입) |
| `insert_column` / `delete_column` | `cell` (기준 셀 왼쪽에 삽입) |
| `add_sheet` / `delete_sheet` | `name` / `sheet` |
| `merge` / `unmerge` | `range` |
| `freeze` | `rows`, `columns` |
| `set_column_width` | `column`, `width`(pt) |
| `set_row_height` | `row`(0부터), `height`(pt) |
| `define_name` | `name`, `formula` |
| `add_chart` / `update_chart` / `delete_chart` | `value` / `index`, `value` / `index` |

style: `bold/italic/underline/wrap/border`(boolean), `fontName`, `fontSize`, `color`/`fill`(RRGGBB, null로 지우기), `align`(general/left/center/right), `numberFormat`(`#,##0`, `0.00%`, `yyyy-mm-dd`).

```json
[
  {"op": "set_range", "sheet": "매출", "start": "B3", "values": [[4, 2500], [6, 500]]},
  {"op": "fill_formula", "sheet": "매출", "range": "D2:D4", "formula": "=B2*C2"},
  {"op": "style_range", "sheet": "매출", "range": "A1:D1", "style": {"bold": true, "fill": "DBEAFE"}},
  {"op": "freeze", "sheet": "매출", "rows": 1, "columns": 1}
]
```

## 내보내기

CSV/TSV는 첫 시트의 서식 적용 계산값만 저장합니다(수식·서식·다른 시트 없음). XLSX 저장 시 피벗 테이블, 매크로, 외부 연결 등은 빠질 수 있습니다.
