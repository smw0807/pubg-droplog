# DropLog · Squad Review

PUBG 팀의 한 판을 함께 돌아보는 한국어 웹 서비스입니다. **TPP 일반 듀오·일반 스쿼드·랭크 듀오·랭크 스쿼드**를 지원합니다. Steam/Kakao 닉네임 검색 → 모드 필터 → 공식 팀 성적표와 사건 타임라인 → 공유 링크 흐름을 제공합니다.

Nuxt 4 + Nitro Node 서버, Nuxt UI 4 + Tailwind CSS 4, 서버 전용 pubg-kit, PostgreSQL + Drizzle ORM을 사용합니다. 별도 API 서버·로그인·작업 큐는 없습니다. 실제 PUBG 키 없이 합성 데이터로 모든 저장 흐름을 확인할 수 있습니다.

## 빠른 시작

필요 환경: Node 24 LTS (`.nvmrc`: 24.21.0), pnpm 9.15.9, Docker Compose.

```sh
nvm install
nvm use
corepack enable
corepack prepare pnpm@9.15.9 --activate
pnpm install --frozen-lockfile
cp .env.example .env
docker compose up -d db
pnpm db:migrate
pnpm dev --host 127.0.0.1 --port 3100
```

[로컬 홈](http://127.0.0.1:3100)에서 Steam 또는 Kakao를 선택하고 `SquadMate`를 검색합니다. 데모는 합성 닉네임만 지원합니다. 조회 시각과 경기 시각은 구분하며 UI 시간대는 KST입니다.

DB 없이 화면만 보려면 `.env`의 `NUXT_DATABASE_URL`을 비우고 예약 샘플 링크를 열 수 있습니다. 검색 스냅샷·UUID 리포트의 생성과 저장에는 DB가 필요합니다. DB 오류를 임시 메모리 저장 성공으로 바꾸지 않습니다.

- [일반 듀오 샘플](http://127.0.0.1:3100/reports/demo-normal-duo)
- [일반 스쿼드 샘플](http://127.0.0.1:3100/reports/demo-normal-squad)
- [랭크 듀오 샘플](http://127.0.0.1:3100/reports/demo-ranked-duo)
- [랭크 스쿼드 샘플](http://127.0.0.1:3100/reports/demo-ranked-squad)

예약 샘플은 항상 읽기 전용입니다. 데모 검색으로 생성한 리포트는 UUID와 `source=demo`로 PostgreSQL에 저장되며, 서버 재시작·live 전환 뒤에도 샘플 표시를 유지합니다. 랭크 듀오 샘플은 플랫폼의 현재 매칭 제공 여부를 증명하지 않습니다.

## 환경변수

| 변수 | 설명 |
| --- | --- |
| `NUXT_DATA_MODE` | `demo` 또는 `live`. 기본 `demo`; 다른 값은 설정 오류 |
| `NUXT_PUBG_API_KEY` | live 전용 PUBG 키. 서버에서만 사용 |
| `NUXT_DATABASE_URL` | PostgreSQL 연결 문자열. 서버에서만 사용 |
| `PORT`, `HOST` | 생산 Nitro 서버 리슨 설정 |

`.env.example`의 DB 자격 정보는 **로컬 Compose 전용 placeholder**입니다. 외부 환경에 재사용하지 마세요. `.env`는 Git에서 제외됩니다. 실제 키·DB 문자열을 채팅, 문서, 테스트 결과나 로그에 붙여넣지 않습니다. 서버의 `runtimeConfig.public`에는 비밀값이 없습니다.

## 검증 명령

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:smoke
pnpm benchmark
pnpm exec playwright install chromium
E2E_STORAGE=1 pnpm test:e2e
```

`test:smoke`는 빌드된 `.output/server/index.mjs`를 직접 실행합니다. 데모 저장과 재시작·모드 변경 후 재조회, noindex·canary 검사, 실제 번들 SDK + **모의 HTTP 전송**의 네 조합 리포트 생성을 확인합니다. 실제 PUBG 서버는 호출하지 않습니다. 합성 live 테스트 레코드는 `smoke-` 접두사와 실행별 식별자를 사용합니다. 테스트 결과를 실제 PUBG 연동 성공으로 해석하지 마세요.

DB 통합 테스트에는 이름이 `_test`로 끝나는 전용 DB가 필요합니다. 운영 DB를 사용하지 않습니다. 초기 생성은 한 번만 실행하세요.

```sh
docker compose exec -T db createdb -U droplog droplog_test
TEST_DATABASE_URL='postgres://droplog:local_demo_only@127.0.0.1:55432/droplog_test' pnpm test:integration
```

통합 테스트는 체크인된 마이그레이션을 적용하고 자신이 만든 식별자의 테스트 데이터만 정리합니다. 이미 실행 중인 개발 서버를 브라우저 테스트에 쓰려면 `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3100 E2E_STORAGE=1 pnpm test:e2e`를 사용합니다.

## 생산 Node 서버

```sh
pnpm build
node --env-file=.env .output/server/index.mjs
```

생산 실행에서 `.env`는 자동으로 로드되지 않으므로 `--env-file` 또는 호스트 환경변수를 사용합니다. `nuxt generate` 정적 배포로 서버 API를 운영할 수 없습니다. 의존성은 정확한 버전과 `pnpm-lock.yaml`로 고정했습니다. Nitro가 SDK의 Zod 3과 앱의 Zod 4를 잘못 합치지 않도록 두 해석본을 번들에 포함합니다. 빌드 후 실제 API smoke 검증이 필수입니다.

## 실제 PUBG 확인 절차

1. 로컬 비밀 환경변수에 서비스 전용 키를 설정하고 `NUXT_DATA_MODE=live`로 서버를 재시작합니다.
2. Steam/Kakao에서 접근 가능한 정확한 닉네임을 검색합니다. 네 필터 조합을 각각 확인하되 자동으로 14일 전체를 반복 수집하지 않습니다.
3. 초기 5경기를 목표로 일반·랭크와 가능한 듀오·스쿼드를 선택해 생성 시간, 품질 사유와 타임라인을 확인합니다.
4. DB의 정규화 메타데이터에 저장된 `raw_match_type`, `raw_game_mode`, `queue_type`, `team_mode`를 비교합니다. 실제 `official → normal`, `competitive → ranked` 매핑은 여기서 확인합니다.
5. 플랫폼 × 네 조합을 `실데이터 검증 완료 / 조회 범위에 데이터 없음 / 미검증`으로 [검증 기록](docs/validation.md)에 남깁니다. 일부 묶음의 빈 결과로 플랫폼의 모드 제공 여부를 단정하지 않습니다.

자동 검증 보조 명령은 `LIVE_PLATFORM=kakao LIVE_PLAYER='<닉네임>' pnpm validate:live`입니다. 로컬 `.env`의 키를 사용하여 첫 원본 20개, 최대 5개 리포트만 확인하고 정규화 결과를 로컬 DB에 저장합니다. 실제 외부 PUBG 요청은 읽기 전용이며 원본 telemetry 파일을 남기지 않습니다. 2026-10-04에는 사용자 제공 카카오 계정의 랭크 스쿼드 5경기를 확인했습니다. 다른 플랫폼·조합과 공개 호스팅은 별도 검증이 필요합니다.

live 모드의 키 누락·인증 실패·호출 제한은 명확한 실패입니다. 자동으로 샘플 결과를 반환하지 않습니다. 이 저장소의 현재 실제 키 검증 상태는 [진행 기록](docs/progress.md)과 [검증 기록](docs/validation.md)을 참고하세요.

## 데이터와 운영 경계

- 공식 participant/roster 통계가 성적표의 기준입니다. 텔레메트리 합계로 덮어쓰지 않습니다. 알 수 없는 값은 `—`, 불완전한 합계는 `확인된 합계`로 표시합니다.
- killer·finisher·기절 유발자·어시스트를 보존합니다. 첫 사망으로 최종 탈락·전멸을 계산하지 않습니다.
- 경기별 원본 ID는 날짜순이라고 가정하지 않습니다. 요청당 최대 20개를 확인하고 정렬하며, 빈 묶음에도 다음 원본이 있으면 더 보기가 가능합니다.
- 목록 커서는 스냅샷·플랫폼·플레이어·필터에, 이벤트 커서는 리포트 revision·필터에 묶입니다. 서명 키는 프로세스 수명이므로 서버 재시작 시 커서는 첫 페이지에서 다시 시작합니다. 저장 리포트 URL은 유지됩니다.
- 외부 요청 timeout 10초, API 작업 예산 30초, telemetry 32 MiB, 정규화 이벤트 20,000개입니다. 큰 입력·실패는 가능한 성적표를 부분 리포트로 저장합니다. DB 쿼리 timeout은 5초입니다.
- PUBG 제한 대상 players 요청은 API 키당 이동 구간 10회/60초입니다. matches/telemetry는 이 제한에서 제외하며 메타데이터 동시 3개/대기 20개, 분석 동시 1개를 별도 적용합니다.
- 생성·재시도는 실제 소켓 클라이언트별 5회/분입니다. 전달된 `X-Forwarded-For`를 신뢰하지 않습니다. 프록시 뒤에서는 IP 신뢰 설정을 배포 환경에 맞춰 검토해야 합니다.
- 중복 분석·제한기는 **Nitro 단일 프로세스**용입니다. 여러 replica나 동일 키를 공유하는 다른 앱에는 중앙 조정이 필요합니다. 호스팅·서버리스·실제 네트워크 성능은 별도 검증 대상입니다.
- telemetry URL은 공식 match의 asset 관계에서만 읽고 HTTPS·정확한 CDN hostname을 검사합니다. 리다이렉트와 인증 헤더 전달을 허용하지 않습니다. 원본 telemetry는 저장하지 않습니다.
- 로그는 request ID, 시간, upstream 호출 수, 캐시 재사용 횟수, source, 분석 버전, 사유 코드만 포함합니다. 공유 작업의 upstream 호출은 작업을 시작한 요청에 귀속됩니다.
- UUID 링크를 아는 사람은 리포트를 읽을 수 있습니다. 로그인·소유권·비공개 보관 기능은 없고, `noindex`는 접근 제어가 아닙니다.
- 저장 리포트의 자동 삭제는 없습니다. MVP 로컬 검증에서는 계속 보존합니다. 공개 운영 전에 보관 기간·백업·관리자 삭제 책임자를 확정해야 합니다. 관리자 삭제는 플랫폼/source/match/report 식별자로 대상 확인 → 백업 → 정확한 UUID 한 건 삭제 → 참조 확인 순으로 수행하고, 자동 정리 API는 제공하지 않습니다. `docker compose down -v`는 로컬 DB를 지우므로 일반 종료에는 `docker compose stop`을 사용합니다.

구현 근거와 원본 계약은 [PRD](docs/PUBG_SQUAD_REVIEW_PRD.md), SDK 예외는 [설치본 검토](docs/sdk-review.md), 성능 수치는 [성능 측정](docs/performance.md)에 기록합니다.
