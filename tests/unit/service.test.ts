import { afterEach, describe, expect, it, vi } from 'vitest'
import { createReviewService } from '../../server/services/review'
import type { Provider } from '../../server/services/provider'
import { ANALYSIS_VERSION, analyzeReport } from '../../server/domain/report'
import {
  demoPlayer,
  demoMatches,
  largeDemoMatches,
  demoTelemetry,
} from '../../server/fixtures/demo'
import type { MatchSnapshot } from '../../server/domain/match'
import { ApiError } from '../../server/utils/errors'
import { MemoryRepository } from '../helpers/memory-repository'

const playerId = demoPlayer.accountId
const matchId = 'demo-match-normal-squad'
const input = { platform: 'steam' as const, matchId, playerId }
const allFilters = { queueType: 'all' as const, teamMode: 'all' as const }
const allKinds = ['damage', 'kill', 'knock', 'revive'] as const

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}

function fakeProvider(source: 'demo' | 'live' = 'live', records: MatchSnapshot[] = demoMatches) {
  const matches = records.map((match) => ({ ...structuredClone(match), source }))
  const player = {
    accountId: playerId,
    displayName: demoPlayer.displayName,
    matchIds: matches.map((match) => match.matchId),
  }
  const provider: Provider = {
    source,
    searchPlayer: vi.fn(async () => player),
    getPlayer: vi.fn(async () => player),
    getMatch: vi.fn(async (platform, id) => {
      const match = matches.find((candidate) => candidate.matchId === id)
      if (!match) throw new ApiError('MATCH_UNAVAILABLE', 404, '경기 없음')
      return { match: { ...match, platform }, telemetryUrl: `fixture:${id}` }
    }),
    getTelemetry: vi.fn(async (url) => demoTelemetry(url.slice('fixture:'.length))),
  }
  return provider
}

afterEach(() => vi.useRealTimers())

