import { createHash } from 'node:crypto'
import { PubgClient, type PubgClientOptions } from 'pubg-kit'
import { z } from 'zod'
import { DomainError, normalizeMatch } from '../domain/match'
import { ApiError, normalizeUpstreamError } from '../utils/errors'
import { recordUpstreamCall } from '../utils/metrics'
import { ConcurrencyLimiter, SlidingWindowLimiter, withTimeout } from '../utils/limits'

type Platform = 'steam' | 'kakao'
export interface PlayerRecord { accountId: string; displayName: string; matchIds: string[] }

const playersLimit = new SlidingWindowLimiter(10)
const metadataLimit = new ConcurrencyLimiter(3, 20)
const TELEMETRY_MAX_BYTES = 32 * 1024 * 1024
const playerSchema = z.object({
  type: z.literal('player'), id: z.string().min(1),
  attributes: z.object({ name: z.string().min(1) }),
  relationships: z.object({ matches: z.object({ data: z.array(z.object({ type: z.literal('match'), id: z.string().min(1) })) }) }),
})

export function validateTelemetryUrl(value: string): URL {
  let url: URL
  try { url = new URL(value) } catch { throw new ApiError('TELEMETRY_URL_INVALID', 502, '텔레메트리 주소를 확인할 수 없습니다.') }
  if (url.protocol !== 'https:' || url.hostname !== 'telemetry-cdn.pubg.com' || url.username || url.password || (url.port && url.port !== '443') || url.hash) {
    throw new ApiError('TELEMETRY_URL_INVALID', 502, '허용되지 않은 텔레메트리 주소입니다.')
  }
  return url
}

function playerRecord(raw: unknown): PlayerRecord {
  const result = playerSchema.safeParse(raw)
  if (!result.success) throw new ApiError('UPSTREAM_INVALID', 502, '플레이어 응답 형식을 확인할 수 없습니다.')
  return {
    accountId: result.data.id,
    displayName: result.data.attributes.name,
    matchIds: [...new Set(result.data.relationships.matches.data.map(match => match.id))],
  }
}

function isSdkSchemaError(error: unknown): boolean {
  return error instanceof Error && error.name === 'ZodError' && 'issues' in error && Array.isArray(error.issues)
}

function assertPlatform(platform: string): asserts platform is Platform {
  if (platform !== 'steam' && platform !== 'kakao') throw new ApiError('INVALID_PLATFORM', 400, '지원하지 않는 플랫폼입니다.')
}

function safeId(id: string): string {
  if (!/^[a-zA-Z0-9._-]{1,160}$/.test(id)) throw new ApiError('INVALID_ID', 400, '잘못된 식별자입니다.')
  return id
}

export interface PubgAdapterOptions {
  apiKey: string
  requestTimeoutMs?: number
  /** Test seams use the real SDK, replacing only its outbound Axios transport. */
  sdkFactory?: (options: PubgClientOptions) => PubgClient
  fetchImpl?: typeof fetch
  playersLimiter?: SlidingWindowLimiter
  metadataLimiter?: ConcurrencyLimiter
  telemetryMaxBytes?: number
}

