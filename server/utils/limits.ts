import { ApiError, abortError } from './errors'

/** Sliding window, keyed by API key or trusted client identifier; never queues. */
export class SlidingWindowLimiter {
  private readonly buckets = new Map<string, number[]>()
  constructor(
    private readonly limit: number,
    private readonly windowMs = 60_000,
    private readonly now = Date.now,
  ) {}

  consume(key: string): void {
    const now = this.now()
    // Expired clients must not accumulate forever in the process.
    for (const [bucketKey, times] of this.buckets) {
      if ((times.at(-1) ?? 0) <= now - this.windowMs) this.buckets.delete(bucketKey)
    }
    const times = (this.buckets.get(key) ?? []).filter((time) => time > now - this.windowMs)
    if (times.length >= this.limit) {
      const retryAfter = Math.max(1, Math.ceil(((times[0] ?? now) + this.windowMs - now) / 1000))
      throw new ApiError(
        'RATE_LIMITED',
        429,
        '요청이 많습니다. 잠시 후 다시 시도해 주세요.',
        true,
        retryAfter,
      )
    }
    times.push(now)
    this.buckets.set(key, times)
  }
}

interface Waiter {
  resolve: (release: () => void) => void
  reject: (error: ApiError) => void
  signal?: AbortSignal
  onAbort: () => void
}

/** A bounded FIFO semaphore. Aborted queued work is removed before it can start. */
export class ConcurrencyLimiter {
  private active = 0
  private readonly queue: Waiter[] = []
  constructor(
    private readonly maxConcurrent: number,
    private readonly maxQueued = 0,
  ) {}
  get activeCount(): number {
    return this.active
  }
  get queuedCount(): number {
    return this.queue.length
  }

  private releaseSlot(): void {
    this.active--
    const next = this.queue.shift()
    if (next) {
      next.signal?.removeEventListener('abort', next.onAbort)
      this.active++
      next.resolve(this.releaseOnce())
    }
  }

  private releaseOnce(): () => void {
    let released = false
    return () => {
      if (released) return
      released = true
      this.releaseSlot()
    }
  }

  private acquire(signal?: AbortSignal): Promise<() => void> {
    if (signal?.aborted) return Promise.reject(abortError(signal))
    if (this.active < this.maxConcurrent) {
      this.active++
      return Promise.resolve(this.releaseOnce())
    }
    if (this.queue.length >= this.maxQueued)
      return Promise.reject(
        new ApiError(
          'SERVER_BUSY',
          429,
          '다른 경기를 처리 중입니다. 잠시 후 다시 시도해 주세요.',
          true,
          10,
        ),
      )
    return new Promise((resolve, reject) => {
      const waiter: Waiter = {
        resolve,
        reject,
        signal,
        onAbort: () => {
          const index = this.queue.indexOf(waiter)
          if (index >= 0) this.queue.splice(index, 1)
          reject(abortError(signal))
        },
      }
      this.queue.push(waiter)
      signal?.addEventListener('abort', waiter.onAbort, { once: true })
    })
  }

  async run<T>(operation: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    const release = await this.acquire(signal)
    try {
      if (signal?.aborted) throw abortError(signal)
      return await operation()
    } finally {
      release()
    }
  }
}

/** Cancels the actual transport. Operations must pass this signal to I/O. */
export async function withTimeout<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  timeoutMs = 10_000,
  parentSignal?: AbortSignal,
): Promise<T> {
  if (parentSignal?.aborted) throw abortError(parentSignal)
  const controller = new AbortController()
  const onParentAbort = () => controller.abort(abortError(parentSignal))
  parentSignal?.addEventListener('abort', onParentAbort, { once: true })
  const timer = setTimeout(
    () =>
      controller.abort(
        new ApiError('UPSTREAM_TIMEOUT', 504, '데이터 응답 시간이 초과되었습니다.', true),
      ),
    timeoutMs,
  )
  timer.unref?.()
  try {
    const result = await operation(controller.signal)
    if (controller.signal.aborted) throw abortError(controller.signal)
    return result
  } catch (error) {
    if (controller.signal.aborted) throw abortError(controller.signal)
    throw error
  } finally {
    clearTimeout(timer)
    parentSignal?.removeEventListener('abort', onParentAbort)
  }
}
