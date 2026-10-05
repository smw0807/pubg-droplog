import { expect, test, type Locator, type Page, type Route } from '@playwright/test'
import type { Report, ReportEvent } from '../../shared/types'

const reportId = 'demo-normal-squad'
const upgradedId = '11111111-1111-4111-8111-111111111111'
const startedAt = '2026-10-04T08:00:00.000Z'

function fixtureEvent(
  id: string,
  kind: ReportEvent['kind'],
  seconds: number,
  targetX: number | null,
  targetY: number | null,
): ReportEvent {
  return {
    id,
    sourceIndex: seconds,
    occurredAt: new Date(Date.parse(startedAt) + seconds * 1000).toISOString(),
    elapsedMs: seconds * 1000,
    kind,
    actor: {
      accountId: 'account.map-1',
      name: 'MapMate',
      memberNo: 1,
      location: targetX === null ? null : { x: 100000, y: 150000, z: 0 },
    },
    target: {
      accountId: 'account.map-opponent',
      name: 'MapOpponent',
      memberNo: null,
      location: targetX === null || targetY === null ? null : { x: targetX, y: targetY },
    },
    knockMaker: null,
    finisher: null,
    assists: [],
    weaponCode: kind === 'revive' ? null : 'WeapM416_C',
    damage: kind === 'damage' ? 12 : null,
    cause: 'combat',
    warnings: [],
  }
}

const majorEvents: ReportEvent[] = [
  fixtureEvent('knock-first', 'knock', 10, 250000, 280000),
  fixtureEvent('kill-overlap', 'kill', 20, 250000, 280000),
  fixtureEvent('revive-no-location', 'revive', 30, null, null),
  fixtureEvent('knock-other', 'knock', 40, 600000, 600000),
]
const damageEvents = Array.from({ length: 55 }, (_, index) =>
  fixtureEvent(
    `damage-${index}`,
    'damage',
    50 + index,
    120000 + index * 8000,
    180000 + index * 6000,
  ),
)

function reportFixture(
  overrides: { mapName?: string; analysisVersion?: string; id?: string } = {},
): Report {
  return {
    id: overrides.id ?? reportId,
    source: overrides.analysisVersion === '1' ? 'live' : 'demo',
    platform: 'steam',
    matchId: 'synthetic-map-match',
    rosterId: 'synthetic-map-roster',
    analysisVersion: overrides.analysisVersion ?? '2',
    revision: 1,
    quality: 'ready',
    summary: {
      mapName: overrides.mapName ?? 'Baltic_Main',
      createdAt: startedAt,
      queueType: 'normal',
      teamMode: 'squad',
      perspective: 'tpp',
      classificationVersion: '1',
      rank: 3,
      teamKills: 4,
      teamDamage: 500,
      killsComplete: true,
      damageComplete: true,
    },
    members: [
      {
        participantId: 'participant-map-1',
        accountId: 'account.map-1',
        name: 'MapMate',
        memberNo: 1,
        kills: 4,
        damageDealt: 500,
        revives: 1,
        timeSurvived: 1200,
        damageShare: 100,
      },
    ],
    warnings: [],
    generatedAt: startedAt,
    updatedAt: startedAt,
    retry: { available: false, notBefore: null, reason: 'READY' },
  }
}

async function installFixture(
  page: Page,
  options: { mapName?: string; analysisVersion?: string; events?: ReportEvent[] } = {},
) {
  const events = options.events ?? [...majorEvents, ...damageEvents]
  let upgrades = 0
  await page.route('**/api/reports/**', async (route) => {
    const url = new URL(route.request().url())
    const activeId = url.pathname.split('/')[3]!
    const report = reportFixture({
      ...options,
      id: activeId,
      analysisVersion: activeId === upgradedId ? '2' : options.analysisVersion,
    })
    const meta = { source: report.source, quality: report.quality, revision: report.revision }
    if (url.pathname.endsWith('/upgrade')) {
      expect(route.request().method()).toBe('POST')
      upgrades++
      await route.fulfill({
        json: { data: { reportId: upgradedId, quality: 'ready', reused: false }, meta },
      })
    } else if (url.pathname.endsWith('/events')) {
      const kinds = (url.searchParams.get('kinds') ?? 'knock,revive,kill').split(',')
      const member = url.searchParams.get('memberNo')
      const filtered = events.filter(
        (event) =>
          kinds.includes(event.kind) &&
          (!member ||
            [event.actor, event.target, event.knockMaker, event.finisher, ...event.assists].some(
              (role) => role?.memberNo === Number(member),
            )),
      )
      const offset = Number(url.searchParams.get('cursor') ?? 0)
      const limit = Number(url.searchParams.get('limit') ?? 50)
      await route.fulfill({
        json: {
          data: {
            events: filtered.slice(offset, offset + limit),
            total: filtered.length,
            nextCursor: offset + limit < filtered.length ? String(offset + limit) : null,
          },
          meta,
        },
      })
    } else if (url.pathname === `/api/reports/${activeId}`) {
      await route.fulfill({ json: { data: report, meta } })
    } else await route.abort('blockedbyclient')
  })
  return { upgrades: () => upgrades }
}