/** Only imported by Nitro server code. Clients never receive a key or raw CDN URL. */
export function createPubgAdapter(options: PubgAdapterOptions) {
  const timeout = options.requestTimeoutMs ?? 10_000
  const keyFingerprint = createHash('sha256').update(options.apiKey).digest('hex')
  const limiter = options.playersLimiter ?? playersLimit
  const metadata = options.metadataLimiter ?? metadataLimit
  const fetchTelemetry = options.fetchImpl ?? fetch
  const maxBytes = options.telemetryMaxBytes ?? TELEMETRY_MAX_BYTES

  function client(signal: AbortSignal, resource: 'player' | 'match' = 'match'): PubgClient {
    if (!options.apiKey.trim()) throw new ApiError('SERVER_MISCONFIGURED', 503, '서버의 PUBG API 키가 설정되지 않았습니다.')
    const sdk = (options.sdkFactory ?? (config => new PubgClient(config)))({ apiKey: options.apiKey, rateLimit: false, cache: false, timeout })
    // SDK resource methods do not accept RequestConfig. An isolated instance per
    // operation prevents concurrent requests from overwriting each other's signal.
    const http = sdk.getHttp()
    http.defaults.signal = signal
    http.defaults.maxRedirects = 0
    http.defaults.maxContentLength = 8 * 1024 * 1024
    http.interceptors.request.use(config => { recordUpstreamCall(); return config })
    http.interceptors.response.use(response => response, (error: unknown) => Promise.reject(normalizeUpstreamError(error, signal, resource)))
    return sdk
  }

  async function searchPlayer(platform: Platform, name: string, signal?: AbortSignal): Promise<PlayerRecord> {
    assertPlatform(platform)
    const trimmed = name.trim()
    if (!trimmed || trimmed.length > 32 || (trimmed.includes(',') || Array.from(trimmed).some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127))) throw new ApiError('INVALID_NAME', 400, '닉네임을 1~32자로 입력해 주세요.')
    return withTimeout(async requestSignal => {
      const sdk = client(requestSignal, 'player')
      limiter.consume(keyFingerprint)
      try {
        // SDK interpolates names into the URL without escaping them.
        const players = await sdk.shard(platform).players.getByNames([encodeURIComponent(trimmed)])
        const exact = players.find(player => player.attributes.name === trimmed)
        if (!exact) throw new ApiError('PLAYER_NOT_FOUND', 404, '해당 닉네임의 플레이어를 찾지 못했습니다.')
        return playerRecord(exact)
      } catch (error) { throw normalizeUpstreamError(error, requestSignal) }
    }, timeout, signal)
  }

  async function getPlayer(platform: Platform, id: string, signal?: AbortSignal): Promise<PlayerRecord> {
    assertPlatform(platform)
    safeId(id)
    return withTimeout(async requestSignal => {
      const sdk = client(requestSignal, 'player')
      limiter.consume(keyFingerprint)
      try {
        const player = playerRecord(await sdk.shard(platform).players.getById(id))
        if (player.accountId !== id) throw new ApiError('UPSTREAM_INVALID', 502, '조회한 플레이어 식별자가 일치하지 않습니다.')
        return player
      }
      catch (error) { throw normalizeUpstreamError(error, requestSignal) }
    }, timeout, signal)
  }

  async function getMatch(platform: Platform, id: string, signal?: AbortSignal) {
    assertPlatform(platform)
    safeId(id)
    return metadata.run(() => withTimeout(async requestSignal => {
      const sdk = client(requestSignal)
      let raw: unknown
      try {
        try { raw = await sdk.shard(platform).matches.get(id) }
        catch (error) {
          // Only an SDK schema rejection can use the official-match compatibility
          // path. Transport, auth, 429, cancellation and domain errors never retry.
          if (!isSdkSchemaError(error)) throw error
          const response = await sdk.getHttp().get<unknown>(`/shards/${platform}/matches/${id}`)
          raw = response.data
        }
        const result = normalizeMatch(raw, { source: 'live', platform })
        if (result.match.matchId !== id) throw new ApiError('UPSTREAM_INVALID', 502, '조회한 경기 식별자가 일치하지 않습니다.')
        return result
      } catch (error) {
        if (error instanceof DomainError) throw new ApiError(error.code, error.statusCode, error.message)
        throw normalizeUpstreamError(error, requestSignal)
      }
    }, timeout, signal), signal)
  }

  async function getTelemetry(value: string, signal?: AbortSignal): Promise<unknown> {
    const url = validateTelemetryUrl(value)
    return withTimeout(async requestSignal => {
      let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
      try {
        recordUpstreamCall()
        const response = await fetchTelemetry(url, {
          method: 'GET', signal: requestSignal, redirect: 'error',
          headers: { Accept: 'application/json' },
        })
        // Mocks and custom runtimes might return redirects despite redirect:error.
        if (response.redirected || (response.status >= 300 && response.status < 400)) {
          await response.body?.cancel()
          throw new ApiError('TELEMETRY_REDIRECT', 502, '텔레메트리 리다이렉트를 허용하지 않습니다.')
        }
        if (!response.ok) {
          await response.body?.cancel()
          throw normalizeUpstreamError({ response: { status: response.status, headers: Object.fromEntries(response.headers) } }, requestSignal, 'telemetry')
        }
        if (!response.body) throw new ApiError('TELEMETRY_INVALID', 502, '텔레메트리 본문이 없습니다.')
        reader = response.body.getReader()
        const chunks: Uint8Array[] = []
        let bytes = 0
        while (true) {
          const chunk = await reader.read()
          if (chunk.done) break
          bytes += chunk.value.byteLength
          if (bytes > maxBytes) {
            await reader.cancel()
            throw new ApiError('TELEMETRY_TOO_LARGE', 502, '텔레메트리가 허용 용량을 초과했습니다.')
          }
          chunks.push(chunk.value)
        }
        const body = new Uint8Array(bytes)
        let offset = 0
        for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength }
        try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body)) }
        catch { throw new ApiError('TELEMETRY_INVALID', 502, '텔레메트리 JSON을 읽을 수 없습니다.') }
      } catch (error) {
        if (reader) await reader.cancel().catch(() => undefined)
        throw normalizeUpstreamError(error, requestSignal)
      } finally { reader?.releaseLock() }
    }, timeout, signal)
  }

  return { searchPlayer, getPlayer, getMatch, getTelemetry }
}

export type PubgAdapter = ReturnType<typeof createPubgAdapter>
