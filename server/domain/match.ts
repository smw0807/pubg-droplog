import { z } from 'zod'
import type { DataSource, MatchListItem, Platform, QueueType, TeamMode } from '../../shared/types'
import { isoDateSchema, platformSchema, sourceSchema } from '../../shared/schemas/report'

export const CLASSIFICATION_VERSION = '1'

export class DomainError extends Error {
  constructor(public readonly code: string, message: string, public readonly statusCode = 422) {
    super(message)
    this.name = 'DomainError'
  }
}

const stat = z.number().finite().nonnegative().nullable()
export const participantSchema = z.object({
  participantId: z.string().min(1), accountId: z.string().min(1), name: z.string(),
  kills: stat, damageDealt: stat, revives: stat, timeSurvived: stat,
})
export const rosterSchema = z.object({ rosterId: z.string().min(1), participantIds: z.array(z.string().min(1)).min(1), rank: stat })
export const matchSnapshotSchema = z.object({
  source: sourceSchema, platform: platformSchema, matchId: z.string().min(1), createdAt: isoDateSchema,
  mapName: z.string(), rawGameMode: z.string().nullable(), rawMatchType: z.string().nullable(), isCustom: z.boolean().nullable(),
  queueType: z.enum(['normal', 'ranked', 'unknown']), teamMode: z.enum(['duo', 'squad', 'unknown']),
  perspective: z.enum(['tpp', 'fpp', 'unknown']), classificationVersion: z.string(),
  classification: z.enum(['supported', 'unsupported', 'unknown']), participants: z.array(participantSchema), rosters: z.array(rosterSchema), fetchedAt: isoDateSchema,
})
export type Participant = z.infer<typeof participantSchema>
export type Roster = z.infer<typeof rosterSchema>
export type MatchSnapshot = z.infer<typeof matchSnapshotSchema>
export type NormalizedMatch = MatchSnapshot
export interface Team { roster: Roster; members: Participant[] }

const referenceSchema = z.object({ id: z.string().min(1), type: z.string() })
const rawParticipantSchema = z.object({
  type: z.literal('participant'), id: z.string().min(1),
  attributes: z.object({ stats: z.object({ playerId: z.string().min(1), name: z.string(), kills: z.unknown().optional(), damageDealt: z.unknown().optional(), revives: z.unknown().optional(), timeSurvived: z.unknown().optional() }) }),
})
const rawRosterSchema = z.object({
  type: z.literal('roster'), id: z.string().min(1), attributes: z.object({ stats: z.object({ rank: z.unknown().optional() }) }),
  relationships: z.object({ participants: z.object({ data: z.array(referenceSchema).min(1) }) }),
})
const rawAssetSchema = z.object({ type: z.literal('asset'), id: z.string(), attributes: z.object({ URL: z.string() }) })
const rawMatchSchema = z.object({
  data: z.object({ type: z.literal('match'), id: z.string().min(1), attributes: z.object({
    createdAt: isoDateSchema, mapName: z.string(), gameMode: z.string().nullish(), matchType: z.string().nullish(), isCustomMatch: z.boolean().nullish(),
  }), relationships: z.object({
    rosters: z.object({ data: z.array(referenceSchema) }), assets: z.object({ data: z.array(referenceSchema) }).optional(),
  }) }), included: z.array(z.unknown()),
})
const resourceTypeSchema = z.object({ type: z.string() })

function numberOrNull(value: unknown): number | null {
  const parsed = z.number().finite().nonnegative().safeParse(value)
  return parsed.success ? parsed.data : null
}

export function classifyMatch(gameMode: string | null, matchType: string | null, isCustom: boolean | null) {
  const queueType: QueueType | 'unknown' = matchType === 'official' ? 'normal' : matchType === 'competitive' ? 'ranked' : 'unknown'
  const teamMode: TeamMode | 'unknown' = gameMode === 'duo' || gameMode === 'duo-fpp' ? 'duo' : gameMode === 'squad' || gameMode === 'squad-fpp' ? 'squad' : 'unknown'
  const perspective = gameMode?.endsWith('-fpp') ? 'fpp' : ['duo', 'squad', 'solo'].includes(gameMode ?? '') ? 'tpp' : 'unknown'
  const explicitlyUnsupported = isCustom === true || perspective === 'fpp' || gameMode === 'solo'
    || ['custom', 'arcade', 'training', 'event', 'eventMode'].includes(matchType ?? '')
    || ['conquest', 'esports', 'war', 'normal-solo', 'tdm', 'training'].includes(gameMode ?? '')
  const classification = explicitlyUnsupported ? 'unsupported' : (gameMode === 'duo' || gameMode === 'squad') && queueType !== 'unknown' && isCustom === false ? 'supported' : 'unknown'
  return { queueType, teamMode, perspective, classification, classificationVersion: CLASSIFICATION_VERSION } as const
}

