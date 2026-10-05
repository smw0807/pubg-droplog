import type { MapLocation } from '../types'

/**
 * Official telemetry coordinates are centimeters, with (0, 0) at top-left.
 * Bounds: https://documentation.pubg.com/en/telemetry-objects.html#location
 * Raw names: https://github.com/pubg/api-assets/blob/master/dictionaries/telemetry/mapName.json
 * Rondo is intentionally absent until its telemetry extent is documented.
 */
const mapExtents: Readonly<Record<string, number>> = {
  Baltic_Main: 816_000,
  Erangel_Main: 816_000,
  Desert_Main: 816_000,
  Tiger_Main: 816_000,
  DihorOtok_Main: 816_000,
  Kiki_Main: 816_000,
  Savage_Main: 408_000,
  Chimera_Main: 306_000,
  Summerland_Main: 204_000,
  Range_Main: 204_000,
  Heaven_Main: 102_000,
}

export function getMapExtent(mapName: string): number | null {
  return Object.hasOwn(mapExtents, mapName) ? (mapExtents[mapName] ?? null) : null
}

/** Percent positions on the full map image; never clamp or invent a coordinate. */
export function projectMapLocation(
  mapName: string,
  location: MapLocation | null | undefined,
): { x: number; y: number } | null {
  const extent = getMapExtent(mapName)
  if (
    extent === null ||
    !location ||
    !Number.isFinite(location.x) ||
    !Number.isFinite(location.y) ||
    location.x < 0 ||
    location.y < 0 ||
    location.x > extent ||
    location.y > extent ||
    (location.z !== undefined && !Number.isFinite(location.z))
  )
    return null
  // This pure browser projection intentionally does not import server DTO
  // schemas or their validation runtime into the report page bundle.
  return { x: (location.x / extent) * 100, y: (location.y / extent) * 100 }
}
