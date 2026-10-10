import { ApiError } from '../utils/errors'
import { createMemoryRepository } from './memory'
import { createPostgresRepository } from './postgres'
import type { Repository } from './repository'

export function getStorageMode(dbEnabled: unknown): 'memory' | 'postgres' {
  if (dbEnabled === true || dbEnabled === 'true') return 'postgres'
  if (dbEnabled === false || dbEnabled === 'false' || dbEnabled === undefined) return 'memory'
  throw new ApiError(
    'SERVER_MISCONFIGURED',
    503,
    'NUXT_DB_ENABLED는 true 또는 false로 설정해 주세요.',
  )
}

export function createRepository(config: { dbEnabled: unknown; databaseUrl: string }): Repository {
  if (getStorageMode(config.dbEnabled) === 'memory') return createMemoryRepository()
  if (!config.databaseUrl)
    throw new ApiError(
      'SERVER_MISCONFIGURED',
      503,
      'DB 저장이 활성화되어 있지만 데이터베이스 연결이 설정되지 않았어요.',
    )
  return createPostgresRepository(config.databaseUrl).repository
}