async function openReport(page: Page) {
  // Enter through client navigation so every report response is the local fixture,
  // including the first render; no real PUBG calls or database writes are needed.
  await page.goto('/')
  await expect(page.locator('[data-app-ready="true"]')).toBeVisible()
  await page.getByRole('link', { name: '샘플 리포트 보기' }).click()
  await expect(page.getByTestId('event-timeline')).toBeVisible()
}

const eventItem = (page: Page, id: string) =>
  page.getByTestId('timeline-event').and(page.locator(`[data-event-id="${id}"]`))
const mapOption = (page: Page, id: string) =>
  page.getByTestId('map-event-option').and(page.locator(`[data-event-id="${id}"]`))
const marker = (page: Page, id: string) =>
  page.getByTestId('event-marker').and(page.locator(`[data-event-id="${id}"]`))
const pressed = (locator: Locator) => locator.locator('[aria-pressed="true"]')

async function dispatchWheel(viewport: Locator, init: WheelEventInit) {
  return viewport.evaluate((element, options) => {
    const bounds = element.getBoundingClientRect()
    const event = new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      clientX: bounds.left + bounds.width / 2,
      clientY: bounds.top + bounds.height / 2,
      ...options,
    })
    element.dispatchEvent(event)
    return event.defaultPrevented
  }, init)
}

async function scrollPositions(viewport: Locator) {
  return viewport.evaluate((element) => {
    const ancestors = []
    for (let parent = element.parentElement; parent; parent = parent.parentElement)
      ancestors.push(parent.scrollTop)
    return { page: window.scrollY, ancestors }
  })
}

async function nextPaint(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  )
}

test('map pins and timeline select each other, including events sharing a coordinate', async ({
  page,
}) => {
  await installFixture(page)
  await openReport(page)
  await expect(page.getByTestId('event-marker')).toHaveCount(2)
  await marker(page, 'knock-first').click()
  await expect(eventItem(page, 'knock-first')).toHaveAttribute('aria-pressed', 'true')
  await expect(mapOption(page, 'knock-first')).toHaveAttribute('aria-pressed', 'true')
  await eventItem(page, 'kill-overlap').click()
  await expect(marker(page, 'knock-first')).toHaveAttribute('aria-pressed', 'true')
  await expect(mapOption(page, 'kill-overlap')).toHaveAttribute('aria-pressed', 'true')
  await expect(eventItem(page, 'knock-first')).toHaveAttribute('aria-pressed', 'false')
  await mapOption(page, 'knock-first').click()
  await expect(eventItem(page, 'knock-first')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('selected-target-marker')).toBeVisible()
  await expect(page.getByTestId('selected-actor-marker')).toBeVisible()
})

