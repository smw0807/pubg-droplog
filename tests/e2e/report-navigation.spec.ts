import { expect, test, type BrowserContext, type Page } from '@playwright/test'
import type { Report } from '../../shared/types'

const reportId = 'demo-normal-squad'
const upgradedId = '11111111-1111-4111-8111-111111111111'
const playerId = 'account.demo-2'
const filters = { queueType: 'ranked', teamMode: 'duo' }
const contextQuery = { playerId, ...filters }
const startedAt = '2026-10-04T08:00:00.000Z'
const members: Report['members'] = ['SquadMate', 'AerialFox'].map((name, index) => ({
  participantId: `participant-navigation-${index + 1}`,
  accountId: `account.demo-${index + 1}`,
  name,
  memberNo: index + 1,
  kills: 1,
  damageDealt: 100,
  revives: 0,
  timeSurvived: 1200,
  damageShare: 50,
}))

function reportFixture(id: string, analysisVersion: string): Report {
  return {
    id,
    source: analysisVersion === '1' ? 'live' : 'demo',
    platform: 'steam',
    matchId: 'synthetic-navigation-match',
    rosterId: 'synthetic-navigation-roster',
    analysisVersion,
    revision: 1,
    quality: 'ready',
    summary: {
      mapName: 'Baltic_Main',
      createdAt: startedAt,
      queueType: 'ranked',
      teamMode: 'duo',
      perspective: 'tpp',
      classificationVersion: '1',
      rank: 3,
      teamKills: 2,
      teamDamage: 200,
      killsComplete: true,
      damageComplete: true,
    },
    members,
    warnings: [],
    generatedAt: startedAt,
    updatedAt: startedAt,
    retry: { available: false, notBefore: null, reason: 'READY' },
  }
}

async function installFixture(target: Page | BrowserContext, legacy = false) {
  let upgrades = 0
  await target.route('**/api/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const meta = { source: 'demo', quality: 'ready', revision: 1 }
    if (url.pathname === '/api/status') {
      await route.fulfill({ json: { data: { mode: 'demo' } } })
    } else if (url.pathname === '/api/players/search') {
      await route.fulfill({
        json: { data: { accountId: playerId, displayName: 'AerialFox', platform: 'steam' }, meta },
      })
    } else if (url.pathname.endsWith('/matches')) {
      const accountId = url.pathname.split('/')[4]!
      await route.fulfill({
        json: {
          data: {
            player: {
              accountId,
              displayName: members.find((member) => member.accountId === accountId)!.name,
              platform: 'steam',
            },
            matches: [
              {
                matchId: 'synthetic-navigation-match',
                createdAt: startedAt,
                mapName: 'Baltic_Main',
                queueType: 'ranked',
                teamMode: 'duo',
                perspective: 'tpp',
                classificationVersion: '1',
                rank: 3,
                kills: 1,
                damageDealt: 100,
                memberCount: 2,
              },
            ],
            nextCursor: null,
          },
          meta: {
            source: 'demo',
            fetchedAt: startedAt,
            checked: 1,
            total: 1,
            matched: 1,
            excluded: 0,
            unclassified: 0,
            failed: 0,
            failedMatchIds: [],
            complete: true,
            snapshotId: 'synthetic-navigation-snapshot',
          },
        },
      })
    } else if (url.pathname === '/api/reports') {
      expect(request.method()).toBe('POST')
      expect(request.postDataJSON()).toEqual({
        platform: 'steam',
        playerId,
        matchId: 'synthetic-navigation-match',
      })
      await route.fulfill({
        json: { data: { reportId, quality: 'ready', reused: false }, meta },
      })
    } else if (url.pathname === `/api/reports/${reportId}/upgrade`) {
      expect(request.method()).toBe('POST')
      upgrades++
      await route.fulfill({
        json: { data: { reportId: upgradedId, quality: 'ready', reused: false }, meta },
      })
    } else if (url.pathname.endsWith('/events')) {
      await route.fulfill({ json: { data: { events: [], total: 0, nextCursor: null }, meta } })
    } else if ([`/api/reports/${reportId}`, `/api/reports/${upgradedId}`].includes(url.pathname)) {
      const id = url.pathname.split('/')[3]!
      await route.fulfill({
        json: { data: reportFixture(id, legacy && id === reportId ? '1' : '2'), meta },
      })
    } else await route.continue()
  })
  return { upgrades: () => upgrades }
}

