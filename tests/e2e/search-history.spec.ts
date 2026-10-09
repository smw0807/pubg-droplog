import { expect, test, type Page } from '@playwright/test'
import type { Platform } from '../../shared/types'

const storageKey = 'pubg-droplog:search-history'
type HistoryEntry = { name: string; platform: Platform }

async function visitHome(page: Page) {
  await page.goto('/')
  await expect(page.locator('[data-app-ready="true"]')).toBeVisible()
}

async function seedHistory(page: Page, entries: HistoryEntry[]) {
  await visitHome(page)
  await page.evaluate(({ key, entries }) => localStorage.setItem(key, JSON.stringify(entries)), {
    key: storageKey,
    entries,
  })
  await page.reload()
  await expect(page.locator('[data-app-ready="true"]')).toBeVisible()
}

async function savedHistory(page: Page): Promise<HistoryEntry[]> {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '[]'), storageKey)
}

async function choosePlatform(page: Page, platform: Platform) {
  await page.getByRole('combobox', { name: '플랫폼', exact: true }).click()
  await page
    .getByRole('option', { name: platform === 'steam' ? 'Steam' : 'Kakao', exact: true })
    .click()
}

async function search(page: Page, name: string, platform: Platform = 'steam') {
  await choosePlatform(page, platform)
  await page.getByRole('textbox', { name: '플레이어 닉네임' }).fill(name)
  await page.getByRole('button', { name: '최근 경기 검색', exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`/players/${platform}/account\\.history-`))
  await expect(page.getByRole('heading', { name: name.trim(), exact: true })).toBeVisible()
}

async function installSearchFixture(page: Page) {
  const searches: HistoryEntry[] = []
  const players = new Map<string, HistoryEntry>()
  await page.route('**/api/players/**', async (route) => {
    const url = new URL(route.request().url())
    if (url.pathname === '/api/players/search') {
      const entry = {
        name: url.searchParams.get('name')!,
        platform: url.searchParams.get('platform')! as Platform,
      }
      searches.push(entry)
      if (entry.name === 'MissingPlayer') {
        await route.fulfill({
          status: 404,
          json: {
            error: {
              code: 'PLAYER_NOT_FOUND',
              message: '플레이어를 찾지 못했어요.',
              retryable: false,
            },
            requestId: 'search-history-not-found',
          },
        })
        return
      }
      const accountId = `account.history-${searches.length}`
      players.set(accountId, entry)
      await route.fulfill({
        json: {
          data: { accountId, displayName: entry.name, platform: entry.platform },
          meta: { source: 'demo' },
        },
      })
    } else if (url.pathname.endsWith('/matches')) {
      const accountId = url.pathname.split('/')[4]!
      const player = players.get(accountId)!
      await route.fulfill({
        json: {
          data: {
            player: { accountId, displayName: player.name, platform: player.platform },
            matches: [],
            nextCursor: null,
          },
          meta: {
            source: 'demo',
            fetchedAt: '2026-10-09T00:00:00.000Z',
            checked: 0,
            total: 0,
            matched: 0,
            excluded: 0,
            unclassified: 0,
            failed: 0,
            failedMatchIds: [],
            complete: true,
            snapshotId: 'search-history-fixture',
          },
        },
      })
    } else await route.continue()
  })
  return searches
}

