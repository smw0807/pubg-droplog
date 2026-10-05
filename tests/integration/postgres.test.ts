import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import { createPostgresRepository } from '../../server/repositories/postgres'
import { analyzeReport } from '../../server/domain/report'
import { normalizeMatch, type MatchSnapshot } from '../../server/domain/match'
import { demoPlayer, makeRawMatch } from '../../server/fixtures/demo'
import type { DataSource } from '../../shared/types'

const configuredUrl = process.env.TEST_DATABASE_URL
if (!configuredUrl)
  throw new Error(
    'PostgreSQL integration tests require TEST_DATABASE_URL pointing to a dedicated database ending in _test. Start the local Compose database and create droplog_test; these tests never silently skip.',
  )
const parsedUrl = new URL(configuredUrl)
if (!parsedUrl.pathname.endsWith('_test'))
  throw new Error(
    'TEST_DATABASE_URL must select a dedicated database whose name ends in _test. Application databases are not accepted.',
  )
const connection = createPostgresRepository(configuredUrl)
const repo = connection.repository
const sql = postgres(configuredUrl, { max: 1, onnotice: () => {}, connect_timeout: 5 })
const runId = randomUUID()
const fixtureMatchIds = new Set<string>()
const fixtureReportIds = new Set<string>()
const fixturePlayerIds = new Set<string>()
const fixedTime = '2026-10-04T12:00:00.000Z'

function makeMatch(source: DataSource = 'demo', sameMatchId?: string): MatchSnapshot {
  const matchId = sameMatchId ?? `integration-${runId}-${randomUUID()}`
  fixtureMatchIds.add(matchId)
  return normalizeMatch(makeRawMatch({ id: matchId }), {
    source,
    platform: 'steam',
    fetchedAt: fixedTime,
  }).match
}

function makeReport(match: MatchSnapshot, partial = false) {
  const id = randomUUID()
  fixtureReportIds.add(id)
  return analyzeReport({
    match,
    playerId: demoPlayer.accountId,
    telemetry: partial ? null : [{ _T: 'LogMatchStart', _D: match.createdAt }],
    reportId: id,
    generatedAt: fixedTime,
  })
}

beforeAll(async () => {
  // Migrate the real checked-in SQL; do not rewrite public-qualified foreign keys.
  await migrate(drizzle(sql), { migrationsFolder: './server/db/migrations' })
}, 30_000)

afterAll(async () => {
  try {
    // Only this run's generated fixtures are removed. Existing rows and migration history remain.
    if (fixtureReportIds.size)
      await sql`delete from reports where id::text = any(${sql.array([...fixtureReportIds])}::text[])`
    if (fixturePlayerIds.size)
      await sql`delete from player_snapshots where id::text = any(${sql.array([...fixturePlayerIds])}::text[])`
    if (fixtureMatchIds.size)
      await sql`delete from match_snapshots where match_id = any(${sql.array([...fixtureMatchIds])}::text[])`
  } finally {
    await Promise.all([connection.close(), sql.end()])
  }
})