async function expectLocation(page: Page, pathname: string, query: Record<string, string> = {}) {
  await expect(page).toHaveURL(
    (url) =>
      url.pathname === pathname &&
      JSON.stringify([...url.searchParams].sort()) === JSON.stringify(Object.entries(query).sort()),
  )
}

async function expectHistoryLink(
  page: Page,
  accountId: string,
  query: Record<string, string> = {},
) {
  await expect(page.locator('[data-app-ready="true"]')).toBeVisible()
  const link = page.getByRole('link', { name: '전적 목록', exact: true })
  await expect(link).toBeVisible()
  const destination = new URL((await link.getAttribute('href'))!, page.url())
  expect(destination.pathname).toBe(`/players/steam/${accountId}`)
  expect(Object.fromEntries(destination.searchParams)).toEqual(query)
  return link
}

async function openFromFilteredHistory(page: Page) {
  await page.goto('/')
  await expect(page.locator('[data-app-ready="true"]')).toBeVisible()
  await page.getByRole('textbox', { name: '플레이어 닉네임' }).fill('AerialFox')
  await page.getByRole('button', { name: '최근 경기 검색', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'AerialFox', exact: true })).toBeVisible()
  for (const [label, option] of [
    ['경기 종류', '랭크'],
    ['팀 모드', '듀오'],
  ]) {
    await page.getByRole('combobox', { name: label, exact: true }).click()
    await page.getByRole('option', { name: option, exact: true }).click()
  }
  await expectLocation(page, `/players/steam/${playerId}`, filters)
  await page.getByRole('button', { name: '리포트 보기', exact: true }).click()
  await expectLocation(page, `/reports/${reportId}`, contextQuery)
}

test('a report returns to the searched second member and preserves match filters', async ({
  page,
}) => {
  await installFixture(page)
  await openFromFilteredHistory(page)
  await (await expectHistoryLink(page, playerId, filters)).click()
  await expectLocation(page, `/players/steam/${playerId}`, filters)
  await expect(page.getByRole('heading', { name: 'AerialFox', exact: true })).toBeVisible()
  await expect(page.getByRole('combobox', { name: '경기 종류', exact: true })).toContainText('랭크')
  await expect(page.getByRole('combobox', { name: '팀 모드', exact: true })).toContainText('듀오')
})

test('refresh and a shared report in a fresh context retain the original match-list destination', async ({
  page,
  browser,
}) => {
  await installFixture(page)
  await openFromFilteredHistory(page)
  const sharedUrl = page.url()
  // Reserved demo IDs also render safely on the server, where browser API routing
  // cannot intercept useFetch. Refresh/shared access never requires a database.
  await page.reload()
  await expectLocation(page, `/reports/${reportId}`, contextQuery)
  await expectHistoryLink(page, playerId, filters)
  const fresh = await browser.newContext()
  try {
    await installFixture(fresh)
    const shared = await fresh.newPage()
    await shared.goto(sharedUrl)
    await (await expectHistoryLink(shared, playerId, filters)).click()
    await expectLocation(shared, `/players/steam/${playerId}`, filters)
    await expect(shared.getByRole('heading', { name: 'AerialFox', exact: true })).toBeVisible()
  } finally {
    await fresh.close()
  }
})

test('direct reports without valid context use the first member and default match filters', async ({
  page,
}) => {
  await installFixture(page)
  for (const query of [
    '',
    '?playerId=account.outside-team&queueType=unsupported&teamMode=solo&returnTo=https://example.com',
  ]) {
    await page.goto(`/reports/${reportId}${query}`)
    await (await expectHistoryLink(page, 'account.demo-1')).click()
    await expectLocation(page, '/players/steam/account.demo-1')
    await expect(page.getByRole('heading', { name: 'SquadMate', exact: true })).toBeVisible()
    await expect(page.getByRole('combobox', { name: '경기 종류', exact: true })).toContainText(
      '전체',
    )
    await expect(page.getByRole('combobox', { name: '팀 모드', exact: true })).toContainText('전체')
  }
})

test('upgrading a legacy report preserves the searched player and match-list filters', async ({
  page,
}) => {
  const requests = await installFixture(page, true)
  await openFromFilteredHistory(page)
  await page.getByRole('button', { name: '위치 포함 리포트 열기', exact: true }).click()
  await expectLocation(page, `/reports/${upgradedId}`, contextQuery)
  expect(requests.upgrades()).toBe(1)
  await (await expectHistoryLink(page, playerId, filters)).click()
  await expectLocation(page, `/players/steam/${playerId}`, filters)
})
