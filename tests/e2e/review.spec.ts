import { expect, test, type Page } from '@playwright/test'

async function visit(page: Page, path: string) {
  await page.goto(path)
  await expect(page.locator('[data-app-ready="true"]')).toBeVisible()
}

async function choose(page: Page, label: string, option: string) {
  await page.getByRole('combobox', { name: label, exact: true }).click()
  await page.getByRole('option', { name: option, exact: true }).click()
}

test('keyboard search preserves the display name and intersecting filters survive refresh', async ({
  page,
}) => {
  await visit(page, '/')
  await page.getByRole('textbox', { name: '플레이어 닉네임' }).fill(' SquadMate ')
  await page.getByRole('textbox', { name: '플레이어 닉네임' }).press('Enter')
  await expect(page).toHaveURL(/\/players\/steam\/account\.demo-1/)
  await expect(page.getByRole('heading', { name: 'SquadMate', exact: true })).toBeVisible()
  await expect(page.getByTestId('match-card')).toHaveCount(4)
  await choose(page, '경기 종류', '랭크')
  await choose(page, '팀 모드', '듀오')
  await expect(page).toHaveURL(/queueType=ranked.*teamMode=duo/)
  await expect(page.getByTestId('match-card')).toHaveCount(1)
  await expect(page.getByTestId('match-card')).toContainText('랭크')
  await expect(page.getByTestId('match-card')).toContainText('듀오 · 2명')
  await page.reload()
  await expect(page.getByTestId('match-card')).toHaveCount(1)
  await expect(page.getByText('샘플 데이터', { exact: true })).toBeVisible()
})

test('all four reserved reports, timeline filters, pagination and direct shared access', async ({
  page,
  browser,
}) => {
  for (const queue of ['normal', 'ranked']) {
    for (const team of ['duo', 'squad']) {
      await visit(page, `/reports/demo-${queue}-${team}`)
      await expect(page.getByText('샘플 리포트', { exact: true })).toBeVisible()
      await expect(page.getByRole('heading', { name: '함께한 팀원' })).toContainText(
        team === 'duo' ? '2명' : '4명',
      )
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
        'content',
        'noindex, nofollow',
      )
    }
  }
  await page.getByRole('button', { name: '피해', exact: true }).click()
  await expect(page.getByText('50/111개 이벤트 표시', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '이벤트 더 보기', exact: true }).click()
  await expect(page.getByText('100/111개 이벤트 표시', { exact: true })).toBeVisible()
  await choose(page, '팀원 필터', '2 · AerialFox')
  await expect(page.getByRole('heading', { name: '현재 조건에 맞는 기록이 없어요' })).toBeVisible()
  await page.getByRole('button', { name: '처치와 사망', exact: true }).click()
  await expect(page.getByTestId('event-timeline')).toContainText('어시스트: 2 · AerialFox')
  const fresh = await browser.newContext()
  const shared = await fresh.newPage()
  await shared.goto(page.url())
  await expect(shared.getByText('샘플 리포트', { exact: true })).toBeVisible()
  await expect(shared.locator('[data-testid="team-stats-table"] .member-2')).toHaveText('2')
  await fresh.close()
})

test('copy succeeds when permitted and provides a selected URL when denied', async ({ page }) => {
  await visit(page, '/reports/demo-normal-duo')
  await page.evaluate(() =>
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (value: string) => {
          sessionStorage.setItem('copiedReportUrl', value)
        },
      },
    }),
  )
  await page.getByRole('button', { name: '리포트 공유', exact: true }).click()
  await expect(page.getByText('리포트 링크를 복사했어요.', { exact: true })).toBeVisible()
  expect(await page.evaluate(() => sessionStorage.getItem('copiedReportUrl'))).toBe(page.url())
  await page.evaluate(() =>
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async () => {
          throw new Error('NotAllowedError')
        },
      },
    }),
  )
  await page.getByRole('button', { name: '링크 복사 완료', exact: true }).click()
  const url = page.getByRole('textbox', { name: '공유 리포트 URL' })
  await expect(url).toHaveValue(page.url())
  await expect(url).toBeFocused()
  expect(
    await url.evaluate(
      (element: HTMLInputElement) => element.selectionEnd! - element.selectionStart!,
    ),
  ).toBe(page.url().length)
})

