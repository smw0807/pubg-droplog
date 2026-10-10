# 개발 안내

설치와 첫 실행은 [프로젝트 README](../README.md), 검증 결과는 [검증 기록](validation.md)을 참고합니다. 아래 명령은 저장소 루트에서 실행합니다.

## 환경변수

| 변수                   | 설명                                                                          |
| ---------------------- | ----------------------------------------------------------------------------- |
| `NUXT_DATA_MODE`       | `demo` 또는 `live`. 기본 `demo`; 다른 값은 설정 오류                          |
| `NUXT_PUBG_API_KEY`    | live 전용 PUBG API 키. 비공개 서버 설정                                       |
| `NUXT_DB_ENABLED`      | `false`(기본): 서버 메모리 캐시, `true`: PostgreSQL 영구 저장                 |
| `NUXT_DATABASE_URL`    | PostgreSQL 연결 문자열. 앱은 `NUXT_DB_ENABLED=true`일 때만 사용하며 이때 필수 |
| `NUXT_PUBLIC_SITE_URL` | OG 이미지·공유 URL·canonical에 사용할 공개 origin. 로컬에서는 생략 가능       |
| `PORT`, `HOST`         | 생산 Nitro 서버의 포트와 리슨 주소                                            |

설정 이름은 [nuxt.config.ts](../nuxt.config.ts), 로컬 예시는 [.env.example](../.env.example), DB는 [compose.yaml](../compose.yaml)을 따릅니다. `.env`와 실제 인증정보는 Git·로그·문서에 넣지 않습니다. `runtimeConfig.public`에는 비밀값을 두지 않습니다.

## 저장소 선택

기본값인 `NUXT_DB_ENABLED=false`에서는 demo와 live 모두 서버 메모리 캐시를 사용합니다. `NUXT_DATABASE_URL`이 설정되어 있어도 앱은 DB에 연결하거나 데이터를 저장하지 않습니다. DB 실행·마이그레이션 없이 검색과 리포트 생성이 가능합니다.

| 데이터               | 메모리 보관 시간 | 최대 건수 | 데이터 용량 한도 |
| -------------------- | ---------------- | --------- | ---------------- |
| 플레이어 조회 스냅샷 | 5분              | 500개     | 4 MiB            |
| 경기 스냅샷          | 1시간            | 500개     | 12 MiB           |
| 분석 리포트          | 24시간           | 100개     | 48 MiB           |

각 캐시는 건수·용량 한도를 넘으면 보관 시간이 남아 있어도 퇴출될 수 있습니다. 용량은 저장 데이터 기준이며 JavaScript 객체 등 런타임 메모리는 추가로 사용합니다. 메모리는 서버 프로세스별로 분리되어 다른 replica와 공유되지 않으며 재시작하면 사라집니다. UUID 리포트 링크도 해당 리포트가 메모리에 남아 있는 동안만 유효합니다. DB 없이 운영할 때는 단일 프로세스를 기준으로 사용합니다.

서버 재시작 후에도 리포트를 유지하려면 `.env`에 `NUXT_DB_ENABLED=true`와 유효한 `NUXT_DATABASE_URL`을 설정합니다. 로컬 Compose 예시를 사용할 때만 아래 DB 시작 명령이 필요합니다.

```sh
docker compose up -d db
pnpm db:migrate
```

DB가 준비되면 앱 서버를 재시작합니다. PostgreSQL 모드에서 연결 URL이 없거나 DB 연결이 실패하면 오류로 처리합니다. 두 저장소 사이의 데이터는 자동으로 옮기지 않습니다. `db:migrate`와 PostgreSQL 통합 테스트는 앱 저장소 선택과 별개로 DB를 직접 사용합니다. 실제 PUBG 검증 스크립트는 `NUXT_DB_ENABLED=true`로 명시한 경우에만 실행됩니다.

## demo와 live 전환

`.env`의 `NUXT_DATA_MODE`를 원하는 모드로 바꾸고 live에서는 유효한 키도 설정합니다. 이미 실행 중인 개발 서버를 완전히 종료한 뒤 다시 시작하세요.

```sh
pnpm dev --host 127.0.0.1 --port 3100
```

