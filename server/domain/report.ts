import { z } from 'zod'
import type {
  EventKind,
  EventRole,
  MapLocation,
  Report,
  ReportEvent,
  ReportMember,
  ReportWarning,
} from '../../shared/types'
import { getMapExtent } from '../../shared/utils/map-coordinates'
import {
  isoDateSchema,
  mapLocationSchema,
  reportEventSchema,
  reportSchema,
} from '../../shared/schemas/report'
import { assertSupportedMatch, identifyTeam, type MatchSnapshot } from './match'

export const ANALYSIS_VERSION = '2'
export const MAX_REPORT_EVENTS = 20_000
export const storedReportSchema = reportSchema
  .omit({ retry: true })
  .extend({ events: z.array(reportEventSchema), lastRetryAt: isoDateSchema.nullable() })
export type StoredReport = z.infer<typeof storedReportSchema>

const charSchema = z.object({
  accountId: z.string(),
  name: z.string().optional(),
  teamId: z.number().int().optional(),
  location: z.unknown().optional(),
})
type Character = z.infer<typeof charSchema>
const requiredCharSchema = charSchema.refine(
  (character) => Boolean(character.accountId.trim() || character.name?.trim()),
  'The required event character is missing.',
)
const optionalChar = charSchema.nullish()
const damageInfo = z
  .object({
    damageCauserName: z.string().optional(),
    damageTypeCategory: z.string().optional(),
    damageReason: z.string().optional(),
  })
  .nullish()
const baseEvent = z.object({ _T: z.string(), _D: isoDateSchema })
const knockSchema = baseEvent.extend({
  attacker: optionalChar,
  victim: requiredCharSchema,
  damageCauserName: z.string().optional(),
  damageTypeCategory: z.string().optional(),
})
const reviveSchema = baseEvent.extend({ reviver: requiredCharSchema, victim: requiredCharSchema })
const damageSchema = knockSchema.extend({ damage: z.number().finite().nonnegative() })
const killSchema = baseEvent.extend({
  killer: optionalChar,
  victim: requiredCharSchema,
  dBNOMaker: optionalChar,
  finisher: optionalChar,
  killerDamageInfo: damageInfo,
  finishDamageInfo: damageInfo,
  dBNODamageInfo: damageInfo,
  assists_AccountId: z.array(z.string()).optional(),
  isSuicide: z.boolean().optional(),
})
const typeOnly = z.object({ _T: z.string() })
const environmentCauses = new Set([
  'Damage_BlueZone',
  'Damage_RedZone',
  'Damage_Explosion_RedZone',
  'Damage_Fall',
  'Damage_Drown',
  'Damage_BlackZone',
  'Damage_Lava',
  'Damage_Train',
])

function addWarning(
  warnings: Map<string, ReportWarning>,
  code: string,
  message: string,
  count = 1,
) {
  const warning = warnings.get(code)
  if (warning) warning.count += count
  else warnings.set(code, { code, message, count })
}

function normalizeLocation(raw: unknown, mapName: string): MapLocation | null {
  const parsed = mapLocationSchema.safeParse(raw)
  if (!parsed.success) return null
  const extent = getMapExtent(mapName)
  if (extent !== null && (parsed.data.x > extent || parsed.data.y > extent)) return null
  return parsed.data
}

function role(
  character: Character | null | undefined,
  names: Map<string, string>,
  numbers: Map<string, number>,
  mapName: string,
): EventRole | null {
  if (!character || (!character.accountId && !character.name)) return null
  return {
    accountId: character.accountId || null,
    name: names.get(character.accountId) ?? character.name ?? '확인 불가',
    memberNo: numbers.get(character.accountId) ?? null,
    location: normalizeLocation(character.location, mapName),
  }
}

function causeFor(
  actor: EventRole | null,
  target: EventRole | null,
  damageType: string | undefined,
): ReportEvent['cause'] {
  if (actor?.accountId && actor.accountId === target?.accountId) return 'self'
  if (actor?.memberNo && target?.memberNo) return 'friendly_fire'
  if (damageType && environmentCauses.has(damageType)) return 'environment'
  if (actor?.accountId) return 'combat'
  return 'unknown'
}

export function eventIncludesMember(event: ReportEvent, memberNo?: number): boolean {
  const roles = [event.actor, event.target, event.knockMaker, event.finisher, ...event.assists]
  return roles.some(
    (value) => value?.memberNo != null && (memberNo === undefined || value.memberNo === memberNo),
  )
}

export function filterEvents(
  events: ReportEvent[],
  kinds: readonly EventKind[] = ['knock', 'revive', 'kill'],
  memberNo?: number,
): ReportEvent[] {
  return events.filter(
    (event) =>
      kinds.includes(event.kind) &&
      (memberNo === undefined || eventIncludesMember(event, memberNo)),
  )
}

