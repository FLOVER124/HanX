---
description: HanX로 파일을 다른 형식으로 변환합니다 (예: /hanx:convert 보고서.hwp docx)
argument-hint: <입력 파일> <출력 형식 또는 출력 경로>
allowed-tools: mcp__plugin_hanx_hanx__hanx_convert, mcp__plugin_hanx_hanx__hanx_read
---

HanX의 `hanx_convert` 도구로 파일을 변환하세요. 인수: $ARGUMENTS

1. 첫 번째 인수는 입력 파일입니다. 상대 경로면 현재 작업 폴더 기준 절대 경로로 바꾸세요.
2. 두 번째 인수가 확장자(`docx`, `hwp`, `hwpx`, `pdf`, `csv`, `pptx`, `xml` 등)뿐이면 입력과 같은 폴더, 같은 파일 이름에 그 확장자를 붙인 경로를 출력으로 씁니다. 경로라면 그대로 씁니다. 형식이 없으면 사용자에게 물어보세요.
3. 출력 파일이 이미 있으면 덮어쓰지 말고 사용자에게 확인하세요. 확인받은 경우에만 `force: true`를 씁니다.
4. 변환 후 `hanx_read`(`noModel: true`)로 결과를 다시 읽어 확인하고, 저장 경로와 `warnings`를 짧게 알려 주세요.
