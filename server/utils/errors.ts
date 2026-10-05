/** Public, deliberately sanitized failures. Never serialize upstream errors/config. */
export class ApiError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    message: string,
    public readonly retryable = false,
    public readonly retryAfterSeconds?: number,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export function abortError(signal?: AbortSignal): ApiError {
  if (signal?.reason instanceof ApiError) return signal.reason
  return new ApiError('REQUEST_CANCELLED', 499, '요청이 취소되었습니다.', true)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function record(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined
}

export function retryAfterSeconds(headers: unknown, now = Date.now()): number | undefined {
  const values = record(headers)
  const retryAfter = values?.['retry-after']
  if (typeof retryAfter === 'string' || typeof retryAfter === 'number') {
    const numeric = Number(retryAfter)
    if (Number.isFinite(numeric) && numeric >= 0) return Math.max(1, Math.ceil(numeric))
    const date = Date.parse(String(retryAfter))
    if (Number.isFinite(date)) return Math.max(1, Math.ceil((date - now) / 1000))
  }
  const reset = Number(values?.['x-ratelimit-reset'])
  return Number.isFinite(reset) && reset * 1000 > now
    ? Math.ceil((reset * 1000 - now) / 1000)
    : undefined
}

export function normalizeUpstreamError(
  error: unknown,
  signal?: AbortSignal,
  resource: 'player' | 'match' | 'telemetry' = 'match',
): ApiError {
  if (signal?.aborted) return abortError(signal)
  if (error instanceof ApiError) return error
  const value = record(error)
  const response = record(value?.response)
  const status = typeof response?.status === 'number' ? response.status : value?.status
  if (status === 404)
    return new ApiError(
      resource === 'player'
        ? 'PLAYER_NOT_FOUND'
        : resource === 'match'
          ? 'MATCH_UNAVAILABLE'
          : 'UPSTREAM_ERROR',
      resource === 'telemetry' ? 502 : 404,
      'PUBG에서 해당 기록을 찾지 못했습니다.',
    )
  if (status === 401 || status === 403)
    return new ApiError('UPSTREAM_ERROR', 502, 'PUBG 인증 설정을 확인해야 합니다.')
  if (status === 429)
    return new ApiError(
      'RATE_LIMITED',
      429,
      'PUBG 호출 한도에 도달했습니다. 잠시 후 다시 시도해 주세요.',
      true,
      retryAfterSeconds(response?.headers) ?? 60,
    )
  if (value?.code === 'ECONNABORTED' || value?.code === 'ETIMEDOUT')
    return new ApiError('UPSTREAM_TIMEOUT', 504, 'PUBG 응답 시간이 초과되었습니다.', true)
  if (value?.name === 'ZodError')
    return new ApiError('UPSTREAM_INVALID', 502, 'PUBG 응답 형식을 확인할 수 없습니다.')
  return new ApiError(
    'UPSTREAM_ERROR',
    502,
    'PUBG 데이터를 가져오지 못했습니다. 잠시 후 다시 시도해 주세요.',
    true,
  )
}
