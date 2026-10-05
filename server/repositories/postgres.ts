import { and, desc, eq, gt, inArray, isNull, lte, or } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as tables from '../db/schema'
import { matchSnapshotSchema } from '../domain/match'
import { storedReportSchema } from '../domain/report'
import { ApiError } from '../utils/errors'
import { playerSnapshotSchema, type Repository } from './repository'

const iso = (value: string) => new Date(value).toISOString()
function readReport(row: typeof tables.reports.$inferSelect) {
  return storedReportSchema.parse({
    ...row,
    generatedAt: iso(row.generatedAt),
    updatedAt: iso(row.updatedAt),
    lastRetryAt: row.lastRetryAt ? iso(row.lastRetryAt) : null,
  })
}
function readPlayer(row: typeof tables.playerSnapshots.$inferSelect) {
  return playerSnapshotSchema.parse({
    ...row,
    fetchedAt: iso(row.fetchedAt),
    expiresAt: iso(row.expiresAt),
  })
}

/** Each JSONB value crosses a runtime schema on every read. Never store telemetry assets. */
export function createPostgresRepository(url: string) {
  const client = postgres(url, {
    max: 5,
    connect_timeout: 5,
    idle_timeout: 20,
    onnotice: () => {},
    connection: { statement_timeout: 5000 },
  })
  const db = drizzle(client)
  async function safe<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation()
    } catch (error) {
      if (error instanceof ApiError) throw error
      throw new ApiError(
        'STORAGE_ERROR',
        503,
        '저장소에 접근하지 못했어요. 잠시 후 다시 시도해 주세요.',
        true,
      )
    }
  }
  const repository: Repository = {
    findPlayer: (source, platform, lookup, now) =>
      safe(async () => {
        const [row] = await db
          .select()
          .from(tables.playerSnapshots)
          .where(
            and(
              eq(tables.playerSnapshots.source, source),
              eq(tables.playerSnapshots.platform, platform),
              gt(tables.playerSnapshots.expiresAt, now),
              lookup.accountId
                ? eq(tables.playerSnapshots.accountId, lookup.accountId)
                : eq(tables.playerSnapshots.requestedName, lookup.name ?? ''),
            ),
          )
          .orderBy(desc(tables.playerSnapshots.fetchedAt))
          .limit(1)
        return row ? readPlayer(row) : null
      }),
    getPlayerSnapshot: (id) =>
      safe(async () => {
        const [row] = await db
          .select()
          .from(tables.playerSnapshots)
          .where(eq(tables.playerSnapshots.id, id))
          .limit(1)
        return row ? readPlayer(row) : null
      }),
    savePlayer: (snapshot) =>
      safe(async () => {
        await db.insert(tables.playerSnapshots).values(playerSnapshotSchema.parse(snapshot))
      }),
    getMatch: (source, platform, matchId) =>
      safe(async () => {
        const [row] = await db
          .select()
          .from(tables.matchSnapshots)
          .where(
            and(
              eq(tables.matchSnapshots.source, source),
              eq(tables.matchSnapshots.platform, platform),
              eq(tables.matchSnapshots.matchId, matchId),
            ),
          )
          .limit(1)
        return row
          ? matchSnapshotSchema.parse({
              ...row,
              createdAt: iso(row.createdAt),
              fetchedAt: iso(row.fetchedAt),
            })
          : null
      }),
    getMatches: (source, platform, matchIds) =>
      safe(async () => {
        if (matchIds.length === 0) return []
        const rows = await db
          .select()
          .from(tables.matchSnapshots)
          .where(
            and(
              eq(tables.matchSnapshots.source, source),
              eq(tables.matchSnapshots.platform, platform),
              inArray(tables.matchSnapshots.matchId, matchIds),
            ),
          )
        return rows.map((row) =>
          matchSnapshotSchema.parse({
            ...row,
            createdAt: iso(row.createdAt),
            fetchedAt: iso(row.fetchedAt),
          }),
        )
      }),
    saveMatch: (match) =>
      safe(async () => {
        const value = matchSnapshotSchema.parse(match)
        await db
          .insert(tables.matchSnapshots)
          .values(value)
          .onConflictDoUpdate({
            target: [
              tables.matchSnapshots.source,
              tables.matchSnapshots.platform,
              tables.matchSnapshots.matchId,
            ],
            set: value,
          })
      }),
    findReport: (key) =>
      safe(async () => {
        const [row] = await db
          .select()
          .from(tables.reports)
          .where(
            and(
              eq(tables.reports.source, key.source),
              eq(tables.reports.platform, key.platform),
              eq(tables.reports.matchId, key.matchId),
              eq(tables.reports.rosterId, key.rosterId),
              eq(tables.reports.analysisVersion, key.analysisVersion),
            ),
          )
          .limit(1)
        return row ? readReport(row) : null
      }),
    getReport: (id) =>
      safe(async () => {
        const [row] = await db
          .select()
          .from(tables.reports)
          .where(eq(tables.reports.id, id))
          .limit(1)
        return row ? readReport(row) : null
      }),
    saveReport: (report) =>
      safe(async () => {
        const value = storedReportSchema.parse(report)
        // A single row contains summary, members and events: no observable partial writes.
        const [inserted] = await db
          .insert(tables.reports)
          .values(value)
          .onConflictDoNothing()
          .returning()
        if (inserted) return readReport(inserted)
        const existing = await repository.findReport(value)
        if (!existing) throw new ApiError('STORAGE_ERROR', 503, '리포트를 저장하지 못했어요.', true)
        return existing
      }),
    claimRetry: (id, now) =>
      safe(async () => {
        const [row] = await db
          .update(tables.reports)
          .set({ lastRetryAt: now })
          .where(
            and(
              eq(tables.reports.id, id),
              eq(tables.reports.quality, 'partial'),
              or(
                isNull(tables.reports.lastRetryAt),
                lte(tables.reports.lastRetryAt, new Date(Date.parse(now) - 60000).toISOString()),
              ),
            ),
          )
          .returning({ id: tables.reports.id })
        return Boolean(row)
      }),
    improveReport: (report, expectedRevision) =>
      safe(async () => {
        const value = storedReportSchema.parse(report)
        const [row] = await db
          .update(tables.reports)
          .set(value)
          .where(
            and(
              eq(tables.reports.id, report.id),
              eq(tables.reports.revision, expectedRevision),
              eq(tables.reports.quality, 'partial'),
            ),
          )
          .returning()
        if (row) return readReport(row)
        const existing = await repository.getReport(report.id)
        if (!existing) throw new ApiError('REPORT_NOT_FOUND', 404, '리포트를 찾을 수 없어요.')
        return existing
      }),
  }
  return { repository, close: () => client.end() }
}
