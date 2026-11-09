# 프레젠테이션 (PPTX)

## 만들기: `hanx_create`

```json
{
  "kind": "presentation",
  "width": 960,
  "height": 540,
  "slides": [
    {"title": "2026 계획", "body": ["목표", "일정", "예산"], "notes": "3분 이내", "background": "F8FAFC", "transition": {"kind": "fade", "duration": 0.5}},
    {"title": "일정", "shapes": [
      {"kind": "roundRect", "x": 60, "y": 160, "width": 240, "height": 80, "fill": "DBEAFE", "text": "1분기: 설계"},
      {"kind": "image", "imagePath": "/절대/경로/차트.png", "x": 360, "y": 140, "width": 400, "height": 300}
    ]}
  ]
}
```

- 슬라이드: `title`, `body`(문단 배열), `notes`, `background`(RRGGBB), `transition`, `shapes`. title/body의 개체 ID는 2/3, 추가 도형은 그 다음부터.
- 도형 `kind`: `text/rect/roundRect/ellipse/triangle/rightArrow/line/image/table` 등. 공통 필드: `name`, `x/y/width/height`, `rotation`, `flipH/flipV`, `lockAspect`, `fill/line/lineWidth`, `text/runs/paragraphs/style`, `table`.
- 그림은 `imagePath`, `imageData:{name,data(base64 PNG)}`, `imageID` 중 하나. PNG 16 MB·16메가픽셀 이내.
- 동영상: `{"kind":"image","videoData":{"name":"x.mp4","data":"BASE64"}}` (16 MiB 이하 MP4/M4V).

## 수정: `hanx_edit`의 `operations`

| op | 필드 |
| --- | --- |
| `replace_text` | `find`, `replace` (본문·표·발표 노트) |
| `add_slide` | `at`(생략 시 끝), `value` |
| `duplicate_slide` / `delete_slide` | `slide` |
| `move_slide` | `slide`, `to` |
| `set_notes` | `slide`, `text` |
| `set_transition` | `slide`, `kind`, `duration`, `direction`, `advanceAfter`, `advanceOnClick` |
| `add_shape` | `slide`, `value` |
| `update_shape` | `slide`, `shapeId`, 바꿀 필드 |
| `duplicate_shape` | `slide`, `shapeId`, `offsetX/offsetY` |
| `reorder_shape` | `slide`, `shapeId`, `to` |
| `delete_shape` | `slide`, `shapeId` |
| `set_table_cell` | `slide`, `shapeId`, `row`, `column`, `text` |
| `set_animations` | `slide`, `animations:[{shapeID,effect,trigger,duration,delay,direction}]` (전체 교체) |

전환 종류: none, fade, push, wipe, cover, pull, split, zoom, dissolve, cut, blinds, checker, comb, randomBar, strips, circle, diamond, plus, wedge, wheel, newsflash.

`shapeId`는 `hanx_read`의 model에서 먼저 확인하세요.
