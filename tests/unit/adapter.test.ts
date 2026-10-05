import { afterEach, describe, expect, it, vi } from 'vitest'
import { PubgClient, type PubgClientOptions } from 'pubg-kit'
import { createPubgAdapter, validateTelemetryUrl } from '../../server/adapters/pubg'
import { readMetrics, runWithMetrics } from '../../server/utils/metrics'
import { ConcurrencyLimiter, SlidingWindowLimiter } from '../../server/utils/limits'

function rawMatch() {
  return {
    data: {
      type: 'match',
      id: 'match-1',
      attributes: {
        gameMode: 'squad',
        matchType: 'competitive',
        isCustomMatch: false,
        createdAt: '2026-10-01T12:00:00.000Z',
        duration: 1200,
        shardId: 'steam',
        mapName: 'Baltic_Main',
      },
      relationships: {
        rosters: { data: [{ type: 'roster', id: 'roster-1' }] },
        assets: { data: [{ type: 'asset', id: 'asset-1' }] },
      },
    },
    included: [
      {
        type: 'participant',
        id: 'participant-1',
        attributes: {
          shardId: 'steam',
          actor: '',
          stats: {
            DBNOs: 1,
            assists: 0,
            boosts: 0,
            damageDealt: 10,
            deathType: 'byplayer',
            headshotKills: 0,
            heals: 0,
            killPlace: 1,
            killStreaks: 1,
            kills: 1,
            longestKill: 0,
            name: 'Synthetic-One',
            playerId: 'account.synthetic-one',
            revives: 0,
            rideDistance: 0,
            roadKills: 0,
            swimDistance: 0,
            teamKills: 0,
            timeSurvived: 1200,
            vehicleDestroys: 0,
            walkDistance: 0,
            weaponsAcquired: 1,
            winPlace: 1,
          },
        },
      },
      {
        type: 'roster',
        id: 'roster-1',
        attributes: { stats: { rank: 1, teamId: 1 }, won: 'true', shardId: 'steam' },
        relationships: {
          team: { data: null },
          participants: { data: [{ type: 'participant', id: 'participant-1' }] },
        },
      },
      {
        type: 'asset',
        id: 'asset-1',
        attributes: {
          name: 'telemetry',
          description: '',
          createdAt: '2026-10-01T12:00:00.000Z',
          URL: 'https://telemetry-cdn.pubg.com/synthetic.json',
        },
      },
    ],
  }
}

const rawPlayer = {
  type: 'player',
  id: 'account.synthetic-one',
  attributes: { name: 'Synthetic-One', shardId: 'steam' },
  relationships: { matches: { data: [{ type: 'match', id: 'match-1' }] } },
}

function sdkMock(handler: (url: string, signal?: AbortSignal) => Promise<unknown>) {
  const configs: PubgClientOptions[] = []
  const requests: string[] = []
  const factory = (config: PubgClientOptions) => {
    configs.push(config)
    const client = new PubgClient(config)
    client.getHttp().defaults.adapter = async (request) => {
      requests.push(request.url ?? '')
      // The SDK's Axios signal type supports the same API but declares it optional.
      const signal = request.signal instanceof AbortSignal ? request.signal : undefined
      const data = await handler(request.url ?? '', signal)
      return { data, status: 200, statusText: 'OK', headers: {}, config: request }
    }
    return client
  }
  return { factory, configs, requests }
}

function adapterWith(mock: ReturnType<typeof sdkMock>) {
  return createPubgAdapter({
    apiKey: 'synthetic-canary-not-a-real-key',
    sdkFactory: mock.factory,
    playersLimiter: new SlidingWindowLimiter(10),
    metadataLimiter: new ConcurrencyLimiter(3, 20),
  })
}

afterEach(() => vi.useRealTimers())

