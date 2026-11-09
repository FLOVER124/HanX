# ChatGPT 데스크톱·Codex용 HanX

ChatGPT 데스크톱의 로컬 대화와 Codex에서 내 컴퓨터에 설치된 HanX로 HWP·HWPX·DOCX·XLSX·PPTX·PDF 문서를 읽고, 만들고, 수정하고, 변환합니다. 문서 처리는 내 컴퓨터의 HanX가 하며, 결과는 지정한 로컬 경로에 저장됩니다.

## 준비

먼저 HanX를 설치하세요. 플러그인은 아래 순서로 HanX를 찾습니다.

1. 환경 변수 `HANX_PATH`
2. Mac 앱: `/Applications/HanX.app` 또는 `~/Applications/HanX.app`
3. npm·Homebrew로 설치한 `hanx` (`~/.local/bin`, `/opt/homebrew/bin`, `/usr/local/bin`, `PATH`)

## 설치

```sh
codex plugin marketplace add FLOVER124/HanX
codex plugin add hanx@hanx
```

설치한 뒤 새 대화를 시작하고 `@HanX`를 선택하세요. 문서의 로컬 경로를 지정하거나 대화에서 로컬 파일을 선택한 뒤 요청합니다.

- 이 HWP 문서의 본문과 표를 읽고 요약해 줘.
- 이 HWPX 문서를 DOCX 복사본으로 저장해 줘.
- 제목과 표가 있는 회의록을 새 HWPX 문서로 만들어 줘.

업데이트는 `codex plugin marketplace upgrade hanx` 후 `codex plugin add hanx@hanx`로 합니다.

## Plugin Creator용 ZIP

이 폴더에서 다음 명령으로 만듭니다.

```sh
cd .. && zip -X -r hanx-chatgpt.zip hanx-chatgpt -x '*/.DS_Store'
```

Windows에서는 이 플러그인 대신 Codex에 `codex mcp add hanx -- hanx mcp`로 연결하세요. 형식과 작업별 지원 범위는 [CLI 안내](../../docs/cli/README.md)를 보세요.
