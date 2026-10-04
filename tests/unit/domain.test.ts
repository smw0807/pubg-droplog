import { describe, expect, it } from 'vitest'
import { classifyMatch, identifyTeam, normalizeMatch, toMatchListItem } from '../../server/domain/match'
import { analyzeReport, eventIncludesMember, filterEvents, toPublicReport } from '../../server/domain/report'
import { demoMatches, demoPlayer, demoTelemetry, getDemoMatch, getReservedDemoReport, largeDemoMatches, makeRawMatch } from '../../server/fixtures/demo'
import { createReportInputSchema, playerNameSchema, reportSchema, reservedDemoIds } from '../../shared/schemas/report'

const context = { source: 'demo', platform: 'steam', fetchedAt: '2026-10-04T12:00:00.000Z' } as const
const normalized = (options: Parameters<typeof makeRawMatch>[0] = {}) => normalizeMatch(makeRawMatch(options), context).match
const character = (id: number) => ({ accountId: `account.demo-${id}`, name: `Sample${id}` })
const enemy = { accountId: 'account.opponent-1', name: 'StoneFalcon' }
const at = (seconds: number) => new Date(Date.parse('2026-10-04T08:00:00.000Z') + seconds * 1_000).toISOString()
const start = { _T: 'LogMatchStart', _D: at(0) }
const damage = (seconds: number, amount = 17) => ({ _T: 'LogPlayerTakeDamage', _D: at(seconds), attacker: character(1), victim: enemy, damage: amount, damageCauserName: 'UnknownFutureWeapon_C', damageTypeCategory: 'Damage_Gun' })
const analyze = (telemetry: unknown, match = normalized()) => analyzeReport({ match, telemetry, playerId: demoPlayer.accountId, reportId: 'd3bfa719-5849-477f-9fd9-7f8c1611b638', generatedAt: at(3_600) })

