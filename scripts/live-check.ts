/** Explicit, bounded read-only PUBG validation. Writes normalized reports only to local configured DB. */
import { z } from 'zod'
import { platformSchema, playerNameSchema } from '../shared/schemas/report'
import { createPubgAdapter } from '../server/adapters/pubg'
import { createPostgresRepository } from '../server/repositories/postgres'
import { createReviewService } from '../server/services/review'
import { ApiError } from '../server/utils/errors'
import { runWithMetrics, readMetrics } from '../server/utils/metrics'

const platform = platformSchema.parse(process.env.LIVE_PLATFORM)
const name = playerNameSchema.parse(process.env.LIVE_PLAYER)
const apiKey = process.env.NUXT_PUBG_API_KEY
const databaseUrl = process.env.NUXT_DATABASE_URL
if (!apiKey || !databaseUrl)
  throw new Error('Set private NUXT_PUBG_API_KEY and NUXT_DATABASE_URL locally.')
const connection = createPostgresRepository(databaseUrl)
const transfers: { host: string; decodedBytes: number; durationMs: number }[] = []
const measuredFetch: typeof fetch = async (input, init) => {
  const started = performance.now()
  const response = await fetch(input, init)
  const entry = {
    host: new URL(input instanceof Request ? input.url : String(input)).hostname,
    decodedBytes: 0,
    durationMs: 0,
  }
  transfers.push(entry)
  if (!response.body) return response
  const body = response.body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        entry.decodedBytes += chunk.byteLength
        entry.durationMs = performance.now() - started
        controller.enqueue(chunk)
      },
    }),
  )
  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  })
}
const provider = {
  source: 'live' as const,
  ...createPubgAdapter({ apiKey, fetchImpl: measuredFetch }),
}
const service = createReviewService(connection.repository, provider)
try {
  await runWithMetrics(async () => {
    const started = performance.now()
    const player = await service.search(platform, name)
    const list = await service.matches(platform, player.data.accountId, {
      queueType: 'all',
      teamMode: 'all',
      refresh: true,
    })
    const snapshot = await connection.repository.getPlayerSnapshot(list.meta.snapshotId)
    const inspected = await connection.repository.getMatches(
      'live',
      platform,
      snapshot?.matchIds.slice(0, 20) ?? [],
    )
    const counts: Record<string, number> = {}
    for (const match of inspected) {
      const label = `${match.rawMatchType ?? 'missing'}:${match.rawGameMode ?? 'missing'}:${match.classification}`
      counts[label] = (counts[label] ?? 0) + 1
    }
    const selected = new Map<string, (typeof list.data.matches)[number]>()
    for (const queue of ['normal', 'ranked'])
      for (const team of ['duo', 'squad']) {
        const match = list.data.matches.find((m) => m.queueType === queue && m.teamMode === team)
        if (match) selected.set(match.matchId, match)
      }
    for (const match of list.data.matches) {
      if (selected.size >= 5) break
      selected.set(match.matchId, match)
    }
    const reports = []
    for (const match of [...selected.values()].slice(0, 5)) {
      const began = performance.now()
      const transferStart = transfers.length
      try {
        const created = await service.create(
          { platform, matchId: match.matchId, playerId: player.data.accountId },
          'local-live-validation',
        )
        const report = await service.report(created.data.reportId)
        const events = await service.events(created.data.reportId, {
          kinds: ['knock', 'revive', 'kill', 'damage'],
          limit: 50,
        })
        reports.push({
          reportId: report.data.id,
          queueType: match.queueType,
          teamMode: match.teamMode,
          rawMatchType: inspected.find((m) => m.matchId === match.matchId)?.rawMatchType,
          quality: report.data.quality,
          memberCount: report.data.members.length,
          eventCount: events.data.total,
          reasons: report.data.warnings.map((w) => ({ code: w.code, count: w.count })),
          elapsedMs: Math.round(performance.now() - began),
          reused: created.data.reused,
          transfers: transfers.slice(transferStart),
        })
      } catch (error) {
        reports.push({
          queueType: match.queueType,
          teamMode: match.teamMode,
          error: error instanceof ApiError ? error.code : 'UNEXPECTED_ERROR',
        })
      }
    }
    console.log(
      JSON.stringify(
        {
          measuredAt: new Date().toISOString(),
          source: 'actual-pubg',
          platform,
          requestedName: name,
          scope: 'first 20 raw match IDs only, maximum 5 report analyses, external reads only',
          listing: {
            checked: list.meta.checked,
            total: list.meta.total,
            matched: list.meta.matched,
            failed: list.meta.failed,
            excluded: list.meta.excluded,
            unclassified: list.meta.unclassified,
            hasMore: Boolean(list.data.nextCursor),
          },
          rawClassificationCounts: counts,
          reports,
          elapsedMs: Math.round(performance.now() - started),
          processPeakRssBytes: process.resourceUsage().maxRSS * 1024,
          metrics: readMetrics(),
        },
        null,
        2,
      ),
    )
  })
} catch (error) {
  console.log(
    JSON.stringify({
      source: 'actual-pubg',
      platform,
      failed: true,
      error:
        error instanceof ApiError
          ? error.code
          : error instanceof z.ZodError
            ? 'INVALID_INPUT_OR_UPSTREAM'
            : 'UNEXPECTED_ERROR',
    }),
  )
  process.exitCode = 1
} finally {
  await connection.close()
}
