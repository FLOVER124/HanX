# HanX 플러그인 (Claude Code)

HanX 로컬 문서 엔진을 Claude Code에 연결합니다. 설치하면 다음이 함께 들어옵니다.

- **MCP 서버** `hanx` — `hanx mcp`를 실행해 `hanx_read`, `hanx_create`, `hanx_edit`, `hanx_convert`, `hanx_sheet_*`, `hanx_pdf_*` 등 19개 도구를 제공합니다.
- **스킬** `hanx-office` — HWP/DOCX/HWPX/PPTX/XLSX/PDF 요청이 오면 Claude가 올바른 순서(capabilities → 읽기 → 새 경로에 저장 → 재확인)와 작업 JSON 형식을 따르도록 안내합니다.
- **명령** `/hanx:convert <파일> <형식>`, `/hanx:doctor`(설치·연결 점검).

## 준비

플러그인은 HanX CLI를 포함하지 않습니다. 먼저 CLI를 설치하세요.

```sh
npm install -g @flover124/hanx
```

```sh
brew install FLOVER124/tap/hanx
```

`hanx`가 PATH에 없으면 Claude Code를 시작하기 전에 절대 경로를 지정합니다.

```sh
export HANX_PATH="/절대/경로/hanx"
```

PDF 편집을 쓰려면 한 번 `hanx pdf setup`을 실행합니다.

## 설치

Claude Code에서:

```
/plugin marketplace add FLOVER124/HanX
/plugin install hanx@hanx
```

설치 후 `/mcp`에서 `hanx` 서버가 연결됐는지 확인하거나 `/hanx:doctor`를 실행하세요.

## 사용 예

> /경로/보고서.hwp를 읽고 표의 합계를 고쳐서 /경로/보고서-수정.docx로 저장해 줘. 원본은 유지해 줘.

> 매출.xlsx의 매출 시트에서 D열 합계를 계산하고, 금액 열에 `#,##0` 서식을 넣어 새 파일로 저장해 줘.

> /hanx:convert 발표.pptx pdf

모든 처리는 로컬에서 이뤄지며 HanX는 언어 모델이나 API 키를 요구하지 않습니다. 쓰기 작업은 항상 별도의 출력 경로에 저장하고, 기존 파일은 명시적으로 허락한 경우에만 덮어씁니다.
