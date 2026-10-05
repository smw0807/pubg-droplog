import { mkdir, readFile, stat } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

// Run: node scripts/generate-og-images.mjs
// Uses the installed Playwright Chromium and a local Korean font (the same
// Apple SD Gothic Neo / Noto Sans KR / Pretendard stack as the app).
// Set PLAYWRIGHT_BROWSERS_PATH if Chromium was installed outside its default cache.
// The generated PNGs are committed, so production does not need a browser or fonts.
const root = fileURLToPath(new URL('../', import.meta.url))
const output = `${root}public/og`
const logo = (await readFile(`${root}public/brand/droplog-logo.png`)).toString('base64')
const logoUrl = `data:image/png;base64,${logo}`

const contour = `
  <svg class="contour" viewBox="0 0 560 630" fill="none" aria-hidden="true">
    <g stroke="#fbbf24" stroke-opacity=".12" stroke-width="1.1">
      <path d="M587-66C298-42 462 83 231 142S-29 320 128 392 102 573 334 698"/>
      <path d="M596-40C307-18 480 111 257 165S1 317 159 397 137 570 362 680"/>
      <path d="M606-10C335 8 501 139 283 188S34 319 190 402 172 563 390 662"/>
      <path d="M616 20C365 40 522 167 309 211S66 321 221 407 207 556 418 644"/>
      <path d="M626 50C395 72 543 195 335 234S98 323 252 412 242 549 446 626"/>
      <path d="M636 80C425 104 564 223 361 257S130 325 283 417 277 542 474 608"/>
      <path d="M646 110C455 136 585 251 387 280S162 327 314 422 312 535 502 590"/>
      <path d="M656 140C485 168 606 279 413 303S194 329 345 427 347 528 530 572"/>
    </g>
  </svg>`

const homeArt = `
  <div class="home-art">
    <div class="orbit orbit-outer"></div><div class="orbit orbit-inner"></div>
    <div class="orbit-dot dot-a"></div><div class="orbit-dot dot-b"></div>
    <div class="logo-tile"><img src="${logoUrl}" alt="" /></div>
    <span class="art-caption">DROP IN. LOOK BACK.</span>
  </div>`

const playerArt = `
  <div class="player-art">
    <div class="record record-back"></div><div class="record record-middle"></div>
    <div class="record record-front">
      <div class="record-heading"><span class="signal"></span>MATCH HISTORY</div>
      <div class="record-row"><span class="row-icon">↗</span><span>최근 경기</span><i></i></div>
      <div class="record-row"><span class="row-icon">◎</span><span>팀의 기록</span><i></i></div>
      <div class="record-row last"><span class="row-icon">↺</span><span>한 판 다시보기</span></div>
      <div class="record-footer"><span></span><b>PUBG DropLog</b></div>
    </div>
  </div>`

const reportArt = `
  <div class="report-art">
    <div class="map-panel">
      <div class="record-heading"><span class="signal"></span>THE MATCH, TOGETHER</div>
      <svg class="map-drawing" viewBox="0 0 350 254" fill="none" aria-hidden="true">
        <g stroke="#fbbf24" stroke-opacity=".12" stroke-width="1.2">
          <path d="M-40 15C78 63 44 99 170 87S241 171 379 140"/>
          <path d="M-40 36C78 84 44 120 170 108S241 192 379 161"/>
          <path d="M-40 57C78 105 44 141 170 129S241 213 379 182"/>
          <path d="M-40 78C78 126 44 162 170 150S241 234 379 203"/>
          <path d="M-40 99C78 147 44 183 170 171S241 255 379 224"/>
        </g>
        <path d="M62 189L137 94 215 137 285 56" stroke="#fbbf24" stroke-width="2.5" stroke-dasharray="5 7"/>
        <circle cx="62" cy="189" r="16" fill="#252318" stroke="#fbbf24" stroke-opacity=".4"/>
        <circle cx="62" cy="189" r="5" fill="#fbbf24"/>
        <circle cx="137" cy="94" r="16" fill="#252318" stroke="#fbbf24" stroke-opacity=".4"/>
        <circle cx="137" cy="94" r="5" fill="#fbbf24"/>
        <circle cx="215" cy="137" r="16" fill="#252318" stroke="#fbbf24" stroke-opacity=".4"/>
        <circle cx="215" cy="137" r="5" fill="#fbbf24"/>
        <circle cx="285" cy="56" r="25" fill="#fbbf24" fill-opacity=".08"/>
        <circle cx="285" cy="56" r="16" fill="#fbbf24"/>
        <path d="m278 56 5 5 9-10" stroke="#18181b" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      <div class="map-legend"><span></span>한 판의 결정적인 순간들</div>
    </div>
  </div>`

