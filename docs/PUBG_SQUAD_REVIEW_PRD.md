# PUBG 듀오와 스쿼드 복기 서비스 기획서

작성일: 2026년 10월 4일  
문서 버전: 1.1  
가칭: Squad Review  
독자: 프로젝트 소유자와 새 저장소에서 구현을 맡을 Codex

> **문서 기준:** 최초 구현을 요청할 때 확정한 PRD v1.1이다. 아래 MVP 범위·구현 순서·수용 기준은 당시 계약을 보존한 것이며, 현재 진행 상태나 새 작업 지시를 뜻하지 않는다. 현재 상태는 [구현 진행](progress.md), 실제 수행한 검증과 남은 확인은 [검증 기록](validation.md)을 따른다.
>
> **이후 승인된 사건 지도:** 분석 버전 2부터 사건 역할별 좌표를 보존하고 지도와 타임라인의 선택을 연결한다. 론도를 포함한 이미지 지원 10개 맵에 사건 핀을 제공한다. 맵별 좌표 기준과 검증 범위는 [맵 자료](map-assets.md)와 현재 진행·검증 기록을 참고한다. 이전 공유 URL과 리포트는 유지하고, `POST /api/reports/:reportId/upgrade`로 별도 URL의 새 분석을 생성하거나 재사용한다. 이는 아래 원 MVP 이후의 추가 범위이며 이동 경로·지도 재생까지 포함하지 않는다.

경기가 끝난 뒤 닉네임을 검색하고, 함께 플레이한 듀오 또는 스쿼드의 성적과 사건을 시간순으로 확인하는 웹 서비스다. **3인칭 일반전과 랭크전의 듀오·스쿼드**를 MVP에 포함한다. 첫 버전의 목표는 **검색 → 경기 종류와 팀 모드 선택 → 경기 선택 → 팀 리포트 → 링크 공유**를 완성하는 것이다.

사용자가 선택한 구성은 **Nuxt 서버에서 백엔드 처리 + pubg-kit + Nuxt UI**다. 별도 NestJS 서버는 만들지 않는다. 이 문서는 구현에 필요한 기본값과 완료 기준을 정하며, 실제 서비스 구현이나 PUBG 실데이터 검증을 완료했다는 뜻은 아니다.

## 1 제품 방향과 결정 사항

### 해결할 문제

듀오·스쿼드 경기 후 팀원들은 자신의 킬과 피해량은 확인할 수 있지만, 누가 먼저 기절했고 누가 소생시켰는지 같은 사건을 함께 돌아보기 어렵다. 경기 결과와 팀 관련 이벤트를 한 화면에 모아, 친구들이 같은 기록을 보며 대화할 수 있게 한다.

제품 가설은 “팀 단위 성적표와 사건 타임라인을 공유할 수 있으면, 함께 플레이하는 사람들이 경기 후 다시 방문한다”이다. 이 가설은 출시 전 사용자 검증이 필요하다. 패배 원인 판정, 실력 평가 점수, 팀원 책임 추궁은 제품 목적에 포함하지 않는다.

### 확정 사항과 구현 기본값

| 구분             | 선택                                                 | 적용 원칙                                                    |
| ---------------- | ---------------------------------------------------- | ------------------------------------------------------------ |
| 사용자 확정      | Nuxt                                                 | 화면과 서버 API를 한 저장소에서 관리                         |
| 사용자 확정      | Nuxt UI                                              | 기본 컴포넌트와 테마를 통일                                  |
| 사용자 확정      | pubg-kit                                             | PUBG API 접근을 서버 어댑터로 감싸 사용                      |
| 사용자 확정      | 3인칭 일반전·랭크전, 듀오·스쿼드                     | 네 조합을 MVP 조회·분석 범위에 포함, 1인칭과 솔로는 제외     |
| 구현 기본값      | Nuxt 4, Nuxt UI 4, Tailwind CSS 4, TypeScript strict | 설치 시 호환되는 안정 버전을 확인하고 lockfile 고정          |
| 구현 기본값      | PostgreSQL, Drizzle ORM                              | 리포트 저장과 재사용, SQL 마이그레이션 관리                  |
| 구현 기본값      | pnpm, 지원 중인 Node.js LTS                          | 실제 선택 버전을 packageManager와 런타임 설정에 기록         |
| 구현 기본값      | 한국어 UI, KST 표시                                  | DB와 API 시간은 UTC ISO 8601, 화면은 Asia/Seoul              |
| 구현 기본값      | 로그인 없는 조회와 링크 공유                         | 사용자 계정이나 비공개 보관함을 만들지 않음                  |
| 개발과 검증 기준 | Nitro Node 서버 단일 프로세스                        | 첫 버전의 메모리 캐시와 호출 제어 범위를 명확히 함           |
| 추후 결정        | 호스팅 사업자와 도메인                               | 배포 전에 실측 결과로 결정, 문서 작성 단계에서 배포하지 않음 |