test('the selected connection follows both marker centers through zoom, pan, drag and pin changes', async ({
  page,
}) => {
  await installFixture(page)
  await openReport(page)
  const connection = page.getByTestId('selected-event-connection')
  const line = page.getByTestId('event-connection-line')
  const viewport = page.getByTestId('map-viewport')
  const expectAligned = async () => {
    await expect(connection).toBeVisible()
    await expect(line).toHaveCount(1)
    await expect
      .poll(() =>
        line.evaluate((element: SVGLineElement) => {
          const matrix = element.getScreenCTM()
          const map = element.closest('[data-testid="event-map"]')
          const actor = map?.querySelector('[data-testid="selected-actor-marker"]')
          const target = map?.querySelector('[data-testid="selected-target-marker"]')
          if (!matrix || !actor || !target) return Number.POSITIVE_INFINITY
          const start = new DOMPoint(
            element.x1.baseVal.value,
            element.y1.baseVal.value,
          ).matrixTransform(matrix)
          const end = new DOMPoint(
            element.x2.baseVal.value,
            element.y2.baseVal.value,
          ).matrixTransform(matrix)
          const actorBounds = actor.getBoundingClientRect()
          const targetBounds = target.getBoundingClientRect()
          return Math.max(
            Math.hypot(
              start.x - actorBounds.left - actorBounds.width / 2,
              start.y - actorBounds.top - actorBounds.height / 2,
            ),
            Math.hypot(
              end.x - targetBounds.left - targetBounds.width / 2,
              end.y - targetBounds.top - targetBounds.height / 2,
            ),
          )
        }),
      )
      .toBeLessThan(1.5)
  }

  await expect(connection).toHaveCount(0)
  await marker(page, 'knock-first').click()
  await expectAligned()
  expect(
    await line.evaluate((element) => {
      const style = getComputedStyle(element)
      return {
        start: style.getPropertyValue('marker-start'),
        end: style.getPropertyValue('marker-end'),
      }
    }),
  ).toEqual({ start: 'none', end: 'none' })

  await page.getByRole('button', { name: '지도 확대', exact: true }).click()
  await expect(viewport).toHaveAttribute('data-scale', '1.5')
  await expectAligned()
  await viewport.focus()
  const beforePan = await viewport.getAttribute('data-pan-x')
  await viewport.press('ArrowRight')
  await expect.poll(() => viewport.getAttribute('data-pan-x')).not.toBe(beforePan)
  await expectAligned()

  await viewport.scrollIntoViewIfNeeded()
  const bounds = await viewport.boundingBox()
  expect(bounds).not.toBeNull()
  const beforeDrag = await viewport.getAttribute('data-pan-y')
  await page.mouse.move(bounds!.x + bounds!.width * 0.15, bounds!.y + bounds!.height * 0.15)
  await page.mouse.down()
  await page.mouse.move(
    bounds!.x + bounds!.width * 0.15 + 24,
    bounds!.y + bounds!.height * 0.15 + 18,
    { steps: 4 },
  )
  await page.mouse.up()
  await expect.poll(() => viewport.getAttribute('data-pan-y')).not.toBe(beforeDrag)
  await expectAligned()
  await marker(page, 'knock-other').click()
  await expect(eventItem(page, 'knock-other')).toHaveAttribute('aria-pressed', 'true')
  await expectAligned()
})

test('connections are absent without two distinct valid positions or a supported map', async ({
  page,
}) => {
  const valid = fixtureEvent('connection-valid', 'knock', 1, 250000, 280000)
  const noActor = fixtureEvent('connection-no-actor', 'knock', 2, 250000, 280000)
  noActor.actor!.location = null
  const noTarget = fixtureEvent('connection-no-target', 'knock', 3, null, null)
  noTarget.actor!.location = { x: 100000, y: 150000 }
  const coincident = fixtureEvent('connection-same-position', 'knock', 4, 100000, 150000)
  const outOfBounds = fixtureEvent('connection-outside-map', 'knock', 5, 900000, 900000)
  await installFixture(page, { events: [valid, noActor, noTarget, coincident, outOfBounds] })
  await openReport(page)
  await expect(page.getByTestId('selected-event-connection')).toHaveCount(0)
  await eventItem(page, valid.id).click()
  await expect(page.getByTestId('event-connection-line')).toBeVisible()
  for (const event of [noActor, noTarget, coincident, outOfBounds]) {
    await eventItem(page, event.id).click()
    await expect(eventItem(page, event.id)).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByTestId('selected-event-connection')).toHaveCount(0)
    await expect(page.getByTestId('event-connection-line')).toHaveCount(0)
  }

  await page.unroute('**/api/reports/**')
  await installFixture(page, { mapName: 'FutureMap', events: [valid] })
  await openReport(page)
  await eventItem(page, valid.id).click()
  await expect(page.getByTestId('event-map-image')).toHaveCount(0)
  await expect(eventItem(page, valid.id)).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('selected-event-connection')).toHaveCount(0)
  await expect(page.getByTestId('event-connection-line')).toHaveCount(0)
})

