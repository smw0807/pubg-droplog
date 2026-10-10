import { randomUUID } from 'node:crypto'
import { Buffer } from 'node:buffer'
import { describe, expect, it } from 'vitest'
import { createMemoryRepository } from '../../server/repositories/memory'
import type { PlayerSnapshot } from '../../server/repositories/repository'
import { analyzeReport, type StoredReport } from '../../server/domain/report'
import { demoMatches, demoPlayer, demoTelemetry } from '../../server/fixtures/demo'

const epoch = Date.parse('2026-10-10T12:00:00.000Z')
const iso = (time: number) => new Date(time).toISOString()
const bytes = (value: unknown) => Buffer.byteLength(JSON.stringify(value), 'utf8')

function player(overrides: Partial<PlayerSnapshot> = {}): PlayerSnapshot {
  return {
    id: randomUUID(),
    source: 'live',
    platform: 'steam',
    accountId: demoPlayer.accountId,
    requestedName: demoPlayer.displayName,
    displayName: demoPlayer.displayName,
    matchIds: ['demo-match-normal-squad'],
    fetchedAt: iso(epoch),
    expiresAt: iso(epoch + 5 * 60_000),
    ...overrides,
  }
}

function match(id = 'demo-match-normal-squad') {
  return { ...structuredClone(demoMatches[0]!), matchId: id, source: 'live' as const }
}

function report(overrides: Partial<StoredReport> = {}): StoredReport {
  const record = match()
  return {
    ...analyzeReport({
      match: record,
      playerId: demoPlayer.accountId,
      telemetry: demoTelemetry(record.matchId),
      reportId: randomUUID(),
      generatedAt: iso(epoch),
    }),
    ...overrides,
  }
}