Nuxt 서버는 API와 DB 접근을 지원한다. Nuxt UI는 Tailwind 기반 Vue 컴포넌트를 제공하며, 현재 v4 소스의 라이선스는 MIT다. [Nuxt 서버](https://nuxt.com/docs/4.x/getting-started/server), [Nuxt UI](https://github.com/nuxt/ui/blob/v4/package.json)

## 2 대상 사용자와 첫 사용 경험

대상은 Steam 또는 Kakao PUBG에서 듀오·스쿼드를 플레이하는 사람이다. 일반전과 랭크전은 모두 첫 버전에 포함하며, 게임의 경쟁전은 화면에서 `랭크`로 표기한다. 경기 종류, 팀 모드, 시점을 별개의 값으로 다룬다.

| 시점      | 경기 종류      | 팀 모드      | 제품 지원 범위 |
| --------- | -------------- | ------------ | -------------- |
| 3인칭 TPP | 일반           | 듀오         | MVP 포함       |
| 3인칭 TPP | 일반           | 스쿼드       | MVP 포함       |
| 3인칭 TPP | 랭크           | 듀오         | MVP 포함       |
| 3인칭 TPP | 랭크           | 스쿼드       | MVP 포함       |
| 1인칭 FPP | 일반·랭크      | 모든 팀 모드 | 제외           |
| 모든 시점 | 모든 경기 종류 | 솔로         | 제외           |

이는 서비스가 처리할 조합을 정한 표이며, 모든 플랫폼·시즌에서 네 조합의 게임 매칭이나 실제 기록이 항상 제공된다는 뜻은 아니다. 랭크 듀오를 코드에서 일괄 제외하지 않는다. 요청 조합의 기록이 없으면 현재 조회 범위의 빈 상태로 처리하고, 다른 모드의 기록을 대신 보여주지 않는다. 몇 건을 조회해 결과가 없다는 이유만으로 PUBG의 해당 모드 제공 여부를 단정하지 않는다.

플랫폼은 `steam`과 `kakao`다. 원본 gameMode와 matchType을 확인해 `perspective`, `teamMode`, `queueType`으로 정규화하는 규칙은 7절을 따른다. `-fpp` 모드와 solo는 목록·리포트 생성 양쪽에서 제외한다. 커스텀·아케이드·훈련·이벤트 경기는 지원하지 않는다. 듀오인지 스쿼드인지는 실제 참가 인원만으로 판별하지 않는다.

1. 홈에서 Steam 또는 Kakao를 선택하고 정확한 닉네임을 입력한다.
2. `일반 / 랭크`와 `듀오 / 스쿼드` 필터로 최근 14일 범위에서 API가 반환한 3인칭 경기 목록을 확인한다.
3. 지원하는 경기에서 `리포트 보기`를 누른다.
4. 해당 듀오 또는 스쿼드 전체 성적표와 기절·소생·처치·사망 기록을 확인한다.
5. 팀원 또는 이벤트 유형으로 기록을 좁혀 본다.
6. 같은 리포트 URL을 복사해 친구에게 전달한다.

API 키가 없는 개발 환경에서도 샘플 데이터로 이 흐름 전체를 확인할 수 있어야 한다. 샘플 데이터는 항상 `샘플 리포트`로 표시한다.

## 3 MVP 범위

| 기능                 | 구현 내용                                                 | 완료 조건                                                                      |
| -------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------ |
| F01 플레이어 검색    | 플랫폼 선택, 닉네임 검증, 플레이어 조회                   | 검색 없음과 API 오류가 서로 다른 상태로 표시됨                                 |
| F02 경기 목록        | 일반·랭크와 듀오·스쿼드 필터, 날짜·맵·순위·킬·피해량 표시 | 3인칭만 반환, 실제 날짜 정렬과 수집 범위 표시                                  |
| F03 팀 식별          | 듀오·스쿼드의 roster와 참가자 연결                        | account ID와 관계로 팀 식별, 모드와 실제 인원을 구분                           |
| F04 성적표           | 팀 순위, 팀 킬, 팀 피해량, 팀원별 공식 경기 통계          | 필드별 출처와 누락 규칙에 따라 표시                                            |
| F05 이벤트 타임라인  | 우리 팀이 관련된 기절·소생·처치·사망·피해 기록            | 시간과 원본 순번으로 안정 정렬, 이벤트별 의미 보존                             |
| F06 필터             | 이벤트 유형, 팀원 선택, 초기화, 더 보기                   | 행위자·대상·기절 유발자·마무리 공격자·어시스트 중 선택 팀원이 있는 기록을 표시 |
| F07 리포트 저장      | 경기와 팀 기준으로 분석 결과 재사용                       | 중복 클릭·재요청에서 같은 리포트로 수렴                                        |
| F08 링크 공유        | 저장된 리포트 URL 복사와 직접 접근                        | 새 브라우저에서도 같은 데이터와 팀원 색상을 표시                               |
| F09 데이터 상태 안내 | 부분 리포트, 호출 제한, 지연, 실패, 미지원 표시           | 알 수 없는 값을 0이나 교전 없음으로 오해시키지 않음                            |
| F10 데모와 반응형    | 키 없는 샘플 흐름, 다크·라이트, 모바일                    | 핵심 화면을 데스크톱과 모바일에서 검증                                         |

### 후속 기능

첫 버전에서 제외하는 것은 1인칭, 솔로, 자동 교전 구간 분류, 지도와 이동 경로 재생, 팀원 간 거리 분석, AI 코칭, 성장 추이, 조합별 승률, 시즌 랭크 점수·티어 대시보드, 디스코드 봇, 자동 경기 수집, 로그인, 비공개 리포트, 리포트 이미지 생성이다. 랭크 경기 한 판의 조회·분석은 MVP에 포함하며, 시즌 누적 랭크 통계 화면과 구분한다.

Redis·BullMQ·별도 워커·NestJS·Elasticsearch·별도 차트 라이브러리도 초기 의존성에 넣지 않는다. 막대는 숫자를 보조하는 단순 CSS로 표현한다. 추후 복잡한 차트가 필요하면 Unovis를 검토한다. Nuxt UI 공식 대시보드의 차트도 별도 `@unovis/vue`를 사용한다. [공식 차트 예제](https://github.com/nuxt-ui-templates/dashboard/blob/main/app/components/home/HomeChart.client.vue)

## 4 화면 설계

### 홈 화면

경로는 `/`다. 서비스 설명 한 문장, 플랫폼 선택, 닉네임 입력, 검색 버튼, 샘플 리포트 버튼을 배치한다. 초기 소개 문구는 `우리 팀의 한 판을 함께 돌아보세요`로 하고 `3인칭 일반·랭크 듀오와 스쿼드`를 지원 범위로 표시한다. 최근 기록이 즉시 반영되지 않을 수 있다는 안내를 검색 영역 아래에 짧게 표시한다.

입력은 양끝 공백만 제거하고 대소문자를 보존한다. 빈 문자열·제어문자·다중 이름 입력은 거부한다. 서비스 입력 길이 상한은 32자로 두되, 실제 계정 조회 fixture와 공식 제약을 확인해 조정한다. 임의로 모든 닉네임을 소문자로 바꾸지 않는다. Enter로 제출할 수 있어야 한다.

사용 컴포넌트는 `UContainer`, `UCard`, `UForm`, `UFormField`, `USelect`, `UInput`, `UButton`, `UAlert`다. 검색 중에는 버튼 중복 제출을 막고 로딩 문구를 제공한다.

### 플레이어와 경기 목록

경로는 `/players/[platform]/[accountId]`다. 플레이어 이름과 플랫폼, 데이터 조회 시각, 경기 목록, 새로고침, 더 보기를 제공한다. 필터는 경기 종류 `전체 / 일반 / 랭크`, 팀 모드 `전체 / 듀오 / 스쿼드`로 두고 기본값은 각각 전체다. 여기서 전체는 지원하는 3인칭 조합만 의미한다. 1인칭 선택지는 만들지 않는다.

Nuxt UI의 탭 또는 선택 컴포넌트로 필터를 구성하고 `queueType`, `teamMode`를 URL query에 유지한다. 각 항목에는 `일반 또는 랭크`, `듀오 또는 스쿼드`, `TPP` 배지와 날짜·맵·순위·킬·피해량, `리포트 보기` 버튼을 둔다. 필터를 변경하면 화면의 목록 커서를 초기화하되 서버의 유효한 원본 스냅샷과 메타데이터를 재사용한다.

플레이어 응답의 match ID 배열 순서를 최신순으로 가정하지 않는다. 목록 상세 정보를 가져온 뒤 `createdAt`으로 정렬한다. 처음에는 최대 20개 원본 ID의 메타데이터를 가져오고, 사용자가 더 보기를 누르면 다음 묶음을 가져온다. 지원 여부와 선택 필터를 적용한 결과는 20개보다 적거나 0개일 수 있다. 모두 읽기 전에는 `원본 N/M개 확인 · 현재 조건 K개 · 확인한 경기 중 최근순`이라고 표시한다. 이 상태를 `최신 20경기`라고 부르지 않는다.

같은 검색 스냅샷의 결과를 합친 뒤 날짜순으로 재정렬한다. 더 보기로 위치가 바뀔 수 있음을 고려해 사용자의 현재 스크롤과 선택을 유지한다. 자동으로 14일 전체 경기를 반복 수집하지 않는다. 1인칭·솔로·특수 경기는 리포트 대상 목록에서 제외하고 제외 건수·사유를 meta로 구분한다. 경기 종류가 확인되지 않은 항목은 `분류 확인 불가` 건수로 따로 집계한다.

현재 묶음의 필터 결과가 0개여도 다음 원본 ID가 있으면 더 보기를 유지하고 `아직 확인한 경기 중에는 해당 기록이 없어요`라고 표시한다. 원본 목록 전체를 확인했고 실패·미분류 항목이 없을 때만 전체 조회 범위에 해당 기록이 없다고 확정한다.

### 듀오와 스쿼드 리포트

경로는 `/reports/[reportId]`다. 생성 후 이동하는 화면과 공유받아 여는 화면이 같다.

화면 순서는 다음과 같다.

1. 맵·일반 또는 랭크·듀오 또는 스쿼드·TPP·경기 시각·플랫폼, 샘플 또는 데이터 상태 배지, 공유 버튼.
2. 팀 순위·팀 킬·팀 피해량을 보여주는 요약 카드.
3. 팀원별 성적표와 피해량 비교 막대.
4. 주요 이벤트·전체·기절·소생·처치와 사망·피해 필터 및 팀원 선택.
5. 사건 타임라인, 표시 건수, 더 보기.
6. 데이터 출처, 분석 버전, 생성 시각, 누락 안내.

데스크톱 성적표는 `UTable`, 모바일은 팀원별 `UCard`를 사용한다. 타임라인은 `UTimeline`을 읽기 전용으로 구성하고 필터와 더 보기는 실제 버튼으로 제공한다. `UTimeline` 자체가 경기 재생기나 가상 스크롤을 제공한다고 가정하지 않는다. [Nuxt UI Table](https://github.com/nuxt/ui/blob/v4/src/runtime/components/Table.vue), [Nuxt UI Timeline](https://github.com/nuxt/ui/blob/v4/src/runtime/components/Timeline.vue)

기본 선택은 `주요 이벤트`로, 기절·소생·처치와 사망을 합쳐 50건 표시한다. `전체`는 여기에 피해를 포함하고, `피해`는 피해 기록만 조회한다. 같은 처치 사건을 공격자의 처치와 피해자의 사망 두 행으로 중복 생성하지 않고, 한 행에 양쪽 역할을 표시한다.

### 상태별 동작

| 상태                        | 사용자에게 보여줄 내용                                                       | 가능한 행동                                |
| --------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------ |
| 검색 결과 없음              | 해당 플랫폼에서 닉네임을 찾지 못함                                           | 입력 또는 플랫폼 수정                      |
| 경기 없음                   | 원본 목록 전체 확인 시 현재 일반·랭크 및 팀 모드 조건에 해당하는 기록이 없음 | 필터 변경 또는 나중에 새로고침             |
| 일부 조회 중 조건 결과 없음 | 아직 확인한 묶음에서 해당 조건의 기록을 찾지 못함                            | 다음 묶음 더 보기                          |
| 목록 일부 실패              | 확인된 경기와 실패한 항목 수                                                 | 실패 묶음 다시 시도                        |
| 미지원 경기                 | 현재 지원하는 경기 조건 안내                                                 | 다른 경기 선택                             |
| 데이터 없음                 | 경기를 가져올 수 없으며 오래된 데이터 또는 반영 지연일 수 있음               | 다른 경기 또는 나중에 재시도               |
| 호출 제한                   | 잠시 후 다시 요청해야 함                                                     | 서버가 정한 재시도 시각까지 대기           |
| 리포트 생성 중              | 경기 기록을 정리하는 중                                                      | 중복 제출 방지, 근거 없는 진행률 표시 금지 |
| 부분 리포트                 | 성적표는 확인했지만 일부 상세 기록이 없음                                    | 확인된 내용 열람, 허용 시 상세 기록 재시도 |
| 필터 결과 없음              | 현재 조건에 맞는 기록이 없음                                                 | 필터 초기화                                |
| 복사 실패                   | 선택 가능한 리포트 URL                                                       | 수동 복사                                  |
| DB 또는 서버 오류           | 리포트를 저장하거나 읽지 못함                                                | 안전한 재시도, request ID 확인             |

## 5 Nuxt UI 디자인 규칙

기본은 다크 테마다. `UColorModeButton`으로 라이트 테마를 선택하고 선택값을 유지한다. SSR 초기 렌더와 클라이언트 테마 적용이 달라 생기는 깜박임을 확인한다. 공통 루트에 `UApp`을 배치한다.

### 색상과 타이포그래피

아래 값은 이 프로젝트의 디자인 기본값이다. Nuxt UI 의미별 색상 토큰과 CSS 변수로 정의하고 화면마다 임의 색상을 추가하지 않는다.

| 용도           | 다크      | 라이트    |
| -------------- | --------- | --------- |
| 배경           | `#09090B` | `#FAFAFA` |
| 카드 표면      | `#18181B` | `#FFFFFF` |
| 기본 글자      | `#FAFAFA` | `#18181B` |
| 보조 글자      | `#A1A1AA` | `#52525B` |
| 강조           | `#FBBF24` | `#B45309` |
| 강조 버튼 글자 | `#09090B` | `#FFFFFF` |
| 경계선         | `#3F3F46` | `#D4D4D8` |

팀원은 듀오에서 최대 2명, 스쿼드에서 최대 4명의 고정 순번과 sky·emerald·violet·rose 계열로 구분한다. 실제 참가자 수만큼 표시하며 듀오를 4칸으로 채우지 않는다. 다크·라이트에서 읽을 수 있는 명도를 각각 선택한다. 색상만으로 팀원이나 성공·실패를 구별하지 않는다. 닉네임·번호·이벤트 이름을 반드시 함께 표시한다.

본문은 시스템 한글 산세리프 폰트와 14~16px를 기본으로 하고, 숫자는 자릿수가 정렬되게 표시한다. 여백은 4·8·12·16·24·32px 기준, 카드 모서리는 약 12px, 최대 콘텐츠 너비는 1280px로 한다. 움직임은 로딩과 짧은 상태 전환에 한정하며 reduced motion 설정을 존중한다.

### 공통 컴포넌트와 반응형

공통 영역은 `AppHeader`, `PlayerSearchForm`, `MatchModeFilters`, `MatchListItem`, `ReportSummary`, `TeamStatsTable`, `TeamMemberCard`, `EventFilters`, `TeamTimeline`, `DataQualityNotice`, `ShareReportButton`으로 나눈다. 듀오와 스쿼드는 같은 성적표·분석기를 재사용한다. 화면 레이아웃과 데이터 요청 상태를 분리하고, Nuxt UI 컴포넌트를 불필요하게 전부 래핑하지 않는다.

- 360px·768px·1440px 너비에서 페이지 전체의 가로 스크롤이 없어야 한다.
- 모바일 요약 카드는 세로 또는 2열로 배치하고 성적표를 팀원 카드로 바꾼다.
- 긴 닉네임은 줄바꿈을 허용하거나 전체 이름을 확인할 수 있는 수단을 제공한다.
- Tab 이동과 Enter 제출, 명확한 포커스, 로딩·오류 알림을 검증한다.
- 클릭 영역은 모바일에서 최소 44px를 목표로 한다. 작은 아이콘에도 접근 가능한 이름을 붙인다.
- 일반 본문 대비는 4.5:1 이상을 목표로 하고 실제 렌더링에서 확인한다.

## 6 서버 구조

```text
브라우저
  └─ Nuxt 화면과 composable
       └─ 같은 origin의 /api 요청
            └─ Nitro API handler
                 ├─ 입력 검증과 호출 제한
                 ├─ 서비스와 순수 분석 함수
                 ├─ PUBG 어댑터 → pubg-kit → 공식 PUBG API
                 └─ Repository → PostgreSQL
```

`server/api`는 입력 검증·서비스 호출·HTTP 응답만 담당한다. 분석 함수는 H3 event, DB, 네트워크, Vue에 의존하지 않는 순수 TypeScript로 작성한다. 같은 입력과 분석 버전은 같은 결과를 만들어야 한다.

`pubg-kit`은 서버에서만 import한다. 외부 원본을 화면에 그대로 전달하지 않고 서비스가 정의한 DTO로 변환한다. 브라우저는 PUBG API나 텔레메트리 CDN을 직접 호출하지 않는다. PUBG 공식 문서도 API 키의 서버 보관을 요구한다. [API 키 보관](https://documentation.pubg.com/en/api-keys.html)

### 권장 디렉터리

```text
app/
  pages/index.vue
  pages/players/[platform]/[accountId].vue
  pages/reports/[reportId].vue
  components/search/
  components/matches/
  components/reports/
  composables/
  assets/css/main.css
server/
  api/players/search.get.ts
  api/players/[platform]/[accountId]/matches.get.ts
  api/reports/index.post.ts
  api/reports/[reportId].get.ts
  api/reports/[reportId]/events.get.ts
  api/reports/[reportId]/retry.post.ts
  adapters/pubg/
  services/
  domain/report/
  repositories/
  db/schema.ts
  db/migrations/
  utils/
shared/
  types/
  schemas/
tests/
  unit/
  integration/
  e2e/
  fixtures/
docs/
  PUBG_SQUAD_REVIEW_PRD.md
  progress.md
  validation.md
```

공유 타입에는 공개 DTO와 입력 스키마만 둔다. API 키·DB 연결·원본 텔레메트리 처리 코드를 `shared`나 `app`에 넣지 않는다. 테스트 fixture는 production client bundle에 통째로 포함하지 않는다.

## 7 PUBG 데이터 처리 규칙

### 데이터 취득과 제약

플레이어 조회에서 account ID와 match ID 목록을 얻고, 경기 조회에서 roster·participant·asset을 연결한다. 일반전과 랭크전 모두 개별 경기 조회와 텔레메트리 분석 흐름을 공유한다. 시즌 누적 랭크 통계 응답을 개별 경기 결과로 사용하지 않는다. 텔레메트리는 경기 asset에서 얻은 URL로 가져온다. SDK가 조회 기능을 제공하지만 팀 추출·정규화·화면용 분석은 이 서비스가 구현해야 한다. [pubg-kit README](https://github.com/smw0807/pubg-kit), [텔레메트리 취득](https://documentation.pubg.com/en/telemetry.html)

공식 API의 경기 보관 범위는 14일이다. 이미 저장한 리포트는 원본 조회 가능 기간과 별개로 읽을 수 있게 한다. 방금 끝난 경기는 API에 반영되기까지 시간이 걸릴 수 있으므로 실시간 분석이나 종료 직후 즉시 제공을 약속하지 않는다. [데이터 보관](https://documentation.pubg.com/en/making-requests.html#data-retention-period), [공식 FAQ](https://developer.pubg.com/faq)

### 경기 종류와 시점의 정규화

원본 필드는 match의 `attributes.matchType`, `attributes.gameMode`, `attributes.isCustomMatch`다. `gameType`라는 원본 필드가 있다고 가정하지 않는다. raw 값을 보존하고, 별도의 서비스 소유 필드 `queueType: normal 또는 ranked 또는 unknown`, `teamMode: duo 또는 squad 또는 unknown`, `perspective: tpp 또는 fpp 또는 unknown`으로 변환한다. [공식 Match 스키마](https://github.com/pubg/api-documentation-content/blob/master/swagger/en/schemas/match.yml)

- gameMode `duo`는 TPP 듀오, `squad`는 TPP 스쿼드로 해석한다. `duo-fpp`, `squad-fpp`를 비롯한 FPP 값은 거부한다. 초기 허용 gameMode는 정확히 `duo`, `squad`다. [공식 모드 사전](https://github.com/pubg/api-assets/blob/master/dictionaries/gameMode.json)
- matchType의 초기 매핑은 `official → normal`, `competitive → ranked`로 구현한다. 공식 schema의 enum은 competitive를 누락하고 있으므로 이 매핑을 문서만으로 실검증 완료라고 선언하지 않는다. T07에서 실제 일반·랭크 경기의 원본 값과 대조하고 결과를 기록한다. 사용자가 기존에 확인한 랭크 조회 가능 범위를 일반전으로 축소하지 않는다.
- `isCustomMatch = true` 또는 custom·arcade·training·event 등의 비대상 matchType은 제외한다. `normal-duo`처럼 접두사가 있는 모드를 이름만 보고 일반전으로 허용하지 않는다.
- matchType 누락·미확인 값·서로 모순되는 필드는 분류 확인 불가로 처리한다. gameMode, 참가 인원, 봇 유무 또는 시즌 랭크 통계만으로 일반·랭크를 추정하지 않는다.
- 설치한 SDK의 실제 스키마가 matchType을 보존하는지 확인하고, 좁은 `MatchType` TypeScript union에 맞추려고 competitive를 버리지 않는다. 서비스 스키마는 원본 문자열을 보존한 뒤 명시적으로 분류한다. [검토한 SDK 매치 타입](https://github.com/smw0807/pubg-kit/blob/81e5459038ddddc89a95cab4fa4d151ce77f5930/src/types/match.types.ts)

서버의 지원 판정은 `TPP && (duo 또는 squad) && (normal 또는 ranked) && 비커스텀`이다. UI 필터를 우회해 직접 report API를 호출해도 같은 판정을 적용한다. 원본은 지원 가능해 보이지만 분류가 불명확한 경우 `MATCH_CLASSIFICATION_UNKNOWN`, 명시적인 FPP·솔로·특수 경기는 `UNSUPPORTED_MATCH`로 구분한다.

정규화에는 classificationVersion을 기록한다. 분류 규칙을 바꿀 때는 보존된 raw 값으로 경기 스냅샷을 재정규화하고 analysisVersion도 올린다. 기존 리포트에는 생성 당시의 일반·랭크, 팀 모드, TPP 표시와 분류 버전을 남긴다.

### 팀 식별과 순번

검색한 account ID를 `participant.attributes.stats.playerId`에 연결하고, 그 participant 리소스 ID를 포함하는 roster를 찾는다. 해당 roster의 participant 관계를 따라 실제 팀원을 구성한다. 검색 플레이어가 없거나 팀을 유일하게 식별할 수 없으면 분석을 중단한다. 듀오는 실제 1~2명, 스쿼드는 실제 1~4명을 허용하고 누락된 팀원을 가짜 행으로 채우지 않는다. 2명이 참가한 스쿼드를 듀오로 바꾸지 않으며, 1명이 참가한 듀오·스쿼드를 솔로 모드로 바꾸지 않는다. [공식 Participant](https://github.com/pubg/api-documentation-content/blob/master/swagger/en/schemas/participant.yml), [공식 Roster](https://github.com/pubg/api-documentation-content/blob/master/swagger/en/schemas/roster.yml)

팀원 순번은 정규화된 팀원 식별자로 결정하고 리포트에 저장한다. 다른 팀원이 같은 경기 리포트를 열어도 같은 순번과 색상을 사용한다. 텔레메트리의 teamId는 보조 검증에만 쓰고 닉네임 매칭만으로 팀을 결정하지 않는다. [Character 객체](https://documentation.pubg.com/en/telemetry-objects.html#character)

### 성적표의 기준

| 지표           | 기준과 계산                                            |
| -------------- | ------------------------------------------------------ |
| 팀 순위        | match roster의 공식 순위                               |
| 개인 킬        | participant의 공식 경기 킬                             |
| 개인 피해량    | participant의 공식 `damageDealt`, 표시할 때만 반올림   |
| 개인 소생 횟수 | participant의 공식 `revives`                           |
| 개인 생존 시간 | participant의 공식 `timeSurvived`, 초를 분과 초로 표시 |
| 팀 킬          | 모든 실제 팀원의 개인 킬 합                            |
| 팀 피해량      | 모든 실제 팀원의 공식 피해량 합, 합산 후 표시 반올림   |
| 피해량 비중    | 개인 피해량 / 팀 피해량, 전체 확인값이 0이면 0%        |

일부 팀원 값이 누락되면 팀 합계를 확정값처럼 표시하지 않는다. `확인된 합계`와 누락 안내를 사용하고 비중은 숨긴다. 알 수 없는 개인 값은 `null`과 `—`로 표현한다. 텔레메트리 피해 합계가 공식 피해량과 다르더라도 공식 성적표를 덮어쓰지 않는다. 공식 지표의 의미는 [Participant 통계 정의](https://github.com/pubg/api-documentation-content/blob/master/swagger/en/schemas/participant.yml)를 따른다.

### 이벤트 정규화

내부 이벤트 종류는 `knock`, `revive`, `kill`, `damage`로 시작한다. kill 이벤트의 피해자가 우리 팀이면 UI에 사망 역할을 함께 표시한다. 출처 이벤트는 `LogPlayerMakeGroggy`, `LogPlayerRevive`, `LogPlayerKillV2`, `LogPlayerTakeDamage`다. `_D`는 발생 시각, `_T`는 이벤트 종류다. [이벤트 스키마](https://documentation.pubg.com/en/telemetry-events.html)

정규화 레코드에는 `id`, `sourceIndex`, `occurredAt`, `elapsedMs`, `kind`, `actor`, `target`, `knockMaker`, `finisher`, `assists`, `weaponCode`, `damage`, `cause`, `warnings`를 둔다. 모든 역할이 존재한다고 가정하지 않는다. 역할 객체에는 서버용 account ID와 표시용 팀원 순번·닉네임을 구분한다.

- KillV2의 killer·finisher·기절시킨 사람을 서로 다른 역할로 보존한다. finisher를 곧바로 공식 킬 획득자로 취급하지 않는다.
- 피해 이벤트는 `damage > 0`인 기록을 사용하고, 아군 공격·자해·환경 피해를 별도 원인으로 분류한다.
- 우리 팀이 행위자·대상·기절시킨 사람·마무리한 사람·어시스트 중 하나인 사건을 포함한다.
- 알 수 없는 행위자는 `확인 불가`, 알려진 환경 원인은 `환경 피해`로 표시한다. 무기 코드 사전에 없는 값도 안전하게 보존한다.
- 경기 시작 이벤트가 있으면 그 시각을 경과 시간의 기준으로 삼는다. 없으면 실제 발생 시각만 표시하고 경과 시간을 임의 추정하지 않는다.
- 같은 시각의 이벤트는 원본 배열 순번으로 정렬한다. 원본 내 같은 모양의 피해 이벤트를 단순 해시로 제거하지 않는다.
- 소생과 기절의 연결은 실제 응답의 연결 필드를 검증한 경우만 수행한다. 비슷한 시각이라는 이유로 같은 사건이라고 단정하지 않는다.
- 재배치·부활 등이 있는 경기에서 첫 사망을 최종 탈락 또는 팀 전멸로 해석하지 않는다. MVP는 전멸 시각을 계산하지 않는다.

이벤트 ID는 한 번 취득한 원본 내 위치를 기반으로 분석 버전에 종속되게 생성한다. 리포트 재분석으로 이벤트가 바뀌면 필터 페이지 커서도 무효화한다.

### 부분 리포트

`ready`는 지원 필드가 유효하고 알려진 수집·해석 누락이 없다는 상태다. 원본 API가 모든 사건을 완벽하게 담았다는 보증은 아니다. 성적표는 유효하지만 상세 기록이 실패하거나 필요한 필드가 빠진 경우는 `partial`로 저장한다.

부분 사유는 `TELEMETRY_UNAVAILABLE`, `KNOWN_EVENT_INVALID`, `MISSING_TIME_ORIGIN`, `MEMBER_STATS_MISSING`, `EVENT_LIMIT_EXCEEDED` 등으로 명시한다. 알려지지 않은 관련 없는 이벤트 종류는 건너뛸 수 있다. 알고 있는 필수 이벤트의 해석 실패는 건수와 사유를 기록하고 조용히 숨기지 않는다.

경기나 팀 식별 자체가 실패하면 부분 리포트를 만들지 않는다. DB 저장 실패도 저장 완료로 응답하지 않는다.

## 8 구현 계약

이하 API·저장 모델·제한값은 이 프로젝트의 구현 설계이며 PUBG나 Nuxt가 제공하는 보장값이 아니다.

### API 목록

| 메서드와 경로                                   | 입력                                          | 출력과 동작                                                           |
| ----------------------------------------------- | --------------------------------------------- | --------------------------------------------------------------------- |
| `GET /api/players/search`                       | `platform`, `name`                            | account ID, 표시 이름, 플랫폼, 조회 시각                              |
| `GET /api/players/:platform/:accountId/matches` | 선택적 `queueType`, `teamMode`, `cursor`      | TPP 경기 목록, 원본 확인·필터 일치·제외·미분류·실패 수, 다음 커서     |
| `POST /api/reports`                             | `platform`, `matchId`, `playerId`             | 신규 저장 201, 기존 리포트 재사용 200                                 |
| `GET /api/reports/:reportId`                    | 무작위 report ID 또는 예약된 샘플 ID          | 요약·팀원·품질·revision·재시도 가능 여부, 원본 텔레메트리는 제외      |
| `GET /api/reports/:reportId/events`             | 선택적 `kinds`, `memberNo`, `cursor`, `limit` | 필터된 이벤트, 전체 건수, 다음 커서                                   |
| `POST /api/reports/:reportId/retry`             | report ID만 사용                              | 저장된 경기·팀 기준으로 부분 리포트 재분석, 갱신 또는 유지된 결과 200 |

성공 응답은 `{ data, meta }`, 실패 응답은 `{ error: { code, message, retryable, retryAfterSeconds? }, requestId }`로 통일한다. `meta`에는 필요한 경우 `source: live 또는 demo`, `fetchedAt`, `quality`, `revision`을 포함한다. 리포트의 출처는 현재 실행 모드가 아닌 저장된 source를 사용한다. 성공 상태나 0건 목록으로 네트워크 실패를 감추지 않는다.

오류 코드는 최소한 `INVALID_INPUT` 400, `PLAYER_NOT_FOUND` 404, `MATCH_UNAVAILABLE` 404, `REPORT_NOT_FOUND` 404, `SNAPSHOT_EXPIRED` 409, `PLAYER_NOT_IN_MATCH` 422, `UNSUPPORTED_MATCH` 422, `MATCH_CLASSIFICATION_UNKNOWN` 422, `RATE_LIMITED` 429, `ANALYSIS_BUSY` 429, `UPSTREAM_ERROR` 502, `UPSTREAM_TIMEOUT` 504, `SERVER_MISCONFIGURED` 503, `STORAGE_ERROR` 503을 구분한다. 실제 PUBG 인증 실패를 사용자 로그인 실패로 표현하지 않는다.

경기 목록의 `queueType`은 `all`, `normal`, `ranked`, `teamMode`는 `all`, `duo`, `squad`만 허용하고 각각 all이 기본이다. perspective 선택 입력은 제공하지 않고 서버에서 TPP만 허용한다. 잘못된 필터는 400으로 거부한다. 일반·랭크와 팀 모드의 정규화 값 및 classificationVersion을 목록 DTO와 보고서 요약에 포함한다.

경기 목록 커서는 조회 당시 ID 목록 스냅샷과 다음 원본 위치, 선택 필터를 가리킨다. 현재 플랫폼·account ID·필터와 일치하는지, 유효 기간 안인지 검증한다. 스냅샷 또는 필터가 바뀐 상태에서 예전 커서를 조용히 재해석하지 않는다. 한 요청에서 원본 ID 최대 20개만 처리하며 필터로 반환 항목이 줄어도 자동으로 더 많은 원본을 읽지 않는다. 다음 원본 ID가 남아 있으면 빈 목록에도 nextCursor를 반환한다. 읽지 못한 ID를 실패 목록으로 유지하고 동일 묶음 재요청으로 회복할 수 있게 한다.

커서 없이 플레이어 URL에 직접 접근하면 유효한 스냅샷을 먼저 찾고, 없으면 account ID로 플레이어를 조회해 새 스냅샷을 만든다. 검색 결과에서 이동한 경우에는 이미 생성한 스냅샷을 재사용한다. 표시 이름도 응답에 포함하므로 새로고침에 이전 화면 상태가 필요하지 않다. ID로 직접 조회한 스냅샷의 requested_name은 null을 허용한다.

이벤트 페이지 크기는 기본 50, 최대 100이다. `kinds` 생략 시 `knock,revive,kill`이며, UI의 전체 선택은 `knock,revive,kill,damage`를 보낸다. `memberNo` 필터는 actor·target·knockMaker·finisher·assists 전체 역할을 검사한다. 커서에는 리포트 revision과 필터 조건이 연결되어야 한다. 재분석으로 revision이 바뀌면 409와 함께 첫 페이지를 다시 읽도록 안내한다. 응답에 전체 원본 이벤트를 한꺼번에 넣지 않는다.

리포트 GET에는 `retry: { available, notBefore, reason }`을 포함한다. 공유 링크로 들어온 사용자도 report ID만으로 재시도할 수 있고, playerId를 다시 알 필요가 없다. 서버는 저장된 경기와 roster를 사용한다. 샘플 보고서, 현재 분석 버전과 다른 보고서, 이미 ready인 보고서는 재시도를 비활성화한다. 쿨다운 중에는 429와 재시도 시각을 제공한다.

### 리포트 생성 순서

1. 플랫폼·ID·요청 크기를 검증하고 서비스 호출 제한을 적용한다.
2. 저장된 경기 메타데이터를 먼저 찾고, 없으면 공식 경기 데이터를 조회한다.
3. 원본에서 일반·랭크, 듀오·스쿼드, TPP 지원 조건을 검증하고 playerId → participant → roster 관계로 팀을 찾는다. 클라이언트가 보낸 분류값으로 지원 판정을 대체하지 않는다.
4. `(source, platform, matchId, rosterId, analysisVersion)`의 기존 리포트가 있으면 재사용한다.
5. 같은 키의 진행 중 요청은 하나의 Promise를 공유한다. 다른 경기 분석으로 서버 한도가 찼으면 즉시 429를 반환한다.
6. 경기 성적표를 만들고, 검증된 asset URL의 텔레메트리를 읽어 필요한 이벤트만 정규화한다.
7. 품질 상태와 경고를 계산한다. 유효한 성적표만 얻은 경우에는 부분 리포트가 가능하다.
8. DB에 원자적으로 저장한다. unique 충돌이면 이미 저장된 리포트를 읽는다.
9. 저장된 report ID와 품질 상태를 반환하고 화면은 해당 URL로 이동한다.

같은 Promise를 기다리는 요청 하나의 연결 종료가 다른 요청의 작업을 취소하지 않도록 한다. 공유 작업 자체의 제한 시간과 참조 정리 정책을 두고, 실패·종료 시 진행 중 맵을 반드시 제거한다.

완료 리포트의 일반 재요청은 분석을 다시 실행하지 않는다. 부분 리포트만 retry API로 다시 시도할 수 있고, 최소 60초 간격을 적용한다. 다시 시도하는 동안 기존 결과는 유지한다. 개선된 결과를 저장할 때 같은 report ID를 유지하고 revision을 증가시킨다. 실패한 재시도가 정상 리포트를 덮어쓰면 안 된다. 분석 버전이 달라지면 기존 보고서를 그대로 보존하고 일반 생성 API에서 새 버전 보고서를 만든다.

MVP에는 영속 작업 큐와 `202 accepted` 기반 백그라운드 처리를 넣지 않는다. 서버는 요청 안에서 작업을 기다린다. 프로세스 재시작으로 작업이 중단되면 이후 같은 요청을 안전하게 다시 처리할 수 있어야 한다. 브라우저 재요청은 같은 보고서 키로 수렴하며 새 보고서가 계속 생기지 않는다.

### 저장 모델

초기에는 아래 세 테이블과 JSONB 문서로 충분하다. 이벤트마다 별도 관계형 테이블을 만들거나 검색 엔진을 도입하지 않는다.

| 테이블             | 주요 필드                                                                                                                                                                                             | 제약과 용도                                                                           |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `player_snapshots` | id, source, platform, account_id, requested_name, display_name, match_ids JSONB, fetched_at, expires_at                                                                                               | source를 포함해 검색 재사용, 5분 스냅샷, 커서의 기준                                  |
| `match_snapshots`  | source, platform, match_id, created_at, map_name, raw_game_mode, raw_match_type, queue_type, team_mode, perspective, classification_version, is_custom, participants JSONB, rosters JSONB, fetched_at | `(source, platform, match_id)` unique, 원본 분류값·정규화 메타데이터·공식 통계 재사용 |
| `reports`          | id UUID, source, platform, match_id, roster_id, analysis_version, revision, quality, summary JSONB, members JSONB, events JSONB, warnings JSONB, generated_at, updated_at, last_retry_at              | source를 포함한 분석 키 unique, 경기 스냅샷 참조, 저장 결과의 단일 원본               |

`quality`는 `ready` 또는 `partial`이다. events JSONB는 우리 팀과 관련된 정규화 이벤트만 담는다. summary에는 생성 당시 queueType, teamMode, perspective, classificationVersion을 포함한다. summary와 members의 shape는 공통 스키마로 검증한다. JSONB를 타입 검증 없이 `any`로 사용하지 않는다. 날짜는 `timestamptz`로 저장한다.

source는 제공자 어댑터가 정하고 클라이언트 입력으로 덮어쓸 수 없다. 모든 스냅샷·리포트 조회와 캐시 키에 source를 포함한다. 실행 모드를 바꿔도 저장 출처를 바꾸지 않는다. DB에서 읽은 demo 리포트는 live 실행 중에도 샘플 표시를 유지하며 실제 API로 재분석하지 않는다.

원본 텔레메트리는 장기 저장하지 않는다. 처리 후 참조를 해제하고, 보고서용 최소 데이터만 보관한다. 경기 스냅샷에는 임시 CDN URL·인증 헤더·원본 전체 응답을 저장하지 않는다. 재분석할 때 필요하면 공식 매치에서 asset URL을 다시 얻는다.

MVP는 저장된 리포트를 자동 삭제하지 않는다. 만료된 검색 스냅샷은 조회에서 배제하고 제한된 개수의 정리 작업으로 지울 수 있다. 운영 공개 전 데이터 보관 기간과 관리자 삭제 절차를 README에 정한다. 원본이 보관 기간을 지나 재분석할 수 없어도 기존 리포트 열람은 가능해야 한다.

### SDK 어댑터에서 확인할 사항

2026년 10월 4일 공개 main 소스 검토 기준으로 SDK의 공통 요청 인터셉터는 모든 요청에 내장 limiter를 적용한다. 텔레메트리 `get`은 원본 응답을 반환하고, `getEvents`는 이벤트 종류 필터와 타입 단언을 사용한다. **README의 타입 지원을 텔레메트리 전체의 런타임 검증으로 해석하지 않는다.** 구현 시작 시 설치한 npm 버전에서 이 동작을 다시 확인한다. [확인한 SDK 클라이언트](https://github.com/smw0807/pubg-kit/blob/81e5459038ddddc89a95cab4fa4d151ce77f5930/src/client/pubg.client.ts), [텔레메트리 구현](https://github.com/smw0807/pubg-kit/blob/81e5459038ddddc89a95cab4fa4d151ce77f5930/src/resources/telemetry.resource.ts)

이 프로젝트의 기본안은 SDK의 `rateLimit: false`, `cache: false`와 서비스 수준 호출 제어다. **이 설정 변경과 서버의 제한 대상 제어는 같은 단계에서 구현·검증한다.** 제한기를 끈 클라이언트를 화면이나 임의 서비스에 노출하지 않는다. 메타데이터는 DB에서 재사용하고, 원본 텔레메트리가 SDK의 장기 메모리 캐시에 누적되지 않게 한다. [SDK 캐시 구현](https://github.com/smw0807/pubg-kit/blob/81e5459038ddddc89a95cab4fa4d151ce77f5930/src/utils/cache.ts)

Zod로 `unknown` 입력의 최상위 배열과 필요한 이벤트별 최소 필드를 검증한다. 새로운 이벤트 종류나 추가 필드를 허용하되, 사용 중인 필드의 잘못된 타입을 숨기지 않는다. SDK 타입에 빠진 필드는 서비스 소유의 타입으로 정규화하고, 수정 없이 무조건 통과하는 타입 단언으로 덮지 않는다.

텔레메트리 전송에 인증 헤더 제거·취소·리다이렉트 제어·용량 제한이 SDK로 보장되지 않으면, **텔레메트리 다운로드를 좁은 서버 전용 fetch 어댑터로 보완**한다. 플레이어·매치의 정상 조회는 pubg-kit을 유지한다. 이 예외의 이유와 검증 결과를 docs/validation.md에 기록한다.

별도의 호환 예외는 매치 스키마 검증 실패다. 확인한 SDK는 `matches.get()`에서 엄격한 schema parse를 하므로, 통계 필드 누락이 있으면 원본 반환 전에 실패할 수 있다. 이 경우에 한해 SDK의 공개 HTTP 접근 기능 또는 공식 match 엔드포인트에 한정한 서버 요청으로 원본을 받아 서비스의 최소 스키마로 검증한다. 네트워크·인증·429 오류를 이 예외로 재요청하지 않는다. 같은 timeout·동시성·인증 범위를 적용하며, 팀 식별 필드가 없는 응답을 억지로 정상화하지 않는다. [확인한 매치 구현](https://github.com/smw0807/pubg-kit/blob/81e5459038ddddc89a95cab4fa4d151ce77f5930/src/resources/matches.resource.ts)

## 9 호출 제어와 배포 기준

공식 기본 제한은 API 키당 분당 10회이며 matches·telemetry는 해당 제한에서 제외된다. 이를 사용자 IP당 10회로 잘못 구현하지 않는다. [공식 호출 제한](https://documentation.pubg.com/en/rate-limits.html)

### 초기 보호값

아래 수치는 외부 서비스 보장이나 성능 측정값이 아닌 초기 설정이다. fixture와 실데이터 측정 후 근거를 남기고 조정할 수 있다.

| 항목                 | 초기값                                  | 정책                                                                |
| -------------------- | --------------------------------------- | ------------------------------------------------------------------- |
| PUBG 제한 대상 요청  | API 키당 60초 이동 구간 최대 10회       | 캐시 miss인 players 요청부터 적용, 초과 시 대기열 대신 429          |
| 경기 메타데이터 요청 | 프로세스 전체 동시 3개, 대기 최대 20개  | 초과 작업은 429, 목록은 요청당 최대 20개 ID, 전체 자동 fan-out 금지 |
| 텔레메트리 분석      | 프로세스 전체 동시 1개                  | 같은 분석은 합치고 다른 분석은 429와 재시도 안내                    |
| 서비스 쓰기 호출     | 클라이언트당 리포트 생성·재시도 1분 5회 | 중복 요청도 보호값 적용, 실제 배포의 신뢰 가능한 IP 설정 확인       |
| 외부 요청 timeout    | 요청당 10초                             | 취소를 지원하는 전송 계층 사용, 자동 무한 재시도 금지               |
| API 처리 예산        | 요청당 30초                             | 목록은 확인된 결과와 실패 ID, 보고서는 가능하면 부분 결과           |
| 텔레메트리 용량      | 압축 해제 후 32 MiB                     | JSON 파싱 전에 제한, 초과 시 부분 리포트와 사유                     |
| 정규화 이벤트        | 리포트당 최대 20,000개                  | 잘린 결과를 완전한 결과로 표시하지 않음                             |
| 검색 스냅샷          | 5분                                     | 재사용 여부와 조회 시각 표시                                        |

재시도 시각은 가능한 경우 upstream의 제한 관련 응답을 반영한다. 브라우저가 자체 무한 재시도나 빠른 폴링을 하지 않도록 한다. 서버의 실행 시간이 제한을 넘으면 가능한 요청을 취소하고 진행 중 맵·동시성 슬롯을 해제한다. `Promise.race`로 응답만 중단하고 원본 요청·분석을 계속 누적시키지 않는다.

이 설계의 메모리 제한기와 진행 중 요청 합치기는 **단일 프로세스 내부에서만** 유효하다. 같은 API 키를 다른 앱이나 개발 프로세스에서 함께 사용하면 전체 한도를 보장할 수 없다. 서비스 전용 키를 기본으로 하고, 공유가 필요하면 중앙에서 제한을 관리한다.

### 배포 선택

로컬과 첫 운영 검증은 Nitro `node-server` 단일 프로세스를 기준으로 한다. Nuxt는 Node 서버와 서버리스 등 여러 배포 형태를 지원하지만, 같은 코드가 모든 환경에서 같은 작업 시간을 보장하지는 않는다. 정적 파일만 배포하는 `generate` 구성으로는 이 서버 API를 운영하지 않는다. [Nuxt 배포 문서](https://nuxt.com/docs/4.x/getting-started/deployment)

서버리스나 다중 replica를 선택하려면 출시 전에 실행 시간·메모리·DB 연결 수를 확인하고, API 키 기준 공유 제한과 분석 중복 제어를 추가한다. 제한을 초과하는 분석이 관찰되면 Nuxt는 API와 화면을 유지하고 분석만 별도 워커로 옮기는 순서로 확장한다. 처음부터 분리를 전제로 관련 패키지를 설치하지 않는다.

## 10 비밀값과 공유 데이터

`runtimeConfig`의 비공개 항목에 PUBG API 키와 DB 연결 문자열을 둔다. `runtimeConfig.public`에는 넣지 않는다. `.env.example`에는 빈 값 또는 명시적 placeholder만 넣고 `.env`는 Git에서 제외한다. [Nuxt runtimeConfig](https://nuxt.com/docs/4.x/getting-started/configuration)

```dotenv
# runtimeConfig.pubgApiKey, databaseUrl, dataMode에 대응한다.
NUXT_PUBG_API_KEY=
NUXT_DATABASE_URL=
NUXT_DATA_MODE=demo
```

`dataMode`는 서버 설정이며 `demo` 또는 `live`만 허용한다. demo는 API 키가 없어도 실행되며 외부 PUBG 호출을 하지 않는다. live에서 키가 없거나 인증이 실패하면 명확히 실패한다. 샘플로 자동 대체하지 않는다. PostgreSQL이 필요한 통합 흐름은 로컬 Docker Compose로 제공한다.

홈의 샘플 버튼은 기본으로 `/reports/demo-normal-squad`를 연다. 샘플 화면에서 `demo-normal-duo`, `demo-normal-squad`, `demo-ranked-duo`, `demo-ranked-squad` 네 예약 ID를 선택할 수 있게 한다. 이 ID들은 report GET과 events GET에서만 허용하며 서버의 고정 fixture에서 공개 DTO를 반환한다. live 실행 중에도 이 읽기 전용 샘플을 제공하고, 항상 source=demo를 표시한다. 랭크 듀오 샘플이 실제 플랫폼의 해당 큐 제공을 증명하는 것은 아니다. 샘플의 실제 데이터 재분석은 불가능하다. demo 모드에서 생성·저장하는 리포트는 일반 UUID와 source=demo를 사용해 저장 경로도 검증한다.

텔레메트리 URL은 공식 경기 asset에서만 가져온다. 공개 API는 URL을 입력받지 않는다. HTTPS와 정확한 허용 hostname을 검사하고, 다른 호스트로의 리다이렉트는 거부하거나 매 단계 재검증한다. 기본 허용 호스트는 공식 문서 예시의 `telemetry-cdn.pubg.com`이며, 추가 호스트는 실데이터와 공식 근거를 확인해 설정한다. 인증 키는 PUBG API 요청에만 사용하고 텔레메트리 다운로드에는 전달하지 않는다.

공유는 무작위 UUID 리포트 URL을 가진 사람이 조회하는 방식이다. 암호화된 비공개 공유나 사용자 소유권을 제공하지 않는다. 생성된 URL은 복사 버튼을 누르기 전에도 접근 가능하다. 화면에 `링크를 아는 사람은 리포트를 볼 수 있어요`라고 안내한다. 공개 리포트 검색·목록 API와 검색엔진 인덱싱은 제공하지 않고 리포트에 noindex를 적용한다. noindex를 접근 제어로 설명하지 않는다.

화면과 로그에 Bearer 헤더, DB URL, 원본 텔레메트리를 출력하지 않는다. 서버 로그는 request ID, 처리 시간, upstream 호출 수, 캐시 재사용, 분석 버전, 품질 사유 등 운영에 필요한 항목을 남긴다. 에러 응답에 stack trace를 포함하지 않는다.

## 11 구현 순서

한 단계의 완료 조건을 확인한 뒤 다음 단계로 진행한다. 기간은 실제 작업 속도와 데이터 확인에 따라 달라지므로 고정 일정으로 약속하지 않는다.

| 단계                 | 작업                                                                                    | 완료 조건                                                                     |
| -------------------- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| T01 기반과 계약      | Nuxt·Nuxt UI·Tailwind·TypeScript 설정, 버전 고정, 환경변수, DTO, fixture, SDK 특성 확인 | dev·typecheck·build가 동작하고 SDK 검토 내용을 기록                           |
| T02 화면과 데모      | 3화면, 일반·랭크와 팀 모드 필터, 네 조합 샘플, 테마·오류·부분 상태                      | API 키 없이 네 조합의 사용자 흐름과 1인칭 제외를 시연                         |
| T03 저장 모델        | PostgreSQL Compose, Drizzle schema·migration, Repository                                | 빈 DB 마이그레이션과 리포트 재조회·unique 제약 검증                           |
| T04 데이터 어댑터    | 플레이어·매치·텔레메트리, 분류 정규화, 제한·취소·URL 검증                               | mock으로 일반·랭크/듀오·스쿼드 허용과 FPP·솔로 거부 검증                      |
| T05 분석과 생성      | 순수 분석기, 공식 통계·이벤트 분리, 부분 결과, 단건 재사용                              | F04~F07·F09와 핵심 분석 fixture 검증                                          |
| T06 통합과 공유      | 화면에 실제 API 연결, 필터 pagination, 공유 직접 접근                                   | 브라우저 E2E와 생산 빌드의 Nitro 경로 점검                                    |
| T07 실제 데이터 검증 | 실제 일반·랭크 matchType 대조, 조합별 검증, 시간·용량 측정                              | raw 분류 매핑을 확인하고 플랫폼·조합별 검증 또는 데이터 없음·미검증 상태 기록 |

유효한 PUBG 키가 없어도 T01~T06은 진행할 수 있다. 키를 채팅이나 소스에 요청해서 붙여넣게 하지 말고 로컬 비밀 환경변수로 설정하는 방법을 안내한다. 키 없이 T07이 통과했다고 보고하지 않는다. 구현 저장소 생성과 공개 배포는 이 문서 작성 작업에 포함되지 않는다.

## 12 수용 기준과 검증

### 기능과 데이터

| 기준 | 검증해야 할 동작                                                                                            | 관련 기능   |
| ---- | ----------------------------------------------------------------------------------------------------------- | ----------- |
| AC01 | steam·kakao 검색, 공백 정리, 대소문자 유지, 잘못된 플랫폼 거부                                              | F01         |
| AC02 | 뒤섞인 match ID의 실제 시각 정렬, 부분 목록의 원본 확인 수와 필터 일치 수 구분                              | F02         |
| AC03 | roster 연결, 듀오 1~2명·스쿼드 1~4명 처리, 2인 스쿼드를 듀오로 오분류하지 않음                              | F03         |
| AC04 | 공식 stats로 개인·팀 값을 계산, 값 누락과 실제 0을 구분                                                     | F04         |
| AC05 | killer·finisher·기절 유발자가 다른 사건과 환경 사망을 정확히 표시                                           | F05         |
| AC06 | 동일 시각·중복처럼 보이는 피해·새 이벤트 종류·잘못된 필드에 안정적 결과                                     | F05·F09     |
| AC07 | 소생·재배치 기록을 최종 전멸로 오해하지 않고 시작 시각 누락을 표시                                          | F05·F09     |
| AC08 | 기본 주요 이벤트·전체 필터 의미 일치, 어시스트만 참여한 팀원 필터, 더 보기와 revision 검증                  | F06         |
| AC09 | 서로 다른 클라이언트의 같은 경기·팀 10개 동시 요청이 하나의 분석·저장으로 수렴, 같은 클라이언트 6번째는 429 | F07         |
| AC10 | 새로고침·서버 재시작 후 같은 URL로 저장 결과 확인, 저장 실패는 실패 응답                                    | F07·F08     |
| AC11 | 텔레메트리 실패 시 성적표 유지, 공유 URL에서 재시도와 60초 제한, 실패가 기존 정상 결과를 훼손하지 않음      | F09         |
| AC12 | 복사 성공과 거부 양쪽 처리, 새 브라우저의 직접 공유 접근                                                    | F08         |
| AC13 | demo 외부 호출 0회, live 오류에 샘플 대체 없음, 모드 전환 후 기존 demo URL의 샘플 표시 유지                 | F10         |
| AC14 | 360px·768px·1440px에서 듀오·스쿼드 성적표와 다크·라이트 확인, 듀오에 빈 팀원 칸 없음                        | F10         |
| AC15 | 키보드 검색·필터·공유, 포커스와 이름, 대비, 누락 안내 확인                                                  | F06·F08·F10 |

### 서버와 운영 경계

| 기준 | 검증해야 할 동작                                                                               |
| ---- | ---------------------------------------------------------------------------------------------- |
| AC16 | 가짜 시간으로 제한 대상의 60초 내 11번째 요청 차단, matches·telemetry의 동일 제한 제외         |
| AC17 | 프로세스 전체 메타데이터 동시 3개·분석 1개, 중복 합치기, 실패 후 슬롯 해제                     |
| AC18 | 임의 telemetry URL·비HTTPS·다른 호스트 redirect 거부, 텔레메트리에 Authorization 미전달        |
| AC19 | timeout과 용량 초과 시 요청 취소·정리, 부분 상태 또는 명확한 오류 반환                         |
| AC20 | 브라우저 bundle·SSR HTML·payload·로그·Git에 비밀값 canary가 없음                               |
| AC21 | `pubg-kit`이 서버 런타임 의존성으로 설치되고 build 후 실제 Nitro API 호출 성공                 |
| AC22 | 실제 일반·랭크의 raw 분류값 및 플랫폼·조합별 결과를 기록, 시간·메모리·크기와 fixture/live 구분 |
| AC23 | 네 TPP 조합 fixture의 조회·분석 성공, FPP·솔로·특수 경기의 목록 제외와 직접 report POST 거부   |
| AC24 | 일반·랭크와 팀 모드 교차 필터·URL 복원·커서 변경 검증, 부분 조회 0건과 전체 범위 0건 구분      |

### 테스트 구성

- Vitest 단위 테스트는 팀 식별·통계 계산·이벤트 의미·정렬·부분 상태·제한기의 경계를 검증한다.
- PostgreSQL 통합 테스트는 마이그레이션·unique 제약·원자적 저장·재조회·경쟁 요청을 검증한다.
- Playwright는 검색부터 공유까지의 데스크톱·모바일 핵심 흐름과 오류 회복을 검증한다.
- 일반 듀오·일반 스쿼드·랭크 듀오·랭크 스쿼드 TPP fixture를 준비한다. FPP 듀오·FPP 스쿼드·솔로·커스텀·matchType 누락·미확인 값도 포함한다.
- 정상 2인·4인, 1인 듀오, 2인 스쿼드, 0 피해, 일부 통계 누락, 환경 사망, 서로 다른 처치 역할, 시작 시각 없음, 텔레메트리 실패, 429, timeout, 긴 닉네임을 검증한다.
- fixture의 닉네임과 식별자는 합성 값으로 만들고 실제 API 키·플레이어 원본 파일을 저장소에 커밋하지 않는다.
- 처음부터 모든 UI 마크업을 snapshot 테스트하지 않는다. 의미가 있는 계산과 실제 사용자 흐름을 우선한다.

프로젝트에는 `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:integration`, `pnpm test:e2e`, `pnpm build`, `pnpm db:migrate` 스크립트를 제공한다. README에 DB 시작·환경변수·데모 실행·라이브 검증 방법을 기록한다.

### 성능과 출시 판단

초기 성능 목표는 저장된 리포트 API p95 500ms 이내, 신규 단일 경기 분석 30초 예산 이내다. 이는 측정 전 목표이며 사용자 인터넷 환경까지 포함하는 SLA가 아니다. 테스트 머신, 데이터 크기, 동시 요청 수, DB 위치를 함께 기록한다. 허용 용량 안의 큰 fixture에서 peak RSS와 이벤트 수를 측정한다.

실데이터 확인은 초기 5경기를 목표로 하되 일반전과 랭크전을 모두 포함하고, 실제 접근 가능한 듀오·스쿼드 조합을 각각 확인한다. 플랫폼별 네 조합에 대해 `실데이터 검증 완료 / 조회 범위에 데이터 없음 / 미검증`을 기록한다. 랭크 듀오 등 실제 기록을 확보하지 못한 조합도 제품의 구현 범위는 유지하고 fixture 검증만 통과했다는 사실을 분리한다. 미확인 플랫폼·조합을 실검증 완료로 홍보하지 않는다. 분석 데이터가 길거나 커서 목표를 넘으면 통계만 저장한 부분 결과와 실패 사유를 확인하고, 용량값 조정 또는 워커 분리의 근거로 삼는다.

MVP 완료는 **데모와 자동 검증을 통과한 구현 완료**와 **실제 키·선택 배포 환경까지 확인한 운영 검증 완료**로 나눠 보고한다. 이 PRD를 최초 작성할 당시에는 둘 다 미실시였다. 이후 구현·검증 상태는 [구현 진행](progress.md)과 [검증 기록](validation.md)에 별도로 기록한다.

## 13 Codex 인계와 변경 원칙

최초 인계에서는 새 저장소의 `docs/PUBG_SQUAD_REVIEW_PRD.md`에 이 문서를 넣고 함께 제공한 시작 프롬프트를 Codex 작업에 전달했다. 그 요청 원문은 현재 [docs/archive/CODEX_START_PROMPT.md](archive/CODEX_START_PROMPT.md)에 보관한다. 현재 저장소에서 새 작업을 시작할 때 초기 구현 지시를 다시 실행하는 용도로 사용하지 않는다.

구현 중 발견한 실제 스키마 차이·의존성 호환성·실행환경 제한은 `docs/progress.md`와 `docs/validation.md`에 근거를 남기고 이 문서와 충돌하는 부분을 좁게 수정한다. 기능이 어렵다는 이유로 샘플만 보여주거나 임의 데이터로 라이브 성공을 꾸미지 않는다. 반대로 구현에 필요하지 않은 로그인·작업 큐·서비스 분리를 추가하지 않는다.

`docs/progress.md`는 단계별 완료·진행·차단 상태와 다음 작업을 기록한다. `docs/validation.md`는 명령, 실제 결과, fixture 또는 live 구분, 사용한 의존성 버전, 테스트 환경, 남은 검증을 기록한다. 매 단계 사용자 승인을 반복 요청할 필요 없이 승인된 MVP 범위에서 이어서 구현한다. 공개 배포·유료 리소스 생성·기존 데이터 삭제는 별도 지시를 따른다.

### 문서 검토 결과와 남은 확인

이 기획서는 최초 작성 당시 대화에서 확정한 Nuxt 서버·pubg-kit·Nuxt UI 선택과 공개 공식 문서·SDK 소스 검토를 반영했다. 당시 SDK main 소스의 관찰만으로 설치할 npm 버전의 동작을 보증할 수 없었으므로 T01에서 재확인하도록 정했다. 최신 버전 번호를 추측해 고정하지 않는 원칙은 유지한다. 이후 설치본 확인 결과는 [검증 기록](validation.md)에 있다.

최초 작성 당시 미확인 항목은 실제 경기별 필드 가용성, 플랫폼별 일반·랭크 식별값과 조합별 실데이터, 실제 다운로드 크기와 분석 시간, 호스팅 제약, 최종 접근성 렌더 검증이었다. 이 항목들은 구현을 멈출 이유가 아니라 각 단계의 검증 대상으로 정했다. 현재 확인한 범위와 아직 남은 항목은 [검증 기록](validation.md)을 기준으로 구분하며, 일부 플랫폼·조합의 결과를 전체 실연동이나 운영 검증 완료로 확대하지 않는다.

## 14 근거 자료

외부 제공 기능과 제약은 아래 자료를 기준으로 확인했다. 이 문서의 화면 구성·API 경로·DB 구조·제한값·MVP 범위는 프로젝트 설계 결정이다.

- [pubg-kit 공식 저장소와 README](https://github.com/smw0807/pubg-kit)
- [확인한 pubg-kit 클라이언트 소스](https://github.com/smw0807/pubg-kit/blob/81e5459038ddddc89a95cab4fa4d151ce77f5930/src/client/pubg.client.ts)
- [공식 Player 스키마](https://github.com/pubg/api-documentation-content/blob/master/swagger/en/schemas/player.yml)
- [공식 Match 스키마](https://github.com/pubg/api-documentation-content/blob/master/swagger/en/schemas/match.yml)
- [공식 게임 모드 사전](https://github.com/pubg/api-assets/blob/master/dictionaries/gameMode.json)
- [공식 Participant 통계 스키마](https://github.com/pubg/api-documentation-content/blob/master/swagger/en/schemas/participant.yml)
- [공식 Roster 스키마](https://github.com/pubg/api-documentation-content/blob/master/swagger/en/schemas/roster.yml)
- [PUBG 텔레메트리 취득](https://documentation.pubg.com/en/telemetry.html)
- [PUBG 이벤트 스키마](https://documentation.pubg.com/en/telemetry-events.html)
- [PUBG 객체 스키마](https://documentation.pubg.com/en/telemetry-objects.html)
- [PUBG 호출 제한](https://documentation.pubg.com/en/rate-limits.html)
- [PUBG 조회 범위](https://documentation.pubg.com/en/making-requests.html#data-retention-period)
- [PUBG API 키](https://documentation.pubg.com/en/api-keys.html)
- [PUBG FAQ](https://developer.pubg.com/faq)
- [Nuxt 서버](https://nuxt.com/docs/4.x/getting-started/server)
- [Nuxt 설정](https://nuxt.com/docs/4.x/getting-started/configuration)
- [Nuxt 배포](https://nuxt.com/docs/4.x/getting-started/deployment)
- [Nuxt UI 공식 컴포넌트](https://github.com/nuxt/ui/tree/v4/src/runtime/components)
- [Nuxt UI 패키지와 라이선스](https://github.com/nuxt/ui/blob/v4/package.json)