test('successful searches survive reload and selecting history restores nickname and platform', async ({
  page,
}) => {
  const searches = await installSearchFixture(page)
  await visitHome(page)
  await search(page, ' AerialFox ', 'kakao')
  expect(await savedHistory(page)).toEqual([{ name: 'AerialFox', platform: 'kakao' }])

  await page.getByRole('link', { name: 'PUBG DropLog 홈', exact: true }).click()
  await expect(page).toHaveURL((url) => url.pathname === '/')
  await page.reload()
  await expect(page.locator('[data-app-ready="true"]')).toBeVisible()
  const history = page.getByRole('region', { name: '최근 검색 기록', exact: true })
  await expect(history).not.toBeVisible()
  await expect(page.getByRole('combobox', { name: '플랫폼', exact: true })).toContainText('Steam')
  const nickname = page.getByRole('textbox', { name: '플레이어 닉네임' })
  await nickname.click()
  await history.getByRole('button', { name: 'AerialFox · Kakao', exact: true }).click()
  await expect(nickname).toHaveValue('AerialFox')
  await expect(page.getByRole('combobox', { name: '플랫폼', exact: true })).toContainText('Kakao')
  await expect(history).not.toBeVisible()
  await expect(page).toHaveURL((url) => url.pathname === '/')
  expect(searches).toEqual([{ name: 'AerialFox', platform: 'kakao' }])

  await page.getByRole('button', { name: '최근 경기 검색', exact: true }).click()
  await expect(page).toHaveURL(/\/players\/kakao\/account\.history-2/)
  expect(searches[1]).toEqual({ name: 'AerialFox', platform: 'kakao' })
})

test('history keeps ten latest searches and deduplicates by both nickname and platform', async ({
  page,
}) => {
  await installSearchFixture(page)
  const entries: HistoryEntry[] = Array.from({ length: 10 }, (_, index) => ({
    name: `History${index}`,
    platform: 'steam',
  }))
  await seedHistory(page, entries)
  await search(page, 'History5', 'kakao')
  expect(await savedHistory(page)).toEqual([
    { name: 'History5', platform: 'kakao' },
    ...entries.slice(0, 9),
  ])

  await visitHome(page)
  await search(page, 'History5', 'steam')
  const expected = [
    { name: 'History5', platform: 'steam' },
    { name: 'History5', platform: 'kakao' },
    ...entries.slice(0, 9).filter((entry) => entry.name !== 'History5'),
  ]
  expect(await savedHistory(page)).toEqual(expected)
  await visitHome(page)
  await page.getByRole('textbox', { name: '플레이어 닉네임' }).click()
  const buttons = page.getByTestId('search-history-entry')
  await expect(buttons).toHaveCount(10)
  await expect(buttons.first()).toHaveAccessibleName('History5 · Steam')
  await expect(buttons.nth(1)).toHaveAccessibleName('History5 · Kakao')
  await expect(buttons.last()).toHaveAccessibleName('History8 · Steam')
})

test('history opens by keyboard, closes with Escape or an outside click, and opens again', async ({
  page,
}) => {
  await seedHistory(page, [{ name: 'AerialFox', platform: 'kakao' }])
  const nickname = page.getByRole('textbox', { name: '플레이어 닉네임' })
  const history = page.getByRole('region', { name: '최근 검색 기록', exact: true })
  await page.getByRole('combobox', { name: '플랫폼', exact: true }).focus()
  await page.keyboard.press('Tab')
  await expect(nickname).toBeFocused()
  await expect(history).toBeVisible()
  await nickname.press('ArrowDown')
  await expect(
    history.getByRole('button', { name: 'AerialFox · Kakao', exact: true }),
  ).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(history).not.toBeVisible()
  await expect(nickname).toBeFocused()
  await nickname.click()
  await expect(history).toBeVisible()
  await page.getByRole('heading', { name: '어떤 한 판을 돌아볼까요?', exact: true }).click()
  await expect(history).not.toBeVisible()
  await nickname.click()
  await expect(history).toBeVisible()
})