describe('process-local memory repository', () => {
  it('finds the latest valid player by requested name/account and isolates source/platform', async () => {
    const repo = createMemoryRepository({ now: () => epoch })
    const older = player({ fetchedAt: iso(epoch - 1000) })
    const newer = player({ requestedName: 'SearchAlias', displayName: 'ActualName' })
    const demo = player({ source: 'demo', fetchedAt: iso(epoch + 1000) })
    const kakao = player({ platform: 'kakao', fetchedAt: iso(epoch + 2000) })
    for (const record of [newer, older, demo, kakao]) await repo.savePlayer(record)
    expect(
      await repo.findPlayer('live', 'steam', { accountId: older.accountId }, iso(epoch)),
    ).toEqual(newer)
    expect(await repo.findPlayer('live', 'steam', { name: 'SearchAlias' }, iso(epoch))).toEqual(
      newer,
    )
    expect(await repo.findPlayer('live', 'steam', { name: 'ActualName' }, iso(epoch))).toBeNull()
    expect(
      await repo.findPlayer('demo', 'steam', { accountId: demo.accountId }, iso(epoch)),
    ).toEqual(demo)
    expect(
      await repo.findPlayer('live', 'kakao', { accountId: kakao.accountId }, iso(epoch)),
    ).toEqual(kakao)
  })

  it('expires player snapshots, matches and reports at their fixed TTL without extending reads', async () => {
    let now = epoch
    const repo = createMemoryRepository({ now: () => now })
    const snapshot = player()
    const metadata = match()
    const result = report()
    await repo.savePlayer(snapshot)
    await repo.saveMatch(metadata)
    await repo.saveReport(result)
    now += 5 * 60_000 - 1
    expect(await repo.getPlayerSnapshot(snapshot.id)).toEqual(snapshot)
    now += 1
    expect(await repo.getPlayerSnapshot(snapshot.id)).toBeNull()
    expect(
      await repo.findPlayer('live', 'steam', { name: snapshot.requestedName! }, iso(now)),
    ).toBeNull()
    now = epoch + 60 * 60_000 - 1
    expect(await repo.getMatch('live', 'steam', metadata.matchId)).toEqual(metadata)
    now += 1
    expect(await repo.getMatches('live', 'steam', [metadata.matchId])).toEqual([])
    now = epoch + 24 * 60 * 60_000 - 1
    expect(await repo.findReport(result)).toEqual(result)
    now += 1
    expect(await repo.getReport(result.id)).toBeNull()
    expect(await repo.findReport(result)).toBeNull()
    expect(await repo.claimRetry(result.id, iso(now))).toBe(false)
    await expect(repo.improveReport(result, 1)).rejects.toMatchObject({ code: 'REPORT_NOT_FOUND' })
  })

  it('treats expiry between identity lookup and retrieval as a cache miss', async () => {
    for (const operation of ['findPlayer', 'findReport', 'saveReport']) {
      let now = epoch
      let ticking = false
      const repo = createMemoryRepository({
        now: () => (ticking ? now++ : now),
        reports: { ttlMs: 50 },
      })
      const snapshot = player({ expiresAt: iso(epoch + 50) })
      const result = report()
      await repo.savePlayer(snapshot)
      await repo.saveReport(result)
      now = epoch + 49
      ticking = true
      if (operation === 'findPlayer') {
        expect(
          await repo.findPlayer('live', 'steam', { accountId: snapshot.accountId }, iso(now)),
        ).toBeNull()
      } else if (operation === 'findReport') {
        expect(await repo.findReport(result)).toBeNull()
      } else {
        const replacement = { ...result, id: randomUUID() }
        expect(await repo.saveReport(replacement)).toEqual(replacement)
        expect(await repo.getReport(result.id)).toBeNull()
        expect(await repo.getReport(replacement.id)).toEqual(replacement)
      }
    }
  })

  it('validates and detaches nested data on writes and reads', async () => {
    const repo = createMemoryRepository({ now: () => epoch })
    const snapshot = player()
    const metadata = match()
    const result = report()
    const expected = structuredClone({ snapshot, metadata, result })
    await repo.savePlayer(snapshot)
    await repo.saveMatch(metadata)
    const saved = await repo.saveReport(result)
    snapshot.matchIds.length = 0
    metadata.participants[0]!.name = 'Changed'
    result.members[0]!.name = 'Changed'
    saved.events.length = 0
    const readPlayer = (await repo.getPlayerSnapshot(snapshot.id))!
    const readMatch = (await repo.getMatch('live', 'steam', metadata.matchId))!
    const readReport = (await repo.getReport(result.id))!
    readPlayer.matchIds.length = 0
    readMatch.rosters[0]!.participantIds.length = 0
    readReport.events[0]!.warnings.push('Changed')
    expect(await repo.getPlayerSnapshot(snapshot.id)).toEqual(expected.snapshot)
    expect(await repo.getMatch('live', 'steam', metadata.matchId)).toEqual(expected.metadata)
    expect(await repo.getReport(result.id)).toEqual(expected.result)
    await expect(repo.saveReport({ ...expected.result, revision: 0 })).rejects.toMatchObject({
      code: 'STORAGE_ERROR',
    })
    await expect(
      repo.savePlayer({ ...expected.snapshot, expiresAt: 'invalid' }),
    ).rejects.toMatchObject({ code: 'STORAGE_ERROR' })
  })

  it('upserts scoped matches and atomically deduplicates reports by team and analysis version', async () => {
    const repo = createMemoryRepository({ now: () => epoch })
    const metadata = match()
    await repo.saveMatch(metadata)
    await repo.saveMatch({ ...metadata, mapName: 'Updated' })
    await repo.saveMatch({ ...metadata, source: 'demo' })
    await repo.saveMatch({ ...metadata, platform: 'kakao' })
    expect((await repo.getMatch('live', 'steam', metadata.matchId))?.mapName).toBe('Updated')
    expect((await repo.getMatch('demo', 'steam', metadata.matchId))?.mapName).toBe(metadata.mapName)
    expect((await repo.getMatch('live', 'kakao', metadata.matchId))?.mapName).toBe(metadata.mapName)
    expect(
      await repo.getMatches('live', 'steam', [metadata.matchId, metadata.matchId, 'missing']),
    ).toHaveLength(1)
    const original = report()
    const [first, duplicate] = await Promise.all([
      repo.saveReport(original),
      repo.saveReport({ ...original, id: randomUUID() }),
    ])
    expect(first).toEqual(duplicate)
    for (const override of [
      { source: 'demo' as const },
      { platform: 'kakao' as const },
      { rosterId: 'another-team' },
      { matchId: 'another-match' },
      { analysisVersion: 'older-version' },
    ]) {
      const scoped = { ...original, ...override, id: randomUUID() }
      expect(await repo.saveReport(scoped)).toEqual(scoped)
      expect(await repo.findReport(scoped)).toEqual(scoped)
    }
    await expect(repo.saveReport({ ...original, matchId: 'conflicting-id' })).rejects.toMatchObject(
      { code: 'STORAGE_ERROR' },
    )
  })

  it('evicts the least recently used entries and removes report identities with them', async () => {
    const repo = createMemoryRepository({
      now: () => epoch,
      players: { maxEntries: 1 },
      matches: { maxEntries: 2 },
      reports: { maxEntries: 2 },
    })
    const firstPlayer = player()
    await repo.savePlayer(firstPlayer)
    await repo.savePlayer(player())
    expect(await repo.getPlayerSnapshot(firstPlayer.id)).toBeNull()
    await repo.saveMatch(match('first'))
    await repo.saveMatch(match('second'))
    await repo.getMatch('live', 'steam', 'first')
    await repo.saveMatch(match('third'))
    expect(await repo.getMatch('live', 'steam', 'second')).toBeNull()
    const first = report({ matchId: 'first' })
    const second = report({ matchId: 'second' })
    await repo.saveReport(first)
    await repo.saveReport(second)
    await repo.findReport(first)
    await repo.saveReport(report({ matchId: 'third' }))
    expect(await repo.findReport(second)).toBeNull()
    expect(await repo.getReport(second.id)).toBeNull()
    const replacement = { ...second, id: randomUUID() }
    expect(await repo.saveReport(replacement)).toEqual(replacement)
    expect(await repo.findReport(second)).toEqual(replacement)
  })

  it('enforces byte bounds and rejects oversized replacements without losing existing values', async () => {
    const first = report({ matchId: 'first' })
    const second = report({ matchId: 'other' })
    const repo = createMemoryRepository({
      now: () => epoch,
      reports: { maxBytes: Math.max(bytes(first), bytes(second)) },
    })
    await repo.saveReport(first)
    await repo.saveReport(second)
    expect(await repo.getReport(first.id)).toBeNull()
    expect(await repo.getReport(second.id)).toEqual(second)
    await expect(
      repo.saveReport(report({ matchId: 'oversized'.repeat(1000) })),
    ).rejects.toMatchObject({ code: 'STORAGE_ERROR' })
    expect(await repo.getReport(second.id)).toEqual(second)
  })

  it('claims retries once per minute and only improves a partial report at the expected revision', async () => {
    let now = epoch
    const repo = createMemoryRepository({ now: () => now })
    const partial = report({ quality: 'partial' })
    await repo.saveReport(partial)
    expect(
      await Promise.all([
        repo.claimRetry(partial.id, iso(now)),
        repo.claimRetry(partial.id, iso(now)),
      ]),
    ).toEqual([true, false])
    expect(await repo.getReport(partial.id)).toMatchObject({ revision: 1, lastRetryAt: iso(now) })
    now += 59_999
    expect(await repo.claimRetry(partial.id, iso(now))).toBe(false)
    now += 1
    expect(await repo.claimRetry(partial.id, iso(now))).toBe(true)
    const improvement = {
      ...partial,
      quality: 'ready' as const,
      revision: 2,
      lastRetryAt: iso(now),
    }
    expect(await repo.improveReport(improvement, 99)).toMatchObject({
      revision: 1,
      quality: 'partial',
    })
    const [winner, stale] = await Promise.all([
      repo.improveReport(improvement, 1),
      repo.improveReport({ ...improvement, revision: 3 }, 1),
    ])
    expect(winner).toEqual(improvement)
    expect(stale).toEqual(improvement)
    expect(await repo.claimRetry(partial.id, iso(now + 60_000))).toBe(false)
    expect(await repo.improveReport({ ...improvement, revision: 3 }, 2)).toEqual(improvement)
    now = epoch + 24 * 60 * 60_000 - 1
    expect(await repo.getReport(partial.id)).toEqual(improvement)
    now += 1
    expect(await repo.getReport(partial.id)).toBeNull()
  })
})
