import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import type {
  ApiResponse,
  CreateReportData,
  EventKind,
  EventsData,
  MatchFilters,
  MatchesData,
  MatchesMeta,
  Platform,
  Report,
} from '../../shared/types'
import { eventKindSchema, matchFiltersSchema } from '../../shared/schemas/report'
import {
  CLASSIFICATION_VERSION,
  classifyMatch,
  assertSupportedMatch,
  identifyTeam,
  toMatchListItem,
  type MatchSnapshot,
} from '../domain/match'
import {
  ANALYSIS_VERSION,
  analyzeReport,
  filterEvents,
  toPublicReport,
  type StoredReport,
} from '../domain/report'
import { getReservedDemoReport } from '../fixtures/demo'
import type { PlayerSnapshot, Repository } from '../repositories/repository'
import { recordAnalysisVersion, recordCacheHit, recordReason, recordSource } from '../utils/metrics'
import { ApiError, abortError } from '../utils/errors'
import { SlidingWindowLimiter, withTimeout } from '../utils/limits'
import { decodeCursor, encodeCursor, filterSignature } from '../utils/cursor'
import type { Provider } from './provider'

const listCursor = z.object({
  snapshotId: z.string().uuid(),
  offset: z.number().int().nonnegative().max(10000),
  filter: z.string(),
  platform: z.string(),
  accountId: z.string(),
})
interface SharedMatchLoad {
  promise: Promise<{ match: MatchSnapshot; telemetryUrl: string | null }>
  controller: AbortController
  consumers: number
  settled: boolean
}

const eventCursor = z.object({
  reportId: z.string(),
  revision: z.number().int(),
  offset: z.number().int().nonnegative().max(20000),
  filter: z.string(),
})
export const eventsInputSchema = z.object({
  kinds: z
    .string()
    .optional()
    .transform((value) =>
      value ? [...new Set(value.split(','))].sort() : ['kill', 'knock', 'revive'],
    )
    .pipe(z.array(eventKindSchema).min(1).max(4)),
  memberNo: z.coerce.number().int().min(1).max(4).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().max(2048).optional(),
})

