# PDF 편집과 OCR

PDF 원본 개체를 직접 편집합니다. 편집 엔진은 Python 3.10 이상이 필요하며, 처음 한 번 사용자가 터미널에서 `hanx pdf setup`을 실행해야 합니다(MCP에서는 설치하지 않습니다).

## 순서

1. `hanx_pdf_inspect` (`input`, `page`): 최상위 개체 목록(`id`, 종류, 경계)과 `revision`.
2. 필요하면 `hanx_pdf_render` (`page`, `scale` 0.1~4)로 PNG 미리보기.
3. `hanx_pdf_edit` (`input`, `output`, `operations`, `revision`, `baseDirectory`).
4. 저장한 파일을 다시 수정할 때는 `inspect`를 다시 실행합니다(ID가 바뀔 수 있음).

좌표는 회전 전 PDF 좌표계의 pt(1/72인치), 원점은 왼쪽 아래입니다.

## 작업

| op | 필드 |
| --- | --- |
| `set_text` | `page`, `object`, `text`, 선택 `size`, `font`(TTF 경로) |
| `transform` | `page`, `object`, `dx`, `dy`, `scaleX`, `scaleY`, `rotation`(도, 반시계) |
| `set_fill` | `page`, `object`, `color`(`#RRGGBB`), `opacity` |
| `replace_image` | `page`, `object`, `image` |
| `delete` | `page`, `object` |
| `add_text` | `page`, `text`, `x`, `y`, `size`, `color`, `font` |
| `add_image` | `page`, `image`, `x`, `y`, `width`, `height` |
| `add_rect` | `page`, `x`, `y`, `width`, `height`, `color` |
| `add_ocr_layer` | `page`, `regions`(OCR `words`) |

- `set_text`는 한 줄 개체 단위입니다. 한글이 기존 글꼴에 없으면 한글 TTF를 `font`로 지정하세요.
- 윤곽선·이미지로 된 텍스트는 수정할 수 없습니다. 주석·양식 필드 편집은 지원하지 않습니다.
- **`delete`는 보안 가림(redaction)이 아닙니다.** 민감 정보 삭제 요청이면 이 점을 사용자에게 알리세요.

## OCR

- `hanx_pdf_ocr` (`page`, `language` 예: `kor+eng`): 텍스트·신뢰도·영역 반환, 원본 수정 없음.
- `hanx_pdf_searchable` (`output`, `allPages`, `language`): 보이지 않는 검색 텍스트를 추가한 새 PDF. 이미 텍스트가 있는 페이지는 건너뜁니다.

macOS는 시스템 인식 엔진, Windows·Linux는 Tesseract와 언어 데이터가 필요합니다.

## 일반 읽기·변환

PDF 텍스트만 필요하면 `hanx_read`, 편집 가능한 문서로 바꾸려면 `hanx_convert`로 `.docx`/`.hwp`/`.hwpx` 출력을 사용합니다.
