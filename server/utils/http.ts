import { randomUUID } from 'node:crypto'
import {
  defineEventHandler,
  getHeader,
  getRequestIP,
  setHeader,
  setResponseStatus,
  type H3Event,
} from 'h3'
import { z } from 'zod'
import { DomainError } from '../domain/match'
import { ApiError } from './errors'
import { readMetrics, recordReason, runWithMetrics } from './metrics'

export function apiHandler<T>(handler: (event: H3Event) => T | Promise<T>) {
  return defineEventHandler((event) =>
    runWithMetrics(async () => {
      const requestId = randomUUID()
      const started = performance.now()
      setHeader(event, 'X-Request-ID', requestId)
      let status = 200
      let code: string | undefined
      try {
        return await handler(event)
      } catch (error) {
        const failure =
          error instanceof ApiError
            ? error
            : error instanceof DomainError
              ? new ApiError(error.code, error.statusCode, error.message)
              : error instanceof z.ZodError
                ? new ApiError('INVALID_INPUT', 400, '입력 형식이 올바르지 않아요.')
                : new ApiError(
                    'INTERNAL_ERROR',
                    500,
                    '요청을 처리하지 못했어요. 요청 ID와 함께 다시 시도해 주세요.',
                    true,
                  )
        status = failure.status
        code = failure.code
        recordReason(code)
        setResponseStatus(event, status)
        if (failure.retryAfterSeconds) setHeader(event, 'Retry-After', failure.retryAfterSeconds)
        return {
          error: {
            code,
            message: failure.message,
            retryable: failure.retryable,
            ...(failure.retryAfterSeconds ? { retryAfterSeconds: failure.retryAfterSeconds } : {}),
          },
          requestId,
        }
      } finally {
        // No request bodies, URLs, auth headers, raw telemetry, connection strings or error objects.
        console.info(
          JSON.stringify({
            requestId,
            durationMs: Math.round(performance.now() - started),
            status: event.node.res.statusCode || status,
            ...readMetrics(),
            ...(code ? { code } : {}),
          }),
        )
      }
    }),
  )
}

export function clientIdentity(event: H3Event): string {
  // Ignore spoofable forwarding headers. A deployed proxy needs a reviewed trust policy.
  return getRequestIP(event, { xForwardedFor: false }) ?? 'unknown-client'
}

export async function smallJsonBody(event: H3Event): Promise<unknown> {
  const limit = 2048
  if (getHeader(event, 'content-type')?.split(';')[0]?.trim() !== 'application/json')
    throw new ApiError('INVALID_INPUT', 400, 'JSON 요청을 보내 주세요.')
  if (Number(getHeader(event, 'content-length') ?? 0) > limit)
    throw new ApiError('INVALID_INPUT', 413, '요청 본문이 너무 커요.')
  const request = event.node.req
  const body = await new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    const timer = setTimeout(
      () => fail(new ApiError('INVALID_INPUT', 408, '요청 본문을 읽는 시간이 초과됐어요.')),
      5000,
    )
    const clean = () => {
      clearTimeout(timer)
      request.off('data', data)
      request.off('end', end)
      request.off('error', fail)
    }
    const fail = (error: unknown) => {
      clean()
      request.resume()
      reject(
        error instanceof ApiError
          ? error
          : new ApiError('INVALID_INPUT', 400, '요청 본문을 읽을 수 없어요.'),
      )
    }
    const data = (chunk: unknown) => {
      if (!Buffer.isBuffer(chunk))
        return fail(new ApiError('INVALID_INPUT', 400, '요청 본문이 올바르지 않아요.'))
      size += chunk.length
      if (size > limit) return fail(new ApiError('INVALID_INPUT', 413, '요청 본문이 너무 커요.'))
      chunks.push(chunk)
    }
    const end = () => {
      clean()
      resolve(Buffer.concat(chunks).toString('utf8'))
    }
    request.on('data', data).once('end', end).once('error', fail)
  })
  try {
    return JSON.parse(body)
  } catch {
    throw new ApiError('INVALID_INPUT', 400, 'JSON 요청 본문이 올바르지 않아요.')
  }
}