describe('real pubg-kit wrapper with mocked HTTP', () => {
  it('uses SDK normal calls with cache and limiter disabled, and excludes matches from player quota', async () => {
    const mock = sdkMock(async (url) =>
      url.includes('/matches/') ? rawMatch() : { data: [rawPlayer] },
    )
    const adapter = adapterWith(mock)
    for (let i = 0; i < 10; i++) await adapter.searchPlayer('steam', 'Synthetic-One')
    await expect(adapter.searchPlayer('steam', 'Synthetic-One')).rejects.toMatchObject({
      status: 429,
    })
    for (let i = 0; i < 12; i++) {
      const result = await adapter.getMatch('steam', 'match-1')
      expect(result.match).toMatchObject({
        source: 'live',
        rawMatchType: 'competitive',
        queueType: 'ranked',
        teamMode: 'squad',
      })
    }
    expect(mock.requests).toHaveLength(22)
    expect(
      mock.configs.every(
        (config) =>
          config.cache === false && config.rateLimit === false && config.timeout === 10_000,
      ),
    ).toBe(true)
  })

  it('preserves case, trims input, encodes query metacharacters and validates single player responses', async () => {
    const name = 'SynthetiC&test=1'
    const mock = sdkMock(async (url) =>
      url.includes('?')
        ? { data: [{ ...rawPlayer, attributes: { name, shardId: 'steam' } }] }
        : { data: rawPlayer },
    )
    const adapter = adapterWith(mock)
    expect((await adapter.searchPlayer('kakao', ` ${name} `)).displayName).toBe(name)
    expect(mock.requests[0]).toContain('SynthetiC%26test%3D1')
    expect((await adapter.getPlayer('steam', 'account.synthetic-one')).matchIds).toEqual([
      'match-1',
    ])
    await expect(adapter.searchPlayer('steam', 'one,two')).rejects.toMatchObject({ status: 400 })
  })

  it('rejects missing player match relationships instead of returning a false empty history', async () => {
    const mock = sdkMock(async () => ({ data: { ...rawPlayer, relationships: undefined } }))
    await expect(
      adapterWith(mock).getPlayer('steam', 'account.synthetic-one'),
    ).rejects.toMatchObject({ status: 502 })
  })

  it('maps missing credentials and missing players to the public error contract', async () => {
    await expect(
      createPubgAdapter({ apiKey: '' }).searchPlayer('steam', 'Synthetic-One'),
    ).rejects.toMatchObject({ code: 'SERVER_MISCONFIGURED', status: 503 })
    const mock = sdkMock(async () => {
      throw Object.assign(new Error('missing'), { response: { status: 404 } })
    })
    await expect(
      adapterWith(mock).getPlayer('steam', 'account.synthetic-one'),
    ).rejects.toMatchObject({ code: 'PLAYER_NOT_FOUND', status: 404 })
  })

  it('counts actual SDK compatibility requests and telemetry fetches without recording key values', async () => {
    const raw: unknown = JSON.parse(
      JSON.stringify(rawMatch(), (key, value: unknown) =>
        key === 'damageDealt' ? undefined : value,
      ),
    )
    const mock = sdkMock(async () => raw)
    const adapter = createPubgAdapter({
      apiKey: 'secret-canary',
      sdkFactory: mock.factory,
      fetchImpl: async () => new Response('[]'),
    })
    const metrics = await runWithMetrics(async () => {
      await adapter.getMatch('steam', 'match-1')
      await adapter.getTelemetry('https://telemetry-cdn.pubg.com/data')
      return readMetrics()
    })
    expect(metrics.upstreamCalls).toBe(3)
    expect(JSON.stringify(metrics)).not.toContain('secret-canary')
  })

  it('uses the compatibility path only on actual strict SDK schema failure', async () => {
    const raw = rawMatch()
    // Deliberately remove one SDK-required official stat using a JSON replacer.
    const missingStat: unknown = JSON.parse(
      JSON.stringify(raw, (key, value: unknown) => (key === 'damageDealt' ? undefined : value)),
    )
    const mock = sdkMock(async () => missingStat)
    const result = await adapterWith(mock).getMatch('steam', 'match-1')
    expect(mock.requests).toHaveLength(2)
    expect(result.match.participants[0]?.damageDealt).toBeNull()
    expect(result.match.participants[0]?.kills).toBe(1)
  })

  it.each([401, 403, 404, 429, 500])(
    'never re-requests HTTP %s through compatibility path',
    async (status) => {
      const mock = sdkMock(async () => {
        throw Object.assign(new Error('SECRET raw body'), {
          response: {
            status,
            headers: { 'retry-after': '7' },
            data: { errors: [{ detail: 'SECRET key' }] },
          },
        })
      })
      const result = adapterWith(mock).getMatch('steam', 'match-1')
      await expect(result).rejects.not.toThrow('SECRET')
      expect(mock.requests).toHaveLength(1)
      if (status === 429) await expect(result).rejects.toMatchObject({ retryAfterSeconds: 7 })
    },
  )

  it('never re-requests network errors and cancels an actual SDK request when the timeout expires', async () => {
    const network = sdkMock(async () => {
      throw new Error('network failure')
    })
    await expect(adapterWith(network).getMatch('steam', 'match-1')).rejects.toMatchObject({
      code: 'UPSTREAM_ERROR',
    })
    expect(network.requests).toHaveLength(1)
    vi.useFakeTimers()
    let aborted = false
    const timeout = sdkMock(
      (_url, signal) =>
        new Promise((_resolve, reject) => {
          signal?.addEventListener(
            'abort',
            () => {
              aborted = true
              reject(signal.reason)
            },
            { once: true },
          )
        }),
    )
    const promise = adapterWith(timeout).getMatch('steam', 'match-1')
    const rejection = expect(promise).rejects.toMatchObject({ code: 'UPSTREAM_TIMEOUT' })
    await vi.advanceTimersByTimeAsync(10_000)
    await rejection
    expect(aborted).toBe(true)
    expect(timeout.requests).toHaveLength(1)
  })
})

