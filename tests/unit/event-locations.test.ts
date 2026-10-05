import { describe, expect, it } from 'vitest'
import {
  ANALYSIS_VERSION,
  analyzeReport,
  storedReportSchema,
  toPublicReport,
} from '../../server/domain/report'
import {
  getDemoMatch,
  demoPlayer,
  demoTelemetry,
  getReservedDemoReport,
} from '../../server/fixtures/demo'
import { eventsDataSchema, reportSchema, reservedDemoIds } from '../../shared/schemas/report'
import { projectMapLocation } from '../../shared/utils/map-coordinates'

const match = getDemoMatch('demo-match-normal-squad')!
const at = (seconds: number) => new Date(Date.parse(match.createdAt) + seconds * 1000).toISOString()
const start = { _T: 'LogMatchStart', _D: at(0) }
const character = (index: number, location?: unknown) => ({
  accountId: `account.demo-${index}`,
  name: `Synthetic ${index}`,
  location,
})
const enemy = (location?: unknown) => ({
  accountId: 'account.opponent-1',
  name: 'Synthetic Opponent',
  location,
})
const analyze = (events: unknown[], mapName = match.mapName) =>
  analyzeReport({
    match: { ...match, mapName },
    playerId: demoPlayer.accountId,
    telemetry: [start, ...events],
    reportId: 'synthetic-location-report',
    generatedAt: at(1800),
  })
const damage = (location?: unknown) => ({
  _T: 'LogPlayerTakeDamage',
  _D: at(10),
  attacker: character(1, { x: 100, y: 200 }),
  victim: enemy(location),
  damage: 8,
})

