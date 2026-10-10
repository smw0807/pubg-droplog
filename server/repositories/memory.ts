import { Buffer } from 'node:buffer'
import { matchSnapshotSchema, type MatchSnapshot } from '../domain/match'
import { storedReportSchema, type StoredReport } from '../domain/report'
import { ApiError } from '../utils/errors'
import {
  playerSnapshotSchema,
  type PlayerSnapshot,
  type ReportKey,
  type Repository,
} from './repository'

interface CacheLimits {
  maxEntries: number
  /** Maximum serialized UTF-8 payload size; runtime object overhead is additional. */
  maxBytes: number
}
interface ExpiringCacheLimits extends CacheLimits {
  ttlMs: number
}
export interface MemoryRepositoryOptions {
  now?: () => number
  players?: Partial<CacheLimits>
  matches?: Partial<ExpiringCacheLimits>
  reports?: Partial<ExpiringCacheLimits>
}
interface CacheEntry<T> {
  value: T
  expiresAt: number
  bytes: number
}

const MiB = 1024 * 1024
const matchKey = (source: string, platform: string, id: string) =>
  JSON.stringify([source, platform, id])
const reportKey = (report: ReportKey) =>
  JSON.stringify([
    report.source,
    report.platform,
    report.matchId,
    report.rosterId,
    report.analysisVersion,
  ])

function storageError() {
  return new ApiError('STORAGE_ERROR', 503, '서버 캐시에 데이터를 저장하지 못했어요.', true)
}

/** Fixed expiry with LRU capacity eviction. No timers, disk writes, or secondary indexes. */
class BoundedCache<T> {
  private readonly entries = new Map<string, CacheEntry<T>>()
  private bytes = 0

  constructor(
    private readonly limits: CacheLimits,
    private readonly now: () => number,
  ) {
    for (const value of [limits.maxEntries, limits.maxBytes]) {
      if (!Number.isSafeInteger(value) || value < 1) throw new Error('Invalid memory cache limit')
    }
  }

  private delete(key: string) {
    const entry = this.entries.get(key)
    if (entry) this.bytes -= entry.bytes
    this.entries.delete(key)
  }

  private prune() {
    const now = this.now()
    for (const [key, entry] of this.entries) {
      if (entry.expiresAt <= now) this.delete(key)
    }
  }

  values(): T[] {
    this.prune()
    return [...this.entries.values()].map((entry) => entry.value)
  }

  get(key: string): CacheEntry<T> | undefined {
    this.prune()
    const entry = this.entries.get(key)
    if (entry) {
      this.entries.delete(key)
      this.entries.set(key, entry)
    }
    return entry
  }

  set(key: string, value: T, expiresAt: number) {
    this.prune()
    const bytes = Buffer.byteLength(JSON.stringify(value), 'utf8')
    if (bytes > this.limits.maxBytes || !Number.isFinite(expiresAt)) throw storageError()
    this.delete(key)
    if (expiresAt <= this.now()) return
    while (
      this.entries.size >= this.limits.maxEntries ||
      this.bytes + bytes > this.limits.maxBytes
    ) {
      const oldest = this.entries.keys().next().value
      if (oldest === undefined) break
      this.delete(oldest)
    }
    this.entries.set(key, { value, expiresAt, bytes })
    this.bytes += bytes
  }
}