describe('explicit report analysis upgrades', () => {
  async function seedLegacy(repo: MemoryRepository, source: 'demo' | 'live' = 'live') {
    const match = { ...structuredClone(demoMatches[0]!), source }
    const old = analyzeReport({
      match,
      playerId,
      telemetry: demoTelemetry(matchId),
      reportId: 'legacy-report',
      generatedAt: '2026-10-04T12:00:00.000Z',
    })
    old.analysisVersion = '1'
    for (const event of old.events) {
      for (const role of [
        event.actor,
        event.target,
        event.knockMaker,
        event.finisher,
        ...event.assists,
      ]) {
        if (role) delete role.location
      }
    }
    await repo.saveMatch(match)
    await repo.saveReport(old)
    return old
  }

  it('creates a new current-version report while preserving every field of the old report', async () => {
    const repo = new MemoryRepository()
    const old = await seedLegacy(repo)
    const provider = fakeProvider()
    const service = createReviewService(repo, provider)
    const before = await service.report(old.id)
    const upgraded = await service.upgrade(old.id, 'upgrade-client')
    expect(ANALYSIS_VERSION).toBe('2')
    expect(upgraded.data).toMatchObject({ reused: false, quality: 'ready' })
    expect(upgraded.data.reportId).toMatch(/^[a-f0-9-]{36}$/)
    expect(upgraded.data.reportId).not.toBe(old.id)
    expect(await repo.getReport(old.id)).toEqual(old)
    expect(await service.report(old.id)).toEqual(before)
    expect((await service.report(upgraded.data.reportId)).data).toMatchObject({
      analysisVersion: ANALYSIS_VERSION,
      revision: 1,
      matchId: old.matchId,
      rosterId: old.rosterId,
      source: old.source,
    })
    expect(repo.reports.size).toBe(2)
    expect(provider.getTelemetry).toHaveBeenCalledTimes(1)
  })

  it('reuses an existing current-version report requested by another member of the same team', async () => {
    const repo = new MemoryRepository()
    const old = await seedLegacy(repo)
    const provider = fakeProvider()
    const service = createReviewService(repo, provider)
    const teammate = old.members.find((member) => member.accountId !== playerId)!
    const current = await service.create({ ...input, playerId: teammate.accountId }, 'teammate')
    vi.mocked(provider.getMatch).mockClear()
    vi.mocked(provider.getTelemetry).mockClear()
    await expect(service.upgrade(old.id, 'upgrade-client')).resolves.toMatchObject({
      data: { reportId: current.data.reportId, reused: true },
    })
    expect(provider.getMatch).not.toHaveBeenCalled()
    expect(provider.getTelemetry).not.toHaveBeenCalled()
    expect(await repo.getReport(old.id)).toEqual(old)
    expect(repo.reports.size).toBe(2)
  })

  it('coalesces simultaneous upgrade requests into one new analysis without replacing the legacy row', async () => {
    const repo = new MemoryRepository()
    const old = await seedLegacy(repo)
    const provider = fakeProvider()
    const analyze = vi.fn(analyzeReport)
    const service = createReviewService(repo, provider, { analyze })
    const results = await Promise.all(
      Array.from({ length: 10 }, (_, index) => service.upgrade(old.id, `upgrade-${index}`)),
    )
    expect(new Set(results.map((result) => result.data.reportId)).size).toBe(1)
    expect(results.filter((result) => !result.data.reused)).toHaveLength(1)
    expect(provider.getTelemetry).toHaveBeenCalledTimes(1)
    expect(analyze).toHaveBeenCalledTimes(1)
    expect(repo.reports.size).toBe(2)
    expect(await repo.getReport(old.id)).toEqual(old)
  })

  it('returns the current report itself without another upstream request', async () => {
    const repo = new MemoryRepository()
    const provider = fakeProvider()
    const service = createReviewService(repo, provider)
    const current = await service.create(input, 'create')
    vi.mocked(provider.getMatch).mockClear()
    vi.mocked(provider.getTelemetry).mockClear()
    await expect(service.upgrade(current.data.reportId, 'upgrade')).resolves.toMatchObject({
      data: { reportId: current.data.reportId, reused: true },
    })
    expect(provider.getMatch).not.toHaveBeenCalled()
    expect(provider.getTelemetry).not.toHaveBeenCalled()
    expect(repo.reports.size).toBe(1)
  })

  it('rate-limits the sixth upgrade from one client even when every call reuses a current report', async () => {
    const provider = fakeProvider()
    const service = createReviewService(new MemoryRepository(), provider)
    const current = await service.create(input, 'separate-creator')
    vi.mocked(provider.getMatch).mockClear()
    vi.mocked(provider.getTelemetry).mockClear()
    for (let index = 0; index < 5; index++) {
      await expect(
        service.upgrade(current.data.reportId, 'same-upgrade-client'),
      ).resolves.toMatchObject({ data: { reportId: current.data.reportId, reused: true } })
    }
    await expect(
      service.upgrade(current.data.reportId, 'same-upgrade-client'),
    ).rejects.toMatchObject({ code: 'RATE_LIMITED', status: 429, retryAfterSeconds: 60 })
    expect(provider.getMatch).not.toHaveBeenCalled()
    expect(provider.getTelemetry).not.toHaveBeenCalled()
  })

  it('charges a newly created upgrade once so four reuses still fit the same client write allowance', async () => {
    const repo = new MemoryRepository()
    const old = await seedLegacy(repo)
    const provider = fakeProvider()
    const service = createReviewService(repo, provider)
    const created = await service.upgrade(old.id, 'same-upgrade-client')
    expect(created.data.reused).toBe(false)
    for (let index = 0; index < 4; index++) {
      await expect(service.upgrade(old.id, 'same-upgrade-client')).resolves.toMatchObject({
        data: { reportId: created.data.reportId, reused: true },
      })
    }
    await expect(service.upgrade(old.id, 'same-upgrade-client')).rejects.toMatchObject({
      code: 'RATE_LIMITED',
      status: 429,
      retryAfterSeconds: 60,
    })
    expect(provider.getTelemetry).toHaveBeenCalledTimes(1)
    expect(await repo.getReport(old.id)).toEqual(old)
    expect(repo.reports.size).toBe(2)
  })

  it.each(['demo', 'live'] as const)(
    'refuses a missing %s upgrade when the active provider has another source',
    async (source) => {
      const repo = new MemoryRepository()
      const old = await seedLegacy(repo, source)
      const provider = fakeProvider(source === 'live' ? 'demo' : 'live')
      const service = createReviewService(repo, provider)
      const otherSource = await service.create(input, 'other-source-create')
      vi.mocked(provider.getMatch).mockClear()
      vi.mocked(provider.getTelemetry).mockClear()
      await expect(service.upgrade(old.id, 'upgrade')).rejects.toMatchObject({
        code: 'SERVER_MISCONFIGURED',
        status: 503,
      })
      expect(otherSource.data.reportId).not.toBe(old.id)
      expect(provider.getMatch).not.toHaveBeenCalled()
      expect(provider.getTelemetry).not.toHaveBeenCalled()
      expect(await repo.getReport(old.id)).toEqual(old)
      expect(repo.reports.size).toBe(2)
    },
  )

  it.each(['demo', 'live'] as const)(
    'reuses a persisted %s upgrade even after the active server source changes',
    async (source) => {
      const repo = new MemoryRepository()
      const old = await seedLegacy(repo, source)
      const creator = createReviewService(repo, fakeProvider(source))
      const current = await creator.create(input, 'create')
      const inactiveProvider = fakeProvider(source === 'live' ? 'demo' : 'live')
      const service = createReviewService(repo, inactiveProvider)
      await expect(service.upgrade(old.id, 'upgrade')).resolves.toMatchObject({
        data: { reportId: current.data.reportId, reused: true },
        meta: { source },
      })
      expect(inactiveProvider.getMatch).not.toHaveBeenCalled()
      expect(inactiveProvider.getTelemetry).not.toHaveBeenCalled()
      expect(await repo.getReport(old.id)).toEqual(old)
    },
  )
})