test('filter changes clear selection while loading another events page retains it', async ({
  page,
}) => {
  await installFixture(page)
  await openReport(page)
  await eventItem(page, 'knock-first').click()
  await page.getByRole('button', { name: '피해', exact: true }).click()
  await expect(page.getByText('50/55개 이벤트 표시', { exact: true })).toBeVisible()
  await expect(pressed(page.getByTestId('event-timeline'))).toHaveCount(0)
  await expect(page.getByTestId('selected-target-marker')).toHaveCount(0)
  await eventItem(page, 'damage-0').click()
  await page.getByRole('button', { name: '이벤트 더 보기', exact: true }).click()
  await expect(page.getByText('55/55개 이벤트 표시', { exact: true })).toBeVisible()
  await expect(eventItem(page, 'damage-0')).toHaveAttribute('aria-pressed', 'true')
  await expect(mapOption(page, 'damage-0')).toHaveAttribute('aria-pressed', 'true')
  await expect(eventItem(page, 'damage-54')).toBeAttached()
  await expect(page.getByRole('button', { name: '이벤트 더 보기', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: '처치와 사망', exact: true }).click()
  await expect(eventItem(page, 'kill-overlap')).toBeVisible()
  await expect(pressed(page.getByTestId('event-timeline'))).toHaveCount(0)
})

test('zoom, keyboard movement, drag and reset work without changing event selection', async ({
  page,
}) => {
  await installFixture(page)
  await openReport(page)
  await eventItem(page, 'knock-other').click()
  const viewport = page.getByTestId('map-viewport')
  await page.getByRole('button', { name: '지도 확대', exact: true }).click()
  await expect
    .poll(async () => Number(await viewport.getAttribute('data-scale')))
    .toBeGreaterThan(1)
  const beforePan = await viewport.getAttribute('data-pan-x')
  await viewport.focus()
  await viewport.press('ArrowRight')
  await expect.poll(() => viewport.getAttribute('data-pan-x')).not.toBe(beforePan)
  await viewport.scrollIntoViewIfNeeded()
  const bounds = await viewport.boundingBox()
  expect(bounds).not.toBeNull()
  const beforeDrag = await viewport.getAttribute('data-pan-x')
  await page.mouse.move(bounds!.x + bounds!.width * 0.15, bounds!.y + bounds!.height * 0.15)
  await page.mouse.down()
  await page.mouse.move(
    bounds!.x + bounds!.width * 0.15 + 30,
    bounds!.y + bounds!.height * 0.15 + 24,
    { steps: 4 },
  )
  await page.mouse.up()
  await expect.poll(() => viewport.getAttribute('data-pan-x')).not.toBe(beforeDrag)
  await expect(eventItem(page, 'knock-other')).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: '지도 초기화', exact: true }).click()
  await expect(viewport).toHaveAttribute('data-scale', '1')
  await expect(viewport).toHaveAttribute('data-pan-x', '0')
  await expect(viewport).toHaveAttribute('data-pan-y', '0')
  await expect(eventItem(page, 'knock-other')).toHaveAttribute('aria-pressed', 'true')
})

test('map detail loads only after zoom and keeps the preview until it can display the full image', async ({
  page,
}) => {
  let detailRequests = 0
  let pendingDetail: Route | undefined
  await page.route('**/maps/erangel-high.webp', (route) => {
    detailRequests++
    if (detailRequests === 1) pendingDetail = route
    else return route.continue()
  })
  await installFixture(page)
  await openReport(page)
  const image = page.getByTestId('event-map-image')
  const viewport = page.getByTestId('map-viewport')
  await expect(image).toHaveAttribute('src', '/maps/erangel.webp')
  await expect
    .poll(() =>
      image.evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth),
    )
    .toBe(819)
  expect(detailRequests).toBe(0)

  await eventItem(page, 'knock-first').click()
  await page.getByRole('button', { name: '지도 확대', exact: true }).click()
  await expect.poll(() => detailRequests).toBe(1)
  await expect(image).toHaveAttribute('src', '/maps/erangel.webp')
  expect(
    await image.evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth),
  ).toBe(819)
  await expect(eventItem(page, 'knock-first')).toHaveAttribute('aria-pressed', 'true')

  await pendingDetail!.continue()
  await expect(image).toHaveAttribute('src', '/maps/erangel-high.webp', { timeout: 15000 })
  await expect
    .poll(
      () => image.evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth),
      { timeout: 15000 },
    )
    .toBe(8192)
  const loadedRequests = detailRequests
  await page.getByRole('button', { name: '지도 초기화', exact: true }).click()
  await expect(viewport).toHaveAttribute('data-scale', '1')
  await expect(image).toHaveAttribute('src', '/maps/erangel-high.webp')
  await expect(eventItem(page, 'knock-first')).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: '지도 확대', exact: true }).click()
  await nextPaint(page)
  expect(detailRequests).toBe(loadedRequests)
})

test('a failed map detail request preserves the decoded preview without a retry loop', async ({
  page,
}) => {
  let detailRequests = 0
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route('**/maps/erangel-high.webp', async (route) => {
    detailRequests++
    await route.abort('failed')
  })
  await installFixture(page)
  await openReport(page)
  const image = page.getByTestId('event-map-image')
  await expect
    .poll(() =>
      image.evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth),
    )
    .toBe(819)
  await page.getByRole('button', { name: '지도 확대', exact: true }).click()
  await expect.poll(() => detailRequests).toBe(1)
  await page.getByRole('button', { name: '지도 초기화', exact: true }).click()
  await page.getByRole('button', { name: '지도 확대', exact: true }).click()
  await nextPaint(page)
  await expect(image).toHaveAttribute('src', '/maps/erangel.webp')
  expect(
    await image.evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth),
  ).toBe(819)
  expect(detailRequests).toBe(1)
  expect(errors).toEqual([])
})

