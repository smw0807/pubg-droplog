import { describe, expect, it, vi } from 'vitest'
import { demoMatches, demoPlayer } from '../../server/fixtures/demo'
import { createMemoryRepository } from '../../server/repositories/memory'
import type { Provider } from '../../server/services/provider'
import { createReviewService } from '../../server/services/review'
import { ApiError } from '../../server/utils/errors'

describe('review service with expiring memory storage', () => {
  it('returns REPORT_NOT_FOUND when a partial report expires during an unsuccessful retry', async () => {
    let now = Date.parse('2026-10-10T12:00:00.000Z')
    let expireDuringRetry = false
    const repo = createMemoryRepository({ now: () => now, reports: { ttlMs: 1000 } })
    const match = { ...structuredClone(demoMatches[0]!), source: 'live' as const }
    const player = {
      accountId: demoPlayer.accountId,
      displayName: demoPlayer.displayName,
      matchIds: [match.matchId],
    }
    const provider: Provider = {
      source: 'live',
      searchPlayer: async () => player,
      getPlayer: async () => player,
      getMatch: async () => ({ match, telemetryUrl: 'fixture:telemetry' }),
      getTelemetry: vi.fn(async () => {
        if (expireDuringRetry) now += 2
        throw new ApiError('UPSTREAM_TIMEOUT', 504, '합성 상세 기록 조회 실패')
      }),
    }
    const service = createReviewService(repo, provider, { now: () => now })
    const created = await service.create(
      { platform: match.platform, matchId: match.matchId, playerId: player.accountId },
      'create-client',
    )
    expect(created.data.quality).toBe('partial')
    const id = created.data.reportId

    now += 999
    expect(await repo.getReport(id)).not.toBeNull()
    expireDuringRetry = true
    await expect(service.retry(id, 'retry-client')).rejects.toMatchObject({
      code: 'REPORT_NOT_FOUND',
      status: 404,
    })
    expect(provider.getTelemetry).toHaveBeenCalledTimes(2)
    expect(await repo.getReport(id)).toBeNull()
    await expect(service.report(id)).rejects.toMatchObject({
      code: 'REPORT_NOT_FOUND',
      status: 404,
    })
  })
})