describe('report creation and bounded single-process work', () => {
  it('coalesces 10 different clients on one team into one analysis and one persisted report', async () => {
    const repo = new MemoryRepository()
    const provider = fakeProvider()
    const analyze = vi.fn(analyzeReport)
    const service = createReviewService(repo, provider, { analyze })
    const reports = await Promise.all(
      Array.from({ length: 10 }, (_, index) => service.create(input, `client-${index}`)),
    )
    expect(new Set(reports.map((report) => report.data.reportId)).size).toBe(1)
    expect(reports.filter((report) => !report.data.reused)).toHaveLength(1)
    expect(reports.filter((report) => report.data.reused)).toHaveLength(9)
    expect(provider.getMatch).toHaveBeenCalledTimes(1)
    expect(provider.getTelemetry).toHaveBeenCalledTimes(1)
    expect(analyze).toHaveBeenCalledTimes(1)
    expect(repo.saveReportCount).toBe(1)
    const reused = await service.create(input, 'new-client')
    expect(reused.data.reused).toBe(true)
    expect(provider.getTelemetry).toHaveBeenCalledTimes(1)
  })

  it('blocks a sixth write from one client even when the report is already reusable', async () => {
    const service = createReviewService(new MemoryRepository(), fakeProvider())
    for (let index = 0; index < 5; index++) await service.create(input, 'same-client')
    await expect(service.create(input, 'same-client')).rejects.toMatchObject({
      status: 429,
      retryAfterSeconds: 60,
    })
  })

  it('rejects another analysis while occupied and frees the slot afterwards', async () => {
    const provider = fakeProvider()
    const gate = deferred<unknown>()
    vi.mocked(provider.getTelemetry).mockImplementationOnce(() => gate.promise)
    const service = createReviewService(new MemoryRepository(), provider)
    const first = service.create(input, 'first')
    await vi.waitFor(() => expect(provider.getTelemetry).toHaveBeenCalledOnce())
    const other = { ...input, matchId: 'demo-match-normal-duo' }
    await expect(service.create(other, 'second')).rejects.toMatchObject({
      code: 'ANALYSIS_BUSY',
      status: 429,
    })
    gate.resolve(demoTelemetry(matchId))
    await first
    await expect(service.create(other, 'third')).resolves.toMatchObject({
      data: { quality: 'ready' },
    })
  })

  it('reports a storage failure and permits a subsequent clean attempt', async () => {
    const repo = new MemoryRepository()
    vi.spyOn(repo, 'saveReport').mockRejectedValueOnce(
      new ApiError('STORAGE_ERROR', 503, '저장 실패'),
    )
    const service = createReviewService(repo, fakeProvider())
    await expect(service.create(input, 'one')).rejects.toMatchObject({ code: 'STORAGE_ERROR' })
    expect(repo.reports.size).toBe(0)
    await expect(service.create(input, 'two')).resolves.toMatchObject({
      data: { quality: 'ready' },
    })
    expect(repo.reports.size).toBe(1)
  })

  it('keeps persisted demo and live reports separate and preserves demo source after mode change', async () => {
    const repo = new MemoryRepository()
    const demo = createReviewService(repo, fakeProvider('demo'))
    const live = createReviewService(repo, fakeProvider('live'))
    const sample = await demo.create(input, 'one')
    const actual = await live.create(input, 'two')
    expect(sample.data.reportId).not.toBe(actual.data.reportId)
    expect(repo.reports.size).toBe(2)
    expect((await live.report(sample.data.reportId)).data).toMatchObject({
      source: 'demo',
      retry: { available: false, reason: 'DEMO_REPORT' },
    })
    await expect(live.retry(sample.data.reportId, 'three')).rejects.toMatchObject({
      code: 'RETRY_UNAVAILABLE',
    })
  })

  it('returns a saved partial report within the original 30 second budget and cancels telemetry', async () => {
    vi.useFakeTimers()
    const provider = fakeProvider()
    const original = provider.getMatch
    vi.mocked(provider.getMatch).mockImplementationOnce(
      (platform, id, signal) =>
        new Promise((resolve) => {
          setTimeout(() => {
            void original(platform, id, signal).then(resolve)
          }, 9000)
        }),
    )
    let cancelled = false
    vi.mocked(provider.getTelemetry).mockImplementation(
      (_url, signal) =>
        new Promise((_resolve, reject) => {
          signal?.addEventListener(
            'abort',
            () => {
              cancelled = true
              reject(signal.reason)
            },
            { once: true },
          )
        }),
    )
    const repo = new MemoryRepository()
    const service = createReviewService(repo, provider)
    const started = Date.now()
    const pending = service.create(input, 'one')
    await vi.advanceTimersByTimeAsync(24000)
    const result = await pending
    expect(Date.now() - started).toBe(24000)
    expect(result.data.quality).toBe('partial')
    expect(cancelled).toBe(true)
    expect(repo.reports.size).toBe(1)
  })
})