/** Accept only validated JSON:API relationships; asset URLs never enter persisted match snapshots. */
export function normalizeMatch(raw: unknown, context: { source: DataSource; platform: Platform; fetchedAt?: string }): { match: MatchSnapshot; telemetryUrl: string | null } {
  const parsed = rawMatchSchema.safeParse(raw)
  if (!parsed.success) throw new DomainError('MATCH_UNAVAILABLE', '경기 응답의 필수 필드를 확인할 수 없어요.', 502)
  const input = parsed.data
  const participants: Participant[] = []
  const rosters: Roster[] = []
  const assets: { id: string; url: string }[] = []
  for (const resource of input.included) {
    const type = resourceTypeSchema.safeParse(resource)
    if (!type.success) continue
    if (type.data.type === 'participant') {
      const result = rawParticipantSchema.safeParse(resource)
      if (!result.success) throw new DomainError('MATCH_UNAVAILABLE', '참가자의 식별 정보를 확인할 수 없어요.', 502)
      const { stats } = result.data.attributes
      participants.push({ participantId: result.data.id, accountId: stats.playerId, name: stats.name,
        kills: numberOrNull(stats.kills), damageDealt: numberOrNull(stats.damageDealt), revives: numberOrNull(stats.revives), timeSurvived: numberOrNull(stats.timeSurvived) })
    } else if (type.data.type === 'roster') {
      const result = rawRosterSchema.safeParse(resource)
      if (!result.success) throw new DomainError('MATCH_UNAVAILABLE', '팀의 식별 정보를 확인할 수 없어요.', 502)
      if (input.data.relationships.rosters.data.some(ref => ref.type === 'roster' && ref.id === result.data.id)) {
        if (result.data.relationships.participants.data.some(ref => ref.type !== 'participant')) throw new DomainError('MATCH_UNAVAILABLE', '팀원 관계가 올바르지 않아요.', 502)
        rosters.push({ rosterId: result.data.id, participantIds: result.data.relationships.participants.data.map(ref => ref.id), rank: numberOrNull(result.data.attributes.stats.rank) })
      }
    } else if (type.data.type === 'asset') {
      const result = rawAssetSchema.safeParse(resource)
      if (result.success) assets.push({ id: result.data.id, url: result.data.attributes.URL })
    }
  }
  if (new Set(participants.map(p => p.participantId)).size !== participants.length || new Set(rosters.map(r => r.rosterId)).size !== rosters.length) {
    throw new DomainError('MATCH_UNAVAILABLE', '경기 식별자가 중복되어 있어요.', 502)
  }
  const attrs = input.data.attributes
  const rawGameMode = attrs.gameMode ?? null
  const rawMatchType = attrs.matchType ?? null
  const isCustom = attrs.isCustomMatch ?? null
  const match = matchSnapshotSchema.parse({
    source: context.source, platform: context.platform, matchId: input.data.id, createdAt: attrs.createdAt, mapName: attrs.mapName,
    rawGameMode, rawMatchType, isCustom, ...classifyMatch(rawGameMode, rawMatchType, isCustom), participants, rosters,
    fetchedAt: context.fetchedAt ?? new Date().toISOString(),
  })
  const assetIds = new Set((input.data.relationships.assets?.data ?? []).filter(ref => ref.type === 'asset').map(ref => ref.id))
  return { match, telemetryUrl: assets.find(asset => assetIds.has(asset.id))?.url ?? null }
}

export function assertSupportedMatch(match: MatchSnapshot): asserts match is MatchSnapshot & { queueType: QueueType; teamMode: TeamMode; perspective: 'tpp' } {
  if (match.classification === 'unsupported') throw new DomainError('UNSUPPORTED_MATCH', '3인칭 일반·랭크 듀오와 스쿼드만 지원해요.')
  if (match.classification !== 'supported' || match.queueType === 'unknown' || match.teamMode === 'unknown' || match.perspective !== 'tpp' || match.isCustom !== false) {
    throw new DomainError('MATCH_CLASSIFICATION_UNKNOWN', '경기 종류를 확인할 수 없어 리포트를 만들 수 없어요.')
  }
}

export function identifyTeam(match: MatchSnapshot, accountId: string): Team {
  assertSupportedMatch(match)
  const selected = match.participants.filter(p => p.accountId === accountId)
  if (selected.length !== 1) throw new DomainError('PLAYER_NOT_IN_MATCH', '경기에서 플레이어를 유일하게 찾을 수 없어요.')
  const player = selected[0]!
  const rosters = match.rosters.filter(r => r.participantIds.includes(player.participantId))
  if (rosters.length !== 1) throw new DomainError('PLAYER_NOT_IN_MATCH', '플레이어의 팀을 유일하게 확인할 수 없어요.')
  const roster = rosters[0]!
  const members = roster.participantIds.map(id => match.participants.find(p => p.participantId === id))
  const resolved = members.filter((member): member is Participant => member !== undefined)
  const limit = match.teamMode === 'duo' ? 2 : 4
  if (resolved.length !== members.length || resolved.length < 1 || resolved.length > limit || new Set(resolved.map(p => p.accountId)).size !== resolved.length) {
    throw new DomainError('PLAYER_NOT_IN_MATCH', '팀원 관계나 실제 참가 인원을 확인할 수 없어요.')
  }
  return { roster, members: resolved.sort((a, b) => a.accountId.localeCompare(b.accountId, 'en')) }
}

export function toMatchListItem(match: MatchSnapshot, accountId: string): MatchListItem {
  assertSupportedMatch(match)
  const team = identifyTeam(match, accountId)
  const player = team.members.find(member => member.accountId === accountId)!
  return { matchId: match.matchId, createdAt: match.createdAt, mapName: match.mapName, queueType: match.queueType,
    teamMode: match.teamMode, perspective: 'tpp', classificationVersion: match.classificationVersion, rank: team.roster.rank,
    kills: player.kills, damageDealt: player.damageDealt, memberCount: team.members.length }
}
