---
description: HanX CLI 설치와 MCP 연결 상태를 확인합니다
allowed-tools: Bash(hanx --version), Bash(command -v hanx), Bash(which hanx), Bash(echo $HANX_PATH)
---

HanX 플러그인이 동작하는지 점검하세요.

1. `hanx_capabilities` 도구가 보이면 호출해 버전과 지원 형식을 요약하고 "정상 연결"이라고 알려 주세요.
2. 도구가 없으면 `command -v hanx`와 `echo $HANX_PATH`로 실행 파일을 찾고, 있으면 `hanx --version`을 실행하세요.
3. 찾지 못했다면 설치 방법을 안내하세요.
   - npm (Node.js 18 이상): `npm install -g @flover124/hanx`
   - Homebrew (macOS/Linux): `brew install FLOVER124/tap/hanx`
   - Windows/Linux 독립 설치본: https://github.com/FLOVER124/HanX/releases
4. 설치는 됐지만 PATH에 없으면, Claude Code를 시작하기 전에 `HANX_PATH` 환경 변수에 hanx 실행 파일의 절대 경로를 지정하라고 안내하세요. 설치 후에는 Claude Code를 다시 시작하거나 `/mcp`에서 hanx 서버를 다시 연결해야 합니다.
5. PDF 편집을 쓰려면 터미널에서 `hanx pdf setup`이 한 번 필요하다고 덧붙이세요.
