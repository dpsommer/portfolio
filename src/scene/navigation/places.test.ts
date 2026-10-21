import { describe, expect, it } from 'vitest'
import {
  BACK_Z,
  FAR_Z,
  HALL_END_Z,
  HALL_FRONT_Z,
  HALL_STEP,
  HALL_X,
  NOOK_X,
  ORIGIN,
  SIGN_STEP,
  WALL_VIEW_DISTANCE,
} from '../core/camera.ts'
import type { FloorPoint } from '../core/camera.ts'
import { FLOOR_PLAN, isOnFloor } from '../room/room.ts'
import { HEADINGS, opposite } from './heading.ts'
import type { Heading } from './heading.ts'
import { PLACES, backFrom, forwardFrom } from './places.ts'
import type { PlaceName } from './places.ts'

const PLACE_NAMES = Object.keys(PLACES) as PlaceName[]

// Unit steps on the floor plan for each heading.
const DIRECTIONS: Record<Heading, FloorPoint> = {
  north: { x: 0, z: 1 },
  west: { x: -1, z: 0 },
  south: { x: 0, z: -1 },
  east: { x: 1, z: 0 },
}

// Walls closer than this straight ahead frame the place, so must be WALL_VIEW_DISTANCE away.
const CLOSE = 1.5

// Distance from `from` along `heading` to the first wall of the floor plan.
function distanceToWall(from: FloorPoint, heading: Heading): number {
  const d = DIRECTIONS[heading]
  let nearest = Infinity
  for (let i = 0; i < FLOOR_PLAN.length; i++) {
    const a = FLOOR_PLAN[i]
    const b = FLOOR_PLAN[(i + 1) % FLOOR_PLAN.length]
    const wx = b.x - a.x
    const wz = b.z - a.z
    const denominator = d.x * wz - d.z * wx
    if (denominator === 0) continue
    // t is the distance along the ray; u how far along the wall the crossing is.
    const t = ((a.x - from.x) * wz - (a.z - from.z) * wx) / denominator
    const u = ((a.x - from.x) * d.z - (a.z - from.z) * d.x) / denominator
    if (t > 1e-9 && u >= 0 && u <= 1) nearest = Math.min(nearest, t)
  }
  return nearest
}

describe('PLACES', () => {
  it('has the start, the nook, the place in front of the sign and the three hall places', () => {
    expect([...PLACE_NAMES].sort()).toEqual(['hall', 'hall-end', 'hall-middle', 'nook', 'sign', 'start'])
  })

  it('puts the start at the origin', () => {
    expect(PLACES.start.x).toBe(ORIGIN.x)
    expect(PLACES.start.z).toBe(ORIGIN.z)
  })

  it('puts the nook WALL_VIEW_DISTANCE in front of the nook\'s back wall, level with the start', () => {
    expect(PLACES.nook.x).toBeCloseTo(NOOK_X + WALL_VIEW_DISTANCE)
    expect(PLACES.nook.z).toBe(ORIGIN.z)
  })

  it('puts the sign place SIGN_STEP north of the start, WALL_VIEW_DISTANCE from the far wall', () => {
    expect(PLACES.sign.x).toBe(ORIGIN.x)
    expect(PLACES.sign.z).toBe(ORIGIN.z + SIGN_STEP)
    expect(FAR_Z - PLACES.sign.z).toBeCloseTo(WALL_VIEW_DISTANCE)
  })

  it('makes the step to the sign as long as the step to the nook', () => {
    expect(PLACES.sign.z - PLACES.start.z).toBeCloseTo(PLACES.start.x - PLACES.nook.x)
  })

  it('puts the hall WALL_VIEW_DISTANCE from the hall\'s east and north walls, level with the start', () => {
    expect(HALL_X - PLACES.hall.x).toBeCloseTo(WALL_VIEW_DISTANCE)
    expect(HALL_FRONT_Z - PLACES.hall.z).toBeCloseTo(WALL_VIEW_DISTANCE)
    expect(PLACES.hall.z).toBe(ORIGIN.z)
  })

  it.each([
    ['hall-middle', 1],
    ['hall-end', 2],
  ] as const)('puts the %s %i HALL_STEP south of the hall, in line with it', (name, steps) => {
    expect(PLACES[name].x).toBe(PLACES.hall.x)
    expect(PLACES.hall.z - PLACES[name].z).toBeCloseTo(steps * HALL_STEP)
  })

  it('puts the hall end WALL_VIEW_DISTANCE from the dead end', () => {
    expect(PLACES['hall-end'].z - HALL_END_Z).toBeCloseTo(WALL_VIEW_DISTANCE)
  })

  it('leads west from the start to the nook, north to the sign and east to the hall', () => {
    expect(PLACES.start.exits).toEqual({ west: 'nook', north: 'sign', east: 'hall' })
  })

  it('leads west from the hall back to the start and south down the hall', () => {
    expect(PLACES.hall.exits).toEqual({ west: 'start', south: 'hall-middle' })
  })

  it('leads north from the hall middle to the hall and south to the hall end', () => {
    expect(PLACES['hall-middle'].exits).toEqual({ north: 'hall', south: 'hall-end' })
  })

  it('leads only north from the hall end', () => {
    expect(PLACES['hall-end'].exits).toEqual({ north: 'hall-middle' })
  })

  it('leads south from the sign back to the start', () => {
    expect(PLACES.sign.exits).toEqual({ south: 'start' })
  })

  it('leads east from the nook back to the start', () => {
    expect(PLACES.nook.exits).toEqual({ east: 'start' })
  })

  it.each(PLACE_NAMES)('puts the %s place on the floor', (name) => {
    expect(isOnFloor(PLACES[name])).toBe(true)
  })
})