test('real wheel zoom keeps the cursor image point, selected event and scroll positions stable', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await installFixture(page)
  await openReport(page)
  await eventItem(page, 'knock-first').click()
  const viewport = page.getByTestId('map-viewport')
  const image = page.getByTestId('event-map-image')
  await viewport.scrollIntoViewIfNeeded()
  await nextPaint(page)
  const bounds = await viewport.boundingBox()
  expect(bounds).not.toBeNull()
  const cursor = { x: bounds!.x + bounds!.width * 0.62, y: bounds!.y + bounds!.height * 0.57 }
  const imagePoint = () =>
    image.evaluate((element, point) => {
      const rectangle = element.getBoundingClientRect()
      return {
        x: (point.x - rectangle.left) / rectangle.width,
        y: (point.y - rectangle.top) / rectangle.height,
        width: rectangle.width,
      }
    }, cursor)
  const before = await imagePoint()
  const originalScroll = await scrollPositions(viewport)
  await page.mouse.move(cursor.x, cursor.y)
  await page.mouse.wheel(0, -180)
  await expect
    .poll(async () => Number(await viewport.getAttribute('data-scale')))
    .toBeGreaterThan(1)
  await nextPaint(page)
  const enlargedScale = Number(await viewport.getAttribute('data-scale'))
  const enlarged = await imagePoint()
  expect(enlarged.x).toBeCloseTo(before.x, 3)
  expect(enlarged.y).toBeCloseTo(before.y, 3)
  expect(enlarged.width / before.width).toBeCloseTo(enlargedScale, 3)
  expect(await scrollPositions(viewport)).toEqual(originalScroll)

  await page.mouse.wheel(0, 40)
  await expect
    .poll(async () => Number(await viewport.getAttribute('data-scale')))
    .toBeLessThan(enlargedScale)
  await nextPaint(page)
  const reduced = await imagePoint()
  expect(reduced.x).toBeCloseTo(before.x, 3)
  expect(reduced.y).toBeCloseTo(before.y, 3)
  expect(await scrollPositions(viewport)).toEqual(originalScroll)
  await expect(eventItem(page, 'knock-first')).toHaveAttribute('aria-pressed', 'true')
  await expect(marker(page, 'knock-first')).toHaveAttribute('aria-pressed', 'true')
})

test('wheel pixel, line and page deltas work and remain consumed at both zoom limits', async ({
  page,
}) => {
  await installFixture(page)
  await openReport(page)
  const viewport = page.getByTestId('map-viewport')
  for (const { deltaMode, amount } of [
    { deltaMode: 0, amount: 40 },
    { deltaMode: 1, amount: 3 },
    { deltaMode: 2, amount: 0.1 },
  ]) {
    await viewport.focus()
    await viewport.press('Home')
    expect(await dispatchWheel(viewport, { deltaY: -amount, deltaMode })).toBe(true)
    await expect
      .poll(async () => Number(await viewport.getAttribute('data-scale')))
      .toBeGreaterThan(1)
    const enlarged = Number(await viewport.getAttribute('data-scale'))
    expect(await dispatchWheel(viewport, { deltaY: amount, deltaMode })).toBe(true)
    await expect
      .poll(async () => Number(await viewport.getAttribute('data-scale')))
      .toBeLessThan(enlarged)
    expect(Number(await viewport.getAttribute('data-scale'))).toBeGreaterThanOrEqual(1)
  }

  for (let index = 0; index < 20; index++)
    expect(await dispatchWheel(viewport, { deltaY: -10000 })).toBe(true)
  await expect(viewport).toHaveAttribute('data-scale', '32')
  await expect(page.getByRole('button', { name: '지도 확대', exact: true })).toBeDisabled()
  expect(await dispatchWheel(viewport, { deltaY: -10000 })).toBe(true)
  await nextPaint(page)
  await expect(viewport).toHaveAttribute('data-scale', '32')
  await page.getByRole('button', { name: '지도 축소', exact: true }).click()
  await expect(viewport).toHaveAttribute('data-scale', '31.5')
  await expect(page.getByRole('button', { name: '지도 확대', exact: true })).toBeEnabled()
  await viewport.focus()
  await viewport.press('+')
  await expect(viewport).toHaveAttribute('data-scale', '32')
  await expect(page.getByRole('button', { name: '지도 확대', exact: true })).toBeDisabled()
  for (let index = 0; index < 20; index++)
    expect(await dispatchWheel(viewport, { deltaY: 10000 })).toBe(true)
  await expect(viewport).toHaveAttribute('data-scale', '1')
  expect(await dispatchWheel(viewport, { deltaY: 10000 })).toBe(true)
  await nextPaint(page)
  await expect(viewport).toHaveAttribute('data-scale', '1')

  await viewport.scrollIntoViewIfNeeded()
  const bounds = await viewport.boundingBox()
  expect(bounds).not.toBeNull()
  await page.mouse.move(bounds!.x + bounds!.width / 2, bounds!.y + bounds!.height / 2)
  const originalScroll = await scrollPositions(viewport)
  await page.mouse.wheel(0, 400)
  await nextPaint(page)
  expect(await scrollPositions(viewport)).toEqual(originalScroll)
  await expect(viewport).toHaveAttribute('data-scale', '1')
})

