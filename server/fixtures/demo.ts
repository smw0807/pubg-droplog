import type { Platform, Player } from '../../shared/types'
import { reservedDemoIds } from '../../shared/schemas/report'
import { normalizeMatch, type MatchSnapshot } from '../domain/match'
import { analyzeReport, type StoredReport } from '../domain/report'

/** Entirely synthetic identities and events. No captured player data or credentials. */
export const demoPlayer: Player = { accountId: 'account.demo-1', displayName: 'SquadMate', platform: 'steam' }
const memberNames = ['SquadMate', 'AerialFox', 'RiverMint', 'CloudNine']
const baseTime = Date.parse('2026-10-04T08:00:00.000Z')

export interface MatchFixtureOptions {
  id?: string
  gameMode?: string | null
  matchType?: string | null
  isCustomMatch?: boolean | null
  memberCount?: number
  createdAt?: string
  missingStats?: boolean
  zeroDamage?: boolean
}

/** Standard JSON:API envelope, including distinct account, participant and roster IDs. */
export function makeRawMatch(options: MatchFixtureOptions = {}) {
  const id = options.id ?? 'synthetic-match'
  const memberCount = options.memberCount ?? 4
  const members = Array.from({ length: memberCount }, (_, index) => ({
    type: 'participant', id: `participant-${id}-${index + 1}`,
    attributes: { stats: {
      playerId: `account.demo-${index + 1}`, name: memberNames[index] ?? `Sample${index + 1}`,
      kills: index === 0 ? 4 : index === 1 ? 2 : 1,
      damageDealt: options.missingStats && index === 1 ? undefined : options.zeroDamage ? 0 : [624.35, 412.4, 201.5, 98.75][index] ?? 0,
      revives: index === 0 ? 2 : 0, timeSurvived: 1_642 - index * 42,
    } },
  }))
  return {
    data: {
      type: 'match', id,
      attributes: {
        createdAt: options.createdAt ?? new Date(baseTime).toISOString(), mapName: 'Baltic_Main',
        gameMode: options.gameMode === undefined ? 'squad' : options.gameMode,
        matchType: options.matchType === undefined ? 'official' : options.matchType,
        isCustomMatch: options.isCustomMatch === undefined ? false : options.isCustomMatch,
      },
      relationships: { rosters: { data: [{ type: 'roster', id: `roster-${id}` }] }, assets: { data: [{ type: 'asset', id: `asset-${id}` }] } },
    },
    included: [
      ...members,
      { type: 'participant', id: `participant-${id}-opponent`, attributes: { stats: { playerId: 'account.opponent-1', name: 'StoneFalcon', kills: 1, damageDealt: 113, revives: 0, timeSurvived: 800 } } },
      { type: 'roster', id: `roster-${id}`, attributes: { stats: { rank: 3 } }, relationships: { participants: { data: members.map(member => ({ type: 'participant', id: member.id })) } } },
      { type: 'asset', id: `asset-${id}`, attributes: { URL: `https://telemetry-cdn.pubg.com/synthetic/${id}.json` } },
    ],
  }
}

const inputs: MatchFixtureOptions[] = [
  { id: 'demo-match-normal-squad', gameMode: 'squad', memberCount: 4, createdAt: '2026-10-04T08:00:00.000Z' },
  { id: 'demo-match-normal-duo', gameMode: 'duo', memberCount: 2, createdAt: '2026-10-04T09:30:00.000Z' },
  ...Array.from({ length: 18 }, (_, index): MatchFixtureOptions => ({
    id: `demo-match-history-${index + 1}`, gameMode: index % 2 ? 'duo' : 'squad', memberCount: index % 2 ? 1 : 2,
    createdAt: new Date(baseTime - ((index * 7) % 18 + 1) * 3_600_000).toISOString(), missingStats: index === 2, zeroDamage: index === 3,
  })),
  { id: 'demo-match-ranked-squad', gameMode: 'squad', matchType: 'competitive', memberCount: 4, createdAt: '2026-10-04T07:00:00.000Z' },
  { id: 'demo-match-ranked-duo', gameMode: 'duo', matchType: 'competitive', memberCount: 2, createdAt: '2026-10-04T10:00:00.000Z' },
  { id: 'demo-match-fpp-duo', gameMode: 'duo-fpp', memberCount: 2 },
  { id: 'demo-match-fpp-squad', gameMode: 'squad-fpp' },
  { id: 'demo-match-solo', gameMode: 'solo', memberCount: 1 },
  { id: 'demo-match-custom', isCustomMatch: true, matchType: 'custom' },
  { id: 'demo-match-missing-type', matchType: null },
  { id: 'demo-match-unknown-type', matchType: 'future-mode' },
]

