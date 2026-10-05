import type { DataSource, Platform } from '../../shared/types'
import type { MatchSnapshot } from '../domain/match'
import { demoPlayer, getDemoMatch, playerMatches, demoTelemetry } from '../fixtures/demo'
import { ApiError } from '../utils/errors'

export interface PlayerRecord {
  accountId: string
  displayName: string
  matchIds: string[]
}
export interface Provider {
  source: DataSource
  searchPlayer(platform: Platform, name: string, signal?: AbortSignal): Promise<PlayerRecord>
  getPlayer(platform: Platform, id: string, signal?: AbortSignal): Promise<PlayerRecord>
  getMatch(
    platform: Platform,
    id: string,
    signal?: AbortSignal,
  ): Promise<{ match: MatchSnapshot; telemetryUrl: string | null }>
  getTelemetry(url: string, signal?: AbortSignal): Promise<unknown>
}

export function createDemoProvider(): Provider {
  const player = {
    accountId: demoPlayer.accountId,
    displayName: demoPlayer.displayName,
    matchIds: playerMatches,
  }
  return {
    source: 'demo',
    async searchPlayer(_platform, name) {
      if (name !== demoPlayer.displayName)
        throw new ApiError('PLAYER_NOT_FOUND', 404, '샘플 닉네임 SquadMate를 입력해 주세요.')
      return player
    },
    async getPlayer(_platform, id) {
      if (id !== demoPlayer.accountId)
        throw new ApiError('PLAYER_NOT_FOUND', 404, '샘플 플레이어를 찾을 수 없어요.')
      return player
    },
    async getMatch(platform, id) {
      const match = getDemoMatch(id, platform)
      if (!match) throw new ApiError('MATCH_UNAVAILABLE', 404, '샘플 경기를 찾을 수 없어요.')
      return { match, telemetryUrl: `demo:${id}` }
    },
    async getTelemetry(url) {
      return demoTelemetry(url.slice('demo:'.length))
    },
  }
}
