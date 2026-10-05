import { describe, expect, it } from 'vitest'
import type { EventRole, ReportEvent } from '../../shared/types'
import { getEventDistanceMeters } from '../../shared/utils/event-distance'

type Location = EventRole['location']
const role = (location: Location): EventRole => ({
  accountId: 'account.test',
  name: 'Test player',
  memberNo: null,
  location,
})
const origin = { x: 0, y: 0, z: 0 }
const event = (
  actor: Location = origin,
  target: Location = { x: 300, y: 400, z: 0 },
  kind: ReportEvent['kind'] = 'knock',
) => ({ kind, actor: role(actor), target: role(target) })

describe('event distance in meters', () => {
  it.each(['knock', 'kill', 'damage'] as const)('converts centimeters for %s events', (kind) => {
    expect(getEventDistanceMeters(event(origin, { x: 300, y: 400, z: 0 }, kind))).toBe(5)
  })

  it('includes altitude, including positions below zero, without rounding', () => {
    expect(
      getEventDistanceMeters(event({ x: 100, y: 200, z: -300 }, { x: 100, y: 200, z: 268.4 })),
    ).toBeCloseTo(5.684)
    expect(getEventDistanceMeters(event(origin, { x: 300, y: 400, z: 1200 }))).toBe(13)
  })

  it('preserves a valid zero distance and excludes revives', () => {
    expect(getEventDistanceMeters(event(origin, origin))).toBe(0)
    expect(getEventDistanceMeters(event(origin, { x: 300, y: 400, z: 0 }, 'revive'))).toBeNull()
  })

  it.each([null, undefined, { x: 100, y: 200 }])(
    'omits distance when either location is incomplete: %j',
    (location) => {
      const incomplete = event()
      incomplete.actor.location = location
      expect(getEventDistanceMeters(incomplete)).toBeNull()
      expect(getEventDistanceMeters({ ...event(), target: role(location) })).toBeNull()
    },
  )

  it.each([
    { x: Number.NaN, y: 0, z: 0 },
    { x: 0, y: Number.POSITIVE_INFINITY, z: 0 },
    { x: 0, y: 0, z: Number.NEGATIVE_INFINITY },
    { x: -1, y: 0, z: 0 },
    { x: 0, y: -1, z: 0 },
  ])('omits distance when either location is invalid: %j', (location) => {
    expect(getEventDistanceMeters(event(location))).toBeNull()
    expect(getEventDistanceMeters(event(origin, location))).toBeNull()
  })

  it('uses the credited killer location and never falls back to the finisher', () => {
    const kill = {
      ...event(origin, { x: 300, y: 400, z: 0 }, 'kill'),
      finisher: role({ x: 300, y: 1400, z: 0 }),
    }
    expect(getEventDistanceMeters(kill)).toBe(5)
    expect(getEventDistanceMeters({ ...kill, actor: null })).toBeNull()
    expect(getEventDistanceMeters({ ...kill, target: null })).toBeNull()
    expect(getEventDistanceMeters({ ...kill, actor: role(null) })).toBeNull()
  })
})
