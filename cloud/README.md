# HanX 클라우드 MCP 서버

ChatGPT, Claude(웹·데스크톱·모바일), Codex처럼 **원격 MCP 서버**만 연결할 수 있는 AI 앱에서 HanX를 쓰게 해 주는 서비스입니다. Cloudflare Workers와 Cloudflare Containers 위에서 동작하며 `https://mcp.hanx.io/mcp`로 공개하는 것을 기준으로 합니다.

사용자 안내는 서버 첫 화면(`https://mcp.hanx.io/`)에 있습니다. 이 문서는 운영자용입니다.

## 구조

```
AI 앱 (ChatGPT, Claude …)
   │  MCP Streamable HTTP  POST /mcp
   ▼
Cloudflare Worker  (cloud/worker)
   ├─ /mcp        MCP 엔드포인트 (상태 없음, JSON 응답)
   ├─ /upload     파일 업로드 페이지와 API → 파일 ID(hx_…)
   ├─ /f/<id>/…   결과 파일 다운로드
   ├─ R2 버킷     업로드·결과 파일 (기본 24시간 보관)
   └─ Rate Limit  IP당 분당 30회
        │
        ▼  Durable Object → Container
HanX 엔진 컨테이너  (cloud/engine)
   └─ server.py → 요청마다 새 임시 폴더에서 `hanx mcp` 실행 (공식 Linux CLI 릴리스 사용)
```

- 원격 앱은 사용자 컴퓨터의 파일 경로를 알 수 없습니다. 그래서 도구는 경로 대신 **파일 ID 또는 https URL**을 받고, 결과는 **다운로드 링크와 새 파일 ID**로 돌려줍니다. 결과 ID를 다음 도구에 넘겨 작업을 이어 갈 수 있습니다.
- 사용자는 기존 파일을 `/upload` 페이지에서 올리고 받은 ID를 대화에 붙여 넣습니다.
- 엔진 컨테이너는 인터넷에 접근하지 않습니다(`enableInternet = false`). 명세 안의 로컬 경로(`path`, `imagePath`, `font` 등)는 거부해서 컨테이너 내부 파일을 읽지 못하게 합니다.
- PDF 편집·OCR·PDF 출력은 추가 네이티브 도구가 필요해서 클라우드에서는 제공하지 않습니다.

### 제공 도구

`hanx_guide`, `hanx_upload_link`, `hanx_capabilities`, `hanx_read`, `hanx_create`, `hanx_edit`, `hanx_convert`, `hanx_sheet_read`, `hanx_sheet_eval`, `hanx_sheet_recalculate`, `hanx_sheet_functions`, `hanx_xml_read`, `hanx_xml_edit`, `hanx_package_list`, `hanx_package_read`, `hanx_package_patch`

`hanx_guide`는 `plugins/hanx/skills/hanx-office/references/`의 문서를 그대로 묶어서 제공하므로 플러그인 안내와 내용이 같습니다.

## 배포

### 준비물

- Cloudflare 계정과 **Workers Paid 요금제**(Containers 사용 조건)
- `hanx.io` 도메인이 **같은 Cloudflare 계정의 영역(zone)** 으로 등록되어 있어야 `mcp.hanx.io`를 바로 연결할 수 있습니다. 네임서버가 다른 곳에 있다면 Cloudflare로 옮기거나, `wrangler.jsonc`의 `routes`를 지우고 `hanx-mcp.<계정>.workers.dev` 주소를 쓰세요. 현재 `hanx.io` 사이트(GitHub Pages)는 그대로 두면 됩니다. `mcp` 하위 도메인만 Worker로 연결됩니다.
- 배포하는 컴퓨터에 Docker (wrangler가 엔진 이미지를 빌드해 Cloudflare 레지스트리에 올립니다)

### 처음 한 번

```sh
cd cloud/worker
npm ci
npx wrangler login
npx wrangler r2 bucket create hanx-mcp-files
npx wrangler r2 bucket lifecycle add hanx-mcp-files expire-files f/ --expire-days 1 --force
npx wrangler deploy
```

