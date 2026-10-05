# DropLog

PUBG 팀의 한 판을 함께 돌아보는 한국어 웹 서비스입니다. Steam/Kakao 닉네임으로 **TPP 일반·랭크 × 듀오·스쿼드** 경기를 찾아 공식 팀 성적표, 사건 타임라인과 지도를 공유합니다.

Nuxt 4 + Nitro Node 서버, Nuxt UI 4 + Tailwind CSS 4, 서버 전용 pubg-kit, PostgreSQL + Drizzle ORM을 사용합니다. 별도 API 서버·로그인·작업 큐는 없습니다.

## 주요 기능

- **경기 검색:** 일반/랭크와 듀오/스쿼드 교차 필터, 추가 경기 조회.
- **팀 리포트:** 공식 통계 기반 성적표, 팀원·유형별 사건 타임라인, 부분 데이터 안내.
- **사건 지도:** 핀과 타임라인 선택 연동, 버튼·마우스 휠 확대와 드래그 이동, 겹친 사건 목록. 피해자·소생 대상 위치와 선택한 사건의 행위자를 구분합니다.
- **링크 공유:** 저장된 리포트를 같은 URL로 열람. 분석 버전 1은 기존 URL을 보존하면서 위치가 포함된 버전 2 리포트를 열 수 있습니다.

에란겔·미라마·태이고·론도·사녹·비켄디·카라킨·데스턴·파라모·헤이븐의 지도 이미지를 지원하며, 첫 확대 시 [공식 8192×8192 이미지](docs/map-assets.md)를 불러옵니다. 론도를 제외한 9개 맵은 기존 좌표 범위에 따라 핀을 표시합니다. 실경기 위치 대응은 에란겔만 검증했으며, 론도는 좌표 범위를 확인할 때까지 이미지만 표시합니다. 좌표가 없는 사건도 타임라인에 남습니다. 지도는 현재 필터에서 불러온 사건을 표시하며, 이동 경로와 재생 기능은 없습니다.

## 빠른 시작

필요 환경: Node 24 LTS ([.nvmrc](.nvmrc)), pnpm 9.15.9, Docker Compose.

```sh
nvm install
nvm use
corepack enable
corepack prepare pnpm@9.15.9 --activate
pnpm install --frozen-lockfile
test -f .env || cp .env.example .env
docker compose up -d db
pnpm db:migrate
pnpm dev --host 127.0.0.1 --port 3100
```

[로컬 홈](http://127.0.0.1:3100)을 엽니다. 새 `.env`는 `demo` 모드이며 Steam 또는 Kakao에서 `SquadMate`를 검색하면 됩니다. 기존 `.env`는 덮어쓰지 않으므로 이미 live로 설정했다면 실제 닉네임을 사용하세요.

| 목적 | 설정과 사용 방법 |
| --- | --- |
| API 키 없이 둘러보기 | `NUXT_DATA_MODE=demo`. 합성 닉네임 검색·저장에는 DB 필요 |
| 실제 경기 조회 | `.env`에 `NUXT_DATA_MODE=live`와 비공개 `NUXT_PUBG_API_KEY` 설정 후 서버 재시작 |
| DB 없이 화면 확인 | [일반 스쿼드 샘플](http://127.0.0.1:3100/reports/demo-normal-squad). 다른 세 조합은 화면에서 선택 |

모드·키를 변경한 뒤에는 개발 서버를 완전히 종료하고 다시 실행하세요. 실행 환경에서 지정한 값이 `.env`보다 우선합니다. [live 전환과 상태 확인](docs/development.md#demo와-live-전환)에 상세 절차가 있습니다.

`.env`는 Git에서 제외됩니다. [.env.example](.env.example)의 DB 자격 정보는 로컬 Compose용 예시이며 외부 환경에는 별도 값을 사용해야 합니다.

## 개발과 검증

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

DB 통합 테스트, **별도 demo 서버를 사용하는 브라우저 테스트**, 생산 빌드 API smoke, 실제 PUBG 검증은 [개발 안내](docs/development.md#검증)에 정리했습니다.

2026-10-04 사건 지도 구현까지 단위 145개·PostgreSQL 12개·Chromium 29개가 통과했습니다. 실제 PUBG 데이터는 카카오 랭크 스쿼드 5경기와 그중 에란겔 한 경기의 지도 좌표를 확인했습니다. 다른 조합·플랫폼과 공개 운영 환경은 별도 검증이 필요합니다. 상세 근거와 측정 범위는 [검증 기록](docs/validation.md)을 참고하세요.

## 문서

| 문서 | 내용 |
| --- | --- |
| [문서 목차](docs/README.md) | 문서별 역할과 권장 읽기 순서 |
| [개발 안내](docs/development.md) | 환경변수, 모드 전환, 테스트, Node 실행, 데이터·운영 제약 |
| [진행 상태](docs/progress.md) | 완료 범위, 후속 변경, 남은 작업 |
| [검증 기록](docs/validation.md) | 자동 테스트·실데이터 검증과 미검증 범위 |

리포트는 로그인 없이 UUID 링크로 공유합니다. 링크를 아는 사람은 읽을 수 있으며 `noindex`는 접근 제어가 아닙니다. 저장 출처는 서버 모드를 바꿔도 유지되고, live 오류를 샘플 성공으로 대체하지 않습니다.
