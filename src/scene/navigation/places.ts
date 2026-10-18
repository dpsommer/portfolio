import { NOOK_X, ORIGIN, WALL_VIEW_DISTANCE } from '../core/camera.ts'
import type { FloorPoint } from '../core/camera.ts'
import { opposite } from './heading.ts'
import type { Heading } from './heading.ts'

// The spots the visitor can stand on, and where moving forward from each leads
// for each heading. Headings without an exit can't move forward.
export type PlaceName = 'start' | 'nook'

type Place = FloorPoint & { exits: Partial<Record<Heading, PlaceName>> }

export const PLACES: Record<PlaceName, Place> = {
  start: { ...ORIGIN, exits: { west: 'nook' } },
  nook: { x: NOOK_X + WALL_VIEW_DISTANCE, z: 0, exits: { east: 'start' } },
}

// Where moving forward leads, or null if there's no way forward.
export function forwardFrom(place: PlaceName, heading: Heading): PlaceName | null {
  return PLACES[place].exits[heading] ?? null
}

// Where stepping back without turning leads, or null if there's no way back.
export function backFrom(place: PlaceName, heading: Heading): PlaceName | null {
  return forwardFrom(place, opposite(heading))
}
