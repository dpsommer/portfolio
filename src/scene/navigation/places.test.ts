import { describe, expect, it } from 'vitest'
import { BACK_Z, FAR_Z, NOOK_X, ORIGIN, ROOM_HALF_WIDTH, SIGN_STEP, WALL_VIEW_DISTANCE } from '../core/camera.ts'
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
  it('has the start, the nook and the place in front of the sign', () => {
    expect([...PLACE_NAMES].sort()).toEqual(['nook', 'sign', 'start'])
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

  it('leads west from the start to the nook and north to the sign', () => {
    expect(PLACES.start.exits).toEqual({ west: 'nook', north: 'sign' })
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
    expect(distanceToWall(ORIGIN, 'east')).toBeCloseTo(ROOM_HALF_WIDTH)
    expect(distanceToWall(ORIGIN, 'south')).toBeCloseTo(-BACK_Z)
    // Straight west of the start is the nook's opening, then its back wall.
    expect(distanceToWall(ORIGIN, 'west')).toBeCloseTo(-NOOK_X)
  })
})

describe('wall view distance', () => {
  it.each([
    ['start', ['east', 'south']],
    ['nook', ['north', 'west', 'south']],
    ['sign', ['north', 'east', 'west']],
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
    ['start', 'east', null],
    ['nook', 'north', null],
    ['nook', 'west', null],
    ['nook', 'south', null],
    ['nook', 'east', 'start'],
    ['sign', 'north', null],
    ['sign', 'west', null],
    ['sign', 'south', 'start'],
    ['sign', 'east', null],
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
    ['start', 'west', null],
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
  ] as const)('from the %s facing %s leads to %s', (place, heading, expected) => {
    expect(backFrom(place, heading)).toBe(expected)
  })

  it.each(PLACE_NAMES)('goes where turning around and going forward from the %s would', (name) => {
    for (const heading of HEADINGS) expect(backFrom(name, heading)).toBe(forwardFrom(name, opposite(heading)))
  })

  it.each(PLACE_NAMES)('never leads both forward and back from the %s facing one way', (name) => {
    for (const heading of HEADINGS) {
      expect(forwardFrom(name, heading) !== null && backFrom(name, heading) !== null).toBe(false)
    }
  })
})
