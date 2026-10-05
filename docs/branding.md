# PUBG DropLog 로고

낙하산(drop)과 펼친 기록장(log)을 연결한 심볼입니다. 기존 UI의 앰버·차콜 색상을 기준으로 제작했습니다. 프로젝트 이름은 로고 옆의 실제 텍스트로 표시합니다.

| 파일                            | 크기      | 용도                    |
| ------------------------------- | --------- | ----------------------- |
| `public/brand/droplog-logo.png` | 1254×1254 | 생성 원본               |
| `public/brand/droplog-mark.png` | 96×96     | 헤더에서 36×36으로 표시 |
| `public/favicon-32x32.png`      | 32×32     | 브라우저 파비콘         |
| `public/favicon.ico`            | 16·32·48  | 크기별 파비콘           |
| `public/apple-touch-icon.png`   | 180×180   | 홈 화면 아이콘          |

내장 `image_gen`으로 생성한 PNG를 원본으로 보관하고, `sips`로 크기만 변환했습니다. ICO에는 16·32·48px PNG를 함께 저장했습니다. 헤더 이미지에는 빈 `alt`를 사용하고 홈 링크의 `aria-label`로 서비스 이름을 전달합니다.

## 공유 이미지

메인·전적·리포트에 각각 1200×630 PNG를 사용합니다. 기존 로고와 앰버·차콜 색상, 큰 한글 제목을 유지하고 페이지별 선 그래픽을 더했습니다. 이미지는 정적이며 실제 플레이어 이름·경기 성적은 페이지의 OG 제목·설명으로 전달합니다.

| 파일                   | 용도                                | 크기       |
| ---------------------- | ----------------------------------- | ---------- |
| `public/og/home.png`   | 메인: 우리 팀의 한 판               | 약 204 KiB |
| `public/og/player.png` | 전적: 최근 경기부터 팀의 기록까지   | 약 134 KiB |
| `public/og/report.png` | 리포트: 성적표·타임라인·이벤트 지도 | 약 161 KiB |

생성 원본은 [generate-og-images.mjs](../scripts/generate-og-images.mjs)의 HTML/CSS/SVG입니다. 설치된 Playwright Chromium과 Apple SD Gothic Neo·Noto Sans KR·Pretendard 중 하나의 로컬 한글 글꼴이 필요합니다. 글꼴이 없으면 생성 전에 중단합니다. 결과 PNG를 저장소에 포함하므로 운영 서버에는 이미지 생성 도구나 글꼴 설치가 필요하지 않습니다.

```sh
node scripts/generate-og-images.mjs
```

Chromium을 별도 위치에 설치했다면 `PLAYWRIGHT_BROWSERS_PATH`를 지정합니다. 생성 후 세 이미지의 한글, 잘림과 겹침을 직접 확인합니다.

## 로고 생성 프롬프트

```text
Use case: logo-brand. Create one finished square logo symbol for PUBG DropLog, a Korean PUBG match journal website. This is the actual deployable UI logo and favicon source, not a presentation, concept sheet or mockup. Flat precise geometric icon: a bold amber parachute canopy above a compact open logbook, connected by just two strong suspension lines; the open book doubles as a simple downward chevron/landing shape, expressing DROP plus LOG. Focus on one unified unmistakable silhouette with a few large shapes and generous negative space that stays recognizable at 32 and 16 pixels. Center it, use approximately 78 percent of the square width/height with equal modest margins. Background is one perfectly uniform opaque charcoal #18181b covering the entire square edge-to-edge, with no rounded outer tile, no border. Symbol is one solid warm amber #fbbf24. Clean flat vector-like edges, broad strokes, no tiny lettering or page lines, no photographic details, no gradients, no shadows, no texture, no 3D. No text, initials, slogans, watermarks, PUBG official logo, helmet, weapons, or extra decorations. Square 1024x1024 output.
```