describe('distanceToWall (test helper)', () => {
  it('finds the walls straight ahead of the start', () => {
    // Straight east of the start is the hall's opening, then its east wall.
    expect(distanceToWall(ORIGIN, 'east')).toBeCloseTo(HALL_X)
    expect(distanceToWall(ORIGIN, 'south')).toBeCloseTo(-BACK_Z)
    // Straight west of the start is the nook's opening, then its back wall.
    expect(distanceToWall(ORIGIN, 'west')).toBeCloseTo(-NOOK_X)
  })
})

describe('wall view distance', () => {
  it.each([
    ['start', ['south']],
    ['nook', ['north', 'west', 'south']],
    ['sign', ['north', 'east', 'west']],
    ['hall', ['north', 'east']],
    ['hall-middle', ['east', 'west']],
    ['hall-end', ['east', 'south', 'west']],
  ] as const)('frames the %s with walls close by to the %j', (name, headings) => {
    const close = HEADINGS.filter((heading) => distanceToWall(PLACES[name], heading) <= CLOSE)
    expect([...close].sort()).toEqual([...headings].sort())
  })

  it.each(PLACE_NAMES)('puts every close wall straight ahead of the %s WALL_VIEW_DISTANCE away', (name) => {
    for (const heading of HEADINGS) {
      const distance = distanceToWall(PLACES[name], heading)
      if (distance > CLOSE) continue
      expect(distance).toBeCloseTo(WALL_VIEW_DISTANCE)
    }
  })

  it.each(PLACE_NAMES)('has a wall in every heading from the %s', (name) => {
    for (const heading of HEADINGS) expect(distanceToWall(PLACES[name], heading)).toBeLessThan(Infinity)
  })
})

describe('forwardFrom', () => {
  it.each([
    ['start', 'north', 'sign'],
    ['start', 'west', 'nook'],
    ['start', 'south', null],
    ['start', 'east', 'hall'],
    ['nook', 'north', null],
    ['nook', 'west', null],
    ['nook', 'south', null],
    ['nook', 'east', 'start'],
    ['sign', 'north', null],
    ['sign', 'west', null],
    ['sign', 'south', 'start'],
    ['sign', 'east', null],
    ['hall', 'north', null],
    ['hall', 'west', 'start'],
    ['hall', 'south', 'hall-middle'],
    ['hall', 'east', null],
    ['hall-middle', 'north', 'hall'],
    ['hall-middle', 'west', null],
    ['hall-middle', 'south', 'hall-end'],
    ['hall-middle', 'east', null],
    ['hall-end', 'north', 'hall-middle'],
    ['hall-end', 'west', null],
    ['hall-end', 'south', null],
    ['hall-end', 'east', null],
  ] as const)('from the %s facing %s leads to %s', (place, heading, expected) => {
    expect(forwardFrom(place, heading)).toBe(expected)
  })

  it.each(PLACE_NAMES)('returns from every exit of the %s by turning around and going forward', (name) => {
    for (const heading of HEADINGS) {
      const next = forwardFrom(name, heading)
      if (next === null) continue
      expect(forwardFrom(next, opposite(heading))).toBe(name)
    }
  })

  it.each(PLACE_NAMES)('moves from the %s in the direction it faces', (name) => {
    for (const heading of HEADINGS) {
      const next = forwardFrom(name, heading)
      if (next === null) continue
      const dx = PLACES[next].x - PLACES[name].x
      const dz = PLACES[next].z - PLACES[name].z
      const along = dx * DIRECTIONS[heading].x + dz * DIRECTIONS[heading].z
      const across = dx * DIRECTIONS[heading].z - dz * DIRECTIONS[heading].x
      expect(along).toBeGreaterThan(0)
      expect(across).toBeCloseTo(0)
    }
  })

  it.each(PLACE_NAMES)('keeps the straight path out of the %s on the floor', (name) => {
    for (const heading of HEADINGS) {
      const next = forwardFrom(name, heading)
      if (next === null) continue
      const from = PLACES[name]
      const to = PLACES[next]
      for (let i = 0; i <= 20; i++) {
        const t = i / 20
        expect(isOnFloor({ x: from.x + (to.x - from.x) * t, z: from.z + (to.z - from.z) * t })).toBe(true)
      }
    }
  })
})

describe('backFrom', () => {
  it.each([
    ['start', 'north', null],
    ['start', 'west', 'hall'],
    ['start', 'south', 'sign'],
    ['start', 'east', 'nook'],
    ['nook', 'north', null],
    ['nook', 'west', 'start'],
    ['nook', 'south', null],
    ['nook', 'east', null],
    ['sign', 'north', 'start'],
    ['sign', 'west', null],
    ['sign', 'south', null],
    ['sign', 'east', null],
    ['hall', 'north', 'hall-middle'],
    ['hall', 'east', 'start'],
    ['hall-middle', 'north', 'hall-end'],
    ['hall-middle', 'south', 'hall'],
    ['hall-middle', 'east', null],
    ['hall-end', 'north', null],
    ['hall-end', 'south', 'hall-middle'],
  ] as const)('from the %s facing %s leads to %s', (place, heading, expected) => {
    expect(backFrom(place, heading)).toBe(expected)
  })

  it.each(PLACE_NAMES)('goes where turning around and going forward from the %s would', (name) => {
    for (const heading of HEADINGS) expect(backFrom(name, heading)).toBe(forwardFrom(name, opposite(heading)))
  })

  it.each(['nook', 'sign', 'hall', 'hall-end'] as const)(
    'never leads both forward and back from the %s facing one way, as it is beside a wall',
    (name) => {
      for (const heading of HEADINGS) {
        expect(forwardFrom(name, heading) !== null && backFrom(name, heading) !== null).toBe(false)
      }
    },
  )
})
