/** One existing match only. Never persist or log raw telemetry or credentials. */
import assert from 'node:assert/strict'
import { z } from 'zod'
import { createPubgAdapter } from '../server/adapters/pubg'
import { createPostgresRepository } from '../server/repositories/postgres'
import { createReviewService } from '../server/services/review'
import { ApiError } from '../server/utils/errors'
import { projectMapLocation } from '../shared/utils/map-coordinates'

const id = z.string().uuid().parse(process.env.MAP_REPORT_ID)
const apiKey = process.env.NUXT_PUBG_API_KEY
const databaseUrl = process.env.NUXT_DATABASE_URL
if (!apiKey || !databaseUrl) throw new Error('Set private NUXT_PUBG_API_KEY and NUXT_DATABASE_URL locally.')
const connection = createPostgresRepository(databaseUrl)
const service = createReviewService(connection.repository, { source: 'live', ...createPubgAdapter({ apiKey }) })
try {
  const before = await connection.repository.getReport(id)
  assert(before?.source === 'live', 'Choose an existing live report.')
  const started = performance.now()
  const result = await service.upgrade(id, 'local-map-validation')
  const report = await connection.repository.getReport(result.data.reportId)
  assert(report, 'The new report must be persisted.')
  assert.deepEqual(await connection.repository.getReport(id), before, 'The old report must stay unchanged.')
  const major = report.events.filter(event => event.kind !== 'damage')
  const located = (events: typeof report.events) => events.filter(event => projectMapLocation(report.summary.mapName, event.target?.location)).length
  const mapped = located(major)
  assert(mapped > 0, 'This match has no verified major-event map positions.')
  const reused = await service.upgrade(id, 'local-map-validation')
  assert.equal(reused.data.reportId, report.id)
  assert(reused.data.reused)
  console.log(JSON.stringify({ source: 'actual-pubg', reportId: report.id, analysisVersion: report.analysisVersion,
    mapName: report.summary.mapName, quality: report.quality, oldReportPreserved: true, reusedOnSecondRequest: true,
    allEvents: report.events.length, locatedEvents: located(report.events), majorEvents: major.length, locatedMajorEvents: mapped,
    elapsedMs: Math.round(performance.now() - started), initialReused: result.data.reused,
  }, null, 2))
} catch (error) {
  console.error(JSON.stringify({ failed: true, error: error instanceof ApiError ? error.code : 'MAP_VALIDATION_FAILED' }))
  process.exitCode = 1
} finally { await connection.close() }
