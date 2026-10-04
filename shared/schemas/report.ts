import { z } from 'zod'

export const platformSchema = z.enum(['steam', 'kakao'])
export const sourceSchema = z.enum(['demo', 'live'])
export const queueTypeSchema = z.enum(['normal', 'ranked'])
export const teamModeSchema = z.enum(['duo', 'squad'])
export const qualitySchema = z.enum(['ready', 'partial'])
export const eventKindSchema = z.enum(['knock', 'revive', 'kill', 'damage'])
export const isoDateSchema = z.string().datetime({ offset: true })
export const resourceIdSchema = z.string().min(1).max(128).regex(/^[A-Za-z0-9._-]+$/)
export const playerNameSchema = z.string().refine(value => [...value].every(character => character.charCodeAt(0) > 31 && character.charCodeAt(0) !== 127), '제어 문자는 사용할 수 없어요.').trim().min(1).max(32).regex(/^[^\s,]+$/, '정확한 닉네임 하나를 입력해 주세요.')
export const searchInputSchema = z.object({ platform: platformSchema, name: playerNameSchema })
export const createReportInputSchema = z.object({ platform: platformSchema, matchId: resourceIdSchema, playerId: resourceIdSchema }).strict()
export const matchFiltersSchema = z.object({ queueType: z.enum(['all', 'normal', 'ranked']).default('all'), teamMode: z.enum(['all', 'duo', 'squad']).default('all') })
export const reservedDemoIds = ['demo-normal-duo', 'demo-normal-squad', 'demo-ranked-duo', 'demo-ranked-squad'] as const
export const reportIdSchema = z.union([z.string().uuid(), z.enum(reservedDemoIds)])

export const warningSchema = z.object({ code: z.string(), count: z.number().int().positive(), message: z.string() })
const metric = z.number().finite().nonnegative().nullable()
export const reportMemberSchema = z.object({
  participantId: z.string(), accountId: z.string(), name: z.string(), memberNo: z.number().int().min(1).max(4),
  kills: metric, damageDealt: metric, revives: metric, timeSurvived: metric, damageShare: metric,
})
export const eventRoleSchema = z.object({ accountId: z.string().nullable(), name: z.string(), memberNo: z.number().int().min(1).max(4).nullable() })
export const reportEventSchema = z.object({
  id: z.string(), sourceIndex: z.number().int().nonnegative(), occurredAt: isoDateSchema, elapsedMs: z.number().int().nonnegative().nullable(),
  kind: eventKindSchema, actor: eventRoleSchema.nullable(), target: eventRoleSchema.nullable(), knockMaker: eventRoleSchema.nullable(),
  finisher: eventRoleSchema.nullable(), assists: z.array(eventRoleSchema), weaponCode: z.string().nullable(), damage: metric,
  cause: z.enum(['combat', 'friendly_fire', 'self', 'environment', 'unknown']), warnings: z.array(z.string()),
})
export const reportSummarySchema = z.object({
  mapName: z.string(), createdAt: isoDateSchema, queueType: queueTypeSchema, teamMode: teamModeSchema,
  perspective: z.literal('tpp'), classificationVersion: z.string(), rank: metric,
  teamKills: metric, teamDamage: metric, killsComplete: z.boolean(), damageComplete: z.boolean(),
})
export const retrySchema = z.object({ available: z.boolean(), notBefore: isoDateSchema.nullable(), reason: z.string().nullable() })
export const reportSchema = z.object({
  id: z.string(), source: sourceSchema, platform: platformSchema, matchId: z.string(), rosterId: z.string(),
  analysisVersion: z.string(), revision: z.number().int().positive(), quality: qualitySchema,
  summary: reportSummarySchema, members: z.array(reportMemberSchema).min(1).max(4), warnings: z.array(warningSchema),
  generatedAt: isoDateSchema, updatedAt: isoDateSchema, retry: retrySchema,
})
export const playerSchema = z.object({ accountId: z.string(), displayName: z.string(), platform: platformSchema })
export const matchListItemSchema = z.object({
  matchId: z.string(), createdAt: isoDateSchema, mapName: z.string(), queueType: queueTypeSchema, teamMode: teamModeSchema,
  perspective: z.literal('tpp'), classificationVersion: z.string(), rank: metric, kills: metric, damageDealt: metric, memberCount: z.number().int().min(1).max(4),
})
export const matchesDataSchema = z.object({ player: playerSchema, matches: z.array(matchListItemSchema), nextCursor: z.string().nullable() })
export const matchesMetaSchema = z.object({
  source: sourceSchema, fetchedAt: isoDateSchema, checked: z.number(), total: z.number(), matched: z.number(),
  excluded: z.number(), unclassified: z.number(), failed: z.number(), failedMatchIds: z.array(z.string()), complete: z.boolean(), snapshotId: z.string(),
})
export const eventsDataSchema = z.object({ events: z.array(reportEventSchema), total: z.number().int().nonnegative(), nextCursor: z.string().nullable() })
export const createReportDataSchema = z.object({ reportId: z.string(), quality: qualitySchema, reused: z.boolean() })