for (const width of [360, 768, 1440]) {
  for (const theme of ['dark', 'light']) {
    test(`${width}px ${theme}: actual duo and squad members with no page overflow`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 960 })
      await page.addInitScript((value) => {
        if (!localStorage.getItem('nuxt-color-mode')) localStorage.setItem('nuxt-color-mode', value)
      }, theme)
      for (const team of ['duo', 'squad']) {
        await visit(page, `/reports/demo-normal-${team}`)
        await expect(page.locator('html')).toHaveClass(new RegExp(theme))
        const count = team === 'duo' ? 2 : 4
        if (width < 768) {
          await expect(page.getByTestId('team-member-card')).toHaveCount(count)
          await expect(page.getByTestId('team-member-card').first()).toBeVisible()
          await expect(page.getByTestId('team-stats-table')).not.toBeVisible()
        } else {
          await expect(page.getByTestId('team-stats-table')).toBeVisible()
          await expect(page.getByTestId('team-stats-table').locator('tbody tr')).toHaveCount(count)
        }
        const shares = await page
          .locator('[data-testid="team-stats-table"]')
          .getByText(/^\d+%$/)
          .allTextContents()
        expect(shares.every((value) => Number.parseInt(value) <= 100)).toBe(true)
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        )
      }
      await visit(page, '/')
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      )
      await page.getByRole('button', { name: '다크·라이트 테마 변경' }).click()
      await expect(page.locator('html')).toHaveClass(
        new RegExp(theme === 'dark' ? 'light' : 'dark'),
      )
      await page.reload()
      await expect(page.locator('html')).toHaveClass(
        new RegExp(theme === 'dark' ? 'light' : 'dark'),
      )
    })
  }
}

test('search to persisted report and shared reload', async ({ page }) => {
  test.skip(
    process.env.E2E_STORAGE !== '1',
    'Requires a migrated PostgreSQL database and E2E_STORAGE=1',
  )
  await visit(page, '/')
  await page.getByRole('textbox', { name: '플레이어 닉네임' }).fill('SquadMate')
  await page.getByRole('button', { name: '최근 경기 검색' }).click()
  await page.getByRole('button', { name: '리포트 보기', exact: true }).first().click()
  await expect(page).toHaveURL(/\/reports\/[a-f0-9-]{36}$/)
  await expect(page.getByText('샘플 리포트', { exact: true })).toBeVisible()
  const reportUrl = page.url()
  await page.reload()
  await expect(page).toHaveURL(reportUrl)
  await expect(page.getByRole('heading', { name: '함께한 팀원' })).toBeVisible()
})

test('an empty filtered page still offers the next raw batch', async ({ page, request }) => {
  const response = await request.get(
    '/api/players/steam/account.demo-1/matches?queueType=ranked&teamMode=duo',
  )
  const result = await response.json()
  await page.route('**/api/players/steam/account.demo-1/matches**', async (route) => {
    const cursor = new URL(route.request().url()).searchParams.get('cursor')
    await route.fulfill({
      json: cursor
        ? {
            ...result,
            data: { ...result.data, nextCursor: null },
            meta: { ...result.meta, checked: 21, total: 21, complete: true },
          }
        : {
            ...result,
            data: { ...result.data, matches: [], nextCursor: 'next-synthetic-batch' },
            meta: { ...result.meta, checked: 20, total: 21, matched: 0, complete: false },
          },
    })
  })
  await visit(page, '/')
  await page.getByRole('textbox', { name: '플레이어 닉네임' }).fill('SquadMate')
  await page.getByRole('button', { name: '최근 경기 검색' }).click()
  await expect(
    page.getByRole('heading', { name: '아직 확인한 경기 중에는 해당 기록이 없어요' }),
  ).toBeVisible()
  await page.getByRole('button', { name: '다음 경기 더 보기' }).click()
  await expect(page.getByTestId('match-card')).toHaveCount(1)
  await expect(page.getByTestId('match-card')).toContainText('랭크')
})