export function createReviewService(
  repo: Repository,
  provider: Provider,
  options: { now?: () => number; analyze?: typeof analyzeReport } = {},
) {
  const now = options.now ?? Date.now
  const analyze = options.analyze ?? analyzeReport
  const writes = new SlidingWindowLimiter(5, 60000, now)
  const playerLoads = new Map<string, Promise<PlayerSnapshot>>()
  const matchLoads = new Map<string, SharedMatchLoad>()
  const analyses = new Map<string, Promise<StoredReport>>()
  let active = false
  const timestamp = () => new Date(now()).toISOString()
  async function loadPlayer(
    platform: Platform,
    lookup: { accountId?: string; name?: string },
    refresh = false,
  ) {
    if (!refresh) {
      const cached = await repo.findPlayer(provider.source, platform, lookup, timestamp())
      if (cached) {
        recordCacheHit()
        return cached
      }
    }
    const key = JSON.stringify([provider.source, platform, lookup])
    const pending = playerLoads.get(key)
    if (pending) {
      recordCacheHit()
      return pending
    }
    const work = withTimeout(async (signal) => {
      const player = lookup.accountId
        ? await provider.getPlayer(platform, lookup.accountId, signal)
        : await provider.searchPlayer(platform, lookup.name ?? '', signal)
      const snapshot: PlayerSnapshot = {
        id: randomUUID(),
        source: provider.source,
        platform,
        accountId: player.accountId,
        displayName: player.displayName,
        requestedName: lookup.name ?? null,
        matchIds: [...new Set(player.matchIds)].slice(0, 10000),
        fetchedAt: timestamp(),
        expiresAt: new Date(now() + 300000).toISOString(),
      }
      await repo.savePlayer(snapshot)
      return snapshot
    }, 10000).finally(() => playerLoads.delete(key))
    playerLoads.set(key, work)
    return work
  }
  async function fetchMatch(platform: Platform, id: string, signal?: AbortSignal) {
    if (signal?.aborted) throw abortError(signal)
    const key = `${provider.source}:${platform}:${id}`
    let pending = matchLoads.get(key)
    if (pending) recordCacheHit()
    if (!pending) {
      const controller = new AbortController()
      const created: SharedMatchLoad = {
        controller,
        consumers: 0,
        settled: false,
        promise: withTimeout(
          async (sharedSignal) => {
            const result = await provider.getMatch(platform, id, sharedSignal)
            if (sharedSignal.aborted) throw abortError(sharedSignal)
            await repo.saveMatch(result.match)
            return result
          },
          10000,
          controller.signal,
        ).finally(() => {
          created.settled = true
          matchLoads.delete(key)
        }),
      }
      matchLoads.set(key, created)
      pending = created
    }
    const load = pending
    load.consumers++
    // Each waiter has its own lifetime. Cancel shared I/O only after every waiter
    // has left; one timed-out list must not abort another client's report.
    return new Promise<{ match: MatchSnapshot; telemetryUrl: string | null }>((resolve, reject) => {
      let finished = false
      const finish = () => {
        if (finished) return false
        finished = true
        signal?.removeEventListener('abort', onAbort)
        load.consumers--
        if (!load.settled && load.consumers === 0) load.controller.abort()
        return true
      }
      const onAbort = () => {
        if (finish()) reject(abortError(signal))
      }
      signal?.addEventListener('abort', onAbort, { once: true })
      load.promise.then(
        (value) => {
          if (finish()) resolve(value)
        },
        (error: unknown) => {
          if (finish()) reject(error)
        },
      )
    })
  }
  async function refreshClassification(match: MatchSnapshot): Promise<MatchSnapshot> {
    if (match.classificationVersion === CLASSIFICATION_VERSION) return match
    const refreshed = {
      ...match,
      ...classifyMatch(match.rawGameMode, match.rawMatchType, match.isCustom),
    }
    await repo.saveMatch(refreshed)
    return refreshed
  }
  async function getMatch(platform: Platform, id: string, signal?: AbortSignal) {
    const match = await repo.getMatch(provider.source, platform, id)
    if (match) {
      recordCacheHit()
      return { match: await refreshClassification(match), telemetryUrl: null }
    }
    return fetchMatch(platform, id, signal)
  }
  async function runAnalysis(
    key: string,
    work: (signal: AbortSignal) => Promise<StoredReport>,
    budgetMs: number,
    onJoin?: () => void,
  ) {
    const pending = analyses.get(key)
    if (pending) {
      recordCacheHit()
      onJoin?.()
      return pending
    }
    if (active)
      throw new ApiError(
        'ANALYSIS_BUSY',
        429,
        '다른 경기 기록을 정리하고 있어요. 잠시 후 다시 시도해 주세요.',
        true,
        10,
      )
    active = true
    const task = withTimeout(work, Math.max(1, budgetMs)).finally(() => {
      analyses.delete(key)
      active = false
    })
    analyses.set(key, task)
    return task
  }
  async function buildReport(
    match: MatchSnapshot,
    playerId: string,
    id: string,
    signal: AbortSignal,
    telemetryUrl: string | null,
    revision = 1,
    budgetMs = 30000,
  ) {
    let telemetry: unknown
    let telemetryFailure: string | undefined
    try {
      telemetry = await withTimeout(
        async (telemetrySignal) => {
          const url =
            telemetryUrl ??
            (await fetchMatch(match.platform, match.matchId, telemetrySignal)).telemetryUrl
          if (!url)
            throw new ApiError(
              'TELEMETRY_UNAVAILABLE',
              502,
              '경기에서 상세 기록 주소를 확인할 수 없어요.',
            )
          return provider.getTelemetry(url, telemetrySignal)
        },
        Math.max(1, budgetMs - 6000),
        signal,
      )
    } catch (error) {
      telemetryFailure =
        error instanceof ApiError
          ? `${error.code}: ${error.message}`
          : '상세 기록을 가져오지 못했어요.'
    }
    recordAnalysisVersion(ANALYSIS_VERSION)
    const report = analyze({
      match,
      playerId,
      telemetry,
      telemetryFailure,
      reportId: id,
      generatedAt: timestamp(),
      revision,
    })
    for (const warning of report.warnings) recordReason(warning.code)
    return report
  }
  async function readStored(id: string) {
    const sample = getReservedDemoReport(id)
    if (sample) {
      recordSource(sample.source)
      recordAnalysisVersion(sample.analysisVersion)
      return sample
    }
    const report = await repo.getReport(id)
    if (!report) throw new ApiError('REPORT_NOT_FOUND', 404, '리포트를 찾을 수 없어요.')
    recordCacheHit()
    recordSource(report.source)
    recordAnalysisVersion(report.analysisVersion)
    for (const warning of report.warnings) recordReason(warning.code)
    return report
  }
  async function createReport(
    input: { platform: Platform; matchId: string; playerId: string },
    deadline = now() + 30000,
  ): Promise<ApiResponse<CreateReportData>> {
    recordSource(provider.source)
    const loaded = await withTimeout(
      (signal) => getMatch(input.platform, input.matchId, signal),
      Math.max(1, Math.min(10000, deadline - now())),
    )
    assertSupportedMatch(loaded.match)
    const team = identifyTeam(loaded.match, input.playerId)
    const key = {
      source: provider.source,
      platform: input.platform,
      matchId: input.matchId,
      rosterId: team.roster.rosterId,
      analysisVersion: ANALYSIS_VERSION,
    }
    const existing = await repo.findReport(key)
    if (existing) recordCacheHit()
    let reused = Boolean(existing)
    const budgetMs = Math.max(1, deadline - now())
    const report =
      existing ??
      (await runAnalysis(
        JSON.stringify(key),
        async (signal) => {
          // Recheck durable identity after joining the bounded analysis slot.
          const completed = await repo.findReport(key)
          if (completed) {
            recordCacheHit()
            reused = true
            return completed
          }
          const result = await buildReport(
            loaded.match,
            input.playerId,
            randomUUID(),
            signal,
            loaded.telemetryUrl,
            1,
            Math.max(1, deadline - now()),
          )
          const saved = await repo.saveReport(result)
          if (saved.id !== result.id) {
            recordCacheHit()
            reused = true
          }
          return saved
        },
        budgetMs,
        () => {
          reused = true
        },
      ))
    recordAnalysisVersion(report.analysisVersion)
    for (const warning of report.warnings) recordReason(warning.code)
    return {
      data: { reportId: report.id, quality: report.quality, reused },
      meta: { source: report.source, quality: report.quality, revision: report.revision },
    }
  }
  return {
    async search(platform: Platform, name: string) {
      recordSource(provider.source)
      const snapshot = await loadPlayer(platform, { name })
      return {
        data: { accountId: snapshot.accountId, displayName: snapshot.displayName, platform },
        meta: { source: snapshot.source, fetchedAt: snapshot.fetchedAt },
      }
    },
    async matches(
      platform: Platform,
      accountId: string,
      input: MatchFilters & { cursor?: string; refresh?: boolean },
    ): Promise<ApiResponse<MatchesData, MatchesMeta>> {
      recordSource(provider.source)
      const deadline = now() + 30000
      const filters = matchFiltersSchema.parse(input)
      const signature = filterSignature(filters)
      const cursor = input.cursor ? decodeCursor(input.cursor, listCursor) : null
      if (
        cursor &&
        (cursor.filter !== signature ||
          cursor.platform !== platform ||
          cursor.accountId !== accountId)
      )
        throw new ApiError(
          'SNAPSHOT_EXPIRED',
          409,
          '필터가 바뀌었어요. 첫 페이지부터 다시 조회해 주세요.',
          true,
        )
      const snapshot = cursor
        ? await repo.getPlayerSnapshot(cursor.snapshotId)
        : await loadPlayer(platform, { accountId }, input.refresh)
      if (
        !snapshot ||
        snapshot.source !== provider.source ||
        snapshot.platform !== platform ||
        snapshot.accountId !== accountId ||
        Date.parse(snapshot.expiresAt) <= now()
      )
        throw new ApiError(
          'SNAPSHOT_EXPIRED',
          409,
          '조회 정보가 만료됐어요. 새로고침해 주세요.',
          true,
        )
      const offset = cursor?.offset ?? 0
      if (offset > snapshot.matchIds.length || offset % 20 !== 0)
        throw new ApiError('INVALID_INPUT', 400, '페이지 위치가 올바르지 않아요.')
      const end = Math.min(snapshot.matchIds.length, offset + 20)
      try {
        await withTimeout(
          async (signal) => {
            const results = await Promise.allSettled(
              snapshot.matchIds.slice(offset, end).map((id) => getMatch(platform, id, signal)),
            )
            const storageFailure = results.find(
              (result) =>
                result.status === 'rejected' &&
                result.reason instanceof ApiError &&
                result.reason.code === 'STORAGE_ERROR',
            )
            if (storageFailure?.status === 'rejected') throw storageFailure.reason
          },
          Math.max(1, deadline - now() - 1000),
        )
      } catch (error) {
        // Preserve confirmed rows and identify failures after cancelling unfinished
        // metadata work. A timeout never becomes an empty successful full range.
        if (!(error instanceof ApiError) || error.code !== 'UPSTREAM_TIMEOUT') throw error
      }
      const storedRows = await repo.getMatches(
        provider.source,
        platform,
        snapshot.matchIds.slice(0, end),
      )
      const byId = new Map(
        (await Promise.all(storedRows.map(refreshClassification))).map((match) => [
          match.matchId,
          match,
        ]),
      )
      const rows = snapshot.matchIds.slice(0, end).map((id) => byId.get(id))
      const matched = []
      const failedMatchIds: string[] = []
      let excluded = 0
      let unclassified = 0
      for (const [index, row] of rows.entries()) {
        if (!row) {
          recordReason('MATCH_UNAVAILABLE')
          failedMatchIds.push(snapshot.matchIds[index]!)
          continue
        }
        if (row.classification === 'unsupported') {
          recordReason('UNSUPPORTED_MATCH')
          excluded++
          continue
        }
        if (row.classification === 'unknown') {
          recordReason('MATCH_CLASSIFICATION_UNKNOWN')
          unclassified++
          continue
        }
        try {
          const item = toMatchListItem(row, accountId)
          if (
            (filters.queueType === 'all' || filters.queueType === item.queueType) &&
            (filters.teamMode === 'all' || filters.teamMode === item.teamMode)
          )
            matched.push(item)
        } catch {
          failedMatchIds.push(row.matchId)
        }
      }
      matched.sort(
        (a, b) =>
          Date.parse(b.createdAt) - Date.parse(a.createdAt) || a.matchId.localeCompare(b.matchId),
      )
      return {
        data: {
          player: { accountId, displayName: snapshot.displayName, platform },
          matches: matched,
          nextCursor:
            end < snapshot.matchIds.length
              ? encodeCursor({
                  snapshotId: snapshot.id,
                  offset: end,
                  filter: signature,
                  platform,
                  accountId,
                })
              : null,
        },
        meta: {
          source: snapshot.source,
          fetchedAt: snapshot.fetchedAt,
          checked: end,
          total: snapshot.matchIds.length,
          matched: matched.length,
          excluded,
          unclassified,
          failed: failedMatchIds.length,
          failedMatchIds,
          complete:
            end === snapshot.matchIds.length && failedMatchIds.length === 0 && unclassified === 0,
          snapshotId: snapshot.id,
        },
      }
    },
    async create(
      input: { platform: Platform; matchId: string; playerId: string },
      clientId: string,
    ): Promise<ApiResponse<CreateReportData>> {
      writes.consume(clientId)
      return createReport(input)
    },
    async report(id: string): Promise<ApiResponse<Report>> {
      const report = await readStored(id)
      return {
        data: toPublicReport(report, now()),
        meta: { source: report.source, quality: report.quality, revision: report.revision },
      }
    },
    async upgrade(id: string, clientId: string): Promise<ApiResponse<CreateReportData>> {
      const deadline = now() + 30000
      writes.consume(clientId)
      const old = await readStored(id)
      // Keep shared links immutable. A newer analysis has its own durable key
      // and ID; looking it up must also work after the server mode changes.
      const latest =
        old.analysisVersion === ANALYSIS_VERSION
          ? old
          : await repo.findReport({
              source: old.source,
              platform: old.platform,
              matchId: old.matchId,
              rosterId: old.rosterId,
              analysisVersion: ANALYSIS_VERSION,
            })
      if (latest)
        return {
          data: { reportId: latest.id, quality: latest.quality, reused: true },
          meta: { source: latest.source, quality: latest.quality, revision: latest.revision },
        }
      if (old.source !== provider.source)
        throw new ApiError(
          'SERVER_MISCONFIGURED',
          503,
          '현재는 이 경기의 새 분석을 만들 수 없어요. 기존 기록은 계속 볼 수 있어요.',
        )
      return createReport(
        { platform: old.platform, matchId: old.matchId, playerId: old.members[0]!.accountId },
        deadline,
      )
    },
    async events(
      id: string,
      input: { kinds: EventKind[]; memberNo?: number; cursor?: string; limit: number },
    ): Promise<ApiResponse<EventsData>> {
      const report = await readStored(id)
      const signature = filterSignature({
        kinds: [...input.kinds].sort(),
        memberNo: input.memberNo ?? null,
        limit: input.limit,
      })
      const cursor = input.cursor ? decodeCursor(input.cursor, eventCursor) : null
      if (
        cursor &&
        (cursor.reportId !== id ||
          cursor.revision !== report.revision ||
          cursor.filter !== signature)
      )
        throw new ApiError(
          'SNAPSHOT_EXPIRED',
          409,
          '리포트 또는 필터가 바뀌었어요. 첫 페이지부터 다시 조회해 주세요.',
          true,
        )
      const events = filterEvents(report.events, input.kinds, input.memberNo)
      const offset = cursor?.offset ?? 0
      const end = offset + input.limit
      return {
        data: {
          events: events.slice(offset, end),
          total: events.length,
          nextCursor:
            end < events.length
              ? encodeCursor({
                  reportId: id,
                  revision: report.revision,
                  offset: end,
                  filter: signature,
                })
              : null,
        },
        meta: { source: report.source, quality: report.quality, revision: report.revision },
      }
    },
    async retry(id: string, clientId: string): Promise<ApiResponse<Report>> {
      recordSource(provider.source)
      const deadline = now() + 30000
      writes.consume(clientId)
      const old = await readStored(id)
      if (
        old.source === 'demo' ||
        old.analysisVersion !== ANALYSIS_VERSION ||
        old.quality === 'ready'
      )
        throw new ApiError('RETRY_UNAVAILABLE', 422, '이 리포트는 재분석 대상이 아니에요.')
      if (provider.source !== old.source)
        throw new ApiError(
          'SERVER_MISCONFIGURED',
          503,
          '현재 서버 모드에서 실제 경기 재분석을 사용할 수 없어요.',
        )
      const key = JSON.stringify({
        source: old.source,
        platform: old.platform,
        matchId: old.matchId,
        rosterId: old.rosterId,
        analysisVersion: old.analysisVersion,
      })
      const updated = await runAnalysis(
        key,
        async (signal) => {
          const claimedAt = timestamp()
          if (!(await repo.claimRetry(id, claimedAt))) {
            const latest = await readStored(id)
            const remaining = Math.max(
              1,
              Math.ceil(
                ((latest.lastRetryAt ? Date.parse(latest.lastRetryAt) : now()) + 60000 - now()) /
                  1000,
              ),
            )
            throw new ApiError(
              'RATE_LIMITED',
              429,
              '상세 기록 재시도는 60초 간격으로 가능해요.',
              true,
              remaining,
            )
          }
          // Retry refreshes official statistics as well as the telemetry asset. A
          // previously missing statistic can become available in the upstream match.
          const fresh = await fetchMatch(old.platform, old.matchId, signal)
          const match = await refreshClassification(fresh.match)
          const member = old.members[0]!
          const team = identifyTeam(match, member.accountId)
          const sameMembers =
            team.members.length === old.members.length &&
            team.members.every((current) =>
              old.members.some(
                (previous) =>
                  previous.accountId === current.accountId &&
                  previous.participantId === current.participantId,
              ),
            )
          if (team.roster.rosterId !== old.rosterId || !sameMembers)
            throw new ApiError('PLAYER_NOT_IN_MATCH', 422, '저장된 팀과 경기 팀이 일치하지 않아요.')
          const next = await buildReport(
            match,
            member.accountId,
            old.id,
            signal,
            fresh.telemetryUrl,
            old.revision + 1,
            Math.max(1, deadline - now()),
          )
          const warningsCount = (r: StoredReport) =>
            r.warnings.reduce((count, warning) => count + warning.count, 0)
          const officialFields = ['kills', 'damageDealt', 'revives', 'timeSurvived'] as const
          const preservesOfficialStats =
            (old.summary.rank === null || next.summary.rank !== null) &&
            old.members.every((previous) => {
              const current = next.members.find(
                (candidate) =>
                  candidate.accountId === previous.accountId &&
                  candidate.participantId === previous.participantId,
              )
              return (
                current !== undefined &&
                officialFields.every((field) => previous[field] === null || current[field] !== null)
              )
            })
          const improved =
            preservesOfficialStats &&
            (next.quality === 'ready' ||
              (next.events.length >= old.events.length && warningsCount(next) < warningsCount(old)))
          if (!improved) return (await repo.getReport(id))!
          return repo.improveReport(
            { ...next, generatedAt: old.generatedAt, lastRetryAt: claimedAt },
            old.revision,
          )
        },
        Math.max(1, deadline - now()),
      )
      return {
        data: toPublicReport(updated, now()),
        meta: { source: updated.source, quality: updated.quality, revision: updated.revision },
      }
    },
  }
}