Worker도 파일 생성 시각을 확인해 보관 시간이 지난 파일을 내주지 않습니다. 실제 삭제는 R2 수명 주기 규칙이 하루 단위로 처리합니다.

배포 후 컨테이너가 처음 뜨기까지 몇 분 걸릴 수 있습니다. `https://mcp.hanx.io/health`가 `{"ok":true}`를 돌려주면 Worker는 준비된 것이고, 첫 도구 호출에서 컨테이너가 시작됩니다.

### GitHub Actions로 배포

`.github/workflows/cloud.yml`은 `cloud/` 변경마다 엔진 이미지를 빌드하고 로컬 Worker로 종단 간 테스트를 실행합니다. 배포는 수동입니다.

1. 저장소 Settings → Environments에서 `cloudflare` 환경을 만들고 비밀 값 `CLOUDFLARE_API_TOKEN`(Workers·Containers·R2 편집 권한)과 `CLOUDFLARE_ACCOUNT_ID`를 넣습니다.
2. Actions → **Cloud MCP** → Run workflow에서 `deploy`를 체크합니다.

### HanX 새 버전 반영

`cloud/engine/Dockerfile`의 `HANX_VERSION`과 `HANX_SHA256`(릴리스의 `SHA256SUMS`에서 `HanX-CLI-<버전>-linux-x64.tar.gz` 줄)을 바꾸고 다시 배포합니다.

## 설정

| 항목 | 위치 | 기본값 |
| --- | --- | --- |
| 파일 보관 시간 | `vars.FILE_TTL_HOURS` | 24 |
| 최대 파일 크기 | `vars.MAX_FILE_MB` | 20 |
| 사용할 컨테이너 수 | `vars.ENGINE_INSTANCES`, `containers.max_instances` | 3 |
| 컨테이너 크기 | `containers.instance_type` | `standard-1` |
| 요청 제한 | `ratelimits` | IP당 60초에 30회 (도구 호출·업로드) |
| 유휴 컨테이너 종료 | `src/index.ts`의 `sleepAfter` | 10분 |

### 접근 제한 (선택)

기본은 누구나 쓸 수 있는 공개 서버입니다. 사용자를 제한하려면 접근 키를 설정합니다.

```sh
npx wrangler secret put ACCESS_TOKENS   # 쉼표로 구분한 키 목록
```

설정하면 `/mcp`와 `/upload`에 `Authorization: Bearer <키>` 또는 `?key=<키>`가 필요합니다. ChatGPT와 Claude 커넥터는 OAuth 또는 인증 없음만 지원하므로 `https://mcp.hanx.io/mcp?key=<키>`처럼 주소에 키를 넣어 안내하세요. 다운로드 링크는 추측할 수 없는 ID로 보호됩니다.

## 비용과 운영 주의

- 컨테이너는 사용한 시간만큼 과금되고, 10분 동안 요청이 없으면 잠듭니다. 잠든 뒤 첫 요청은 컨테이너 시작 시간만큼 느립니다.
- 공개 서버는 남용될 수 있습니다. Cloudflare 대시보드에서 사용량 알림을 설정하고, 필요하면 접근 키를 켜거나 `max_instances`를 줄이세요.
- 사용자가 올린 문서가 운영자의 R2에 최대 보관 시간 동안 저장됩니다. 서비스 첫 화면에 이 사실을 안내하고 있으며, 개인정보 처리방침이 필요하면 사이트에 추가하세요.
- 로그에는 문서 이름과 내용을 남기지 않습니다(엔진 서버의 요청 로그를 끔).

## 로컬 개발과 테스트

```sh
docker build -t hanx-engine cloud/engine
docker run -d --name hanx-engine -p 8080:8080 hanx-engine
cd cloud/worker
npm ci
npm run dev        # http://127.0.0.1:8787, 엔진은 ENGINE_URL로 호출
HANX_CLOUD_URL=http://127.0.0.1:8787 npm test
```

Claude Code로 직접 연결해 볼 수도 있습니다.

```sh
claude mcp add --transport http hanx-local http://127.0.0.1:8787/mcp
```