export function normalizeTelemetry(
  telemetry: unknown,
  match: MatchSnapshot,
  members: ReportMember[],
  maxEvents = MAX_REPORT_EVENTS,
): { events: ReportEvent[]; warnings: ReportWarning[] } {
  const warnings = new Map<string, ReportWarning>()
  const array = z.array(z.unknown()).safeParse(telemetry)
  if (!array.success)
    return {
      events: [],
      warnings: [
        {
          code: 'TELEMETRY_UNAVAILABLE',
          count: 1,
          message: '상세 이벤트를 가져오지 못했어요. 공식 경기 성적은 확인할 수 있어요.',
        },
      ],
    }
  const names = new Map(
    match.participants.map((participant) => [participant.accountId, participant.name]),
  )
  const numbers = new Map(members.map((member) => [member.accountId, member.memberNo]))
  let origin: number | null = null
  for (const value of array.data) {
    const type = typeOnly.safeParse(value)
    if (type.success && type.data._T === 'LogMatchStart') {
      const event = baseEvent.safeParse(value)
      if (event.success) {
        const candidate = Date.parse(event.data._D)
        if (origin === null || candidate < origin) origin = candidate
      } else
        addWarning(
          warnings,
          'KNOWN_EVENT_INVALID',
          '일부 지원 이벤트의 필드가 올바르지 않아 해석하지 못했어요.',
        )
    }
  }
  if (origin === null)
    addWarning(warnings, 'MISSING_TIME_ORIGIN', '경기 시작 시각이 없어 실제 발생 시각만 표시해요.')
  const events: ReportEvent[] = []
  let limited = 0
  for (const [sourceIndex, raw] of array.data.entries()) {
    const type = typeOnly.safeParse(raw)
    if (!type.success) {
      addWarning(warnings, 'KNOWN_EVENT_INVALID', '유형을 확인할 수 없는 이벤트가 있어요.')
      continue
    }
    const rawType = type.data._T
    if (
      ![
        'LogPlayerMakeGroggy',
        'LogPlayerRevive',
        'LogPlayerKillV2',
        'LogPlayerTakeDamage',
      ].includes(rawType)
    )
      continue
    let kind: EventKind
    let occurredAt: string
    let actor: EventRole | null
    let target: EventRole | null
    let knockMaker: EventRole | null = null
    let finisher: EventRole | null = null
    let assists: EventRole[] = []
    let weaponCode: string | null = null
    let damage: number | null = null
    let damageType: string | undefined
    const eventWarnings: string[] = []
    const invalid = () =>
      addWarning(
        warnings,
        'KNOWN_EVENT_INVALID',
        '일부 지원 이벤트의 필드가 올바르지 않아 해석하지 못했어요.',
      )
    if (rawType === 'LogPlayerKillV2') {
      const parsed = killSchema.safeParse(raw)
      if (!parsed.success) {
        invalid()
        continue
      }
      const value = parsed.data
      kind = 'kill'
      occurredAt = value._D
      actor = role(value.killer, names, numbers, match.mapName)
      target = role(value.victim, names, numbers, match.mapName)
      knockMaker = role(value.dBNOMaker, names, numbers, match.mapName)
      finisher = role(value.finisher, names, numbers, match.mapName)
      assists = (value.assists_AccountId ?? []).filter(Boolean).map((accountId) => ({
        accountId,
        name: names.get(accountId) ?? '확인 불가',
        memberNo: numbers.get(accountId) ?? null,
        location: null,
      }))
      // DamageInfo belongs to its role. An absent killer can have an empty
      // killerDamageInfo object while the finishing cause is environmental.
      // A known killer must never inherit the finisher's weapon or kill credit.
      const info = actor
        ? value.killerDamageInfo
        : (value.finishDamageInfo ?? value.killerDamageInfo)
      weaponCode = info?.damageCauserName || null
      damageType = info?.damageTypeCategory
    } else if (rawType === 'LogPlayerRevive') {
      const parsed = reviveSchema.safeParse(raw)
      if (!parsed.success) {
        invalid()
        continue
      }
      kind = 'revive'
      occurredAt = parsed.data._D
      actor = role(parsed.data.reviver, names, numbers, match.mapName)
      target = role(parsed.data.victim, names, numbers, match.mapName)
    } else if (rawType === 'LogPlayerTakeDamage') {
      const parsed = damageSchema.safeParse(raw)
      if (!parsed.success) {
        invalid()
        continue
      }
      if (parsed.data.damage === 0) continue
      kind = 'damage'
      occurredAt = parsed.data._D
      actor = role(parsed.data.attacker, names, numbers, match.mapName)
      target = role(parsed.data.victim, names, numbers, match.mapName)
      weaponCode = parsed.data.damageCauserName || null
      damageType = parsed.data.damageTypeCategory
      damage = parsed.data.damage
    } else {
      const parsed = knockSchema.safeParse(raw)
      if (!parsed.success) {
        invalid()
        continue
      }
      kind = 'knock'
      occurredAt = parsed.data._D
      actor = role(parsed.data.attacker, names, numbers, match.mapName)
      target = role(parsed.data.victim, names, numbers, match.mapName)
      weaponCode = parsed.data.damageCauserName || null
      damageType = parsed.data.damageTypeCategory
    }
    const elapsed = origin === null ? null : Date.parse(occurredAt) - origin
    if (elapsed !== null && elapsed < 0) eventWarnings.push('EVENT_BEFORE_TIME_ORIGIN')
    const cause = kind === 'revive' ? 'combat' : causeFor(actor, target, damageType)
    if (!actor && cause === 'unknown') eventWarnings.push('ACTOR_UNKNOWN')
    const event: ReportEvent = {
      id: `${ANALYSIS_VERSION}:${match.matchId}:${sourceIndex}`,
      sourceIndex,
      occurredAt,
      elapsedMs: elapsed !== null && elapsed >= 0 ? elapsed : null,
      kind,
      actor,
      target,
      knockMaker,
      finisher,
      assists,
      weaponCode,
      damage,
      cause,
      warnings: eventWarnings,
    }
    if (!eventIncludesMember(event)) continue
    if (eventWarnings.length)
      addWarning(
        warnings,
        'KNOWN_EVENT_INVALID',
        '일부 이벤트의 행위자 또는 경과 시간을 확인할 수 없어요.',
      )
    if (events.length >= maxEvents) {
      limited++
      continue
    }
    events.push(event)
  }
  if (limited)
    addWarning(
      warnings,
      'EVENT_LIMIT_EXCEEDED',
      '이벤트 수가 처리 한도를 넘어 일부 기록만 표시해요.',
      limited,
    )
  events.sort(
    (a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt) || a.sourceIndex - b.sourceIndex,
  )
  return { events, warnings: [...warnings.values()] }
}

