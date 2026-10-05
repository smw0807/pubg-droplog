import { describe, expect, it } from 'vitest'
import {
  readMetrics,
  recordAnalysisVersion,
  recordCacheHit,
  recordReason,
  recordSource,
  recordUpstreamCall,
  runWithMetrics,
} from '../../server/utils/metrics'

describe('safe per-request metrics', () => {
  it('isolates async request counters and permits only structured fields', async () => {
    const metrics = await Promise.all(
      ['live', 'demo'].map((source) =>
        runWithMetrics(async () => {
          recordSource(source === 'live' ? 'live' : 'demo')
          recordAnalysisVersion('1')
          recordUpstreamCall()
          await Promise.resolve()
          recordCacheHit()
          recordReason('TELEMETRY_UNAVAILABLE')
          recordReason('TELEMETRY_UNAVAILABLE')
          recordReason('Bearer private-key')
          recordAnalysisVersion('https://private.example')
          if (source === 'live') recordUpstreamCall()
          return readMetrics()
        }),
      ),
    )
    expect(metrics).toEqual([
      {
        upstreamCalls: 2,
        cacheHits: 1,
        source: 'live',
        analysisVersion: '1',
        reasons: ['TELEMETRY_UNAVAILABLE'],
      },
      {
        upstreamCalls: 1,
        cacheHits: 1,
        source: 'demo',
        analysisVersion: '1',
        reasons: ['TELEMETRY_UNAVAILABLE'],
      },
    ])
    expect(readMetrics().upstreamCalls).toBe(0)
  })
})
