# 구현 검증 기록

기준일: 2026-10-04. PRD 1.1의 MVP를 구현했다. **합성 fixture·mock·로컬 PostgreSQL 검증과 실제 PUBG 검증을 구분한다.** 초기에는 키 없이 구현했고 종료 전 로컬 `.env`의 키 설정을 확인하여 사용자 제공 카카오 계정으로 T07을 일부 수행했다. 공개 배포는 수행하지 않았다.

## 환경과 의존성

Apple M1 Max / arm64 / 64 GiB, macOS Darwin 24.6.0, Node 24.21.0, pnpm 9.15.9. PostgreSQL 17.6는 이 저장소 전용 Docker Compose에서 `127.0.0.1:55432`로 실행했다. 앱 DB `droplog`, 통합 테스트 DB `droplog_test`를 분리했다. 기존 다른 프로젝트 DB는 변경하지 않았다.

설치 전 npm registry의 버전과 engines/peerDependencies를 직접 조회했다. `package.json`은 정확한 버전, `packageManager`와 `.nvmrc`를 사용하고 `pnpm-lock.yaml`을 체크인 대상으로 생성했다.

| 패키지 | 고정 버전 |
| --- | --- |
| Nuxt / Nitro / Vite | 4.5.2 / lockfile 2.13.4 / lockfile 8.3.2 |
| Nuxt UI / Tailwind CSS | 4.11.3 / 4.3.3 |
| Vue / Vue Router | 3.5.43 / 5.3.1 |
| pubg-kit | 1.4.4, 서버 런타임 의존성 |
| Drizzle ORM / Drizzle Kit / postgres | 0.45.3 / 0.31.11 / 3.4.9 |
| Zod / TypeScript | 4.6.5 / 5.9.3 |
| Vitest / Playwright | 5.0.3 / 1.63.0 |
| ESLint / Nuxt ESLint | 10.12.0 / 1.17.0 |

설치 시 Nuxt CLI의 `@bomb.sh/tab`이 요구하는 `cac ^6.7.14`와 CLI의 `cac 7.0.0` 간 upstream peer 경고가 있었다. 설치·prepare·dev·typecheck·build·Node 실행 검증은 통과했다. 자동완성 플러그인의 모든 shell 환경은 검증하지 않았다. Drizzle Kit의 esbuild-kit 등 세 간접 의존성의 deprecation 경고도 있으며 임의의 major 강제 대체는 하지 않았다.

## 실행 결과

최종 수정 후 2026-10-04 20:20 KST부터 재검증했다.

| 명령 | 실제 확인 |
| --- | --- |
| `pnpm install` | 성공, lockfile 생성, Nuxt prepare 성공 |
| `docker compose up -d db` | 새 전용 컨테이너·볼륨 생성, PostgreSQL 준비 완료 |
| `pnpm db:migrate` | 빈 앱 DB에 3개 테이블·unique·FK 마이그레이션 성공 |
| `pnpm dev --host 127.0.0.1 --port 3100` | 개발 서버, 실제 상태·검색·필터·리포트 경로 성공 |
| `pnpm lint` | 통과 |
| `pnpm typecheck` | 통과 |
| `pnpm test` | 6개 파일, **89개 통과**, 446 ms |
| `TEST_DATABASE_URL=… pnpm test:integration` | 실제 PostgreSQL **10개 통과**, 998 ms |
| `E2E_STORAGE=1 PLAYWRIGHT_BASE_URL=http://127.0.0.1:3100 pnpm test:e2e` | Chromium **15개 통과**, 35.5초, 실제 DB 생성·공유 포함 |
| `E2E_STORAGE=1 PLAYWRIGHT_BASE_URL=http://127.0.0.1:3101 pnpm test:e2e` | **최종 생산 Nitro에서도 동일 15개 통과**, 16.7초 |
| `pnpm build` | Nitro `node-server` 생산 빌드 성공 |
| `pnpm test:smoke` | 생산 서버 재시작/출처 보존/키 없음/live 모의 SDK 네 조합/노출 검사 통과 |
| `pnpm benchmark` | 32 MiB 미만 대용량 입력, 20,000 이벤트 제한 및 부분 상태 확인 |

## 데이터·서버 수용 기준

