import { useRuntimeConfig } from '#imports'
import { createPubgAdapter } from '../adapters/pubg'
import { createRepository, getStorageMode } from '../repositories/storage'
import type { Repository } from '../repositories/repository'
import { ApiError } from '../utils/errors'
import { createDemoProvider } from './provider'
import { createReviewService } from './review'

let storage: Repository | undefined
let service: ReturnType<typeof createReviewService> | undefined

export function runtimeStatus() {
  const config = useRuntimeConfig()
  if (config.dataMode !== 'demo' && config.dataMode !== 'live')
    throw new ApiError('SERVER_MISCONFIGURED', 503, '데이터 모드 설정을 확인해 주세요.')
  const storageMode = getStorageMode(config.dbEnabled)
  return {
    mode: config.dataMode,
    storageMode,
    storageConfigured: storageMode === 'memory' || Boolean(config.databaseUrl),
    liveConfigured: Boolean(config.pubgApiKey),
  }
}
function repository(): Repository {
  if (storage) return storage
  const config = useRuntimeConfig()
  storage = createRepository(config)
  return storage
}
// One repository per process shares cached results across requests. Fixed sample
// GETs do not initialize storage, including when PostgreSQL is enabled without a URL.
const lazyRepository: Repository = {
  findPlayer: (...args) => repository().findPlayer(...args),
  getPlayerSnapshot: (...args) => repository().getPlayerSnapshot(...args),
  savePlayer: (...args) => repository().savePlayer(...args),
  getMatch: (...args) => repository().getMatch(...args),
  getMatches: (...args) => repository().getMatches(...args),
  saveMatch: (...args) => repository().saveMatch(...args),
  findReport: (...args) => repository().findReport(...args),
  getReport: (...args) => repository().getReport(...args),
  saveReport: (...args) => repository().saveReport(...args),
  claimRetry: (...args) => repository().claimRetry(...args),
  improveReport: (...args) => repository().improveReport(...args),
}
export function reviewService() {
  if (!service) {
    const status = runtimeStatus()
    const config = useRuntimeConfig()
    const provider =
      status.mode === 'demo'
        ? createDemoProvider()
        : { source: 'live' as const, ...createPubgAdapter({ apiKey: config.pubgApiKey }) }
    service = createReviewService(lazyRepository, provider)
  }
  return service
}
