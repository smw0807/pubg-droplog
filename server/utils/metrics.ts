import { AsyncLocalStorage } from 'node:async_hooks'
import type { DataSource } from '../../shared/types'

export interface RequestMetrics {
  upstreamCalls: number
  cacheHits: number
  source: DataSource | null
  analysisVersion: string | null
  reasons: string[]
}
const context = new AsyncLocalStorage<RequestMetrics>()
const emptyMetrics = (): RequestMetrics => ({ upstreamCalls: 0, cacheHits: 0, source: null, analysisVersion: null, reasons: [] })

export function runWithMetrics<T>(operation: () => T): T {
  return context.run(emptyMetrics(), operation)
}
export function readMetrics(): RequestMetrics {
  const metrics = context.getStore() ?? emptyMetrics()
  return { ...metrics, reasons: [...metrics.reasons] }
}
export function recordUpstreamCall(): void {
  const metrics = context.getStore()
  if (metrics) metrics.upstreamCalls++
}
export function recordCacheHit(): void {
  const metrics = context.getStore()
  if (metrics) metrics.cacheHits++
}
export function recordSource(source: DataSource): void {
  const metrics = context.getStore()
  if (metrics) metrics.source = source
}
export function recordAnalysisVersion(version: string): void {
  const metrics = context.getStore()
  if (metrics && /^[0-9.]{1,32}$/.test(version)) metrics.analysisVersion = version
}
/** Accept service-owned codes only; never put messages, URLs or payloads in logs. */
export function recordReason(code: string): void {
  const metrics = context.getStore()
  if (metrics && /^[A-Z][A-Z0-9_]{0,63}$/.test(code) && !metrics.reasons.includes(code)) metrics.reasons.push(code)
}