test('browser zoom shortcuts, horizontal wheel and scrolling outside the map remain available', async ({
  page,
}) => {
  await installFixture(page)
  await openReport(page)
  const viewport = page.getByTestId('map-viewport')
  const initialScale = await viewport.getAttribute('data-scale')
  const initialPan = {
    x: await viewport.getAttribute('data-pan-x'),
    y: await viewport.getAttribute('data-pan-y'),
  }
  for (const input of [
    { deltaY: -80, ctrlKey: true },
    { deltaY: -80, metaKey: true },
    { deltaX: 80, deltaY: 0 },
  ]) {
    expect(await dispatchWheel(viewport, input)).toBe(false)
  }
  await nextPaint(page)
  await expect(viewport).toHaveAttribute('data-scale', initialScale!)
  await expect(viewport).toHaveAttribute('data-pan-x', initialPan.x!)
  await expect(viewport).toHaveAttribute('data-pan-y', initialPan.y!)

  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }))
  await page.mouse.move(5, 200)
  const scrollBefore = await page.evaluate(() => window.scrollY)
  await page.mouse.wheel(0, 400)
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(scrollBefore)
  await expect(viewport).toHaveAttribute('data-scale', initialScale!)
})

test('events without usable locations remain readable and selectable in the timeline', async ({
  page,
}) => {
  const invalid = fixtureEvent('invalid-location', 'kill', 45, 900000, 900000)
  invalid.actor!.location = null
  await installFixture(page, { events: [...majorEvents, invalid] })
  await openReport(page)
  await expect(page.getByTestId('timeline-event')).toHaveCount(5)
  await expect(page.getByTestId('event-marker')).toHaveCount(2)
  await eventItem(page, 'revive-no-location').click()
  await expect(eventItem(page, 'revive-no-location')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('selected-target-marker')).toHaveCount(0)
  await expect(page.getByTestId('selected-actor-marker')).toHaveCount(0)
  await eventItem(page, 'invalid-location').click()
  await expect(eventItem(page, 'invalid-location')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('selected-target-marker')).toHaveCount(0)
  await expect(page.getByTestId('event-timeline')).toContainText('MapOpponent')
})

test('more than 100 pin groups and more than six overlapping events remain individually reachable, including map boundaries', async ({
  page,
}) => {
  const grid = Array.from({ length: 200 }, (_, index) =>
    fixtureEvent(
      `grid-${index}`,
      'kill',
      index + 1,
      ((index % 20) / 19) * 816000,
      (Math.floor(index / 20) / 9) * 816000,
    ),
  )
  const overlapPoint = grid[21]!.target!.location!
  const overlaps = Array.from({ length: 7 }, (_, index) =>
    fixtureEvent(`overlap-${index}`, 'kill', 201 + index, overlapPoint.x, overlapPoint.y),
  )
  await installFixture(page, { events: [...grid, ...overlaps] })
  await openReport(page)
  for (const loaded of [100, 150, 200, 207]) {
    await page.getByRole('button', { name: '이벤트 더 보기', exact: true }).click()
    await expect(page.getByText(`${loaded}/207개 이벤트 표시`, { exact: true })).toBeVisible()
  }
  await expect(page.getByTestId('timeline-event')).toHaveCount(207)
  await expect(page.getByTestId('event-marker')).toHaveCount(100)
  await expect(marker(page, 'grid-0')).toBeVisible()
  expect(
    await marker(page, 'grid-0').evaluate((element) => ({
      x: (element as HTMLElement).style.left,
      y: (element as HTMLElement).style.top,
    })),
  ).toEqual({ x: '0%', y: '0%' })

  await marker(page, 'grid-21').click()
  await expect(page.getByTestId('map-event-option')).toHaveCount(6)
  await page.getByRole('button', { name: '다음 목록', exact: true }).click()
  await expect(page.getByTestId('map-event-option')).toHaveCount(2)
  await mapOption(page, 'overlap-6').click()
  await expect(eventItem(page, 'overlap-6')).toHaveAttribute('aria-pressed', 'true')
  await expect(marker(page, 'grid-21')).toHaveAttribute('aria-pressed', 'true')

  await page.getByRole('button', { name: '다음 지도 사건', exact: true }).click()
  await expect(page.getByTestId('event-marker')).toHaveCount(100)
  await expect(marker(page, 'grid-0')).toHaveCount(0)
  await expect(marker(page, 'grid-199')).toBeVisible()
  expect(
    await marker(page, 'grid-199').evaluate((element) => ({
      x: (element as HTMLElement).style.left,
      y: (element as HTMLElement).style.top,
    })),
  ).toEqual({ x: '100%', y: '100%' })
  await eventItem(page, 'grid-199').click()
  await expect(marker(page, 'grid-199')).toHaveAttribute('aria-pressed', 'true')
  await eventItem(page, 'grid-0').click()
  await expect(marker(page, 'grid-0')).toHaveAttribute('aria-pressed', 'true')
  await expect(marker(page, 'grid-199')).toHaveCount(0)
})