- **AC01~04:** 닉네임 양끝 공백·대소문자·제어문자·다중 이름·길이 검증, Steam/Kakao 허용, 실제 날짜 정렬, account→participant→roster 식별, 1인 듀오·2인 스쿼드, 공식 통계·실제 0·누락 구별. 팀원 순번은 식별자 정렬로 고정한다.
- **AC05~08:** killer·finisher·dBNOMaker·어시스트 각 역할, 환경·자해·아군 피해, 같은 시각 원본 순번, 중복처럼 보이는 피해 보존, 새 이벤트 건너뛰기, 알려진 필드 오류·시작 시각 없음·이벤트 제한을 부분 사유로 표시한다. 기본 주요 이벤트와 전체/피해, 어시스트만 참여한 팀원, revision·필터 커서를 검증한다.
- **AC09~11:** 서로 다른 클라이언트의 같은 팀 10회가 한 분석/저장 ID로 수렴한다. 같은 클라이언트 6번째 요청은 429. DB unique·FK·JSONB 검증과 재시도 CAS를 실제 PostgreSQL에서 확인한다. telemetry 실패 시 공식 성적표 유지, 재시도 60초 제한·실패 시 기존 결과 보존을 검증한다.
- **AC12~15:** 복사 허용과 거부 시 선택 가능한 수동 URL, 새 브라우저 직접 접근, source=demo 유지, 360/768/1440px × 다크/라이트에서 실제 팀원 수·가로 넘침·키보드 검색·필터·테마 유지·오류 회복을 확인한다. OS 클립보드 실기기 정책은 별도 확인 대상이다.
- **AC16~19:** 실제 설치 SDK와 모의 Axios 전송, 가짜 시간으로 players 10/60초·matches/telemetry 제외, metadata 3동시/20대기·analysis 1개, 실패/취소 후 슬롯 해제, URL 정확한 host·HTTPS·redirect 차단·Authorization 미전달, stream byte 상한·timeout 취소를 검증한다. 하나의 대기 요청 취소가 다른 요청의 공유 작업을 끊지 않는다.
- **AC20~21:** 생산 Node에서 canary를 비공개 설정에 넣고 SSR HTML·브라우저 파일·API 결과·서버 로그에 노출되지 않음을 검사한다. pubg-kit 설치본과 배포 tarball이 동일함을 확인했다. 실제 생산 번들 SDK + 모의 transport로 네 조합 조회·분석·저장·이벤트 API를 실행했다. live 모드의 실제 외부 호출 성공이라는 뜻은 아니다.
- **AC23~24:** 네 TPP 조합 fixture, FPP 듀오/스쿼드·솔로·커스텀 제외와 직접 report POST 거부, matchType 누락/미확인값 분류 구별, 교차 필터 URL 복원, 첫 원본 20개에서 0건이어도 다음 원본 유지, 커서 필터 mismatch와 재시작 만료를 확인한다.

## 발견 후 수정한 사항

1. 앱 Zod 4와 SDK Zod 3을 Nitro가 외부 패키지 `zod` 하나로 합쳐 생산 API가 실패했다. `nitro.externals.inline: ['zod']`로 각 해석본을 번들에 포함하고 실제 생산 경로를 재검증했다. 빌드 성공만으로 API 성공을 판정하지 않았다.
2. SDK의 엄격한 match schema가 통계 누락을 거부했다. `ZodError`에만 공식 match 호환 요청을 허용하고, 네트워크·401·403·429·timeout에서 재요청하지 않음을 검증했다. 상세 근거는 [SDK 검토](sdk-review.md).
3. 피해량 비중의 0~100 값에 UI에서 100을 재차 곱하던 부분을 수정했다.
4. SSR 이후 hydration 전에 입력한 값이 사라질 수 있어 준비 완료까지 검색을 비활성화했다. ofetch의 기본 GET 재시도가 409를 가리므로 API 호출에 `retry: 0`을 지정했다.
5. 메타데이터 요청과 분석이 별개 30초 예산을 쓰지 않도록 요청 시작 기준 deadline을 사용하고, DB 쿼리 timeout을 고려해 부분 결과 저장 시간을 남겼다. 이전 페이지 결과는 DB 일괄 조회로 재사용한다.
6. 공유 메타데이터 다운로드는 각 요청의 참조를 추적하며 마지막 대기자가 취소했을 때만 실제 전송을 취소한다.
7. 더 보기 후 이전 묶음의 실패를 복구하지 못하던 UI를 수정했다. 실패 묶음 커서를 추적하고 복구 후 가장 멀리 읽은 범위의 합계·다음 커서를 유지한다.
8. 재시도에서 최신 match의 공식 통계를 사용하도록 수정했다. 팀/참가자 관계가 달라지거나 확인된 통계·순위가 null로 퇴행하면 기존 리포트를 보존한다.
9. 빈 피해 대상과 비어 있는 killer 피해 정보 때문에 환경 사망을 오해할 수 있던 처리를 수정하고 회귀 테스트를 추가했다.
10. 순수 벤치마크의 `tsx` CLI가 sandbox의 IPC 소켓 제한에 걸려 `node --import tsx`로 실행 경로를 바꿨다. 벤치마크 재실행은 통과했다.

## 성능

로컬 생산 Nitro + 로컬 Docker PostgreSQL, 저장된 듀오 리포트, 동시성 1, 100회 HTTP 요청 측정에서 최초 p95 9.14 ms/중앙값 5.76 ms, 생산 코드 재측정은 p95 8.30 ms/중앙값 5.55 ms였다. API 원문 canary 검사까지 추가한 마지막 실행은 p95 **26.53 ms**/중앙값 **7.92 ms**로 측정됐다. 모든 실행에서 목표 500 ms 이내였으며 측정 회차별 변동을 함께 보존한다. 같은 머신의 loopback 측정이며 인터넷·실제 PUBG 지연이나 운영 SLA를 의미하지 않는다.