describe('bounded telemetry transport', () => {
  it.each([
    'http://telemetry-cdn.pubg.com/file',
    'https://telemetry-cdn.pubg.com.evil.test/file',
    'https://localhost/file',
    'https://user:password@telemetry-cdn.pubg.com/file',
    'https://telemetry-cdn.pubg.com:444/file',
  ])('rejects unsafe URL %s', (url) => {
    expect(() => validateTelemetryUrl(url)).toThrow(
      expect.objectContaining({ code: 'TELEMETRY_URL_INVALID' }),
    )
  })

  it('sends no authorization, forbids redirects, and does not consume players quota', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response('[{"_T":"NewEvent"}]'))
    const limiter = new SlidingWindowLimiter(0)
    const adapter = createPubgAdapter({
      apiKey: 'private-canary',
      fetchImpl,
      playersLimiter: limiter,
    })
    const telemetry = await adapter.getTelemetry('https://telemetry-cdn.pubg.com/data')
    expect(telemetry).toEqual([{ _T: 'NewEvent' }])
    expect(fetchImpl.mock.calls[0]?.[1]).toMatchObject({
      redirect: 'error',
      headers: { Accept: 'application/json' },
    })
    expect(JSON.stringify(fetchImpl.mock.calls)).not.toContain('private-canary')
    await expect(adapter.searchPlayer('steam', 'Synthetic-One')).rejects.toMatchObject({
      status: 429,
    })
  })

  it('cancels the decompressed body before JSON parse when it exceeds the bound', async () => {
    const cancel = vi.fn()
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(11))
      },
      cancel,
    })
    const adapter = createPubgAdapter({
      apiKey: '',
      telemetryMaxBytes: 10,
      fetchImpl: async () => new Response(stream),
    })
    await expect(adapter.getTelemetry('https://telemetry-cdn.pubg.com/data')).rejects.toMatchObject(
      { code: 'TELEMETRY_TOO_LARGE' },
    )
    expect(cancel).toHaveBeenCalledOnce()
  })

  it('rejects redirect response and malformed JSON', async () => {
    const redirect = createPubgAdapter({
      apiKey: '',
      fetchImpl: async () =>
        new Response('', { status: 302, headers: { location: 'https://evil.test' } }),
    })
    await expect(
      redirect.getTelemetry('https://telemetry-cdn.pubg.com/data'),
    ).rejects.toMatchObject({ code: 'TELEMETRY_REDIRECT' })
    const malformed = createPubgAdapter({ apiKey: '', fetchImpl: async () => new Response('{') })
    await expect(
      malformed.getTelemetry('https://telemetry-cdn.pubg.com/data'),
    ).rejects.toMatchObject({ code: 'TELEMETRY_INVALID' })
  })

  it('cancels fetch and its streaming reader on timeout', async () => {
    vi.useFakeTimers()
    let aborted = false
    const adapter = createPubgAdapter({
      apiKey: '',
      fetchImpl: async (_input, init) =>
        new Response(
          new ReadableStream({
            start(controller) {
              init?.signal?.addEventListener(
                'abort',
                () => {
                  aborted = true
                  controller.error(new Error('aborted transport'))
                },
                { once: true },
              )
            },
          }),
        ),
    })
    const promise = adapter.getTelemetry('https://telemetry-cdn.pubg.com/data')
    const rejection = expect(promise).rejects.toMatchObject({ code: 'UPSTREAM_TIMEOUT' })
    await vi.advanceTimersByTimeAsync(10_000)
    await rejection
    expect(aborted).toBe(true)
  })
})