test('revision mismatch recovers to the first filtered events page', async ({ page }) => {
  let rejected = false
  await page.route('**/api/reports/demo-normal-squad/events**', async (route) => {
    if (new URL(route.request().url()).searchParams.has('cursor') && !rejected) {
      rejected = true
      await route.fulfill({
        status: 409,
        json: {
          error: { code: 'SNAPSHOT_EXPIRED', message: '리포트가 갱신되었습니다.', retryable: true },
          requestId: 'synthetic-revision-check',
        },
      })
    } else await route.continue()
  })
  await visit(page, '/reports/demo-normal-squad')
  await page.getByRole('button', { name: '피해', exact: true }).click()
  await expect(page.getByText('50/111개 이벤트 표시', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '이벤트 더 보기' }).click()
  await expect(
    page.getByText('리포트가 갱신되어 첫 이벤트부터 다시 불러왔어요.', { exact: true }),
  ).toBeVisible()
  await expect(page.getByText('50/111개 이벤트 표시', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '이벤트 더 보기' }).click()
  await expect(page.getByText('100/111개 이벤트 표시', { exact: true })).toBeVisible()
})

test('partial retry respects cooldown, preserves the scorecard on failure and can recover', async ({
  page,
  request,
}) => {
  const response = await request.get('/api/reports/demo-normal-squad')
  const baseline = await response.json()
  const partial = {
    ...baseline,
    data: {
      ...baseline.data,
      source: 'live',
      quality: 'partial',
      warnings: [
        { code: 'TELEMETRY_UNAVAILABLE', count: 1, message: '상세 기록을 가져오지 못했어요.' },
      ],
      retry: {
        available: true,
        notBefore: new Date(Date.now() + 5_000).toISOString(),
        reason: 'COOLDOWN',
      },
    },
  }
  let attempts = 0
  await page.route('**/api/reports/demo-normal-squad', (route) => route.fulfill({ json: partial }))
  await page.route('**/api/reports/demo-normal-squad/retry', async (route) => {
    attempts++
    if (attempts === 1)
      await route.fulfill({
        status: 502,
        json: {
          error: {
            code: 'UPSTREAM_ERROR',
            message: '상세 기록 조회에 실패했어요.',
            retryable: true,
          },
          requestId: 'synthetic-retry-check',
        },
      })
    else
      await route.fulfill({
        json: { ...baseline, data: { ...baseline.data, source: 'live', revision: 2 } },
      })
  })
  await visit(page, '/')
  await page.getByRole('link', { name: '샘플 리포트 보기' }).click()
  await expect(
    page.getByText('일부 기록을 확인하지 못한 부분 리포트예요', { exact: true }),
  ).toBeVisible()
  await expect(page.getByRole('heading', { name: '함께한 팀원' })).toBeVisible()
  const retry = page.getByRole('button', { name: /초 후 재시도|상세 기록 다시 시도/ })
  await expect(retry).toBeDisabled()
  await expect(retry).toBeEnabled({ timeout: 8000 })
  await retry.click()
  await expect(page.getByText('상세 기록 조회에 실패했어요.', { exact: true })).toBeVisible()
  await expect(page.getByTestId('team-stats-table')).toBeVisible()
  await retry.click()
  await expect(page.getByText('기록 준비 완료', { exact: true })).toBeVisible()
})