function confirmedTotal(values: (number | null)[]): number | null {
  return values.every((value) => value === null)
    ? null
    : values.reduce<number>((sum, value) => sum + (value ?? 0), 0)
}

export function analyzeReport(input: {
  match: MatchSnapshot
  playerId: string
  telemetry: unknown
  reportId: string
  telemetryFailure?: string
  generatedAt?: string
  revision?: number
  maxEvents?: number
}): StoredReport {
  const { match } = input
  assertSupportedMatch(match)
  const team = identifyTeam(match, input.playerId)
  const killsComplete = team.members.every((member) => member.kills !== null)
  const damageComplete = team.members.every((member) => member.damageDealt !== null)
  const teamKills = confirmedTotal(team.members.map((member) => member.kills))
  const teamDamage = confirmedTotal(team.members.map((member) => member.damageDealt))
  const members: ReportMember[] = team.members.map((member, index) => ({
    ...member,
    memberNo: index + 1,
    damageShare:
      damageComplete && member.damageDealt !== null && teamDamage !== null
        ? teamDamage === 0
          ? 0
          : (member.damageDealt / teamDamage) * 100
        : null,
  }))
  const result = input.telemetryFailure
    ? {
        events: [],
        warnings: [{ code: 'TELEMETRY_UNAVAILABLE', count: 1, message: input.telemetryFailure }],
      }
    : normalizeTelemetry(input.telemetry, match, members, input.maxEvents)
  const missing = members.filter((member) =>
    [member.kills, member.damageDealt, member.revives, member.timeSurvived].includes(null),
  ).length
  if (missing || team.roster.rank === null)
    result.warnings.push({
      code: 'MEMBER_STATS_MISSING',
      count: Math.max(1, missing),
      message:
        '일부 공식 경기 통계가 없어 확인된 값만 표시해요. 피해량 비중은 전체 피해량이 확인될 때만 계산해요.',
    })
  const now = input.generatedAt ?? new Date().toISOString()
  return storedReportSchema.parse({
    id: input.reportId,
    source: match.source,
    platform: match.platform,
    matchId: match.matchId,
    rosterId: team.roster.rosterId,
    analysisVersion: ANALYSIS_VERSION,
    revision: input.revision ?? 1,
    quality: result.warnings.length ? 'partial' : 'ready',
    summary: {
      mapName: match.mapName,
      createdAt: match.createdAt,
      queueType: match.queueType,
      teamMode: match.teamMode,
      perspective: 'tpp',
      classificationVersion: match.classificationVersion,
      rank: team.roster.rank,
      teamKills,
      teamDamage,
      killsComplete,
      damageComplete,
    },
    members,
    events: result.events,
    warnings: result.warnings,
    generatedAt: now,
    updatedAt: now,
    lastRetryAt: null,
  })
}

export function toPublicReport(report: StoredReport, now = Date.now()): Report {
  const { events: _events, lastRetryAt, ...publicReport } = report
  const next = lastRetryAt ? Date.parse(lastRetryAt) + 60_000 : null
  const blockedReason =
    report.source === 'demo'
      ? 'DEMO_REPORT'
      : report.analysisVersion !== ANALYSIS_VERSION
        ? 'ANALYSIS_VERSION'
        : report.quality === 'ready'
          ? 'READY'
          : null
  return {
    ...publicReport,
    retry: {
      available: !blockedReason,
      notBefore: !blockedReason && next !== null ? new Date(next).toISOString() : null,
      reason: blockedReason ?? (next !== null && now < next ? 'COOLDOWN' : null),
    },
  }
}