for (const { mapName, slug, extent } of [
  { mapName: 'Savage_Main', slug: 'sanhok', extent: 408000 },
  { mapName: 'DihorOtok_Main', slug: 'vikendi', extent: 816000 },
  { mapName: 'Summerland_Main', slug: 'karakin', extent: 204000 },
  { mapName: 'Kiki_Main', slug: 'deston', extent: 816000 },
  { mapName: 'Chimera_Main', slug: 'paramo', extent: 306000 },
  { mapName: 'Heaven_Main', slug: 'haven', extent: 102000 },
]) {
  test(`${slug} decodes its official preview and detail while keeping in-bounds events selectable`, async ({
    page,
  }) => {
    let detailRequests = 0
    page.on('request', (request) => {
      if (new URL(request.url()).pathname === `/maps/${slug}-high.webp`) detailRequests++
    })
    const event = fixtureEvent('map-center', 'knock', 10, extent * 0.25, extent * 0.5)
    event.actor!.location = { x: extent * 0.2, y: extent * 0.4, z: 0 }
    await installFixture(page, { mapName, events: [event] })
    await openReport(page)
    const image = page.getByTestId('event-map-image')
    await expect(image).toHaveAttribute('src', `/maps/${slug}.webp`)
    await expect
      .poll(() =>
        image.evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth),
      )
      .toBe(1024)
    expect(detailRequests).toBe(0)
    await expect(page.getByTestId('map-unsupported')).toHaveCount(0)
    await expect(page.getByTestId('event-marker')).toHaveCount(1)
    expect(
      await marker(page, event.id).evaluate((element) => ({
        x: (element as HTMLElement).style.left,
        y: (element as HTMLElement).style.top,
      })),
    ).toEqual({ x: '25%', y: '50%' })
    await marker(page, event.id).click()
    await expect(eventItem(page, event.id)).toHaveAttribute('aria-pressed', 'true')

    await page.getByRole('button', { name: '지도 확대', exact: true }).click()
    await expect.poll(() => detailRequests).toBeGreaterThan(0)
    await expect(image).toHaveAttribute('src', `/maps/${slug}-high.webp`, { timeout: 15000 })
    await expect
      .poll(
        () =>
          image.evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth),
        { timeout: 15000 },
      )
      .toBe(8192)
    await expect(eventItem(page, event.id)).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByTestId('selected-target-marker')).toBeVisible()
    await expect(page.getByTestId('selected-actor-marker')).toBeVisible()
  })
}