test('an earlier failed batch can recover after loading more without losing the continuation', async ({
  page,
  request,
}) => {
  const raw = await request.get('/api/players/steam/account.demo-1/matches')
  const baseline = await raw.json()
  const requests: string[] = []
  let recovered = false
  await page.route('**/api/players/steam/account.demo-1/matches**', async (route) => {
    const cursor = new URL(route.request().url()).searchParams.get('cursor') ?? 'first'
    requests.push(cursor)
    if (cursor === 'first' && requests.length > 1) recovered = true
    const checked = cursor === 'first' ? 20 : cursor === 'next20' ? 40 : 45
    const matches =
      cursor === 'first'
        ? baseline.data.matches.slice(0, recovered ? 2 : 1)
        : cursor === 'next20'
          ? baseline.data.matches.filter(
              (_value: unknown, index: number) => index < 3 && (index !== 1 || recovered),
            )
          : baseline.data.matches
    await route.fulfill({
      json: {
        data: {
          ...baseline.data,
          matches,
          nextCursor: checked === 20 ? 'next20' : checked === 40 ? 'next40' : null,
        },
        meta: {
          ...baseline.meta,
          checked,
          total: 45,
          matched: matches.length,
          excluded: 0,
          unclassified: 0,
          failed: recovered ? 0 : 1,
          failedMatchIds: recovered ? [] : ['synthetic-earlier-failure'],
          complete: checked === 45,
        },
      },
    })
  })
  await visit(page, '/')
  await page.getByRole('textbox', { name: '플레이어 닉네임' }).fill('SquadMate')
  await page.getByRole('button', { name: '최근 경기 검색' }).click()
  await expect(page.getByTestId('match-card')).toHaveCount(1)
  await page.getByRole('button', { name: '다음 경기 더 보기' }).click()
  await expect(page.getByTestId('match-card')).toHaveCount(2)
  await page.getByRole('button', { name: '실패 묶음 다시 시도' }).click()
  await expect(page.getByTestId('match-card')).toHaveCount(3)
  await expect(page.getByText(/원본 40\/45개 확인/)).toBeVisible()
  await expect(page.getByRole('button', { name: '실패 묶음 다시 시도' })).not.toBeVisible()
  await page.getByRole('button', { name: '다음 경기 더 보기' }).click()
  await expect(page.getByTestId('match-card')).toHaveCount(4)
  expect(requests).toEqual(['first', 'next20', 'first', 'next20', 'next40'])
})

test('32-character names fit mobile cards and primary text meets contrast targets', async ({
  page,
  request,
}) => {
  const raw = await request.get('/api/reports/demo-normal-squad')
  const baseline = await raw.json()
  const longName = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ123456'
  baseline.data.members[0].name = longName
  await page.setViewportSize({ width: 360, height: 960 })
  await page.route('**/api/reports/demo-normal-squad', (route) => route.fulfill({ json: baseline }))
  await visit(page, '/')
  await page.getByRole('link', { name: '샘플 리포트 보기' }).click()
  await expect(page.getByTestId('team-member-card').first().getByRole('heading')).toHaveText(
    longName,
  )
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  for (const theme of ['dark', 'light']) {
    if (!(await page.locator('html').getAttribute('class'))?.includes(theme))
      await page.getByRole('button', { name: '다크·라이트 테마 변경' }).click()
    const contrast = await page.evaluate(() => {
      const luminance = (value: string) => {
        const values =
          value
            .match(/[\d.]+/g)
            ?.slice(0, 3)
            .map(Number) ?? []
        return values
          .map((value) => value / 255)
          .map((value) => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4))
          .reduce((total, value, index) => total + value * [0.2126, 0.7152, 0.0722][index]!, 0)
      }
      const background = getComputedStyle(document.body).backgroundColor
      return ['.text-muted', '.text-primary'].map((selector) => {
        const element = document.querySelector(selector)
        if (!element) throw new Error(`Missing contrast sample ${selector}`)
        const foreground = getComputedStyle(element).color
        const a = luminance(background),
          b = luminance(foreground)
        return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
      })
    })
    expect(contrast.every((value) => value >= 4.5)).toBe(true)
  }
  expect(
    await page
      .getByRole('button', { name: '리포트 공유', exact: true })
      .evaluate((element) => element.getBoundingClientRect().height),
  ).toBeGreaterThanOrEqual(44)
})