25,001개 합성 입력(23,950,056 bytes)을 분석하여 20,000개로 제한하고 `partial`을 표시했다. 최초 측정 분석 시간 86.22 ms, 프로세스 최대 RSS 250.36 MiB였다. 측정 범위와 입력 생성·직렬화 포함 여부는 [성능 기록](performance.md)을 따른다.

20:18 KST 벤치마크 재실행: 일반 fixture 중앙값 0.93 ms/p95 1.88 ms, 큰 fixture 91.17 ms, 프로세스 최대 RSS 262,520,832 bytes(250.36 MiB). 크기와 이벤트 제한 결과는 동일했다. 대표 렌더 대비도 다크 muted/card 6.91, primary/background 11.92; 라이트 7.73, 4.81로 확인했다. 모바일 공유 버튼 최소 44px와 32자 닉네임의 가로 넘침을 E2E로 검증했다.

## T07 실제 데이터·출시 경계

2026-10-04 20:27 KST 사용자 제공 카카오 계정을 실제로 조회했다. 원본 69개 ID 중 **첫 20개만** 확인했으며 19개는 `competitive:squad`, 1개는 `airoyale:squad`였다. 순서를 최신순으로 가정하지 않았다. `airoyale`은 검증된 매핑이 없어 분류 확인 불가로 제외했다. 전체 69개를 자동 수집하지 않았다.

| 플랫폼 | 일반 듀오 | 일반 스쿼드 | 랭크 듀오 | 랭크 스쿼드 |
| --- | --- | --- | --- | --- |
| Steam | 미검증 | 미검증 | 미검증 | 미검증 |
| Kakao | 미검증: 확인한 20개에 없음 | 미검증: 확인한 20개에 없음 | 미검증: 확인한 20개에 없음 | **실데이터 검증 완료: 5경기** |

카카오 `competitive → ranked`, `squad → squad/TPP`, 실제 4명 roster 연결을 확인했다. 5개 리포트 모두 `ready`, 관련 이벤트 수는 607/224/343/446/524개였다. 실제 CDN hostname은 `telemetry-cdn.pubg.com`이었다. 개인·원본 응답 파일은 저장소에 남기지 않고 서비스 정규화 리포트만 로컬 DB에 저장했다.

생산 `.output/server/index.mjs`를 별도 로컬 live 모드로 실행한 뒤 같은 카카오 검색·랭크/스쿼드 필터·리포트 POST 재사용·GET·이벤트 GET을 확인했다. 원본 20개 중 19개를 표시했고 POST는 기존 보고서 ID를 HTTP 200으로 재사용했다. `source=live`, `quality=ready`, 첫 리포트의 주요 이벤트 21개를 확인했다. 이 재조회는 DB 캐시를 사용하여 추가 외부 호출이 없었으며, 위 5개 신규 생성은 실제 외부 호출로 검증한 결과다.

| 경기 | 해제 후 다운로드 bytes | 생성·저장 ms | 상태 |
| --- | ---: | ---: | --- |
| 1 | 24,458,748 | 2,245 | ready |
| 2 | 26,116,441 | 1,074 | ready |
| 3 | 26,056,654 | 1,008 | ready |
| 4 | 22,431,914 | 997 | ready |
| 5 | 31,473,897 | 2,087 | ready |

순차 5경기 검증 전체 8,479 ms, 프로세스 최대 RSS **526.69 MiB**였다. 메모리 수치는 조회·다운로드·JSON 파싱·분석·DB 저장을 포함한 전체 프로세스 최고치이고, 1개 리포트의 추가 메모리가 아니다. 32 MiB 다운로드 제한과 30초 생성 예산 안이었다. 실제 데이터는 합성 벤치마크보다 메모리를 더 사용했으므로 선택 호스팅의 메모리 한도를 확인해야 한다. API 제한 대상 호출은 플레이어 2회이며, 매치/telemetry 포함 upstream 요청 총 32회였다.

`LIVE_PLATFORM=kakao LIVE_PLAYER='<검증할 닉네임>' pnpm validate:live`로 같은 범위의 읽기 전용 검증을 재현할 수 있다. 스크립트는 첫 20개 메타데이터와 최대 5개 리포트만 처리하며 원본 전체나 키를 출력하지 않는다. 실제 `official → normal`, Steam 및 나머지 조합, 여러 프로세스의 키 공유 한도는 확인이 필요하다. 이 부분 조회 결과로 플랫폼의 큐 제공 여부를 단정하지 않는다.

공개 호스팅·도메인·다중 replica·서버리스·프록시 IP 신뢰 설정·백업/보관 정책은 운영 검증 범위로 남아 있다. 실제 Safari/iPhone의 클립보드·브라우저 동작, 보조공학 도구를 통한 전체 접근성 감사도 별도다. 현재 검증은 Chromium과 실제 렌더링의 핵심 접근성/반응형 확인이다.
