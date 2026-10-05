import { afterEach, describe, expect, it, vi } from 'vitest'
import { ConcurrencyLimiter, SlidingWindowLimiter, withTimeout } from '../../server/utils/limits'

function gate() {
  let release = () => {}
  const promise = new Promise<void>((resolve) => {
    release = resolve
  })
  return { promise, release }
}

afterEach(() => vi.useRealTimers())

describe('sliding window', () => {
  it('blocks the 11th request for the same API key and opens at precisely 60 seconds', () => {
    let now = 0
    const limiter = new SlidingWindowLimiter(10, 60_000, () => now)
    for (let index = 0; index < 10; index++) limiter.consume('key-one')
    expect(() => limiter.consume('key-one')).toThrow(
      expect.objectContaining({ status: 429, retryAfterSeconds: 60 }),
    )
    expect(() => limiter.consume('key-two')).not.toThrow()
    now = 59_001
    expect(() => limiter.consume('key-one')).toThrow(
      expect.objectContaining({ retryAfterSeconds: 1 }),
    )
    now = 60_000
    expect(() => limiter.consume('key-one')).not.toThrow()
  })

  it('retains a moving window rather than allowing fixed-window bursts', () => {
    let now = 1_000
    const limiter = new SlidingWindowLimiter(2, 60_000, () => now)
    limiter.consume('key')
    now = 59_000
    limiter.consume('key')
    now = 61_000
    limiter.consume('key')
    expect(() => limiter.consume('key')).toThrow(expect.objectContaining({ retryAfterSeconds: 58 }))
  })
})

describe('bounded concurrency', () => {
  it('allows exactly 3 running and 20 queued, then frees all slots', async () => {
    const limiter = new ConcurrencyLimiter(3, 20)
    const blocked = gate()
    let maxActive = 0
    const runs = Array.from({ length: 23 }, () =>
      limiter.run(async () => {
        maxActive = Math.max(maxActive, limiter.activeCount)
        await blocked.promise
      }),
    )
    expect(limiter.activeCount).toBe(3)
    expect(limiter.queuedCount).toBe(20)
    await expect(limiter.run(async () => {})).rejects.toMatchObject({ status: 429 })
    blocked.release()
    await Promise.all(runs)
    expect(maxActive).toBe(3)
    expect(limiter.activeCount).toBe(0)
    expect(limiter.queuedCount).toBe(0)
  })

  it('removes cancelled queued work and releases slots after failures', async () => {
    const limiter = new ConcurrencyLimiter(1, 1)
    const blocked = gate()
    const first = limiter.run(async () => {
      await blocked.promise
      throw new Error('failure')
    })
    const controller = new AbortController()
    const neverRun = vi.fn(async () => {})
    const queued = limiter.run(neverRun, controller.signal)
    controller.abort()
    await expect(queued).rejects.toMatchObject({ code: 'REQUEST_CANCELLED' })
    expect(limiter.queuedCount).toBe(0)
    blocked.release()
    await expect(first).rejects.toThrow('failure')
    await limiter.run(async () => {})
    expect(neverRun).not.toHaveBeenCalled()
    expect(limiter.activeCount).toBe(0)
  })

  it('aborts the transport on timeout and releases the occupied slot', async () => {
    vi.useFakeTimers()
    const limiter = new ConcurrencyLimiter(1)
    let aborted = false
    const operation = limiter.run(() =>
      withTimeout(
        (signal) =>
          new Promise<void>((_resolve, reject) => {
            signal.addEventListener(
              'abort',
              () => {
                aborted = true
                reject(signal.reason)
              },
              { once: true },
            )
          }),
        10_000,
      ),
    )
    const rejection = expect(operation).rejects.toMatchObject({ code: 'UPSTREAM_TIMEOUT' })
    await vi.advanceTimersByTimeAsync(10_000)
    await rejection
    expect(aborted).toBe(true)
    expect(limiter.activeCount).toBe(0)
  })
})
