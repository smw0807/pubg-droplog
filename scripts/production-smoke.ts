import assert from 'node:assert/strict'
import { spawn, type ChildProcess } from 'node:child_process'
import { readFile, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { z } from 'zod'
import {
  createReportDataSchema,
  eventsDataSchema,
  matchesDataSchema,
  playerSchema,
  reportSchema,
} from '../shared/schemas/report'

const dbEnabledValue = process.env.NUXT_DB_ENABLED ?? 'false'
if (dbEnabledValue !== 'true' && dbEnabledValue !== 'false')
  throw new Error('NUXT_DB_ENABLED must be true or false.')
const dbEnabled = dbEnabledValue === 'true'
const databaseUrl = process.env.NUXT_DATABASE_URL ?? ''
if (dbEnabled && !databaseUrl)
  throw new Error('NUXT_DATABASE_URL is required when NUXT_DB_ENABLED=true.')
const port = Number(process.env.SMOKE_PORT ?? 3102)
const base = `http://127.0.0.1:${port}`
const canary = `smoke-private-canary-${Date.now()}`
// Memory smoke must succeed even with an unusable URL; never use an inherited DB in this mode.
const ignoredDatabaseUrl = `postgres://${canary}:unused@127.0.0.1:1/ignored`
const privateValues = [canary, databaseUrl, ignoredDatabaseUrl].filter(Boolean)
const run = Date.now().toString(36)
const statusSchema = z.object({
  mode: z.enum(['demo', 'live']),
  storageMode: z.enum(['memory', 'postgres']),
  storageConfigured: z.boolean(),
  liveConfigured: z.boolean(),
})
let child: ChildProcess | undefined
let logs = ''
function assertPrivateConfigurationAbsent(content: string, context: string) {
  assert.ok(
    privateValues.every((value) => !content.includes(value)),
    `Private configuration in ${context}`,
  )
}
function redactPrivateConfiguration(content: string) {
  return privateValues.reduce((value, secret) => value.replaceAll(secret, '[redacted]'), content)
}
async function stop() {
  if (!child || child.exitCode !== null) return
  const running = child
  await new Promise<void>((resolveExit) => {
    running.once('exit', () => resolveExit())
    running.kill('SIGTERM')
  })
  child = undefined
}
async function start(
  mode: 'demo' | 'live',
  mock = false,
  key = canary,
  dbUrl = dbEnabled ? databaseUrl : ignoredDatabaseUrl,
  enabled = dbEnabled,
) {
  await stop()
  const args = mock
    ? [
        '--import',
        'tsx',
        '--import',
        './tests/helpers/mock-upstream.ts',
        '.output/server/index.mjs',
      ]
    : ['.output/server/index.mjs']
  child = spawn(process.execPath, args, {
    env: {
      ...process.env,
      NUXT_DB_ENABLED: String(enabled),
      NUXT_DATABASE_URL: dbUrl,
      NUXT_DATA_MODE: mode,
      NUXT_PUBG_API_KEY: key,
      PORT: String(port),
      HOST: '127.0.0.1',
      SMOKE_RUN_ID: run,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  child.stdout?.on('data', (value) => {
    logs += String(value)
  })
  child.stderr?.on('data', (value) => {
    logs += String(value)
  })
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null)
      throw new Error(
        `Production server exited (${child.exitCode}). ${redactPrivateConfiguration(logs).slice(-1800)}`,
      )
    let ready: Response | undefined
    try {
      ready = await fetch(`${base}/api/status`, { signal: AbortSignal.timeout(1000) })
    } catch {
      /* wait for bind */
    }
    if (ready?.ok) {
      const raw: unknown = await ready.json()
      assertPrivateConfigurationAbsent(JSON.stringify(raw), 'status response')
      assert.deepEqual(z.object({ data: statusSchema }).parse(raw).data, {
        mode,
        storageMode: enabled ? 'postgres' : 'memory',
        storageConfigured: enabled ? Boolean(dbUrl) : true,
        liveConfigured: Boolean(key),
      })
      return
    }
    await sleep(100)
  }
  throw new Error('Production server did not become ready')
}
async function get<T>(path: string, schema: z.ZodType<T>, options?: RequestInit) {
  const response = await fetch(`${base}${path}`, options)
  const raw: unknown = await response.json()
  const serialized = JSON.stringify(raw)
  assertPrivateConfigurationAbsent(serialized, 'API response')
  assert.ok(response.ok, `${path}: HTTP ${response.status}`)
  return {
    response,
    body: z
      .object({ data: schema, meta: z.object({ source: z.enum(['demo', 'live']) }).passthrough() })
      .parse(raw),
  }
}
async function expectError(path: string, status: number, code: string, options?: RequestInit) {
  const response = await fetch(`${base}${path}`, options)
  const raw: unknown = await response.json()
  assertPrivateConfigurationAbsent(JSON.stringify(raw), 'API error response')
  assert.equal(response.status, status)
  assert.equal(z.object({ error: z.object({ code: z.string() }) }).parse(raw).error.code, code)
}
const create = (matchId: string, playerId = 'account.demo-1') =>
  get('/api/reports', createReportDataSchema, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ platform: 'steam', matchId, playerId }),
  })