describe('partial retry and stable event cursors', () => {
  it('preserves a failed retry, enforces 60 seconds, then improves the same ID and revision', async () => {
    let now = Date.parse('2026-10-04T12:00:00.000Z')
    const repo = new MemoryRepository()
    const provider = fakeProvider()
    vi.mocked(provider.getTelemetry).mockRejectedValueOnce(
      new ApiError('UPSTREAM_TIMEOUT', 504, '시간 초과'),
    )
    const service = createReviewService(repo, provider, { now: () => now })
    const created = await service.create(input, 'create')
    const id = created.data.reportId
    const original = await service.report(id)
    expect(original.data.quality).toBe('partial')
    expect(original.data.summary.teamKills).toBe(8)
    vi.mocked(provider.getTelemetry).mockRejectedValueOnce(
      new ApiError('UPSTREAM_TIMEOUT', 504, '시간 초과'),
    )
    const failed = await service.retry(id, 'retry-1')
    expect(failed.data).toMatchObject({
      id,
      quality: 'partial',
      revision: 1,
      summary: original.data.summary,
    })
    await expect(service.retry(id, 'retry-2')).rejects.toMatchObject({
      status: 429,
      retryAfterSeconds: 60,
    })
    now += 60_000
    const improved = await service.retry(id, 'retry-3')
    expect(improved.data).toMatchObject({
      id,
      quality: 'ready',
      revision: 2,
      generatedAt: original.data.generatedAt,
    })
    await expect(service.retry(id, 'retry-4')).rejects.toMatchObject({ code: 'RETRY_UNAVAILABLE' })
  })

  it('refreshes missing official stats on retry and upgrades the same report to ready', async () => {
    const provider = fakeProvider()
    const missing = { ...structuredClone(demoMatches[0]!), source: 'live' as const }
    missing.participants[0]!.damageDealt = null
    vi.mocked(provider.getMatch).mockResolvedValueOnce({
      match: missing,
      telemetryUrl: `fixture:${matchId}`,
    })
    const repo = new MemoryRepository()
    const service = createReviewService(repo, provider)
    const created = await service.create(input, 'creator')
    expect(created.data.quality).toBe('partial')
    const before = await service.report(created.data.reportId)
    expect(before.data.members[0]?.damageDealt).toBeNull()
    expect(before.data.warnings.some((warning) => warning.code === 'MEMBER_STATS_MISSING')).toBe(
      true,
    )
    const retried = await service.retry(created.data.reportId, 'retry')
    expect(retried.data).toMatchObject({ id: created.data.reportId, quality: 'ready', revision: 2 })
    expect(retried.data.members[0]?.damageDealt).toBe(624.35)
    expect(retried.data.summary.damageComplete).toBe(true)
    expect(provider.getMatch).toHaveBeenCalledTimes(2)
    expect(provider.getTelemetry).toHaveBeenCalledTimes(2)
  })

  it.each(['kills', 'damageDealt', 'revives', 'timeSurvived', 'rank'] as const)(
    'retains known official %s when fewer telemetry warnings would otherwise hide its loss',
    async (field) => {
      const provider = fakeProvider()
      vi.mocked(provider.getTelemetry).mockResolvedValueOnce([
        ...demoTelemetry(matchId),
        ...Array.from({ length: 5 }, () => ({
          _T: 'LogPlayerTakeDamage',
          _D: '2026-10-04T08:20:00.000Z',
          damage: 'invalid',
        })),
      ])
      const repo = new MemoryRepository()
      const service = createReviewService(repo, provider)
      const created = await service.create(input, 'creator')
      const before = (await service.report(created.data.reportId)).data
      expect(before.quality).toBe('partial')
      expect(before.warnings.find((warning) => warning.code === 'KNOWN_EVENT_INVALID')?.count).toBe(
        5,
      )
      const degraded = { ...structuredClone(demoMatches[0]!), source: 'live' as const }
      if (field === 'rank') degraded.rosters[0]!.rank = null
      else degraded.participants[0]![field] = null
      vi.mocked(provider.getMatch).mockResolvedValueOnce({
        match: degraded,
        telemetryUrl: `fixture:${matchId}`,
      })
      const after = (await service.retry(created.data.reportId, 'retry')).data
      // New telemetry has zero invalid events, but one newly missing official stat
      // must not trade away the previous confirmed scorecard.
      expect(after.revision).toBe(1)
      expect(after.members).toEqual(before.members)
      expect(after.summary).toEqual(before.summary)
      expect(after.warnings).toEqual(before.warnings)
      expect(after.retry.notBefore).not.toBeNull()
    },
  )

  it.each(['roster', 'members'])(
    'rejects a fresh %s identity change without replacing the stored partial report',
    async (change) => {
      const provider = fakeProvider()
      vi.mocked(provider.getTelemetry).mockRejectedValueOnce(
        new ApiError('UPSTREAM_TIMEOUT', 504, '시간 초과'),
      )
      const service = createReviewService(new MemoryRepository(), provider)
      const created = await service.create(input, 'creator')
      const changed = { ...structuredClone(demoMatches[0]!), source: 'live' as const }
      if (change === 'roster') changed.rosters[0]!.rosterId = 'different-roster'
      else changed.rosters[0]!.participantIds = changed.rosters[0]!.participantIds.slice(0, 1)
      vi.mocked(provider.getMatch).mockResolvedValueOnce({
        match: changed,
        telemetryUrl: `fixture:${matchId}`,
      })
      await expect(service.retry(created.data.reportId, 'retry')).rejects.toMatchObject({
        code: 'PLAYER_NOT_IN_MATCH',
      })
      expect((await service.report(created.data.reportId)).data).toMatchObject({
        quality: 'partial',
        revision: 1,
      })
      expect(provider.getTelemetry).toHaveBeenCalledTimes(1)
    },
  )

  it('rejects event cursors after filter or report revision changes', async () => {
    const repo = new MemoryRepository()
    const service = createReviewService(repo, fakeProvider())
    const created = await service.create(input, 'create')
    const id = created.data.reportId
    const page = await service.events(id, { kinds: [...allKinds], limit: 2 })
    expect(page.data.nextCursor).not.toBeNull()
    const cursor = page.data.nextCursor!
    await expect(service.events(id, { kinds: ['damage'], limit: 2, cursor })).rejects.toMatchObject(
      { code: 'SNAPSHOT_EXPIRED' },
    )
    await expect(
      service.events(id, { kinds: [...allKinds], memberNo: 2, limit: 2, cursor }),
    ).rejects.toMatchObject({ code: 'SNAPSHOT_EXPIRED' })
    const stored = repo.reports.get(id)!
    stored.revision++
    await expect(
      service.events(id, { kinds: [...allKinds], limit: 2, cursor }),
    ).rejects.toMatchObject({ code: 'SNAPSHOT_EXPIRED' })
  })
})