const cards = [
  {
    name: 'home',
    category: 'TEAM MATCH REVIEW',
    title: '우리 팀의<br><em>한 판</em>',
    description: '함께 뛰었던 순간을, 함께 돌아보세요.',
    footer: '마지막 순위 너머의 기록',
    art: homeArt,
  },
  {
    name: 'player',
    category: 'PLAYER MATCH HISTORY',
    title: '플레이어<br><em>전적</em>',
    description: '최근 경기부터 팀의 기록까지.',
    footer: '닉네임으로 찾는 우리 팀의 한 판',
    art: playerArt,
  },
  {
    name: 'report',
    category: 'TEAM MATCH REPORT',
    title: '우리 팀의<br><em>경기 리포트</em>',
    description: '성적표 · 사건 타임라인 · 이벤트 지도',
    footer: '팀의 기록과 결정적인 순간을 한곳에',
    art: reportArt,
  },
]

function renderCard(card) {
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>
    * { box-sizing: border-box; }
    body { margin: 0; width: 1200px; height: 630px; overflow: hidden; background: #111113;
      color: #fafafa; font-family: "Apple SD Gothic Neo", "Noto Sans KR", Pretendard, sans-serif; }
    .card { position: relative; width: 1200px; height: 630px; overflow: hidden;
      background: radial-gradient(ellipse at 95% 14%, #30291a 0, transparent 42%), #111113; }
    .card::after { content: ""; position: absolute; inset: 22px; border: 1px solid #ffffff10;
      border-radius: 3px; pointer-events: none; }
    .accent { position: absolute; width: 112px; height: 5px; top: 0; left: 64px; background: #fbbf24; }
    .contour { position: absolute; height: 630px; width: 560px; right: -25px; top: 0; }
    header { position: absolute; top: 51px; left: 64px; right: 64px; display: flex;
      align-items: center; justify-content: space-between; }
    .brand { display: flex; align-items: center; gap: 14px; font-family: Arial, sans-serif;
      font-size: 27px; font-weight: 700; letter-spacing: -.8px; }
    .brand img { width: 47px; height: 47px; border-radius: 11px; border: 1px solid #fbbf242b; }
    .brand span { color: #fbbf24; }
    .category { font-family: Arial, sans-serif; font-size: 12px; letter-spacing: 2px;
      color: #b4ac9b; border: 1px solid #fbbf2430; padding: 12px 16px; border-radius: 4px; }
    .copy { position: absolute; top: 161px; left: 64px; z-index: 2; }
    .eyebrow { display: flex; align-items: center; gap: 12px; color: #a1a1aa;
      font-family: Arial, sans-serif; font-size: 12px; letter-spacing: 2.5px; }
    .eyebrow::before { content: ""; width: 24px; height: 2px; background: #fbbf24; }
    h1 { margin: 21px 0 20px; font-size: 80px; letter-spacing: -3px; line-height: 1.12;
      font-weight: 800; }
    h1 em { color: #fbbf24; font-style: normal; }
    .report h1 { font-size: 72px; margin-bottom: 25px; line-height: 1.22; }
    .description { margin: 0; font-size: 25px; font-weight: 400; letter-spacing: -.5px;
      color: #c4c4cb; }
    footer { position: absolute; left: 64px; right: 64px; bottom: 49px; padding-top: 22px;
      border-top: 1px solid #ffffff19; display: flex; justify-content: space-between;
      align-items: center; color: #a1a1aa; font-size: 18px; letter-spacing: -.3px; }
    .footer-right { display: flex; align-items: center; gap: 10px; font-family: Arial, sans-serif;
      color: #b5b5bd; font-size: 13px; letter-spacing: 1px; }
    .footer-dot { display: block; width: 5px; height: 5px; background: #fbbf24; border-radius: 50%; }
    .home-art { position: absolute; width: 410px; height: 410px; right: 54px; top: 122px; }
    .orbit { position: absolute; border: 1px solid #fbbf2424; border-radius: 50%; }
    .orbit-outer { inset: 6px; } .orbit-inner { inset: 26px; border-style: dashed; }
    .orbit-dot { position: absolute; width: 9px; height: 9px; background: #fbbf24;
      border-radius: 50%; z-index: 2; }
    .dot-a { top: 65px; left: 56px; } .dot-b { bottom: 63px; right: 55px; }
    .logo-tile { position: absolute; inset: 56px; overflow: hidden; border: 1px solid #fbbf2440;
      border-radius: 40px; box-shadow: 0 22px 60px #00000070; transform: rotate(-5deg); }
    .logo-tile img { width: 100%; height: 100%; display: block; }
    .art-caption { position: absolute; bottom: 3px; left: 0; right: 0; text-align: center;
      font-family: Arial, sans-serif; font-size: 11px; letter-spacing: 3px; color: #9d927a; }
    .player-art { position: absolute; width: 366px; height: 354px; right: 73px; top: 159px; }
    .record { position: absolute; border-radius: 15px; border: 1px solid #fbbf2433; }
    .record-back { inset: 0 0 39px 0; background: #242117; transform: rotate(7deg); }
    .record-middle { inset: 0 0 39px 0; background: #1c1b18; transform: rotate(-4deg); }
    .record-front { inset: 10px 5px 29px 5px; background: #1b1b1e; padding: 27px;
      box-shadow: 0 22px 50px #00000060; }
    .record-heading { display: flex; align-items: center; gap: 9px; font-family: Arial, sans-serif;
      color: #d0bb84; font-size: 11px; letter-spacing: 1.7px; }
    .signal { display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: #fbbf24; }
    .record-row { display: flex; align-items: center; gap: 14px; height: 63px;
      border-bottom: 1px solid #ffffff13; font-size: 22px; letter-spacing: -.5px; }
    .record-row:first-of-type { margin-top: 17px; } .record-row.last { border-bottom: 0; }
    .row-icon { width: 29px; height: 29px; display: grid; place-items: center; color: #fbbf24;
      border: 1px solid #fbbf2438; border-radius: 7px; font-family: Arial, sans-serif; font-size: 19px; }
    .record-row i { display: block; height: 3px; width: 35px; border-radius: 4px; background: #ffffff16;
      margin-left: auto; }
    .record-footer { display: flex; justify-content: space-between; align-items: center; margin-top: 14px; }
    .record-footer span { display: block; width: 43px; height: 3px; background: #fbbf24; }
    .record-footer b { font-family: Arial, sans-serif; font-size: 10px; letter-spacing: .8px;
      font-weight: 400; color: #71717a; }
    .report-art { position: absolute; width: 370px; right: 66px; top: 149px; }
    .map-panel { border: 1px solid #fbbf2438; border-radius: 16px; background: #1a1a1de8;
      padding: 26px 21px 23px; box-shadow: 0 22px 50px #00000040; transform: rotate(3deg); }
    .map-panel .record-heading { margin-left: 5px; font-size: 10px; letter-spacing: 1.5px; }
    .map-drawing { display: block; width: 100%; height: 245px; margin-top: 6px; }
    .map-legend { display: flex; align-items: center; justify-content: center; gap: 8px;
      color: #b0ada5; font-size: 16px; }
    .map-legend span { display: block; width: 15px; height: 2px; background: #fbbf24; }
  </style></head><body><main class="card ${card.name}">
    <div class="accent"></div>${contour}
    <header><div class="brand"><img src="${logoUrl}" alt="" />PUBG <span>DropLog</span></div>
      <div class="category">${card.category}</div></header>
    <section class="copy"><div class="eyebrow">EVERY MATCH HAS A STORY</div>
      <h1>${card.title}</h1><p class="description">${card.description}</p></section>
    ${card.art}
    <footer><span>${card.footer}</span><span class="footer-right"><i class="footer-dot"></i>PUBG TEAM RECORDS</span></footer>
  </main></body></html>`
}

await mkdir(output, { recursive: true })
const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage({
    viewport: { width: 1200, height: 630 },
    deviceScaleFactor: 1,
  })
  const koreanFont = await page.evaluate(async () => {
    for (const name of ['AppleSDGothicNeo-Regular', 'Noto Sans KR', 'Pretendard-Regular']) {
      try {
        await new FontFace('OgKoreanFontCheck', `local("${name}")`).load()
        return name
      } catch {
        // Try the next font from the app's Korean fallback stack.
      }
    }
    return null
  })
  if (!koreanFont) {
    throw new Error(
      'Install Apple SD Gothic Neo, Noto Sans KR, or Pretendard before generating OGs.',
    )
  }
  console.log(`Korean font: ${koreanFont}`)
  for (const card of cards) {
    await page.setContent(renderCard(card), { waitUntil: 'load' })
    await page.evaluate(() => document.fonts.ready)
    const path = `${output}/${card.name}.png`
    await page.screenshot({ path, animations: 'disabled' })
    console.log(`${card.name}.png: 1200×630, ${Math.round((await stat(path)).size / 1024)} KiB`)
  }
} finally {
  await browser.close()
}
