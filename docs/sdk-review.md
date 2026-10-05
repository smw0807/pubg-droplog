# pubg-kit 설치본 검토

검토일: 2026-10-04. `pubg-kit@1.4.4` npm 배포본과 로컬 합성 fixture를 확인한 기록이다. 아래 SDK 관찰은 이 버전에 한정되며, 문서 정리 과정에서 외부 요청이나 테스트를 다시 실행하지 않았다. 실행·검증 명령은 [개발 가이드](development.md), 실제 경기 확인 결과는 [검증 기록](validation.md)을 따른다.

## 고정 버전과 확인 방법

- `pubg-kit@1.4.4`를 npm registry에서 확인하고 배포 tarball을 내려받아 `dist/index.js` 및 선언 파일을 직접 읽었다. [package.json](../package.json)의 서버 런타임 의존성과 [lockfile](../pnpm-lock.yaml)에 같은 버전을 고정했다.
- 동일 버전의 메타데이터 재확인 명령: `npm view pubg-kit@1.4.4 version dist.tarball engines dependencies --json`
- `npm pack pubg-kit@1.4.4 --pack-destination /private/tmp`
- tarball SHA-1: `8890a373d62c3283ea9d2ff351558436c3b2135c`
- SDK는 Axios `^1.7.2`, Zod `^3.23.8`, lru-cache `^11.0.0`에 의존한다. 앱의 Zod 4와 SDK 내부 Zod 3은 별도이므로 SDK의 스키마 오류는 `instanceof`를 공유한다고 가정하지 않는다.
- [Nuxt 설정](../nuxt.config.ts)은 `nitro.externals.inline: ['zod']`로 두 해석본을 번들에 포함한다. 과거 생산 번들에서 두 버전이 하나로 합쳐지는 오류를 수정했으며, 빌드 성공과 실제 Nitro API 실행 검증을 구분한다.

## 설치본에서 확인한 동작

| 항목          | 배포본 관찰                                                                                                                                               | 서비스 적용                                                                                                                                                                |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| limiter       | 공통 Axios request interceptor에서 모든 요청을 제한하고 초과 요청을 내부 큐에서 대기시킨다.                                                               | `rateLimit:false`; 플레이어 조회만 프로세스 공유 API 키 SHA-256 기준 이동 구간 10회/60초, 초과 시 429.                                                                     |
| 캐시          | 기본 활성화; match와 telemetry는 `Infinity` TTL로 저장한다.                                                                                               | `cache:false`; 리포지토리에서 필요한 정규화 데이터만 저장한다.                                                                                                             |
| 플레이어 이름 | `getByNames`가 배열을 쉼표로 합쳐 URL에 직접 삽입한다.                                                                                                    | 양끝 공백만 제거하고 대소문자 보존, 단일 이름을 URI 인코딩한 뒤 SDK에 전달한다.                                                                                            |
| 플레이어 검증 | `getByNames`는 Zod parse를 수행하지만 `getById`는 `data.data`를 그대로 반환한다.                                                                          | 두 경우 모두 서비스 최소 schema로 다시 검증한다.                                                                                                                           |
| 매치 검증     | `matches.get`이 필수 통계 필드를 포함하는 엄격한 schema parse를 수행한다.                                                                                 | 정상 경로는 SDK. 실제 `ZodError`일 때만 동일 공식 match 경로의 `getHttp().get`으로 raw 응답을 재조회한다. 누락 통계는 서비스 normalizer에서 `null`.                        |
| 오류와 헤더   | SDK 오류 변환 시 응답 헤더와 원래 Axios 오류 문맥을 잃는다.                                                                                               | `getHttp()` 응답 interceptor에서 먼저 안전한 `ApiError`로 변환하며 `Retry-After` 또는 rate limit reset을 보존한다. 오류 본문·인증키·Axios config는 외부에 전달하지 않는다. |
| 취소          | SDK resource 함수에는 signal 매개변수가 없다. `getHttp()`가 Axios instance를 공개한다.                                                                    | 작업별 SDK instance를 만들고 `http.defaults.signal`을 붙인다. 10초 타이머 및 부모 신호가 실제 전송을 중단하며 작업 종료 시 타이머를 해제한다.                              |
| telemetry     | SDK는 인증 헤더가 있는 같은 Axios instance로 임의 URL을 요청하고 `baseURL`만 비운다. `getEvents`는 `_T` 필터만 수행하며 이벤트 필드의 런타임 검증은 없다. | SDK telemetry 함수는 호출하지 않는다. 제한된 서버 fetch 경로를 사용하고 이후 순수 분석기가 unknown 이벤트를 검증한다.                                                      |

[서버 어댑터](../server/adapters/pubg.ts)는 매치 메타데이터 요청을 프로세스 공유 동시 3개/대기 20개로 제한한다. 대기 중 취소된 요청은 큐에서 제거한다. 매치 schema 호환 요청도 같은 슬롯과 신호·timeout·인증 범위 안에서 수행된다. 네트워크/인증/429/timeout 실패는 호환 경로로 재요청하지 않는다. 자동 재시도는 없다.

## 텔레메트리 예외 범위

공개 API는 URL을 입력받지 않는다. `normalizeMatch`는 해당 공식 match의 asset relationship에 실제 연결된 URL만 추출한다. 전송 직전 `https://telemetry-cdn.pubg.com` 정확한 hostname, 표준 HTTPS 포트, 사용자 정보 없음, fragment 없음을 검사한다. Fetch의 `redirect:error`를 사용하고 반환된 redirect 응답도 거부한다. 요청 헤더는 Accept만 지정한다.

응답 stream의 압축 해제된 바이트를 최대 32 MiB까지 읽고 초과 시 reader를 취소한다. 본문을 전부 읽은 뒤에만 JSON을 파싱한다. Content-Length는 압축된 크기일 수 있으므로 용량 판단에 사용하지 않는다. timeout/부모 취소 신호를 fetch 및 본문 읽기에 전달한다. 원본 이벤트 배열은 분석 중에만 사용하고 서버 전역 캐시에 보관하지 않는다.

## 검증 범위

[어댑터 테스트](../tests/unit/adapter.test.ts)는 실제 설치된 `PubgClient`를 생성하고 Axios의 outbound adapter만 mock한다. SDK의 스키마 검증 자체는 그대로 실행한다. [제한기 테스트](../tests/unit/limits.test.ts)는 이동 구간 경계, 3개/20개 제한, 취소·실패 후 슬롯 해제를 확인한다. 텔레메트리는 URL 거부, Authorization 미전달, redirect 거부, JSON 실패, 바이트 제한, fetch/reader 취소를 확인한다. 테스트 구성과 이전 실행 결과를 기술한 것이며, 최신 실행 시점과 결과는 [검증 기록](validation.md)에서 확인한다.

합성 fixture의 raw `official`/`competitive` 매핑은 제품 구현 규칙만 검증한다. 이 SDK 설치본 검토 당시에는 실제 PUBG 응답·외부 지연을 확인하지 않았다. 이후 수행한 카카오 랭크 스쿼드 5경기의 `competitive` 매핑과 실제 다운로드·분석 결과는 [실데이터 검증 기록](validation.md#t07-실제-데이터출시-경계)에 별도로 기록했다. 나머지 조합과 운영 키 공유 한도는 미검증이다. 메모리 제한기는 Nitro Node 단일 프로세스에만 유효하며 동일 키를 다른 프로세스에서 쓰면 전체 한도를 보장하지 못한다.
