import { cpus, release, totalmem } from 'node:os'
import { performance } from 'node:perf_hooks'
import { analyzeReport, MAX_REPORT_EVENTS } from '../server/domain/report'
import { demoPlayer, demoTelemetry, getDemoMatch } from '../server/fixtures/demo'

const match = getDemoMatch('demo-match-normal-squad')
if (!match) throw new Error('Synthetic benchmark match is unavailable.')
const baselineRssBytes = process.memoryUsage().rss
const typicalTelemetry = demoTelemetry(match.matchId)
const run = (telemetry: unknown, id: string) => {
  const started = performance.now()
  const report = analyzeReport({ match, telemetry, playerId: demoPlayer.accountId, reportId: id, generatedAt: '2026-10-04T12:00:00.000Z' })
  return { durationMs: performance.now() - started, eventCount: report.events.length, quality: report.quality, warnings: report.warnings }
}

run(typicalTelemetry, 'benchmark-warmup')
const typicalRuns = Array.from({ length: 10 }, (_, index) => run(typicalTelemetry, `benchmark-typical-${index}`))
const typicalDurations = typicalRuns.map(result => result.durationMs).sort((a, b) => a - b)
const largeCount = 25_000
const largeTelemetry = [
  { _T: 'LogMatchStart', _D: match.createdAt },
  ...Array.from({ length: largeCount }, (_, index) => ({
    _T: 'LogPlayerTakeDamage', _D: new Date(Date.parse(match.createdAt) + 1_000 + index).toISOString(),
    attacker: { accountId: demoPlayer.accountId, name: demoPlayer.displayName, teamId: 11 },
    victim: { accountId: 'account.opponent-1', name: 'StoneFalcon', teamId: 22 },
    damage: 1, damageCauserName: 'WeapM416_C', damageTypeCategory: 'Damage_Gun',
    // Unused future fields reproduce a larger input without inflating persisted events.
    syntheticAdditionalField: 'x'.repeat(640),
  })),
]
const largeInputBytes = Buffer.byteLength(JSON.stringify(largeTelemetry))
if (largeInputBytes >= 32 * 1024 * 1024) throw new Error('Benchmark must remain below the decompressed telemetry cap.')
const large = run(largeTelemetry, 'benchmark-large')
if (large.eventCount !== MAX_REPORT_EVENTS || large.quality !== 'partial' || !large.warnings.some(warning => warning.code === 'EVENT_LIMIT_EXCEEDED')) {
  throw new Error('Large-fixture benchmark did not preserve the event limit and partial-report semantics.')
}

console.log(JSON.stringify({
  measuredAt: new Date().toISOString(), source: 'synthetic-fixture',
  environment: { node: process.version, platform: process.platform, arch: process.arch, osRelease: release(), cpu: cpus()[0]?.model ?? 'unknown', totalMemoryBytes: totalmem(), concurrency: 1, database: 'not used' },
  typical: { rawEventCount: typicalTelemetry.length, inputBytes: Buffer.byteLength(JSON.stringify(typicalTelemetry)), normalizedEventCount: typicalRuns[0]!.eventCount, runs: typicalRuns.length,
    medianMs: typicalDurations[Math.floor(typicalDurations.length / 2)], p95Ms: typicalDurations[Math.ceil(typicalDurations.length * 0.95) - 1] },
  large: { rawEventCount: largeTelemetry.length, inputBytes: largeInputBytes, normalizedEventCount: large.eventCount, durationMs: large.durationMs, quality: large.quality, warnings: large.warnings },
  memory: { baselineRssBytes, endingRssBytes: process.memoryUsage().rss, processPeakRssBytes: process.resourceUsage().maxRSS * 1024 },
  scope: 'Pure synchronous analyzer only. Includes normalization and output schema validation; excludes downloads, HTTP, DB, browser and live PUBG data. Peak RSS is the full benchmark process high-water mark including fixture generation and JSON size measurement.',
}, null, 2))