test('individual and all-history deletion persist without submitting a search', async ({
  page,
}) => {
  const searches = await installSearchFixture(page)
  await seedHistory(page, [
    { name: 'AerialFox', platform: 'kakao' },
    { name: 'SquadMate', platform: 'steam' },
  ])
  const nickname = page.getByRole('textbox', { name: '플레이어 닉네임' })
  const history = page.getByRole('region', { name: '최근 검색 기록', exact: true })
  await nickname.click()
  await history
    .getByRole('button', { name: 'AerialFox · Kakao 검색 기록 삭제', exact: true })
    .click()
  expect(await savedHistory(page)).toEqual([{ name: 'SquadMate', platform: 'steam' }])
  await expect(nickname).toHaveValue('')
  await page.reload()
  await expect(page.locator('[data-app-ready="true"]')).toBeVisible()
  await nickname.click()
  await expect(history.getByTestId('search-history-entry')).toHaveCount(1)
  await history.getByRole('button', { name: '전체 삭제', exact: true }).click()
  await expect(history).not.toBeVisible()
  expect(await savedHistory(page)).toEqual([])
  await page.reload()
  await expect(page.locator('[data-app-ready="true"]')).toBeVisible()
  await nickname.click()
  await expect(history).not.toBeVisible()
  expect(searches).toEqual([])
})

test('failed searches do not become recent history', async ({ page }) => {
  await installSearchFixture(page)
  await seedHistory(page, [{ name: 'SquadMate', platform: 'steam' }])
  await page.getByRole('textbox', { name: '플레이어 닉네임' }).fill('MissingPlayer')
  await page.getByRole('button', { name: '최근 경기 검색', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('플레이어를 찾지 못했어요.')
  expect(await savedHistory(page)).toEqual([{ name: 'SquadMate', platform: 'steam' }])
})

test.describe('mobile touch history', () => {
  test.use({ viewport: { width: 360, height: 800 }, isMobile: true, hasTouch: true })

  test('long nicknames fit and touch selection and clearing work', async ({ page }) => {
    const name = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ123456'
    await seedHistory(page, [{ name, platform: 'kakao' }])
    const nickname = page.getByRole('textbox', { name: '플레이어 닉네임' })
    const history = page.getByRole('region', { name: '최근 검색 기록', exact: true })
    await nickname.tap()
    await expect(history).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await history.getByRole('button', { name: `${name} · Kakao`, exact: true }).tap()
    await expect(nickname).toHaveValue(name)
    await expect(page.getByRole('combobox', { name: '플랫폼', exact: true })).toContainText('Kakao')
    await expect(history).not.toBeVisible()

    await nickname.tap()
    await expect(history).toBeVisible()
    await history.getByRole('button', { name: '전체 삭제', exact: true }).tap()
    await expect(history).not.toBeVisible()
    expect(await savedHistory(page)).toEqual([])
    await page.reload()
    await expect(page.locator('[data-app-ready="true"]')).toBeVisible()
    await nickname.tap()
    await expect(history).not.toBeVisible()
  })
})

for (const storage of ['malformed', 'unavailable'] as const) {
  test(`${storage} history storage does not prevent searching`, async ({ page }) => {
    await installSearchFixture(page)
    const pageErrors: Error[] = []
    page.on('pageerror', (error) => pageErrors.push(error))
    await page.addInitScript(
      ({ key, storage }) => {
        if (storage === 'malformed') localStorage.setItem(key, '{broken json')
        else {
          const getItem = Storage.prototype.getItem
          const setItem = Storage.prototype.setItem
          Storage.prototype.getItem = function (requestedKey) {
            if (requestedKey === key) throw new DOMException('Storage blocked', 'SecurityError')
            return getItem.call(this, requestedKey)
          }
          Storage.prototype.setItem = function (requestedKey, value) {
            if (requestedKey === key) throw new DOMException('Storage blocked', 'SecurityError')
            return setItem.call(this, requestedKey, value)
          }
        }
      },
      { key: storageKey, storage },
    )
    await visitHome(page)
    await page.getByRole('textbox', { name: '플레이어 닉네임' }).click()
    await expect(
      page.getByRole('region', { name: '최근 검색 기록', exact: true }),
    ).not.toBeVisible()
    await search(page, 'SquadMate')
    if (storage === 'malformed') {
      expect(await savedHistory(page)).toEqual([{ name: 'SquadMate', platform: 'steam' }])
    }
    expect(pageErrors).toEqual([])
  })
}