/** Process-local storage: restarting the server or evicting a report invalidates its link. */
export function createMemoryRepository(options: MemoryRepositoryOptions = {}): Repository {
  const now = options.now ?? Date.now
  const matchLimits = {
    ttlMs: 60 * 60 * 1000,
    maxEntries: 500,
    maxBytes: 12 * MiB,
    ...options.matches,
  }
  const reportLimits = {
    ttlMs: 24 * 60 * 60 * 1000,
    maxEntries: 100,
    maxBytes: 48 * MiB,
    ...options.reports,
  }
  for (const ttl of [matchLimits.ttlMs, reportLimits.ttlMs]) {
    if (!Number.isSafeInteger(ttl) || ttl < 1) throw new Error('Invalid memory cache TTL')
  }
  const players = new BoundedCache<PlayerSnapshot>(
    { maxEntries: 500, maxBytes: 4 * MiB, ...options.players },
    now,
  )
  const matches = new BoundedCache<MatchSnapshot>(matchLimits, now)
  const reports = new BoundedCache<StoredReport>(reportLimits, now)

  // Parsing provides runtime validation and detaches all returned/stored nested objects.
  async function safe<T>(operation: () => T): Promise<T> {
    try {
      return operation()
    } catch (error) {
      if (error instanceof ApiError) throw error
      throw storageError()
    }
  }
  const findStoredReport = (key: ReportKey) => {
    const identity = reportKey(key)
    return reports.values().find((report) => reportKey(report) === identity)
  }

  return {
    findPlayer: (source, platform, lookup, timestamp) =>
      safe(() => {
        const player = players
          .values()
          .filter(
            (value) =>
              value.source === source &&
              value.platform === platform &&
              Date.parse(value.expiresAt) > Date.parse(timestamp) &&
              (lookup.accountId
                ? value.accountId === lookup.accountId
                : value.requestedName === (lookup.name ?? '')),
          )
          .sort((a, b) => Date.parse(b.fetchedAt) - Date.parse(a.fetchedAt))[0]
        const entry = player ? players.get(player.id) : undefined
        return entry ? playerSnapshotSchema.parse(entry.value) : null
      }),
    getPlayerSnapshot: (id) =>
      safe(() => {
        const player = players.get(id)
        return player ? playerSnapshotSchema.parse(player.value) : null
      }),
    savePlayer: (snapshot) =>
      safe(() => {
        const value = playerSnapshotSchema.parse(snapshot)
        value.fetchedAt = new Date(value.fetchedAt).toISOString()
        value.expiresAt = new Date(value.expiresAt).toISOString()
        if (players.get(value.id)) throw storageError()
        players.set(value.id, value, Date.parse(value.expiresAt))
      }),
    getMatch: (source, platform, id) =>
      safe(() => {
        const match = matches.get(matchKey(source, platform, id))
        return match ? matchSnapshotSchema.parse(match.value) : null
      }),
    getMatches: (source, platform, ids) =>
      safe(() =>
        [...new Set(ids)].flatMap((id) => {
          const match = matches.get(matchKey(source, platform, id))
          return match ? [matchSnapshotSchema.parse(match.value)] : []
        }),
      ),
    saveMatch: (match) =>
      safe(() => {
        const value = matchSnapshotSchema.parse(match)
        matches.set(
          matchKey(value.source, value.platform, value.matchId),
          value,
          now() + matchLimits.ttlMs,
        )
      }),
    findReport: (key) =>
      safe(() => {
        const report = findStoredReport(key)
        const entry = report ? reports.get(report.id) : undefined
        return entry ? storedReportSchema.parse(entry.value) : null
      }),
    getReport: (id) =>
      safe(() => {
        const report = reports.get(id)
        return report ? storedReportSchema.parse(report.value) : null
      }),
    saveReport: (report) =>
      safe(() => {
        const value = storedReportSchema.parse(report)
        const existing = findStoredReport(value)
        const entry = existing ? reports.get(existing.id) : undefined
        if (entry) return storedReportSchema.parse(entry.value)
        if (reports.get(value.id)) throw storageError()
        reports.set(value.id, value, now() + reportLimits.ttlMs)
        return storedReportSchema.parse(value)
      }),
    claimRetry: (id, timestamp) =>
      safe(() => {
        const entry = reports.get(id)
        if (
          !entry ||
          entry.value.quality !== 'partial' ||
          (entry.value.lastRetryAt &&
            Date.parse(entry.value.lastRetryAt) > Date.parse(timestamp) - 60_000)
        )
          return false
        const value = storedReportSchema.parse({ ...entry.value, lastRetryAt: timestamp })
        reports.set(id, value, entry.expiresAt)
        return true
      }),
    improveReport: (report, expectedRevision) =>
      safe(() => {
        const value = storedReportSchema.parse(report)
        const entry = reports.get(value.id)
        if (!entry) throw new ApiError('REPORT_NOT_FOUND', 404, '리포트를 찾을 수 없어요.')
        if (entry.value.revision !== expectedRevision || entry.value.quality !== 'partial')
          return storedReportSchema.parse(entry.value)
        const conflict = findStoredReport(value)
        if (conflict && conflict.id !== value.id) throw storageError()
        reports.set(value.id, value, entry.expiresAt)
        return storedReportSchema.parse(value)
      }),
  }
}