describe('scoped incremental match lists', () => {
  it('keeps an empty first ranked batch pageable, combines results and sorts by actual createdAt', async () => {
    const repo = new MemoryRepository()
    const provider = fakeProvider('live', largeDemoMatches)
    const service = createReviewService(repo, provider)
    const filters = { queueType: 'ranked' as const, teamMode: 'all' as const }
    const first = await service.matches('steam', playerId, filters)
    expect(first.data.matches).toEqual([])
    expect(first.data.nextCursor).toBeTruthy()
    expect(first.meta).toMatchObject({ checked: 20, total: 28, matched: 0, complete: false })
    expect(provider.getMatch).toHaveBeenCalledTimes(20)
    const second = await service.matches('steam', playerId, {
      ...filters,
      cursor: first.data.nextCursor!,
    })
    expect(second.data.matches.map((match) => match.matchId)).toEqual([
      'demo-match-ranked-duo',
      'demo-match-ranked-squad',
    ])
    expect(second.meta).toMatchObject({
      checked: 28,
      matched: 2,
      excluded: 4,
      unclassified: 2,
      complete: false,
    })
    expect(second.data.nextCursor).toBeNull()
    await expect(
      service.matches('steam', playerId, { ...allFilters, cursor: first.data.nextCursor! }),
    ).rejects.toMatchObject({ code: 'SNAPSHOT_EXPIRED' })
    const reset = await service.matches('steam', playerId, allFilters)
    expect(reset.data.matches[0]?.matchId).toBe('demo-match-normal-duo')
    expect(provider.getMatch).toHaveBeenCalledTimes(28)
  })

  it('reports only failed metadata IDs while preserving successful rows', async () => {
    const provider = fakeProvider()
    vi.mocked(provider.getMatch).mockRejectedValueOnce(
      new ApiError('UPSTREAM_TIMEOUT', 504, '시간 초과'),
    )
    const result = await createReviewService(new MemoryRepository(), provider).matches(
      'steam',
      playerId,
      allFilters,
    )
    expect(result.meta).toMatchObject({ failed: 1, failedMatchIds: [matchId], complete: false })
    expect(result.data.matches.length).toBeGreaterThan(0)
  })

  it('does not let a short-budget list cancel another report sharing its metadata load', async () => {
    vi.useFakeTimers()
    const repo = new MemoryRepository()
    const provider = fakeProvider('live', demoMatches.slice(0, 1))
    const service = createReviewService(repo, provider)
    await service.search('steam', demoPlayer.displayName)
    const find = repo.findPlayer.bind(repo)
    vi.spyOn(repo, 'findPlayer').mockImplementationOnce(
      (...args) =>
        new Promise((resolve) => {
          setTimeout(() => {
            void find(...args).then(resolve)
          }, 25_000)
        }),
    )
    const gate = deferred<{ match: MatchSnapshot; telemetryUrl: string | null }>()
    let upstreamSignal: AbortSignal | undefined
    vi.mocked(provider.getMatch).mockImplementationOnce((_platform, _id, signal) => {
      upstreamSignal = signal
      return gate.promise
    })
    const list = service.matches('steam', playerId, allFilters)
    await vi.advanceTimersByTimeAsync(25_000)
    const report = service.create(input, 'another-client')
    await vi.advanceTimersByTimeAsync(4000)
    expect((await list).meta).toMatchObject({ failed: 1, complete: false })
    expect(upstreamSignal?.aborted).toBe(false)
    gate.resolve({
      match: { ...demoMatches[0]!, source: 'live' },
      telemetryUrl: `fixture:${matchId}`,
    })
    expect((await report).data.quality).toBe('ready')
    expect(provider.getMatch).toHaveBeenCalledTimes(1)
  })
})