실행 환경변수가 `.env`보다 우선합니다. 예전에 셸에서 `NUXT_DATA_MODE=demo`를 export했다면 해제하거나 원하는 값으로 바꿔야 합니다. macOS/Linux에서는 셸의 모드 값만 제외해 파일 설정을 읽을 수도 있습니다.

```sh
env -u NUXT_DATA_MODE pnpm dev --host 127.0.0.1 --port 3100
```

서버가 준비되면 상태를 확인합니다.

```sh
curl -fsS http://127.0.0.1:3100/api/status
```

응답의 `data.mode`가 원하는 데이터 모드인지, `data.storageMode`가 `memory` 또는 `postgres` 중 원하는 저장소인지 확인합니다. `liveConfigured`는 API 키 존재 여부이며 인증 성공을 보장하지 않습니다. `storageConfigured`는 메모리 모드에서는 `true`, PostgreSQL 모드에서는 연결 URL 존재 여부이며 DB 연결 검사가 아닙니다. live에서는 실제 닉네임 검색까지 확인합니다. 열린 홈 화면은 한 번 새로고침하면 됩니다.

- demo 검색에는 `SquadMate`를 사용합니다. 검색 스냅샷과 UUID 리포트는 선택한 저장소에 보관합니다.
- `/reports/demo-normal-duo`, `/reports/demo-normal-squad`, `/reports/demo-ranked-duo`, `/reports/demo-ranked-squad`는 DB·키 없이 읽을 수 있는 합성 샘플입니다. live에서도 접근할 수 있습니다.
- 예약 샘플은 읽기 전용이며 메모리 캐시 만료와 무관하게 열 수 있습니다. PostgreSQL에 저장한 리포트는 PostgreSQL 모드에서 서버 재시작·데이터 모드 변경 후에도 원래 `source`와 URL을 유지합니다.
- live의 키 누락·인증·호출 제한 오류는 실패로 표시합니다. 합성 결과로 대신 성공 처리하지 않습니다.

## 코드 스타일