/** Larger test fixture: first 20 raw records are normal, so a ranked page is initially empty. */
export const largeDemoMatches: MatchSnapshot[] = inputs.map(options => normalizeMatch(makeRawMatch(options), { source: 'demo', platform: 'steam', fetchedAt: '2026-10-04T12:00:00.000Z' }).match)
export const demoMatches = [...largeDemoMatches.slice(0, 2), ...largeDemoMatches.slice(20)]
/** Intentionally not ordered by date. The four supported combinations are visible together. */
export const playerMatches = demoMatches.map(match => match.matchId)

export function getDemoMatch(matchId: string, platform: Platform = 'steam'): MatchSnapshot | undefined {
  const match = demoMatches.find(candidate => candidate.matchId === matchId)
  return match ? { ...structuredClone(match), platform } : undefined
}

export function demoTelemetry(matchId: string): unknown[] {
  const match = demoMatches.find(candidate => candidate.matchId === matchId)
  const start = Date.parse(match?.createdAt ?? new Date(baseTime).toISOString())
  const at = (seconds: number) => new Date(start + seconds * 1_000).toISOString()
  const location = (x: number, y: number) => ({ x, y, z: 1_800 })
  const character = (index: number, x = 296_000, y = 320_000) => ({ accountId: `account.demo-${index}`, name: memberNames[index - 1] ?? `Sample${index}`, teamId: 11, location: location(x, y) })
  const enemy = (x = 304_000, y = 329_000) => ({ accountId: 'account.opponent-1', name: 'StoneFalcon', teamId: 22, location: location(x, y) })
  const secondIndex = (match?.rosters[0]?.participantIds.length ?? 4) > 1 ? 2 : 1
  const second = (x: number, y: number) => character(secondIndex, x, y)
  const events: unknown[] = [
    { _T: 'LogMatchStart', _D: at(0), mapName: 'Baltic_Main' },
    { _T: 'LogPlayerTakeDamage', _D: at(215), attacker: character(1), victim: enemy(), damage: 32.5, damageCauserName: 'WeapM416_C', damageTypeCategory: 'Damage_Gun' },
    { _T: 'LogPlayerMakeGroggy', _D: at(221), attacker: character(1), victim: enemy(), damageCauserName: 'WeapM416_C', damageTypeCategory: 'Damage_Gun' },
    { _T: 'LogPlayerKillV2', _D: at(227), killer: character(1), victim: enemy(305_000, 330_000), dBNOMaker: character(1), finisher: second(303_000, 328_000),
      killerDamageInfo: { damageCauserName: 'WeapM416_C', damageTypeCategory: 'Damage_Gun' }, finishDamageInfo: { damageCauserName: 'WeapAK47_C', damageTypeCategory: 'Damage_Gun' }, assists_AccountId: [`account.demo-${secondIndex}`] },
    { _T: 'LogPlayerMakeGroggy', _D: at(438), attacker: enemy(422_000, 448_000), victim: second(428_000, 451_000), damageCauserName: 'WeapBerylM762_C', damageTypeCategory: 'Damage_Gun' },
    { _T: 'LogPlayerRevive', _D: at(451), reviver: character(1, 428_800, 451_500), victim: second(429_000, 451_700) },
    { _T: 'LogPlayerKillV2', _D: at(815), killer: null, finisher: null, dBNOMaker: null, victim: second(546_000, 587_000),
      finishDamageInfo: { damageCauserName: 'BP_BlueZoneController_C', damageTypeCategory: 'Damage_BlueZone' }, assists_AccountId: [] },
    { _T: 'LogPlayerRedeploy', _D: at(930), character: second(566_000, 572_000) },
    { _T: 'FutureUnrelatedEvent', _D: at(950), arbitrary: 'additional fields are allowed' },
  ]
  for (let index = 0; index < 110; index++) events.push({ _T: 'LogPlayerTakeDamage', _D: at(1_000 + Math.floor(index / 2)), attacker: character(1, 587_000 + index * 180, 602_000 + index * 80), victim: enemy(595_000 + index * 180, 611_000 + index * 80), damage: 3.2, damageCauserName: 'WeapM416_C', damageTypeCategory: 'Damage_Gun' })
  return events
}

export function getReservedDemoReport(id: string): StoredReport | null {
  if (!reservedDemoIds.some(candidate => candidate === id)) return null
  const match = getDemoMatch(id.replace('demo-', 'demo-match-'))
  if (!match) return null
  return analyzeReport({ match, playerId: demoPlayer.accountId, telemetry: demoTelemetry(match.matchId), reportId: id, generatedAt: '2026-10-04T12:00:00.000Z' })
}
