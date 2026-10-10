import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryRepository } from '../../server/repositories/memory'
import { createPostgresRepository } from '../../server/repositories/postgres'
import { createRepository, getStorageMode } from '../../server/repositories/storage'

vi.mock('../../server/repositories/memory', () => ({
  createMemoryRepository: vi.fn(() => ({ kind: 'memory' })),
}))
vi.mock('../../server/repositories/postgres', () => ({
  createPostgresRepository: vi.fn(() => ({ repository: { kind: 'postgres' } })),
}))

beforeEach(() => vi.clearAllMocks())

describe('storage selection', () => {
  it.each([undefined, false, 'false'])(
    'uses memory for %s even with a DB URL present',
    (dbEnabled) => {
      expect(createRepository({ dbEnabled, databaseUrl: 'unused-invalid-url' })).toEqual({
        kind: 'memory',
      })
      expect(createMemoryRepository).toHaveBeenCalledOnce()
      expect(createPostgresRepository).not.toHaveBeenCalled()
      expect(getStorageMode(dbEnabled)).toBe('memory')
    },
  )

  it.each([true, 'true'])('uses PostgreSQL only when explicitly enabled with %s', (dbEnabled) => {
    const databaseUrl = 'postgres://example.invalid/test'
    expect(createRepository({ dbEnabled, databaseUrl })).toEqual({ kind: 'postgres' })
    expect(createPostgresRepository).toHaveBeenCalledExactlyOnceWith(databaseUrl)
    expect(createMemoryRepository).not.toHaveBeenCalled()
    expect(getStorageMode(dbEnabled)).toBe('postgres')
  })

  it('requires a DB URL when enabled and does not silently fall back to memory', () => {
    expect(() => createRepository({ dbEnabled: true, databaseUrl: '' })).toThrow(
      'DB 저장이 활성화되어 있지만 데이터베이스 연결이 설정되지 않았어요.',
    )
    expect(createMemoryRepository).not.toHaveBeenCalled()
    expect(createPostgresRepository).not.toHaveBeenCalled()
  })

  it.each(['yes', '0', 'FALSE', 1, null])('rejects an ambiguous enabled value: %s', (dbEnabled) => {
    expect(() => createRepository({ dbEnabled, databaseUrl: '' })).toThrow(
      'NUXT_DB_ENABLED는 true 또는 false로 설정해 주세요.',
    )
    expect(createMemoryRepository).not.toHaveBeenCalled()
    expect(createPostgresRepository).not.toHaveBeenCalled()
  })
})