describe('stored metadata upgrades and batch reuse', () => {
  it('reads accumulated rows in one batch and upgrades stale raw classification before listing', async () => {
    const repo = new MemoryRepository()
    const provider = fakeProvider('live', demoMatches.slice(0, 1))
    const old = {
      ...demoMatches[0]!,
      source: 'live' as const,
      classificationVersion: '0',
      queueType: 'unknown' as const,
      classification: 'unknown' as const,
    }
    await repo.saveMatch(old)
    const batch = vi.spyOn(repo, 'getMatches')
    const result = await createReviewService(repo, provider).matches('steam', playerId, allFilters)
    expect(batch).toHaveBeenCalledOnce()
    expect(result.data.matches[0]).toMatchObject({
      queueType: 'normal',
      classificationVersion: '1',
    })
    expect(provider.getMatch).not.toHaveBeenCalled()
    expect((await repo.getMatch('live', 'steam', matchId))?.classificationVersion).toBe('1')
  })

  it('does not trust an outdated supported flag when stored raw fields identify FPP', async () => {
    const repo = new MemoryRepository()
    await repo.saveMatch({
      ...demoMatches[0]!,
      source: 'live',
      classificationVersion: '0',
      rawGameMode: 'squad-fpp',
    })
    const provider = fakeProvider()
    await expect(createReviewService(repo, provider).create(input, 'one')).rejects.toMatchObject({
      code: 'UNSUPPORTED_MATCH',
    })
    expect(provider.getTelemetry).not.toHaveBeenCalled()
  })
})
