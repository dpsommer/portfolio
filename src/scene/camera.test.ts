import { describe, expect, it } from 'vitest'
import {
  BACK_Z,
  CEILING_Y,
  FAR_WALL_SCALE,
  FAR_Z,
  FLOOR_Y,
  FOCAL_RATIO,
  NEAR,
  NOOK_FRONT_Z,
  NOOK_X,
  ROOM_HALF_WIDTH,
  clipToNearPlane,
  projectPoint,
  projectSegment,
  toCamera,
} from './camera.ts'
import type { Vec3 } from './camera.ts'

const WIDTH = 320
const HEIGHT = 240

const vec = (x: number, y: number, z: number): Vec3 => ({ x, y, z })

function expectVecClose(actual: Vec3, expected: Vec3) {
  expect(actual.x).toBeCloseTo(expected.x)
  expect(actual.y).toBeCloseTo(expected.y)
  expect(actual.z).toBeCloseTo(expected.z)
}

describe('constants', () => {
  it('uses the documented focal ratio and far wall scale', () => {
    expect(FOCAL_RATIO).toBe(0.8)
    expect(FAR_WALL_SCALE).toBe(0.45)
  })

  it('makes the room 2 wide with floor and ceiling in a 3:4 ratio to it', () => {
    expect(ROOM_HALF_WIDTH).toBe(1)
    expect(FLOOR_Y).toBe(-0.75)
    expect(CEILING_Y).toBe(0.75)
  })

  it('puts the far wall in front of the camera and the back wall behind it', () => {
    expect(FAR_Z).toBeGreaterThan(NEAR)
    expect(BACK_Z).toBeLessThan(0)
  })

  it('puts the nook left of the main room, running from behind the start to in front of it', () => {
    expect(NOOK_X).toBeLessThan(-ROOM_HALF_WIDTH)
    expect(BACK_Z).toBeLessThan(0)
    expect(NOOK_FRONT_Z).toBeGreaterThan(0)
    expect(NOOK_FRONT_Z).toBeLessThan(FAR_Z)
  })
})

describe('toCamera', () => {
  it('is the identity at yaw 0', () => {
    expectVecClose(toCamera(vec(0.3, -0.2, 1.5), 0), vec(0.3, -0.2, 1.5))
  })

  it('maps west straight ahead when turned left a quarter turn', () => {
    expectVecClose(toCamera(vec(-1, 0, 0), Math.PI / 2), vec(0, 0, 1))
  })

  it('maps north to the camera\'s right when turned left a quarter turn', () => {
    expectVecClose(toCamera(vec(0, 0, 1), Math.PI / 2), vec(1, 0, 0))
  })

  it('maps east straight ahead when turned right a quarter turn', () => {
    expectVecClose(toCamera(vec(1, 0, 0), -Math.PI / 2), vec(0, 0, 1))
  })

  it('maps south straight ahead when turned half way round', () => {
    expectVecClose(toCamera(vec(0, 0, -1), Math.PI), vec(0, 0, 1))
  })

  it('leaves the height unchanged', () => {
    expect(toCamera(vec(0.4, 0.6, 0.9), 1.234).y).toBe(0.6)
  })
})

describe('projectPoint', () => {
  it('puts points straight ahead at the canvas centre', () => {
    expect(projectPoint(vec(0, 0, 3), WIDTH, HEIGHT)).toEqual({ x: WIDTH / 2, y: HEIGHT / 2 })
  })

  it('maps the near floor/right wall edge point to the bottom-right corner', () => {
    const p = projectPoint(vec(1, FLOOR_Y, FOCAL_RATIO), WIDTH, HEIGHT)
    expect(p.x).toBeCloseTo(WIDTH)
    expect(p.y).toBeCloseTo(HEIGHT)
  })

  it('maps the near ceiling/left wall edge point to the top-left corner', () => {
    const p = projectPoint(vec(-1, CEILING_Y, FOCAL_RATIO), WIDTH, HEIGHT)
    expect(p.x).toBeCloseTo(0)
    expect(p.y).toBeCloseTo(0)
  })

  it('places the far wall corners on a centred rect FAR_WALL_SCALE the view size', () => {
    const topLeft = projectPoint(vec(-ROOM_HALF_WIDTH, CEILING_Y, FAR_Z), WIDTH, HEIGHT)
    const bottomRight = projectPoint(vec(ROOM_HALF_WIDTH, FLOOR_Y, FAR_Z), WIDTH, HEIGHT)
    expect(bottomRight.x - topLeft.x).toBeCloseTo(WIDTH * FAR_WALL_SCALE)
    expect(bottomRight.y - topLeft.y).toBeCloseTo(HEIGHT * FAR_WALL_SCALE)
    expect((topLeft.x + bottomRight.x) / 2).toBeCloseTo(WIDTH / 2)
    expect((topLeft.y + bottomRight.y) / 2).toBeCloseTo(HEIGHT / 2)
  })

  it('scales with the canvas size', () => {
    const small = projectPoint(vec(0.5, 0.25, 2), WIDTH, HEIGHT)
    const large = projectPoint(vec(0.5, 0.25, 2), WIDTH * 2, HEIGHT * 2)
    expect(large.x).toBeCloseTo(small.x * 2)
    expect(large.y).toBeCloseTo(small.y * 2)
  })

  it('draws points above eye level higher up the canvas', () => {
    expect(projectPoint(vec(0, 0.5, 2), WIDTH, HEIGHT).y).toBeLessThan(HEIGHT / 2)
  })
})

