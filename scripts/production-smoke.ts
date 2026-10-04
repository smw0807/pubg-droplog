import assert from 'node:assert/strict'
import { spawn, type ChildProcess } from 'node:child_process'
import { readFile, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { z } from 'zod'
import { createReportDataSchema, eventsDataSchema, matchesDataSchema, reportSchema } from '../shared/schemas/report'

const databaseUrl = process.env.NUXT_DATABASE_URL
if (!databaseUrl) throw new Error('NUXT_DATABASE_URL is required for persisted production smoke.')
const port = Number(process.env.SMOKE_PORT ?? 3102)
const base = `http://127.0.0.1:${port}`
const canary = `smoke-private-canary-${Date.now()}`
const run = Date.now().toString(36)
let child: ChildProcess | undefined
let logs = ''
async function stop() {
  if (!child || child.exitCode !== null) return
  const running = child
  await new Promise<void>((resolveExit) => { running.once('exit', () => resolveExit()); running.kill('SIGTERM') })
  child = undefined
}
async function start(mode: 'demo' | 'live', mock = false, key = canary, dbUrl = databaseUrl) {
  await stop()
  const args = mock ? ['--import', 'tsx', '--import', './tests/helpers/mock-upstream.ts', '.output/server/index.mjs'] : ['.output/server/index.mjs']
  child = spawn(process.execPath, args, { env: { ...process.env, NUXT_DATABASE_URL: dbUrl, NUXT_DATA_MODE: mode, NUXT_PUBG_API_KEY: key, PORT: String(port), HOST: '127.0.0.1', SMOKE_RUN_ID: run }, stdio: ['ignore', 'pipe', 'pipe'] })
  child.stdout?.on('data', value => { logs += String(value) })
  child.stderr?.on('data', value => { logs += String(value) })
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null) throw new Error(`Production server exited (${child.exitCode}). ${logs.slice(-1800)}`)
    try { if ((await fetch(`${base}/api/status`, { signal: AbortSignal.timeout(1000) })).ok) return } catch { /* wait for bind */ }
    await sleep(100)
  }
  throw new Error('Production server did not become ready')
}
async function get<T>(path: string, schema: z.ZodType<T>, options?: RequestInit) {
  const response = await fetch(`${base}${path}`, options)
  const raw: unknown = await response.json()
  const serialized = JSON.stringify(raw)
  assert.ok(!serialized.includes(canary) && !serialized.includes(databaseUrl!), 'Private configuration in API response')
  assert.ok(response.ok, `${path}: HTTP ${response.status}`)
  return { response, body: z.object({ data: schema, meta: z.object({ source: z.enum(['demo', 'live']) }).passthrough() }).parse(raw) }
}
const create = (matchId: string, playerId = 'account.demo-1') => get('/api/reports', createReportDataSchema, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ platform: 'steam', matchId, playerId }) })
async function scanPublicFiles(directory: string) {
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, item.name)
    if (item.isDirectory()) await scanPublicFiles(path)
    else if (/\.(js|css|html|json)$/.test(item.name)) {
      const content = await readFile(path, 'utf8')
      assert.ok(!content.includes(canary) && !content.includes(databaseUrl!), `Private configuration in ${item.name}`)
      assert.ok(!content.includes('telemetry-cdn.pubg.com/synthetic/'), `Raw fixture shipped to browser: ${item.name}`)
    }
  }
}
try {
  await start('demo', false, '', '')
  assert.equal((await get('/api/reports/demo-normal-squad', reportSchema)).body.data.source, 'demo')
  assert.equal((await fetch(`${base}/api/players/search?platform=steam&name=SquadMate`)).status, 503)
  await start('demo')
  const search = await fetch(`${base}/api/players/search?platform=steam&name=%20SquadMate%20`)
  assert.equal(search.status, 200)
  const list = await get('/api/players/steam/account.demo-1/matches?queueType=ranked&teamMode=duo', matchesDataSchema)
  assert.equal(list.body.data.matches.length, 1)
  const created = await create('demo-match-ranked-duo')
  const id = created.body.data.reportId
  const before = await get(`/api/reports/${id}`, reportSchema)
  assert.equal(before.body.data.source, 'demo')
  assert.equal((await create('demo-match-ranked-duo')).body.data.reportId, id)
  const invalid = await fetch(`${base}/api/reports`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ platform: 'steam', matchId: 'demo-match-fpp-duo', playerId: 'account.demo-1' }) })
  assert.equal(invalid.status, 422)
  assert.equal(z.object({ error: z.object({ code: z.string() }) }).parse(await invalid.json()).error.code, 'UNSUPPORTED_MATCH')
  await start('demo')
  assert.deepEqual((await get(`/api/reports/${id}`, reportSchema)).body.data, before.body.data)
  const times: number[] = []
  for (let i = 0; i < 100; i++) { const began = performance.now(); await get(`/api/reports/${id}`, reportSchema); times.push(performance.now() - began) }
  times.sort((a, b) => a - b)
  const reportHtml = await fetch(`${base}/reports/${id}`).then(r => r.text())
  assert.ok(reportHtml.includes('noindex'))
  assert.ok(!reportHtml.includes(canary) && !reportHtml.includes(databaseUrl))
  const metricsSchema = z.object({ upstreamCalls: z.number() })
  for (const line of logs.split('\n').filter(line => line.startsWith('{'))) {
    const metric = metricsSchema.safeParse(JSON.parse(line))
    if (metric.success) assert.equal(metric.data.upstreamCalls, 0, 'Demo made an upstream request')
  }
  await start('live', false, '')
  assert.equal((await get(`/api/reports/${id}`, reportSchema)).body.data.source, 'demo')
  assert.equal((await get('/api/reports/demo-ranked-duo', reportSchema)).body.data.source, 'demo')
  const missingKey = await fetch(`${base}/api/players/search?platform=steam&name=Smoke-${run}`)
  assert.equal(missingKey.status, 503)
  await start('live', true)
  const liveSearch = await fetch(`${base}/api/players/search?platform=steam&name=Smoke-${run}`)
  assert.equal(liveSearch.status, 200)
  const liveList = await get(`/api/players/steam/account.smoke-${run}/matches`, matchesDataSchema)
  assert.equal(liveList.body.data.matches.length, 4)
  for (const match of liveList.body.data.matches) {
    const live = await create(match.matchId, `account.smoke-${run}`)
    assert.equal(live.response.status, 201)
    const report = await get(`/api/reports/${live.body.data.reportId}`, reportSchema)
    assert.equal(report.body.data.source, 'live')
    assert.equal(report.body.data.quality, 'ready')
    assert.equal(report.body.data.members.length, match.teamMode === 'duo' ? 2 : 4)
    assert.equal((await get(`/api/reports/${report.body.data.id}/events`, eventsDataSchema)).body.data.total, 1)
  }
  await scanPublicFiles(resolve('.output/public'))
  assert.ok(!logs.includes(canary) && !logs.includes(databaseUrl))
  console.log(JSON.stringify({ fixture: true, liveNetwork: false, productionSdkMock: 'four TPP combinations passed', persistenceAcrossRestart: true, sourceAfterModeSwitch: 'demo', requests: times.length, concurrency: 1, savedReportP95Ms: Number(times[94]!.toFixed(2)), savedReportMedianMs: Number(times[49]!.toFixed(2)), privateCanaryAbsent: true }))
} finally { await stop() }
