import { expect, test, type Page } from '@playwright/test'

type PageMetadata = {
  path: string
  image: 'home' | 'player' | 'report'
  title: string | RegExp
  description?: RegExp[]
  noindex?: boolean
}

const home: PageMetadata = {
  path: '/',
  image: 'home',
  title: 'PUBG DropLog · 우리 팀의 한 판',
  description: [/PUBG/, /듀오/, /스쿼드/],
}
const player: PageMetadata = {
  path: '/players/steam/account.demo-1',
  image: 'player',
  title: /^(?:샘플 · )?SquadMate의 전적 · PUBG DropLog$/,
  description: [/SquadMate/, /Steam|스팀/, /합성/],
}
const report: PageMetadata = {
  path: '/reports/demo-normal-squad',
  image: 'report',
  title: /^샘플 · 에란겔 스쿼드 리포트 · PUBG DropLog$/,
  description: [/에란겔/, /일반/, /스쿼드/, /3위/, /8킬/, /합성/],
  noindex: true,
}

function publicUrl(path: string, baseURL: string | undefined) {
  const origin = process.env.OG_EXPECTED_ORIGIN || baseURL
  if (!origin) throw new Error('The SEO checks require a Playwright base URL')
  return new URL(path, origin).href
}

async function expectMetadata(page: Page, expected: PageMetadata, baseURL: string | undefined) {
  await expect(page).toHaveTitle(expected.title)
  const title = await page.title()
  const description = page.locator('head meta[name="description"]')
  await expect(description).toHaveCount(1)
  await expect(description).toHaveAttribute('content', /\S/)
  const descriptionText = (await description.getAttribute('content'))!
  for (const pattern of expected.description ?? []) expect(descriptionText).toMatch(pattern)

  const imageUrl = publicUrl(`/og/${expected.image}.png`, baseURL)
  const metadata: Record<string, string> = {
    'og:type': 'website',
    'og:site_name': 'PUBG DropLog',
    'og:locale': 'ko_KR',
    'og:title': title,
    'og:description': descriptionText,
    'og:url': publicUrl(expected.path, baseURL),
    'og:image': imageUrl,
    'og:image:width': '1200',
    'og:image:height': '630',
    'og:image:type': 'image/png',
  }
  for (const [property, content] of Object.entries(metadata)) {
    const tag = page.locator(`head meta[property="${property}"]`)
    await expect(tag).toHaveCount(1)
    await expect(tag).toHaveAttribute('content', content)
  }
  const imageAlt = page.locator('head meta[property="og:image:alt"]')
  await expect(imageAlt).toHaveCount(1)
  await expect(imageAlt).toHaveAttribute('content', /\S/)
  for (const [name, content] of Object.entries({
    'twitter:card': 'summary_large_image',
    'twitter:title': title,
    'twitter:description': descriptionText,
    'twitter:image': imageUrl,
    'twitter:image:alt': (await imageAlt.getAttribute('content'))!,
  })) {
    const tag = page.locator(`head meta[name="${name}"]`)
    await expect(tag).toHaveCount(1)
    await expect(tag).toHaveAttribute('content', content)
  }
  const canonical = page.locator('head link[rel="canonical"]')
  await expect(canonical).toHaveCount(1)
  await expect(canonical).toHaveAttribute('href', publicUrl(expected.path, baseURL))
  if (expected.noindex) {
    await expect(page.locator('head meta[name="robots"]')).toHaveCount(1)
    await expect(page.locator('head meta[name="robots"]')).toHaveAttribute(
      'content',
      'noindex, nofollow',
    )
  } else {
    await expect(page.locator('head meta[name="robots"][content*="noindex"]')).toHaveCount(0)
  }
}

for (const expected of [home, player, report]) {
  test(`${expected.image} metadata and image are available to an HTML-only sharing crawler`, async ({
    browser,
    request,
    baseURL,
  }) => {
    // Read the raw HTTP response, then parse only its head with JavaScript disabled.
    // A client-side metadata update cannot make this crawler assertion pass.
    const response = await request.get(
      `${expected.path}?queueType=ranked&teamMode=duo&playerId=account.demo-2&utm_source=share`,
    )
    expect(response.status()).toBe(200)
    if (expected.noindex) expect(response.headers()['x-robots-tag']).toBe('noindex, nofollow')
    const html = await response.text()
    const head = html.match(/<head\b[^>]*>[\s\S]*?<\/head>/i)?.[0]
    expect(head).toBeDefined()
    const crawler = await browser.newContext({ javaScriptEnabled: false })
    try {
      const page = await crawler.newPage()
      await page.setContent(`<!doctype html><html>${head}<body></body></html>`)
      await expectMetadata(page, expected, baseURL)
    } finally {
      await crawler.close()
    }
    const image = await request.get(`/og/${expected.image}.png`)
    expect(image.status()).toBe(200)
    expect(image.headers()['content-type']).toMatch(/^image\/png\b/)
    const png = await image.body()
    expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a')
    expect(png.subarray(12, 16).toString()).toBe('IHDR')
    expect(png.readUInt32BE(16)).toBe(1200)
    expect(png.readUInt32BE(20)).toBe(630)
  })
}

test('unavailable player and report pages retain complete generic sharing metadata', async ({
  browser,
  request,
  baseURL,
}) => {
  const crawler = await browser.newContext({ javaScriptEnabled: false })
  try {
    const page = await crawler.newPage()
    for (const expected of [
      {
        path: '/players/steam/account.missing-player',
        image: 'player' as const,
        title: /전적.*PUBG DropLog$/,
      },
      {
        path: '/reports/invalid-report-id',
        image: 'report' as const,
        title: /리포트.*PUBG DropLog$/,
        noindex: true,
      },
    ]) {
      const response = await request.get(expected.path)
      expect(response.status()).toBe(200)
      if (expected.noindex) expect(response.headers()['x-robots-tag']).toBe('noindex, nofollow')
      const html = await response.text()
      const head = html.match(/<head\b[^>]*>[\s\S]*?<\/head>/i)?.[0]
      expect(head).toBeDefined()
      await page.setContent(`<!doctype html><html>${head}<body></body></html>`)
      await expectMetadata(page, expected, baseURL)
    }
  } finally {
    await crawler.close()
  }
})

test('SPA navigation replaces page metadata without duplicates or stale report restrictions', async ({
  page,
  baseURL,
}) => {
  await page.goto('/?utm_source=share#main-content')
  await expect(page.locator('[data-app-ready="true"]')).toBeVisible()
  await expectMetadata(page, home, baseURL)
  await page.getByRole('textbox', { name: '플레이어 닉네임' }).fill('SquadMate')
  await page.getByRole('button', { name: '최근 경기 검색', exact: true }).click()
  await expect(page).toHaveURL(/\/players\/steam\/account\.demo-1/)
  await expectMetadata(page, player, baseURL)
  await page.getByRole('link', { name: 'PUBG DropLog 홈', exact: true }).click()
  await expectMetadata(page, home, baseURL)
  await page.getByRole('link', { name: '샘플 리포트 보기', exact: true }).click()
  await expect(page).toHaveURL(/\/reports\/demo-normal-squad$/)
  await expectMetadata(page, report, baseURL)
  await page.getByRole('link', { name: '전적 목록', exact: true }).click()
  await expect(page).toHaveURL(/\/players\/steam\/account\.demo-1/)
  await expectMetadata(page, player, baseURL)
  await page.getByRole('link', { name: 'PUBG DropLog 홈', exact: true }).click()
  await expectMetadata(page, home, baseURL)
})