describe('PostgreSQL repository with real migrations', () => {
  it('applies the checked-in migration and enforces the report/match foreign key', async () => {
    const migrationRows =
      await sql`select count(*)::integer as count from drizzle.__drizzle_migrations`
    expect(migrationRows[0]?.count).toBeGreaterThan(0)
    const orphan = makeReport(makeMatch())
    await expect(repo.saveReport(orphan)).rejects.toMatchObject({ code: 'STORAGE_ERROR' })
    expect(await repo.getReport(orphan.id)).toBeNull()
  })

  it('round-trips the entire normalized document after closing and reopening connections', async () => {
    const match = makeMatch()
    const report = makeReport(match)
    await repo.saveMatch(match)
    expect(await repo.saveReport(report)).toEqual(report)
    const reopened = createPostgresRepository(configuredUrl)
    try {
      expect(await reopened.repository.getMatch('demo', 'steam', match.matchId)).toEqual(match)
      expect(await reopened.repository.getReport(report.id)).toEqual(report)
      expect(await reopened.repository.findReport(report)).toEqual(report)
    } finally {
      await reopened.close()
    }
  })

  it('reads legacy v1 JSONB events with omitted locations alongside a separate v2 document', async () => {
    const match = makeMatch()
    await repo.saveMatch(match)
    const legacy = makeReport(match)
    legacy.analysisVersion = '1'
    legacy.events = [
      {
        id: 'legacy-event',
        sourceIndex: 1,
        occurredAt: match.createdAt,
        elapsedMs: 0,
        kind: 'knock',
        actor: { accountId: demoPlayer.accountId, name: demoPlayer.displayName, memberNo: 1 },
        target: {
          accountId: 'account.synthetic-opponent',
          name: 'SyntheticOpponent',
          memberNo: null,
        },
        knockMaker: null,
        finisher: null,
        assists: [],
        weaponCode: 'WeapM416_C',
        damage: null,
        cause: 'combat',
        warnings: [],
      },
    ]
    await repo.saveReport(legacy)
    const current = makeReport(match)
    current.analysisVersion = '2'
    current.events = structuredClone(legacy.events)
    current.events[0]!.actor!.location = { x: 0, y: 409600, z: 0 }
    current.events[0]!.target!.location = { x: 819200, y: 0 }
    await repo.saveReport(current)
    const reopened = createPostgresRepository(configuredUrl)
    try {
      const storedLegacy = await reopened.repository.getReport(legacy.id)
      expect(storedLegacy).toEqual(legacy)
      expect(storedLegacy?.events[0]?.actor).not.toHaveProperty('location')
      expect(await reopened.repository.findReport({ ...legacy, analysisVersion: '1' })).toEqual(
        legacy,
      )
      expect(await reopened.repository.findReport({ ...current, analysisVersion: '2' })).toEqual(
        current,
      )
      expect(current.id).not.toBe(legacy.id)
    } finally {
      await reopened.close()
    }
  })

  it('preserves zero and nullable event coordinates through JSONB without changing roles', async () => {
    const match = makeMatch()
    await repo.saveMatch(match)
    const report = makeReport(match)
    report.events = [
      {
        id: 'coordinate-event',
        sourceIndex: 2,
        occurredAt: match.createdAt,
        elapsedMs: 0,
        kind: 'kill',
        actor: {
          accountId: demoPlayer.accountId,
          name: demoPlayer.displayName,
          memberNo: 1,
          location: { x: 0, y: 0, z: 0 },
        },
        target: {
          accountId: 'account.synthetic-opponent',
          name: 'SyntheticOpponent',
          memberNo: null,
          location: { x: 819200, y: 819200 },
        },
        knockMaker: null,
        finisher: { accountId: 'account.demo-2', name: 'AerialFox', memberNo: 2, location: null },
        assists: [{ accountId: 'account.demo-3', name: 'RiverMint', memberNo: 3 }],
        weaponCode: 'WeapM416_C',
        damage: null,
        cause: 'combat',
        warnings: [],
      },
    ]
    await repo.saveReport(report)
    expect(await repo.getReport(report.id)).toEqual(report)
  })

  it('converges 10 concurrent inserts with distinct IDs onto one analysis key', async () => {
    const match = makeMatch()
    await repo.saveMatch(match)
    const candidates = Array.from({ length: 10 }, () => makeReport(match))
    const saved = await Promise.all(candidates.map((report) => repo.saveReport(report)))
    expect(new Set(saved.map((report) => report.id)).size).toBe(1)
    expect(
      saved.every(
        (report) =>
          report.summary.teamKills === 8 && report.members.length === 4 && report.revision === 1,
      ),
    ).toBe(true)
    const rows =
      await sql`select count(*)::integer as count from reports where match_id = ${match.matchId}`
    expect(rows[0]?.count).toBe(1)
  })

  it('never leaves a partial report row when validation or the database insert fails', async () => {
    const match = makeMatch()
    await repo.saveMatch(match)
    const invalidDocument = makeReport(match)
    invalidDocument.members[0]!.damageDealt = -1
    await expect(repo.saveReport(invalidDocument)).rejects.toMatchObject({ code: 'STORAGE_ERROR' })
    expect(await repo.getReport(invalidDocument.id)).toBeNull()
    const valid = makeReport(match)
    await repo.saveReport(valid)
    const failedUpdate = structuredClone(valid)
    failedUpdate.summary.teamDamage = -1
    await expect(repo.improveReport(failedUpdate, valid.revision)).rejects.toMatchObject({
      code: 'STORAGE_ERROR',
    })
    expect(await repo.getReport(valid.id)).toEqual(valid)
  })

  it('validates JSONB documents on read instead of accepting corrupt members or match stats', async () => {
    const match = makeMatch()
    await repo.saveMatch(match)
    const report = makeReport(match)
    await repo.saveReport(report)
    await sql`update reports set members = ${JSON.stringify([{ malformed: true }])}::jsonb where id = ${report.id}`
    await expect(repo.getReport(report.id)).rejects.toMatchObject({ code: 'STORAGE_ERROR' })
    await sql`update match_snapshots set participants = ${JSON.stringify([{ participantId: 'invalid' }])}::jsonb where source = 'demo' and platform = 'steam' and match_id = ${match.matchId}`
    await expect(repo.getMatch('demo', 'steam', match.matchId)).rejects.toMatchObject({
      code: 'STORAGE_ERROR',
    })
  })

  it('separates demo and live snapshots and report analysis keys', async () => {
    const demoMatch = makeMatch('demo')
    const liveMatch = makeMatch('live', demoMatch.matchId)
    liveMatch.mapName = 'Desert_Main'
    await repo.saveMatch(demoMatch)
    await repo.saveMatch(liveMatch)
    const demoReport = await repo.saveReport(makeReport(demoMatch))
    const liveReport = await repo.saveReport(makeReport(liveMatch))
    expect(demoReport.id).not.toBe(liveReport.id)
    expect((await repo.getMatch('demo', 'steam', demoMatch.matchId))?.mapName).toBe('Baltic_Main')
    expect((await repo.getMatch('live', 'steam', demoMatch.matchId))?.mapName).toBe('Desert_Main')
    expect((await repo.findReport({ ...demoReport, source: 'live' }))?.id).toBe(liveReport.id)
    expect((await repo.getReport(demoReport.id))?.source).toBe('demo')
  })

  it('batch-loads only requested source and platform records, preserving nullable stats without promising result order', async () => {
    const first = makeMatch('demo')
    first.participants[0]!.damageDealt = null
    const second = makeMatch('demo')
    const live = makeMatch('live', first.matchId)
    live.mapName = 'Desert_Main'
    const kakao = {
      ...makeMatch('demo', first.matchId),
      platform: 'kakao' as const,
      mapName: 'Tiger_Main',
    }
    await Promise.all([first, second, live, kakao].map((match) => repo.saveMatch(match)))
    const requested = [second.matchId, 'absent-fixture', first.matchId, second.matchId]
    const rows = await repo.getMatches('demo', 'steam', requested)
    expect(rows).toHaveLength(2)
    // SQL IN is unordered. Consumers map by match ID and apply display sorting.
    const byId = new Map(rows.map((match) => [match.matchId, match]))
    expect(requested.map((id) => byId.get(id)?.matchId ?? null)).toEqual([
      second.matchId,
      null,
      first.matchId,
      second.matchId,
    ])
    expect(byId.get(first.matchId)).toEqual(first)
    expect(byId.get(first.matchId)?.participants[0]?.damageDealt).toBeNull()
    expect(await repo.getMatches('live', 'steam', requested)).toEqual([live])
    expect(await repo.getMatches('demo', 'kakao', requested)).toEqual([kakao])
    expect(await repo.getMatches('demo', 'steam', [])).toEqual([])
  })

  it('keeps nullable requested names, honors source, and excludes expired player snapshots', async () => {
    const accountId = `account.integration-${runId}`
    const base = {
      platform: 'steam',
      accountId,
      requestedName: null,
      displayName: 'SyntheticSnapshot',
      matchIds: ['synthetic-1'],
      fetchedAt: fixedTime,
      expiresAt: '2026-10-04T12:05:00.000Z',
    } as const
    const demoId = randomUUID()
    const liveId = randomUUID()
    fixturePlayerIds.add(demoId)
    fixturePlayerIds.add(liveId)
    await repo.savePlayer({ ...base, matchIds: [...base.matchIds], id: demoId, source: 'demo' })
    await repo.savePlayer({
      ...base,
      matchIds: [...base.matchIds],
      id: liveId,
      source: 'live',
      displayName: 'SyntheticLive',
    })
    expect((await repo.findPlayer('demo', 'steam', { accountId }, fixedTime))?.id).toBe(demoId)
    expect((await repo.findPlayer('live', 'steam', { accountId }, fixedTime))?.displayName).toBe(
      'SyntheticLive',
    )
    expect((await repo.getPlayerSnapshot(demoId))?.requestedName).toBeNull()
    expect(await repo.findPlayer('demo', 'steam', { accountId }, base.expiresAt)).toBeNull()
  })

  it('claims retry once across competing requests and allows another exactly after 60 seconds', async () => {
    const match = makeMatch('live')
    await repo.saveMatch(match)
    const report = await repo.saveReport(makeReport(match, true))
    const claims = await Promise.all(
      Array.from({ length: 10 }, () => repo.claimRetry(report.id, fixedTime)),
    )
    expect(claims.filter(Boolean)).toHaveLength(1)
    expect(await repo.claimRetry(report.id, '2026-10-04T12:00:59.999Z')).toBe(false)
    expect(await repo.claimRetry(report.id, '2026-10-04T12:01:00.000Z')).toBe(true)
    expect((await repo.getReport(report.id))?.lastRetryAt).toBe('2026-10-04T12:01:00.000Z')
  })

  it('uses revision compare-and-swap and prevents a stale retry from overwriting a ready result', async () => {
    const match = makeMatch('live')
    await repo.saveMatch(match)
    const original = await repo.saveReport(makeReport(match, true))
    const improved = { ...makeReport(match), id: original.id, revision: 2, lastRetryAt: fixedTime }
    const stale = {
      ...structuredClone(original),
      revision: 2,
      updatedAt: '2026-10-04T12:00:01.000Z',
    }
    const [winner, loser] = await Promise.all([
      repo.improveReport(improved, 1),
      repo.improveReport(stale, 1),
    ])
    // Either competing compare-and-swap may win, but only one revision is committed.
    expect(winner.id).toBe(original.id)
    expect(loser.id).toBe(original.id)
    expect(winner.revision).toBe(2)
    expect(loser.revision).toBe(2)
    const current = (await repo.getReport(original.id))!
    const ready =
      current.quality === 'ready'
        ? current
        : await repo.improveReport({ ...improved, revision: 3 }, 2)
    expect(ready.quality).toBe('ready')
    expect(await repo.improveReport(stale, ready.revision)).toEqual(ready)
    expect(await repo.claimRetry(original.id, '2026-10-04T12:30:00.000Z')).toBe(false)
    expect(await repo.getReport(original.id)).toEqual(ready)
  })
})