describe('match classification and relationships', () => {
  it.each([['duo', 'official', 'normal', 'duo'], ['squad', 'official', 'normal', 'squad'], ['duo', 'competitive', 'ranked', 'duo'], ['squad', 'competitive', 'ranked', 'squad']])('supports %s / %s', (gameMode, matchType, queueType, teamMode) => {
    expect(classifyMatch(gameMode!, matchType!, false)).toMatchObject({ classification: 'supported', queueType, teamMode, perspective: 'tpp' })
  })

  it.each(['duo-fpp', 'squad-fpp', 'solo'])('excludes %s for direct report creation', gameMode => {
    const match = normalized({ gameMode })
    expect(match.classification).toBe('unsupported')
    expect(() => analyze([], match)).toThrow(expect.objectContaining({ code: 'UNSUPPORTED_MATCH' }))
  })

  it.each(['custom', 'arcade', 'training', 'event'])('excludes explicit special match type %s', matchType => {
    expect(normalized({ matchType }).classification).toBe('unsupported')
  })

  it('does not infer classification when raw fields are missing, unknown or prefixed', () => {
    for (const options of [{ matchType: null }, { matchType: 'future-mode' }, { isCustomMatch: null }, { gameMode: 'normal-duo' }]) {
      const match = normalized(options)
      expect(match.classification).toBe('unknown')
      expect(() => analyze([], match)).toThrow(expect.objectContaining({ code: 'MATCH_CLASSIFICATION_UNKNOWN' }))
    }
    expect(normalized({ isCustomMatch: true }).classification).toBe('unsupported')
  })

  it('connects account ID through participant ID to roster without renaming a 2-person squad', () => {
    const match = normalized({ memberCount: 2 })
    expect(identifyTeam(match, 'account.demo-2').members.map(member => member.accountId)).toEqual(['account.demo-1', 'account.demo-2'])
    expect(toMatchListItem(match, demoPlayer.accountId)).toMatchObject({ teamMode: 'squad', memberCount: 2 })
    expect(toMatchListItem(normalized({ gameMode: 'duo', memberCount: 1 }), demoPlayer.accountId)).toMatchObject({ teamMode: 'duo', memberCount: 1 })
    expect(() => identifyTeam(match, match.participants[0]!.participantId)).toThrow(expect.objectContaining({ code: 'PLAYER_NOT_IN_MATCH' }))
  })

  it('fails ambiguous, incomplete and oversized team identification instead of partial success', () => {
    const match = normalized()
    match.rosters.push({ ...match.rosters[0]!, rosterId: 'other-roster' })
    expect(() => identifyTeam(match, demoPlayer.accountId)).toThrow()
    const missing = normalized()
    missing.rosters[0]!.participantIds.push('missing-participant')
    expect(() => identifyTeam(missing, demoPlayer.accountId)).toThrow()
    expect(() => identifyTeam(normalized({ gameMode: 'duo', memberCount: 3 }), demoPlayer.accountId)).toThrow()
  })

  it('extracts only a related asset URL and keeps it outside the persisted snapshot', () => {
    const raw = makeRawMatch()
    const { match, telemetryUrl } = normalizeMatch(raw, context)
    expect(telemetryUrl).toMatch(/^https:\/\/telemetry-cdn\.pubg\.com\//)
    expect(JSON.stringify(match)).not.toContain('https:')
    raw.data.relationships.assets.data = []
    expect(normalizeMatch(raw, context).telemetryUrl).toBeNull()
  })

  it('preserves source, original classification and missing official fields', () => {
    const match = normalizeMatch(makeRawMatch({ matchType: 'competitive', missingStats: true }), { ...context, source: 'live' }).match
    expect(match).toMatchObject({ source: 'live', rawMatchType: 'competitive', queueType: 'ranked', classificationVersion: '1' })
    expect(match.participants[1]!.damageDealt).toBeNull()
  })
})

describe('official scoreboard', () => {
  it('uses official stats rather than telemetry and sums before rounding', () => {
    const report = analyze([start, damage(1, 9_999)])
    expect(report.summary.teamKills).toBe(8)
    expect(report.summary.teamDamage).toBeCloseTo(1_337)
    expect(report.members[0]!.damageDealt).toBe(624.35)
    expect(report.members[0]!.damageShare).toBeCloseTo(624.35 / 1_337 * 100)
  })

  it('distinguishes missing stats from real zero and suppresses incomplete proportions', () => {
    const partial = analyze([start], normalized({ missingStats: true }))
    expect(partial.quality).toBe('partial')
    expect(partial.summary.damageComplete).toBe(false)
    expect(partial.summary.teamDamage).toBeCloseTo(924.6)
    expect(partial.members[1]!.damageDealt).toBeNull()
    expect(partial.members.every(member => member.damageShare === null)).toBe(true)
    const zero = analyze([start], normalized({ zeroDamage: true }))
    expect(zero.quality).toBe('ready')
    expect(zero.summary.teamDamage).toBe(0)
    expect(zero.members.every(member => member.damageShare === 0)).toBe(true)
  })

  it('assigns stable numbers regardless of which teammate requested the report', () => {
    const match = normalized()
    match.participants.reverse()
    match.rosters[0]!.participantIds.reverse()
    const first = analyze([start], match)
    const second = analyzeReport({ match, telemetry: [start], playerId: 'account.demo-4', reportId: 'other-id' })
    expect(second.members).toEqual(first.members)
    expect(second.rosterId).toBe(first.rosterId)
  })
})

describe('event normalization', () => {
  it('preserves killer, finisher, knock maker and assist roles separately in one kill row', () => {
    const report = analyze([start, { _T: 'LogPlayerKillV2', _D: at(20), killer: character(1), victim: enemy,
      dBNOMaker: character(2), finisher: character(3), assists_AccountId: ['account.demo-4'],
      killerDamageInfo: { damageCauserName: 'KillerWeapon', damageTypeCategory: 'Damage_Gun' }, finishDamageInfo: { damageCauserName: 'FinisherWeapon' } }])
    expect(report.events).toHaveLength(1)
    const event = report.events[0]!
    expect(event).toMatchObject({ kind: 'kill', actor: { memberNo: 1 }, knockMaker: { memberNo: 2 }, finisher: { memberNo: 3 }, assists: [{ memberNo: 4 }], weaponCode: 'KillerWeapon' })
    expect(eventIncludesMember(event, 4)).toBe(true)
    expect(filterEvents(report.events, ['kill'], 4)).toHaveLength(1)
  })

  it('includes events where our team only assisted, without nickname-based team matching', () => {
    const report = analyze([start, { _T: 'LogPlayerKillV2', _D: at(20), killer: enemy, victim: { accountId: 'account.other-enemy', name: 'SquadMate' }, assists_AccountId: ['account.demo-2'] }])
    expect(report.events).toHaveLength(1)
    expect(report.events[0]!.target?.memberNo).toBeNull()
    expect(filterEvents(report.events, ['kill'], 1)).toHaveLength(0)
    expect(filterEvents(report.events, ['kill'], 2)).toHaveLength(1)
  })

  it('retains same-looking positive damage rows and sorts same-time records by original index', () => {
    const report = analyze([start, damage(50), damage(10), damage(10), damage(5, 0), { _T: 'BrandNewEvent', _D: at(2), anything: true }])
    expect(report.quality).toBe('ready')
    expect(report.events.map(event => event.sourceIndex)).toEqual([2, 3, 1])
    expect(new Set(report.events.map(event => event.id)).size).toBe(3)
    expect(report.events[0]!.weaponCode).toBe('UnknownFutureWeapon_C')
    expect(filterEvents(report.events)).toHaveLength(0)
    expect(filterEvents(report.events, ['knock', 'revive', 'kill', 'damage'])).toHaveLength(3)
  })

  it('marks known malformed events partial but keeps valid rows and official stats', () => {
    const report = analyze([start, damage(1), { ...damage(2), damage: '17' }, { _T: 'LogPlayerRevive', _D: at(3), victim: character(1), reviver: { accountId: 12 } }])
    expect(report.quality).toBe('partial')
    expect(report.events).toHaveLength(1)
    expect(report.warnings).toContainEqual(expect.objectContaining({ code: 'KNOWN_EVENT_INVALID', count: 2 }))
    expect(report.summary.teamKills).toBe(8)
  })

  it('recognizes environment deaths, friendly fire and self harm without inferring a wipe', () => {
    const report = analyze([start,
      { _T: 'LogPlayerKillV2', _D: at(1), killer: null, victim: character(1), finishDamageInfo: { damageTypeCategory: 'Damage_BlueZone' } },
      { ...damage(2), attacker: character(2), victim: character(1) },
      { ...damage(3), attacker: character(1), victim: character(1) },
      { _T: 'LogPlayerRedeploy', _D: at(4), character: character(1) },
      { _T: 'LogPlayerRevive', _D: at(5), reviver: character(2), victim: character(1) },
    ])
    expect(report.quality).toBe('ready')
    expect(report.events.map(event => event.cause)).toEqual(['environment', 'friendly_fire', 'self', 'combat'])
    expect(report.events.map(event => event.kind)).toEqual(['kill', 'damage', 'damage', 'revive'])
    expect(report.summary).not.toHaveProperty('wipeAt')
  })

  it('uses the finishing environment cause when there is no killer, even with an empty killer damage object', () => {
    const report = analyze([start, { _T: 'LogPlayerKillV2', _D: at(1), killer: null, victim: character(1),
      killerDamageInfo: {}, finishDamageInfo: { damageTypeCategory: 'Damage_BlueZone', damageCauserName: 'BlueZone' } }])
    expect(report.quality).toBe('ready')
    expect(report.events[0]).toMatchObject({ actor: null, cause: 'environment', weaponCode: 'BlueZone' })
  })

  it('never attributes a finisher weapon or official kill credit to a different known killer', () => {
    const report = analyze([start, { _T: 'LogPlayerKillV2', _D: at(1), killer: character(1), finisher: character(2), victim: enemy,
      finishDamageInfo: { damageTypeCategory: 'Damage_Gun', damageCauserName: 'FinisherWeapon' } }])
    expect(report.events[0]).toMatchObject({ actor: { memberNo: 1 }, finisher: { memberNo: 2 }, cause: 'combat', weaponCode: null })
    expect(report.summary.teamKills).toBe(8)
  })

  it.each(['LogPlayerKillV2', 'LogPlayerMakeGroggy', 'LogPlayerTakeDamage', 'LogPlayerRevive'])('marks a missing required victim in %s partial', type => {
    const report = analyze([start, { _T: type, _D: at(1), killer: character(1), attacker: character(1), reviver: character(1), damage: 10, victim: { accountId: '', name: '' } }])
    expect(report.quality).toBe('partial')
    expect(report.events).toHaveLength(0)
    expect(report.warnings).toContainEqual(expect.objectContaining({ code: 'KNOWN_EVENT_INVALID', count: 1 }))
    expect(report.summary.teamKills).toBe(8)
  })

  it('does not estimate elapsed time from match metadata when LogMatchStart is absent', () => {
    const report = analyze([damage(60)])
    expect(report.events[0]!.elapsedMs).toBeNull()
    expect(report.events[0]!.occurredAt).toBe(at(60))
    expect(report.warnings).toContainEqual(expect.objectContaining({ code: 'MISSING_TIME_ORIGIN' }))
  })

  it('marks capped and unavailable telemetry partial rather than claiming no combat', () => {
    const match = normalized()
    const report = analyzeReport({ match, playerId: demoPlayer.accountId, telemetry: [start, damage(1), damage(2), damage(3)], reportId: 'capped', maxEvents: 2 })
    expect(report.events).toHaveLength(2)
    expect(report.warnings).toContainEqual(expect.objectContaining({ code: 'EVENT_LIMIT_EXCEEDED', count: 1 }))
    const failed = analyze(null)
    expect(failed.summary.teamKills).toBe(8)
    expect(failed.quality).toBe('partial')
    expect(failed.warnings[0]!.code).toBe('TELEMETRY_UNAVAILABLE')
  })
})

describe('public contracts and synthetic demo', () => {
  it.each(reservedDemoIds)('provides a valid, read-only %s', id => {
    const stored = getReservedDemoReport(id)!
    const report = reportSchema.parse(toPublicReport(stored))
    expect(report.source).toBe('demo')
    expect(report.quality).toBe('ready')
    expect(report.retry).toMatchObject({ available: false, reason: 'DEMO_REPORT' })
    expect(report).not.toHaveProperty('events')
    expect(report.members).toHaveLength(id.endsWith('duo') ? 2 : 4)
  })

  it('has four supported modes, exclusion fixtures and a separate empty-filter page fixture', () => {
    expect(demoMatches.filter(match => match.classification === 'supported')).toHaveLength(4)
    expect(demoMatches.filter(match => match.classification === 'unsupported')).toHaveLength(4)
    expect(demoMatches.filter(match => match.classification === 'unknown')).toHaveLength(2)
    expect(largeDemoMatches.slice(0, 20).filter(match => match.queueType === 'ranked')).toHaveLength(0)
    expect(largeDemoMatches.slice(20).some(match => match.queueType === 'ranked')).toBe(true)
    expect(getDemoMatch('demo-match-ranked-duo', 'kakao')?.platform).toBe('kakao')
    expect(demoTelemetry('demo-match-normal-squad').length).toBeGreaterThan(100)
  })

  it('returns cooldown eligibility independent of notBefore and keeps source on stored reports', () => {
    const report = analyze(null)
    report.source = 'live'
    report.lastRetryAt = at(10)
    expect(toPublicReport(report, Date.parse(at(20))).retry).toEqual({ available: true, notBefore: at(70), reason: 'COOLDOWN' })
    expect(toPublicReport(report, Date.parse(at(71))).retry.reason).toBeNull()
    report.source = 'demo'
    expect(toPublicReport(report).retry.available).toBe(false)
  })

  it('trims only outer whitespace while preserving case and rejects multiple names and source spoofing', () => {
    expect(playerNameSchema.parse('  MixedCase_12  ')).toBe('MixedCase_12')
    for (const value of ['', 'One Two', 'One,Two', 'One\nTwo', 'x'.repeat(33)]) expect(playerNameSchema.safeParse(value).success).toBe(false)
    expect(createReportInputSchema.safeParse({ platform: 'steam', matchId: 'match-1', playerId: 'account.demo-1', source: 'live' }).success).toBe(false)
  })
})
