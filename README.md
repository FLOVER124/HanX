# HanX

HWP, 문서, 도표, 프레젠테이션과 모두 호환되는 새로운 사무 도구입니다 :)
macOS 13 이상(Apple Silicon/Intel), Windows x64, Ubuntu 22.04 이상 x64를 대상으로 합니다.

.pkg형 설치 GUI 프로그램 뿐만 아니라 CLI형 프로그램도 제공하며
AI 에이전트 AI 클라이언트, AI 클라이언트 등을 이용해 모든 작업을 진행할 수 있습니다.

GUI에서 문서, 도표와 프레젠테이션을 편집하고 CLI와 MCP로 같은 엔진을 호출합니다.
형식별 지원 범위와 제한은 CLI 안내에서 확인할 수 있습니다.

[설치와 화면 보기](https://studentsview.github.io/HanX/) | [CLI 안내](docs/cli/README.md) | [릴리스](https://github.com/StudentsView/HanX/releases)

## 설치

CLI는 npm과 Homebrew 설치를 지원합니다. macOS 13 이상(Apple Silicon/Intel), Windows x64, Ubuntu 22.04 이상 x64를 대상으로 합니다.

### npm

```sh
npm install -g @juyoungsuh/hanx
hanx setup
```

Node.js 18 이상이 필요합니다. 설치 화면에서 GUI만, CLI만, 둘 다를 선택합니다. [공개 npm 패키지](https://www.npmjs.com/package/@juyoungsuh/hanx)에서 버전을 확인하세요.

### Homebrew

```sh
brew install StudentsView/tap/hanx
hanx setup
```

[공개 tap](https://github.com/StudentsView/homebrew-tap)은 macOS와 Linux를 지원하며 설정 실행기에 Node.js를 사용합니다. Windows에서는 npm 또는 Setup.exe를 사용하세요.

### 설치 확인

어느 방법으로 설치해도 실행 명령은 같습니다.

```sh
hanx --version
hanx capabilities --pretty
```

터미널에서 `hanx`를 실행하면 시작 화면을 표시합니다. `hanx --convert`를 실행하고 파일을 드롭한 뒤 방향키로 출력 형식을 선택하면 같은 폴더에 변환본을 저장합니다. 문서, 스프레드시트, 슬라이드의 PDF 출력도 지원합니다.

AI 에이전트의 MCP 연결에는 `hanx mcp`를 사용합니다. [CLI 안내](docs/cli/README.md)에서 연결과 스프레드시트 작업 예제를 확인하세요.

### 업데이트

npm으로 설치했다면 `npm install -g @juyoungsuh/hanx`를 다시 실행합니다. Homebrew로 설치했다면 다음 명령을 실행합니다.

```sh
brew update
brew upgrade StudentsView/tap/hanx
```

### macOS 앱 설치

최신 앱은 [릴리스](https://github.com/StudentsView/HanX/releases/tag/v2.12.0)의 `HanX-2.12.0-macOS.zip` 또는 npm / Homebrew로 설치하세요. 마지막 공증 pkg는 2.9.0입니다. npm과 Homebrew는 `hanx setup`에서 GUI와 CLI 구성을 선택합니다.

## Windows와 Linux 앱 설치

[릴리스](https://github.com/StudentsView/HanX/releases/tag/v2.12.0)에서 Windows Setup.exe, Linux AppImage 또는 Debian 패키지를 제공합니다. Windows 설치 마법사에서는 GUI와 CLI를 선택할 수 있습니다. Linux CLI 압축 파일의 `install-cli.sh`에서도 구성을 고릅니다.

Windows/Linux PDF 출력에는 로컬 PDF renderer, PDF 읽기에는 PDF text tools가 필요합니다. 설치 화면에서 PDF 도구를 선택한 경우에만 추가 설치합니다. macOS 기본 네이티브 배포판은 PDF 처리를 포함합니다.

## 스프레드시트 CLI

```sh
hanx spreadsheet read 매출.xlsx --sheet 매출 --range A1:D10 --pretty
hanx spreadsheet eval 매출.xlsx --sheet 매출 --formula '=SUM(D2:D10)' --pretty
hanx edit 매출.xlsx --ops 작업.json --output 매출-수정.xlsx
hanx spreadsheet recalculate 매출-수정.xlsx --output 매출-계산.xlsx
```

JSON을 이용해 도표 내 정보와 상호작용 하는 구조로 이루어져 있습니다. SUM, IF, SUMIFS, XLOOKUP, 날짜와 텍스트 함수, LET/LAMBDA 등의 함수 호환성을 확보하였습니다. 범위 쓰기, 상대 참조 수식 채우기, 서식과 숫자 형식, 시트 추가와 삭제, 이름 정의와 틀 고정을 작업 단위로 제공합니다.

언어 모델은 포함하지 않습니다. 사용 중인 로컬 에이전트가 명령을 실행하거나 `hanx mcp`의 stdio 도구를 호출합니다. 클라우드 채팅이 설치만으로 Mac 파일에 접근할 수 있게 되는 것은 아닙니다.

에이전트에게 먼저 `hanx capabilities`와 응답의 `guidePath`를 읽도록 요청하세요. 지원되는 작업과 모든 매개변수는 CLI 안내에 있습니다. 생성과 수정에는 출력 경로가 필요하며, 기존 출력은 `--force`가 있을 때만 교체합니다.

만약 잘 이해되지 않는 경우, 이 Github 레포를 AI 에이전트에게 링크 형태로 제공해주세요.

## 문서와 프레젠테이션

HWP, HWPX, HWPML, DOCX의 본문과 표와 기본 서식을 읽고 저장합니다. PPTX의 슬라이드와 도형과 표와 노트, 지원 전환을 편집합니다. XML도 XPath로 수정할 수 있습니다.

XLSX, CSV, TSV를 지원합니다. 구형 XLS, 복잡한 피벗과 매크로와 일부 개체는 아직 호환되지 않을 수 있습니다. 모든 연산은 자체 개발된 HanX 엔진을 사용합니다. 모델을 거쳐 저장하면 미지원 요소가 빠질 수 있으므로 복사본으로 작업하고 결과를 확인하세요. 다른 XML 파트를 유지해야 하는 수정에는 `package patch`를 사용할 수 있습니다.

## 소스에서 빌드

Xcode 또는 Swift 개발 도구가 설치된 Mac에서 실행합니다.

```sh
./build-cli.sh --universal
./build-app.sh
./install-cli.sh
```

빌드된 앱은 `build/HanX.app`입니다. 기본 빌드는 로컬 서명을 적용하며, 공개 배포에는 별도 Developer ID 서명과 공증이 필요합니다. 인증서와 공증 자격 증명은 저장소에 포함하지 않습니다.

```sh
python3 -m unittest discover -s Tests/AgentCLI
Tests/StartWindow/run.sh
Tests/run-editing.sh
build/hanx-cli formula-suite Tests/formulas.tsv
```

npm 패키지는 `packaging/npm`에서 빌드된 네이티브 실행 파일을 포함합니다. 배포판을 다시 만들 때는 해당 폴더의 설명을 따르세요. Homebrew와 pkg는 같은 엔진을 각 채널의 설치 경로에 배치합니다. 다른 방식으로 설치한 기존 명령을 자동 덮어쓰지 않습니다.

## 라이선스

[MIT License](LICENSE)


## 버전 확인과 업데이트

| 작업 | 명령 |
| --- | --- |
| 현재 버전과 최신 여부 | `hanx --version` |
| 최신 배포 확인 | `hanx --check-update` |
| npm 또는 Homebrew 설치 업데이트 | `hanx --update` |

최신 버전이면 터미널에 `Up to date`, 새 버전이 있으면 `Update available`을 표시합니다. 네트워크가 연결되지 않으면 `Version check unavailable`을 표시합니다. npm과 Homebrew의 버전 응답은 자동화에서도 사용할 수 있는 JSON입니다. 직접 설치한 독립 CLI의 `--version` JSON은 로컬 버전만 반환하고 `--check-update`가 최신 배포를 조회합니다.

`--update`는 설치한 관리자로 CLI를 갱신합니다. 기존 설정에서 GUI를 선택한 경우 앱도 갱신합니다. 권한이 부족하면 설치 관리자 오류를 표시하며 관리자 권한으로 자동 재실행하지 않습니다. ZIP이나 설치 파일로 직접 설치한 앱과 독립 CLI는 최신 다운로드로 교체하세요.

이 명령이 없는 이전 배포판은 한 번만 `npm install -g @juyoungsuh/hanx@latest` 또는 `brew update && brew upgrade StudentsView/tap/hanx`로 갱신하세요.
