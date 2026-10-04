import { useRuntimeConfig } from '#imports'
import { createPubgAdapter } from '../adapters/pubg'
import { createPostgresRepository } from '../repositories/postgres'
import type { Repository } from '../repositories/repository'
import { ApiError } from '../utils/errors'
import { createDemoProvider } from './provider'
import { createReviewService } from './review'

let storage: ReturnType<typeof createPostgresRepository> | undefined
let service: ReturnType<typeof createReviewService> | undefined

export function runtimeStatus() {
  const config = useRuntimeConfig()
  if (config.dataMode !== 'demo' && config.dataMode !== 'live') throw new ApiError('SERVER_MISCONFIGURED', 503, '데이터 모드 설정을 확인해 주세요.')
  return { mode: config.dataMode, storageConfigured: Boolean(config.databaseUrl), liveConfigured: Boolean(config.pubgApiKey) }
}
function repository(): Repository {
  if (storage) return storage.repository
  const config = useRuntimeConfig()
  if (!config.databaseUrl) throw new ApiError('SERVER_MISCONFIGURED', 503, '리포트 저장을 위한 데이터베이스가 설정되지 않았어요. 예약 샘플은 바로 볼 수 있어요.')
  storage = createPostgresRepository(config.databaseUrl)
  return storage.repository
}
// Resolve the DB only for operations that require persistence. Fixed sample GETs
// continue to work with no key and no DB, including while live mode is configured.
const lazyRepository: Repository = {
  findPlayer: (...args) => repository().findPlayer(...args), getPlayerSnapshot: (...args) => repository().getPlayerSnapshot(...args),
  savePlayer: (...args) => repository().savePlayer(...args), getMatch: (...args) => repository().getMatch(...args),
  getMatches: (...args) => repository().getMatches(...args),
  saveMatch: (...args) => repository().saveMatch(...args), findReport: (...args) => repository().findReport(...args),
  getReport: (...args) => repository().getReport(...args), saveReport: (...args) => repository().saveReport(...args),
  claimRetry: (...args) => repository().claimRetry(...args), improveReport: (...args) => repository().improveReport(...args),
}
export function reviewService() {
  if (!service) {
    const status = runtimeStatus()
    const config = useRuntimeConfig()
    const provider = status.mode === 'demo' ? createDemoProvider() : { source: 'live' as const, ...createPubgAdapter({ apiKey: config.pubgApiKey }) }
    service = createReviewService(lazyRepository, provider)
  }
  return service
}