describe('optional location normalization', () => {
  it.each([
    undefined,
    null,
    {},
    { x: 10 },
    { x: '10', y: 20 },
    { x: Number.NaN, y: 20 },
    { x: 10, y: Number.POSITIVE_INFINITY },
    { x: -1, y: 20 },
    { x: 10, y: -1 },
    { x: 816_001, y: 20 },
    { x: 10, y: 816_001 },
    { x: 10, y: 20, z: 'invalid' },
  ])('keeps the original event when only location is invalid: %j', (location) => {
    const report = analyze([damage(location)])
    expect(report.events).toHaveLength(1)
    expect(report.events[0]?.target?.location).toBeNull()
    expect(report.events[0]?.actor?.location).toEqual({ x: 100, y: 200 })
    expect(report.quality).toBe('ready')
    expect(report.summary.teamKills).toBe(8)
  })

  it('preserves legitimate zero, full-map boundary, fractional and negative-altitude values', () => {
    for (const location of [
      { x: 0, y: 0 },
      { x: 816_000, y: 816_000, z: 0 },
      { x: 108.5, y: 208.75, z: -120.5 },
    ]) {
      const report = analyze([damage(location)])
      expect(report.events[0]?.target?.location).toEqual(location)
    }
  })

  it('preserves valid raw coordinates for an unknown extent but does not project them', () => {
    const location = { x: 200_000, y: 400_000, z: 1500 }
    const report = analyze([damage(location)], 'FutureMap')
    expect(report.events[0]?.target?.location).toEqual(location)
    expect(projectMapLocation('FutureMap', report.events[0]?.target?.location)).toBeNull()
  })

  it('preserves and projects target coordinates from a Rondo report', () => {
    const location = { x: 526_347.25, y: 437_304.125, z: 497.1755065917969 }
    const report = analyze([damage(location)], 'Neon_Main')
    expect(report.events[0]?.target?.location).toEqual(location)
    const point = projectMapLocation('Neon_Main', report.events[0]?.target?.location)
    expect(point?.x).toBeCloseTo(64.50333946078432)
    expect(point?.y).toBeCloseTo(53.591191789215685)
  })

  it('keeps killer, victim, knock maker and finisher positions separate and never infers assist locations', () => {
    const report = analyze([
      {
        _T: 'LogPlayerKillV2',
        _D: at(12),
        killer: character(1, { x: 100, y: 200 }),
        victim: enemy({ x: 300, y: 400 }),
        dBNOMaker: character(2, { x: 500, y: 600 }),
        finisher: character(3, { x: 700, y: 800 }),
        assists_AccountId: ['account.demo-1', 'account.demo-4'],
        killerDamageInfo: { damageCauserName: 'KillerWeapon', damageTypeCategory: 'Damage_Gun' },
        finishDamageInfo: { damageCauserName: 'FinisherWeapon', damageTypeCategory: 'Damage_Gun' },
      },
    ])
    expect(report.events[0]).toMatchObject({
      actor: { memberNo: 1, location: { x: 100, y: 200 } },
      target: { memberNo: null, location: { x: 300, y: 400 } },
      knockMaker: { memberNo: 2, location: { x: 500, y: 600 } },
      finisher: { memberNo: 3, location: { x: 700, y: 800 } },
      assists: [
        { memberNo: 1, location: null },
        { memberNo: 4, location: null },
      ],
      weaponCode: 'KillerWeapon',
    })
  })

  it('keeps environmental death target position without inventing an actor', () => {
    const report = analyze([
      {
        _T: 'LogPlayerKillV2',
        _D: at(12),
        killer: null,
        finisher: null,
        dBNOMaker: null,
        victim: character(2, { x: 2000, y: 4000 }),
        finishDamageInfo: { damageTypeCategory: 'Damage_BlueZone' },
      },
    ])
    expect(report.events[0]).toMatchObject({
      actor: null,
      finisher: null,
      knockMaker: null,
      target: { location: { x: 2000, y: 4000 } },
      cause: 'environment',
    })
  })

  it('reads persisted v1 events without a location property while new reports use analysis version 2', () => {
    const current = analyze([damage({ x: 100, y: 200 })])
    expect(ANALYSIS_VERSION).toBe('2')
    expect(current.analysisVersion).toBe('2')
    expect(current.events[0]?.id).toMatch(/^2:/)
    const legacyRaw: unknown = JSON.parse(
      JSON.stringify({ ...current, analysisVersion: '1' }, (key, value: unknown) =>
        key === 'location' ? undefined : value,
      ),
    )
    const legacy = storedReportSchema.parse(legacyRaw)
    expect(legacy.analysisVersion).toBe('1')
    expect(legacy.events[0]?.target?.location).toBeUndefined()
    expect(() => reportSchema.parse(toPublicReport(legacy))).not.toThrow()
    expect(() =>
      eventsDataSchema.parse({
        events: legacy.events,
        total: legacy.events.length,
        nextCursor: null,
      }),
    ).not.toThrow()
  })
})

describe('synthetic map fixtures', () => {
  it.each(reservedDemoIds)(
    'adds useful synthetic positions without changing event timing or count in %s',
    (id) => {
      const report = getReservedDemoReport(id)!
      const major = report.events.filter((event) => event.kind !== 'damage')
      expect(report.analysisVersion).toBe('2')
      expect(report.quality).toBe('ready')
      expect(report.events).toHaveLength(116)
      expect(report.events[0]?.elapsedMs).toBe(215_000)
      expect(report.events.at(-1)?.elapsedMs).toBe(1_054_000)
      expect(
        major.every(
          (event) => projectMapLocation(report.summary.mapName, event.target?.location) !== null,
        ),
      ).toBe(true)
      expect(
        new Set(major.map((event) => JSON.stringify(event.target?.location))).size,
      ).toBeGreaterThan(2)
      const downed = major.find(
        (event) => event.kind === 'knock' && event.target?.memberNo !== null,
      )!
      const revived = major.find((event) => event.kind === 'revive')!
      const downLocation = downed.target!.location!
      const reviveLocation = revived.target!.location!
      expect(
        Math.hypot(downLocation.x - reviveLocation.x, downLocation.y - reviveLocation.y),
      ).toBeLessThan(2000)
      expect(demoTelemetry(report.matchId)).toHaveLength(119)
    },
  )
})
