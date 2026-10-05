import type { MapLocation, ReportEvent } from '../types'

function hasCoordinates(
  location: MapLocation | null | undefined,
): location is MapLocation & { z: number } {
  return (
    !!location &&
    Number.isFinite(location.x) &&
    Number.isFinite(location.y) &&
    typeof location.z === 'number' &&
    Number.isFinite(location.z) &&
    location.x >= 0 &&
    location.y >= 0
  )
}

/** Stored-position straight-line distance, not bullet travel or a damage-log distance. */
export function getEventDistanceMeters(
  event: Pick<ReportEvent, 'kind' | 'actor' | 'target'>,
): number | null {
  if (event.kind === 'revive') return null
  const from = event.actor?.location
  const to = event.target?.location
  // Do not invent an altitude or mix horizontal and 3D distances under one label.
  if (!hasCoordinates(from) || !hasCoordinates(to)) return null
  const meters = Math.hypot(from.x - to.x, from.y - to.y, from.z - to.z) / 100
  return Number.isFinite(meters) ? meters : null
}
