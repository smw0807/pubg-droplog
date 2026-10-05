# PUBG DropLog 로고

낙하산(drop)과 펼친 기록장(log)을 연결한 심볼입니다. 기존 UI의 앰버·차콜 색상을 기준으로 제작했습니다. 프로젝트 이름은 로고 옆의 실제 텍스트로 표시합니다.

| 파일 | 크기 | 용도 |
| --- | --- | --- |
| `public/brand/droplog-logo.png` | 1254×1254 | 생성 원본 |
| `public/brand/droplog-mark.png` | 96×96 | 헤더에서 36×36으로 표시 |
| `public/favicon-32x32.png` | 32×32 | 브라우저 파비콘 |
| `public/favicon.ico` | 16·32·48 | 크기별 파비콘 |
| `public/apple-touch-icon.png` | 180×180 | 홈 화면 아이콘 |

내장 `image_gen`으로 생성한 PNG를 원본으로 보관하고, `sips`로 크기만 변환했습니다. ICO에는 16·32·48px PNG를 함께 저장했습니다. 헤더 이미지에는 빈 `alt`를 사용하고 홈 링크의 `aria-label`로 서비스 이름을 전달합니다.

## 생성 프롬프트

```text
Use case: logo-brand. Create one finished square logo symbol for PUBG DropLog, a Korean PUBG match journal website. This is the actual deployable UI logo and favicon source, not a presentation, concept sheet or mockup. Flat precise geometric icon: a bold amber parachute canopy above a compact open logbook, connected by just two strong suspension lines; the open book doubles as a simple downward chevron/landing shape, expressing DROP plus LOG. Focus on one unified unmistakable silhouette with a few large shapes and generous negative space that stays recognizable at 32 and 16 pixels. Center it, use approximately 78 percent of the square width/height with equal modest margins. Background is one perfectly uniform opaque charcoal #18181b covering the entire square edge-to-edge, with no rounded outer tile, no border. Symbol is one solid warm amber #fbbf24. Clean flat vector-like edges, broad strokes, no tiny lettering or page lines, no photographic details, no gradients, no shadows, no texture, no 3D. No text, initials, slogans, watermarks, PUBG official logo, helmet, weapons, or extra decorations. Square 1024x1024 output.
```