async function scanPublicFiles(directory: string) {
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, item.name)
    if (item.isDirectory()) await scanPublicFiles(path)
    else if (/\.(js|css|html|json)$/.test(item.name)) {
      const content = await readFile(path, 'utf8')
      assertPrivateConfigurationAbsent(content, item.name)
      assert.ok(
        !content.includes('telemetry-cdn.pubg.com/synthetic/'),
        `Raw fixture shipped to browser: ${item.name}`,
      )
    }
  }
}
try {
  await start('demo', false, '', '', true)
  assert.equal((await get('/api/reports/demo-normal-squad', reportSchema)).body.data.source, 'demo')
  await expectError(
    '/api/players/search?platform=steam&name=SquadMate',
    503,
    'SERVER_MISCONFIGURED',
  )
  await start('demo')
  const search = await get('/api/players/search?platform=steam&name=%20SquadMate%20', playerSchema)
  assert.equal(search.body.data.accountId, 'account.demo-1')
  assert.equal(search.body.meta.source, 'demo')
  const list = await get(
    '/api/players/steam/account.demo-1/matches?queueType=ranked&teamMode=duo',
    matchesDataSchema,
  )
  assert.equal(list.body.data.matches.length, 1)
  const created = await create('demo-match-ranked-duo')
  let id = created.body.data.reportId
  const before = await get(`/api/reports/${id}`, reportSchema)
  assert.equal(before.body.data.source, 'demo')
  const reused = await create('demo-match-ranked-duo')
  assert.equal(reused.body.data.reportId, id)
  assert.equal(reused.body.data.reused, true)
  assert.equal(reused.response.status, 200)
  assert.ok((await get(`/api/reports/${id}/events`, eventsDataSchema)).body.data.total > 0)
  await expectError('/api/reports', 422, 'UNSUPPORTED_MATCH', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      platform: 'steam',
      matchId: 'demo-match-fpp-duo',
      playerId: 'account.demo-1',
    }),
  })
  await start('demo')
  if (dbEnabled) {
    assert.deepEqual((await get(`/api/reports/${id}`, reportSchema)).body.data, before.body.data)
  } else {
    assert.equal(created.response.status, 201)
    assert.equal(created.body.data.reused, false)
    await expectError(`/api/reports/${id}`, 404, 'REPORT_NOT_FOUND')
    const regenerated = await create('demo-match-ranked-duo')
    assert.equal(regenerated.response.status, 201)
    assert.equal(regenerated.body.data.reused, false)
    assert.notEqual(regenerated.body.data.reportId, id)
    id = regenerated.body.data.reportId
  }
  const times: number[] = []
  for (let i = 0; i < 100; i++) {
    const began = performance.now()
    await get(`/api/reports/${id}`, reportSchema)
    times.push(performance.now() - began)
  }
  times.sort((a, b) => a - b)
  const reportHtml = await fetch(`${base}/reports/${id}`).then((r) => r.text())
  assert.ok(reportHtml.includes('noindex'))
  assertPrivateConfigurationAbsent(reportHtml, 'report HTML')
  const metricsSchema = z.object({ upstreamCalls: z.number() })
  for (const line of logs.split('\n').filter((line) => line.startsWith('{'))) {
    const metric = metricsSchema.safeParse(JSON.parse(line))
    if (metric.success) assert.equal(metric.data.upstreamCalls, 0, 'Demo made an upstream request')
  }
  await start('live', false, '')
  if (dbEnabled)
    assert.equal((await get(`/api/reports/${id}`, reportSchema)).body.data.source, 'demo')
  else await expectError(`/api/reports/${id}`, 404, 'REPORT_NOT_FOUND')
  assert.equal((await get('/api/reports/demo-ranked-duo', reportSchema)).body.data.source, 'demo')
  await expectError(
    `/api/players/search?platform=steam&name=Smoke-${run}`,
    503,
    'SERVER_MISCONFIGURED',
  )
  await start('live', true)
  const liveSearch = await get(`/api/players/search?platform=steam&name=Smoke-${run}`, playerSchema)
  assert.equal(liveSearch.body.data.accountId, `account.smoke-${run}`)
  assert.equal(liveSearch.body.meta.source, 'live')
  const liveList = await get(`/api/players/steam/account.smoke-${run}/matches`, matchesDataSchema)
  assert.equal(liveList.body.data.matches.length, 4)
  for (const match of liveList.body.data.matches) {
    const live = await create(match.matchId, `account.smoke-${run}`)
    assert.equal(live.response.status, 201)
    const report = await get(`/api/reports/${live.body.data.reportId}`, reportSchema)
    assert.equal(report.body.data.source, 'live')
    assert.equal(report.body.data.quality, 'ready')
    assert.equal(report.body.data.members.length, match.teamMode === 'duo' ? 2 : 4)
    assert.equal(
      (await get(`/api/reports/${report.body.data.id}/events`, eventsDataSchema)).body.data.total,
      1,
    )
  }
  await scanPublicFiles(resolve('.output/public'))
  assertPrivateConfigurationAbsent(logs, 'server logs')
  console.log(
    JSON.stringify({
      fixture: true,
      liveNetwork: false,
      productionSdkMock: 'four TPP combinations passed',
      storageMode: dbEnabled ? 'postgres' : 'memory',
      persistenceAcrossRestart: dbEnabled,
      ...(dbEnabled ? {} : { memoryResetAcrossRestart: true }),
      sourceAfterModeSwitch: dbEnabled ? 'demo' : 'report unavailable',
      requests: times.length,
      concurrency: 1,
      savedReportP95Ms: Number(times[94]!.toFixed(2)),
      savedReportMedianMs: Number(times[49]!.toFixed(2)),
      privateCanaryAbsent: true,
    }),
  )
} finally {
  await stop()
}