ESLint는 Nuxt·Vue·TypeScript 코드 오류를 검사하고, Prettier는 소스와 문서를 정렬합니다. [Nuxt ESLint 공식 안내](https://eslint.nuxt.com/packages/module#prettier)에 따라 함께 사용하며, `eslint-config-prettier`를 ESLint 설정 마지막에 적용해 포맷 규칙 충돌을 막습니다.

- 들여쓰기는 공백 2칸, 줄 길이 기준은 100자입니다. 긴 문자열과 클래스 이름은 100자를 넘을 수 있습니다.
- JavaScript·TypeScript는 작은따옴표를 사용하고 세미콜론을 생략합니다.
- Vue 템플릿 속성은 한 줄에 하나씩 배치합니다.
- Vue 파일에는 `htmlWhitespaceSensitivity: "ignore"`를 적용해 태그와 닫는 괄호가 어색하게 분리되지 않도록 합니다. 인라인 텍스트에서 반드시 필요한 공백은 문자열이나 `{{ ' ' }}`로 명시합니다.
- `.prettierrc.json`은 Prettier 규칙, `.editorconfig`는 기본 들여쓰기·줄바꿈을 정의합니다.
- 생성물(`.nuxt`, `.output`, 테스트 결과), 잠금 파일, 생성된 DB 마이그레이션, 정적 이미지와 `.env` 파일은 `.prettierignore`로 제외합니다.

```sh
pnpm format        # 전체 소스·문서 정렬
pnpm format:check  # 파일 변경 없이 포맷 검사
pnpm lint          # 코드 오류 검사
pnpm lint:fix      # 자동 수정 가능한 ESLint 문제 수정
```

VS Code에서 권장 확장 프로그램인 ESLint, Prettier, Vue - Official을 설치하면 `.vscode/settings.json`에 따라 저장 시 포맷팅과 ESLint 자동 수정이 적용됩니다. 다른 편집기에서는 프로젝트에 설치된 Prettier와 위 설정 파일을 사용하세요. 첫 설치 시 `pnpm install`의 `postinstall`이 `nuxt prepare`를 실행하여 ESLint가 사용하는 Nuxt 설정을 생성합니다.

### Cursor·VS Code의 TypeScript 버전

에디터에서도 프로젝트에 설치된 TypeScript를 사용합니다. `.vscode/settings.json`의 `js/ts.tsdk.path`는 `node_modules/typescript/lib`를 가리키며, 작업 영역 버전 사용 알림에서 허용을 선택합니다. 알림이 없다면 명령 팔레트의 `TypeScript: Select TypeScript Version`에서 작업 영역 버전을 선택합니다. 이전 버전의 VS Code에서 새 설정 키를 인식하지 못하면 `typescript.tsdk`에 같은 경로를 지정합니다.

Nuxt가 생성하는 `module: preserve`는 [TypeScript 5.4부터 지원](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-5-4.html)됩니다. 오래된 TypeScript Nightly 확장의 5.3 버전을 사용하면 최상위 `await`에 `ts-plugin(1378)` 오류가 표시될 수 있습니다. 프로젝트 버전 선택 후에도 이전 진단이 남으면 `TypeScript: Restart TS Server`를 실행합니다. 이 경우 생성된 `.nuxt/tsconfig*.json`이나 페이지의 `await`를 수정할 필요는 없습니다.

## 링크 공유 미리보기

메인·전적·리포트는 서버 HTML에 Open Graph와 Twitter Card 메타태그를 포함합니다. 전적은 조회된 플레이어 이름·플랫폼, 리포트는 맵·모드·확인된 순위·팀 킬을 문구에 반영합니다. 합성 샘플은 제목·설명에 샘플임을 표시하며, 데이터 조회 실패 시에는 기본 문구를 사용합니다. 이미지는 페이지 종류별 정적 PNG이고 플레이어별로 별도 이미지를 생성하지 않습니다.

배포 환경의 `NUXT_PUBLIC_SITE_URL`을 실제 공개 origin(예: `https://서비스도메인`)으로 설정하세요. 경로·쿼리·해시 없이 프로토콜과 도메인을 사용합니다. 이 값이 없으면 현재 요청의 origin을 사용합니다. 메타태그의 URL은 절대 주소이며, 전적 필터·리포트 복귀 정보·추적 쿼리와 해시는 canonical 및 `og:url`에서 제외합니다. 사용자가 복사하는 공유 링크의 복귀 정보는 유지됩니다. 리포트의 `noindex, nofollow` 정책도 유지합니다.

이미지 파일과 재생성 방법은 [브랜딩 문서](branding.md#공유-이미지)를 참고합니다. localhost는 외부 공유 서비스에서 접근할 수 없으므로 실제 카카오톡 등의 미리보기 확인은 공개 배포 후 진행합니다. 구현 기준은 [Nuxt SEO 안내](https://nuxt.com/docs/4.x/getting-started/seo-meta)와 [Open Graph 명세](https://ogp.me/)입니다.

## 검증

### 정적 검사와 단위 테스트

```sh
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

### PostgreSQL 통합 테스트

로컬 Compose를 시작한 뒤 전용 DB를 최초 한 번만 생성합니다. 이미 있는 DB를 삭제하거나 초기화하지 않습니다.

```sh
docker compose up -d db
docker compose exec -T db createdb -U droplog droplog_test
TEST_DATABASE_URL='postgres://droplog:local_demo_only@127.0.0.1:55432/droplog_test' pnpm test:integration
```

이 연결 문자열은 로컬 Compose 전용 예시입니다. 테스트 DB 이름은 `_test`로 끝나야 합니다. 테스트는 체크인된 마이그레이션을 적용하고 해당 실행이 생성한 식별자의 데이터만 정리합니다. 앱 DB를 테스트 DB로 사용하지 않습니다.

### 브라우저 테스트

검색 흐름 테스트는 **demo 모드 서버**를 사용하며 메모리 모드로 실행할 수 있습니다. 실행 중인 live 서버를 `PLAYWRIGHT_BASE_URL`에 지정하지 마세요. 다른 포트에 demo 서버를 띄우면 `.env`의 live 설정을 유지하며 테스트할 수 있습니다.

```sh
pnpm exec playwright install chromium
# 터미널 1: 사용하지 않는 포트에서 실행
NUXT_DATA_MODE=demo NUXT_DB_ENABLED=false pnpm dev --host 127.0.0.1 --port 3101
```

```sh
# 터미널 2: 위 demo 서버에 연결
PLAYWRIGHT_BASE_URL=http://127.0.0.1:3101 E2E_STORAGE=1 pnpm test:e2e
```

`E2E_STORAGE=1`은 선택한 저장소의 리포트 생성·재사용 흐름도 검사합니다. PostgreSQL로 검사하려면 마이그레이션한 DB를 준비하고 서버를 `NUXT_DB_ENABLED=true`로 실행합니다. 기본 Playwright 설정은 3100 포트의 서버를 재사용하므로 데이터 모드와 저장소를 먼저 확인해야 합니다. 지도 테스트의 합성 API 응답은 실제 PUBG 연동 검증과 구분합니다.

생산 빌드의 브라우저 검증에는 `pnpm build` 후 터미널 1에서 아래 명령을 대신 사용합니다.

```sh
NUXT_DATA_MODE=demo NUXT_DB_ENABLED=false PORT=3101 HOST=127.0.0.1 node --env-file=.env .output/server/index.mjs
```

### 생산 API smoke와 성능 측정

```sh
pnpm build
pnpm test:smoke
pnpm benchmark
```

`test:smoke`는 기본 메모리 모드로 별도 생산 서버를 시작·종료합니다. 기본 포트는 3102이며 필요하면 `SMOKE_PORT`로 바꿉니다. 리포트 생성·재사용·재시작 시 소실·비밀 canary 검사와 실제 SDK에 모의 HTTP 전송을 붙인 네 TPP 조합을 확인합니다. 외부 PUBG 서버를 호출하지 않습니다. SDK mock 구간은 실행별 식별자를 사용하고, demo 구간은 고정 샘플 경기의 리포트를 생성·재사용합니다.

마이그레이션한 DB와 연결 URL을 준비하고 `NUXT_DB_ENABLED=true pnpm test:smoke`를 실행하면 PostgreSQL 저장과 재시작·데이터 모드 변경 후 리포트 유지도 검사합니다.

`benchmark`는 DB·네트워크 없는 순수 분석기 측정입니다. 입력 JSON 크기, 정규화 이벤트 수, 시간, 프로세스 최대 RSS를 출력합니다. 결과를 해석할 때는 [성능 기록](performance.md)의 측정 범위를 확인합니다.

### 실제 PUBG 검증

비공개 키와 DB 설정, 명시적인 `NUXT_DB_ENABLED=true`가 필요합니다. 두 스크립트는 자체 live 어댑터와 PostgreSQL 저장소를 사용하며 메모리 모드에서는 실행을 거부합니다. 실행 중인 개발 서버의 모드는 바꾸지 않으며, 외부 PUBG에는 조회만 수행하고 정규화 결과는 설정된 DB에 저장합니다.

```sh
NUXT_DB_ENABLED=true LIVE_PLATFORM=kakao LIVE_PLAYER='<실제 닉네임>' pnpm validate:live
NUXT_DB_ENABLED=true MAP_REPORT_ID='<기존 실제 리포트 UUID>' pnpm validate:map
```

- `validate:live`: 첫 원본 경기 ID 20개를 확인하고 가능한 일반/랭크·듀오/스쿼드 조합에서 최대 5개 리포트를 생성·재사용합니다. 원본 ID 순서는 최신순이라고 가정하지 않습니다.
- `validate:map`: 지정한 실제 경기 한 건의 새 분석을 생성·재사용하고 위치, 기존 리포트 보존, 두 번째 요청의 재사용을 확인합니다. 이미 현재 버전이면 저장 결과를 검증하므로 매 실행이 새 외부 분석은 아닙니다.
- 원본 텔레메트리는 파일에 저장하지 않습니다. 플랫폼·조합별 결과를 검증 기록에 남기고, 일부 조회에 기록이 없다는 이유로 해당 큐가 없다고 단정하지 않습니다.

## 생산 Node 서버

```sh
pnpm build
PORT=3100 HOST=127.0.0.1 node --env-file=.env .output/server/index.mjs
```

생산 실행은 `.env`를 자동으로 읽지 않으므로 `--env-file` 또는 호스트 환경변수를 사용합니다. `pnpm start`도 자동으로 `.env`를 읽지 않습니다. 위 주소는 로컬 실행 예시이며 공개 배포 설정이 아닙니다. `nuxt generate` 정적 배포로 서버 API를 운영할 수 없습니다.

초기 기준은 Nitro `node-server` 단일 프로세스입니다. 앱 Zod 4와 SDK Zod 3을 각각 번들에 포함하는 이유는 [SDK 검토](sdk-review.md)에 기록했습니다. 빌드 성공과 실제 생산 API 동작은 별개로 검증합니다.

## 데이터와 운영 제약

- 성적표는 공식 participant/roster 통계를 사용합니다. 텔레메트리 합계로 덮어쓰지 않고 누락값은 `—`, 불완전한 합계는 `확인된 합계`로 표시합니다. killer·finisher·기절 유발자·어시스트를 구분하며 첫 사망을 최종 전멸로 해석하지 않습니다.
- 사건 지도는 분석 버전 2부터 역할별 좌표를 저장합니다. `/api/reports/:reportId/upgrade`는 이전 URL을 보존하고 별도 ID의 새 분석을 생성·재사용합니다. 새 분석 생성에는 저장 출처와 서버 모드가 일치해야 합니다. 보관 중인 새 버전은 데이터 모드와 무관하게 열 수 있습니다. PostgreSQL에 저장한 결과는 원본 제공 기간이 지나 재분석할 수 없어도 유지됩니다.
- 경기 목록은 요청당 원본 최대 20개를 확인하고 실제 경기 시각으로 정렬합니다. 목록 커서는 조회 스냅샷·플랫폼·플레이어·필터에, 사건 커서는 리포트 revision·필터에 묶입니다. 서버 재시작 후 커서는 첫 페이지부터 다시 시작합니다. PostgreSQL의 저장 URL은 유지되지만 메모리의 리포트와 URL은 만료됩니다.
- 외부 요청 timeout 10초, API 작업 예산 30초, 텔레메트리 32 MiB, 정규화 이벤트 20,000개, PostgreSQL 쿼리 timeout 5초입니다. 실패·제한 초과 시 가능한 성적표와 부분 결과를 선택한 저장소에 보관합니다.
- 플레이어 조회는 API 키당 10회/60초 이동 구간 제한을 적용합니다. 매치·텔레메트리는 이 제한에서 제외하며 메타데이터 동시 3개/대기 20개, 분석 동시 1개를 별도로 제한합니다.
- 생성·재시도·새 분석 POST는 실제 소켓 클라이언트별 5회/분을 공유합니다. 저장 결과 재사용도 포함합니다. `X-Forwarded-For`를 신뢰하지 않으므로 프록시 배포 시 IP 신뢰 설정을 검토해야 합니다.
- 중복 분석·호출 제한은 단일 프로세스 기준입니다. 여러 replica나 다른 앱에서 같은 키를 쓸 때는 중앙 조정이 필요합니다.
- 텔레메트리 URL은 공식 match asset에서만 읽고 HTTPS·정확한 CDN hostname을 검사합니다. 리다이렉트와 인증 헤더 전달은 허용하지 않습니다. 원본은 저장하지 않습니다.
- 로그에는 request ID, 시간, 상태, upstream 호출 수, 캐시 재사용 횟수, source, 분석 버전, 사유 코드를 기록합니다. 인증정보와 원본 API 응답은 출력하지 않습니다.
- UUID 링크를 아는 사람은 보관 중인 리포트를 읽을 수 있습니다. 로그인·소유권·비공개 보관 기능은 없고 `noindex`는 접근 제어가 아닙니다.
- 메모리 캐시는 보관 시간·용량에 따라 퇴출되며 재시작 시 사라집니다. PostgreSQL에는 리포트 자동 삭제와 관리자 삭제 API가 없습니다. DB로 공개 운영할 때는 보관 기간·백업·삭제 책임을 정해야 합니다. 수동 삭제는 대상 식별자 확인 → 백업 → 해당 UUID 삭제 → 참조 확인 순서로 수행합니다. 일반 DB 종료에는 `docker compose stop`을 사용합니다. `docker compose down -v`는 저장 볼륨을 삭제합니다.