test('an unrecognized map keeps the timeline usable when there is no map image', async ({
  page,
}) => {
  await installFixture(page, { mapName: 'Unrecognized_Map' })
  await openReport(page)
  await expect(page.getByTestId('event-map-image')).toHaveCount(0)
  await expect(page.getByTestId('event-marker')).toHaveCount(0)
  await expect(page.getByTestId('timeline-event')).toHaveCount(4)
  await eventItem(page, 'knock-first').click()
  await expect(eventItem(page, 'knock-first')).toHaveAttribute('aria-pressed', 'true')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('Rondo projects event coordinates and connects the selected actor and target', async ({
  page,
}) => {
  const event = fixtureEvent('rondo-kill', 'kill', 20, 526_347.25, 437_304.125)
  event.target!.location!.z = 497.1755065917969
  await installFixture(page, { mapName: 'Neon_Main', events: [event] })
  await openReport(page)
  const image = page.getByTestId('event-map-image')
  await expect(image).toHaveAttribute('src', '/maps/rondo.webp')
  await expect
    .poll(() =>
      image.evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth > 0),
    )
    .toBe(true)
  await expect(page.getByTestId('map-unsupported')).toHaveCount(0)
  await expect(page.getByTestId('map-no-locations')).toHaveCount(0)
  await expect(page.getByTestId('event-marker')).toHaveCount(1)
  await expect(page.getByTestId('timeline-event')).toHaveCount(1)
  const position = await marker(page, event.id).evaluate((element) => ({
    x: Number.parseFloat((element as HTMLElement).style.left),
    y: Number.parseFloat((element as HTMLElement).style.top),
  }))
  expect(position.x).toBeCloseTo(64.50333946078432)
  expect(position.y).toBeCloseTo(53.591191789215685)
  await marker(page, event.id).click()
  await expect(eventItem(page, event.id)).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('selected-target-marker')).toBeVisible()
  await expect(page.getByTestId('selected-actor-marker')).toBeVisible()
  await expect(page.getByTestId('selected-event-connection')).toBeVisible()
  const endpoint = await page.getByTestId('event-connection-line').evaluate((element) => ({
    x: Number.parseFloat(element.getAttribute('x2')!),
    y: Number.parseFloat(element.getAttribute('y2')!),
  }))
  expect(endpoint.x).toBeCloseTo(position.x)
  expect(endpoint.y).toBeCloseTo(position.y)
})

test('a legacy report upgrades only after a click and navigates to a separate report URL', async ({
  page,
}) => {
  const requests = await installFixture(page, {
    analysisVersion: '1',
    events: majorEvents.map((event) => ({
      ...event,
      actor: event.actor ? { ...event.actor, location: undefined } : null,
      target: event.target ? { ...event.target, location: undefined } : null,
    })),
  })
  await openReport(page)
  await expect(
    page.getByText('이전에 만든 리포트에는 위치가 저장되어 있지 않아요.', { exact: true }),
  ).toBeVisible()
  expect(requests.upgrades()).toBe(0)
  await page.getByRole('button', { name: '위치 포함 리포트 열기', exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`/reports/${upgradedId}$`))
  expect(requests.upgrades()).toBe(1)
  await expect(
    page.getByText('이전에 만든 리포트에는 위치가 저장되어 있지 않아요.', { exact: true }),
  ).toHaveCount(0)
  await expect(page.getByTestId('event-timeline')).toBeVisible()
})

for (const width of [360, 768, 1440]) {
  for (const theme of ['dark', 'light']) {
    test(`event map ${width}px ${theme} has decoded imagery and no page overflow`, async ({
      page,
    }) => {
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      await page.setViewportSize({ width, height: 960 })
      await page.addInitScript((value) => localStorage.setItem('nuxt-color-mode', value), theme)
      await installFixture(page)
      await openReport(page)
      await expect(page.locator('html')).toHaveClass(new RegExp(theme))
      const image = page.getByTestId('event-map-image')
      await expect(image).toBeVisible()
      await expect
        .poll(() =>
          image.evaluate(
            (element: HTMLImageElement) => element.complete && element.naturalWidth > 0,
          ),
        )
        .toBe(true)
      await eventItem(page, 'knock-first').click()
      await expect(page.getByTestId('selected-target-marker')).toBeVisible()
      if (width === 360) {
        await page.getByRole('button', { name: '지도에서 보기', exact: true }).click()
        await expect(page.getByTestId('map-viewport')).toBeFocused()
        await expect(page.getByTestId('map-viewport')).toBeInViewport()
        await expect(marker(page, 'knock-first')).toHaveAttribute('aria-pressed', 'true')
        await page.getByRole('button', { name: '타임라인에서 보기', exact: true }).click()
        await expect(eventItem(page, 'knock-first')).toBeFocused()
        await expect(eventItem(page, 'knock-first')).toBeInViewport()
        await expect(eventItem(page, 'knock-first')).toHaveAttribute('aria-pressed', 'true')
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      )
      for (const label of ['지도 확대', '지도 축소', '지도 초기화']) {
        const box = await page.getByRole('button', { name: label, exact: true }).boundingBox()
        expect(box?.height).toBeGreaterThanOrEqual(44)
        expect(box?.width).toBeGreaterThanOrEqual(44)
      }
      expect(errors).toEqual([])
    })
  }
}
