import { describe, expect, it } from 'vitest'
import { getMapExtent, projectMapLocation } from '../../shared/utils/map-coordinates'

describe('map coordinate bounds', () => {
  it.each([
    'Baltic_Main',
    'Erangel_Main',
    'Desert_Main',
    'Tiger_Main',
    'DihorOtok_Main',
    'Kiki_Main',
  ])('uses the documented 816000 cm extent for %s', (map) => {
    expect(getMapExtent(map)).toBe(816_000)
    expect(projectMapLocation(map, { x: 408_000, y: 204_000 })).toEqual({ x: 50, y: 25 })
  })

  it.each([
    ['Savage_Main', 408_000],
    ['Chimera_Main', 306_000],
    ['Summerland_Main', 204_000],
    ['Range_Main', 204_000],
    ['Heaven_Main', 102_000],
  ] as const)('uses the separate documented extent for %s', (map, extent) => {
    expect(getMapExtent(map)).toBe(extent)
    expect(projectMapLocation(map, { x: extent / 2, y: extent / 2 })).toEqual({ x: 50, y: 50 })
  })

  it.each(['FutureMap', 'toString', '__proto__'])('does not guess a range for %s', (map) => {
    expect(getMapExtent(map)).toBeNull()
    expect(projectMapLocation(map, { x: 0, y: 0 })).toBeNull()
  })

  it('projects the Rondo event sample using the shared 8 km map convention', () => {
    expect(getMapExtent('Neon_Main')).toBe(816_000)
    const point = projectMapLocation('Neon_Main', {
      x: 526_347.25,
      y: 437_304.125,
      z: 497.1755065917969,
    })
    expect(point?.x).toBeCloseTo(64.50333946078432)
    expect(point?.y).toBeCloseTo(53.591191789215685)
  })

  it('retains zero and boundary coordinates with top-left origin, without reversing Y', () => {
    expect(projectMapLocation('Baltic_Main', { x: 0, y: 0 })).toEqual({ x: 0, y: 0 })
    expect(projectMapLocation('Baltic_Main', { x: 816_000, y: 816_000 })).toEqual({
      x: 100,
      y: 100,
    })
    expect(projectMapLocation('Baltic_Main', { x: 0, y: 408_000, z: -120 })).toEqual({
      x: 0,
      y: 50,
    })
  })

  it.each([
    null,
    undefined,
    { x: -1, y: 100 },
    { x: 100, y: -1 },
    { x: 816_001, y: 100 },
    { x: 100, y: 816_001 },
    { x: Number.NaN, y: 100 },
    { x: 100, y: Number.POSITIVE_INFINITY },
    { x: 100, y: 100, z: Number.NaN },
  ])('returns null for invalid or absent coordinates rather than clamping: %j', (location) => {
    expect(projectMapLocation('Baltic_Main', location)).toBeNull()
  })
})