describe('clipToNearPlane', () => {
  it('returns null when both ends are behind the near plane', () => {
    expect(clipToNearPlane(vec(0, 0, -1), vec(1, 0, NEAR / 2))).toBeNull()
  })

  it('returns the segment unchanged when both ends are in front', () => {
    const a = vec(0, 0, 1)
    const b = vec(1, 1, 2)
    const clipped = clipToNearPlane(a, b)
    expect(clipped).not.toBeNull()
    expect(clipped![0]).toBe(a)
    expect(clipped![1]).toBe(b)
  })

  it('keeps a segment that ends exactly on the near plane', () => {
    const a = vec(0, 0, NEAR)
    const b = vec(0, 0, 1)
    expect(clipToNearPlane(a, b)).toEqual([a, b])
  })

  it('cuts the start at the near plane when the start is behind', () => {
    const clipped = clipToNearPlane(vec(-1, 0, -0.9), vec(1, 2, 1.1))
    expect(clipped).not.toBeNull()
    const [cut, end] = clipped!
    expectVecClose(cut, vec(0, 1, NEAR))
    expect(end).toEqual(vec(1, 2, 1.1))
  })

  it('cuts the end at the near plane when the end is behind', () => {
    const clipped = clipToNearPlane(vec(1, 2, 1.1), vec(-1, 0, -0.9))
    expect(clipped).not.toBeNull()
    const [start, cut] = clipped!
    expect(start).toEqual(vec(1, 2, 1.1))
    expectVecClose(cut, vec(0, 1, NEAR))
  })
})

describe('projectSegment', () => {
  it('returns null for a segment behind the camera', () => {
    expect(projectSegment(vec(-1, 0, -1), vec(1, 0, -2), 0, WIDTH, HEIGHT)).toBeNull()
  })

  it('returns null for a segment in front once the camera faces away', () => {
    expect(projectSegment(vec(-1, 0, 2), vec(1, 0, 2), Math.PI, WIDTH, HEIGHT)).toBeNull()
  })

  it('projects both ends of a segment in front of the camera', () => {
    const a = vec(-1, CEILING_Y, FAR_Z)
    const b = vec(1, FLOOR_Y, FAR_Z)
    expect(projectSegment(a, b, 0, WIDTH, HEIGHT)).toEqual([
      projectPoint(a, WIDTH, HEIGHT),
      projectPoint(b, WIDTH, HEIGHT),
    ])
  })

  it('rotates the segment by the yaw before projecting', () => {
    // Turned left a quarter turn, a point due west is straight ahead.
    const projected = projectSegment(vec(-2, 0, 0), vec(-3, 0, 0), Math.PI / 2, WIDTH, HEIGHT)
    expect(projected).not.toBeNull()
    for (const p of projected!) {
      expect(p.x).toBeCloseTo(WIDTH / 2)
      expect(p.y).toBeCloseTo(HEIGHT / 2)
    }
  })

  it('clips a segment crossing the camera plane to finite screen points', () => {
    const projected = projectSegment(vec(1, FLOOR_Y, BACK_Z), vec(1, FLOOR_Y, FAR_Z), 0, WIDTH, HEIGHT)
    expect(projected).not.toBeNull()
    for (const p of projected!) {
      expect(Number.isFinite(p.x)).toBe(true)
      expect(Number.isFinite(p.y)).toBe(true)
    }
  })
})
