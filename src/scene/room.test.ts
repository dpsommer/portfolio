import { describe, expect, it, vi } from 'vitest'
import {
  BACK_Z,
  CEILING_Y,
  FAR_Z,
  FLOOR_Y,
  FOCAL_RATIO,
  NOOK_FRONT_Z,
  NOOK_X,
  ORIGIN,
  ROOM_HALF_WIDTH,
  WALL_VIEW_DISTANCE,
} from './camera.ts'
import type { FloorPoint } from './camera.ts'
import { MIRROR_BOUNDS, isOnGlass } from './mirror.ts'
import type { MirrorPoint } from './mirror.ts'
import { FOREGROUND, FOREGROUND_DIM, FOREGROUND_WORN } from './palette.ts'
import { PLACES } from './places.ts'
import { GLASS_CELLS, PREVIEW_COLOURS, PREVIEW_HEIGHT, PREVIEW_WIDTH } from './preview.ts'
import type { Shimmer } from './preview.ts'
import { PULL_BOUNDS, PULL_S, isOnPull } from './pull.ts'
import {
  FLOOR_PLAN,
  MIRROR_WALL,
  WALLS,
  isOnFloor,
  isVisible,
  mirrorPixels,
  previewPixels,
  pullPixels,
  ripplePixels,
  roomPixels,
  screenToMirror,
  screenToWall,
} from './room.ts'
import type { WallName } from './room.ts'
import { rippleDuration, rippleRings } from './ripple.ts'
import type { Pixel } from './types.ts'

// rippleRings passes through, so tests can feed ripplePixels set rings with mockReturnValueOnce.
vi.mock('./ripple.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./ripple.ts')>()
  return { ...actual, rippleRings: vi.fn(actual.rippleRings) }
})

const WIDTH = 320
const HEIGHT = 240
// Focal length in pixels at 320 wide (128).
const FOCAL = (FOCAL_RATIO * WIDTH) / 2
// Screen column of a point `across` units right of the view's centre line, `depth` ahead.
const columnAt = (across: number, depth: number) => Math.round(WIDTH / 2 + (FOCAL * across) / depth)
// Screen row of a point at height `y` (relative to the eye), `depth` ahead.
const rowAt = (y: number, depth: number) => Math.round(HEIGHT / 2 - (FOCAL * y) / depth)

// The far wall's rect facing north at 320x240: FAR_WALL_SCALE (0.45) of the view, centred.
const FAR_WALL = { left: 88, top: 66, right: 232, bottom: 174 }

// Walls in floor plan order, clockwise seen from above.
const WALL_ORDER: WallName[] = ['north', 'east', 'south', 'nook-back', 'nook-side', 'west']

const key = (p: { x: number; y: number }) => `${p.x},${p.y}`
// The distinct pixels drawn, ignoring order and duplicates.
const pixelSet = (pixels: Pixel[]) => new Set(pixels.map((p) => `${key(p)},${p.colour}`))
const wallEnd = ({ start, along, length }: (typeof WALLS)[WallName]) => ({
  x: start.x + along.x * length,
  z: start.z + along.z * length,
})
const worn = (pixels: Pixel[]) => pixels.filter((p) => p.colour === FOREGROUND_WORN)
const dim = (pixels: Pixel[]) => pixels.filter((p) => p.colour === FOREGROUND_DIM)

// Distinct rows drawn in worn pixels within the given columns.
function wornRowsIn(pixels: Pixel[], minX: number, maxX: number): Set<number> {
  return new Set(worn(pixels).filter((p) => p.x >= minX && p.x <= maxX).map((p) => p.y))
}

// Columns whose worn pixels cover many rows: the box's vertical corner edges.
function verticalEdgeColumns(pixels: Pixel[], minRows: number): number[] {
  const rowsByColumn = new Map<number, Set<number>>()
  for (const p of worn(pixels)) {
    const rows = rowsByColumn.get(p.x) ?? new Set<number>()
    rows.add(p.y)
    rowsByColumn.set(p.x, rows)
  }
  return [...rowsByColumn].filter(([, rows]) => rows.size >= minRows).map(([x]) => x)
}

// Rows whose worn pixels cover many columns: the box's horizontal floor and ceiling edges.
function horizontalEdgeRows(pixels: Pixel[], minColumns: number): number[] {
  const columnsByRow = new Map<number, Set<number>>()
  for (const p of worn(pixels)) {
    const columns = columnsByRow.get(p.y) ?? new Set<number>()
    columns.add(p.x)
    columnsByRow.set(p.y, columns)
  }
  return [...columnsByRow].filter(([, columns]) => columns.size >= minColumns).map(([y]) => y)
}

const sorted = (values: number[]) => [...values].sort((a, b) => a - b)

// Fraction of `pixels` that have a pixel of the same colour in `other` within `distance`.
function fractionNear(pixels: Pixel[], other: Pixel[], distance: number): number {
  const others = new Set(other.map((p) => `${key(p)},${p.colour}`))
  const near = pixels.filter((p) => {
    for (let dx = -distance; dx <= distance; dx++) {
      for (let dy = -distance; dy <= distance; dy++) {
        if (others.has(`${p.x + dx},${p.y + dy},${p.colour}`)) return true
      }
    }
    return false
  })
  return near.length / pixels.length
}

// The inclusive extent of a set of pixels.
const extent = (pixels: Pixel[]) => ({
  left: Math.min(...pixels.map((p) => p.x)),
  top: Math.min(...pixels.map((p) => p.y)),
  right: Math.max(...pixels.map((p) => p.x)),
  bottom: Math.max(...pixels.map((p) => p.y)),
})

describe('FLOOR_PLAN', () => {
  it('lists the corners clockwise from the far wall\'s left end, around the nook', () => {
    expect(FLOOR_PLAN).toEqual([
      { x: -ROOM_HALF_WIDTH, z: FAR_Z },
      { x: ROOM_HALF_WIDTH, z: FAR_Z },
      { x: ROOM_HALF_WIDTH, z: BACK_Z },
      { x: NOOK_X, z: BACK_Z },
      { x: NOOK_X, z: NOOK_FRONT_Z },
      { x: -ROOM_HALF_WIDTH, z: NOOK_FRONT_Z },
    ])
  })
})

describe('WALLS', () => {
  it('has one wall per side of the floor plan', () => {
    expect(Object.keys(WALLS).sort()).toEqual([...WALL_ORDER].sort())
  })

  it('starts each wall at its corner of the floor plan', () => {
    WALL_ORDER.forEach((name, i) => {
      expect(WALLS[name].start.x).toBeCloseTo(FLOOR_PLAN[i].x)
      expect(WALLS[name].start.z).toBeCloseTo(FLOOR_PLAN[i].z)
    })
  })

  it('places each wall on its side of the room', () => {
    expect(WALLS.north.start.z).toBe(FAR_Z)
    expect(WALLS.east.start.x).toBe(ROOM_HALF_WIDTH)
    expect(WALLS.south.start.z).toBe(BACK_Z)
    expect(WALLS['nook-back'].start.x).toBe(NOOK_X)
    expect(WALLS['nook-side'].start.z).toBe(NOOK_FRONT_Z)
    expect(WALLS.west.start.x).toBe(-ROOM_HALF_WIDTH)
  })

  it('starts every wall at the ceiling', () => {
    for (const wall of Object.values(WALLS)) expect(wall.start.y).toBe(CEILING_Y)
  })

  it('gives each wall the length of its side of the floor plan', () => {
    expect(WALLS.north.length).toBeCloseTo(2 * ROOM_HALF_WIDTH)
    expect(WALLS.east.length).toBeCloseTo(FAR_Z - BACK_Z)
    expect(WALLS.south.length).toBeCloseTo(ROOM_HALF_WIDTH - NOOK_X)
    expect(WALLS['nook-back'].length).toBeCloseTo(NOOK_FRONT_Z - BACK_Z)
    expect(WALLS['nook-side'].length).toBeCloseTo(-ROOM_HALF_WIDTH - NOOK_X)
    expect(WALLS.west.length).toBeCloseTo(FAR_Z - NOOK_FRONT_Z)
  })

  it('runs the nook walls from the back wall round to the main room\'s left wall', () => {
    expect(wallEnd(WALLS.south).x).toBeCloseTo(NOOK_X)
    expect(WALLS['nook-back'].along).toEqual({ x: 0, y: 0, z: 1 })
    expect(WALLS['nook-side'].along).toEqual({ x: 1, y: 0, z: 0 })
    expect(WALLS.west.start.z).toBe(NOOK_FRONT_Z)
  })

  it('gives each wall a horizontal unit vector along it', () => {
    for (const { along } of Object.values(WALLS)) {
      expect(along.y).toBe(0)
      expect(Math.hypot(along.x, along.z)).toBeCloseTo(1)
    }
  })

  it('ends each wall where the next one clockwise begins', () => {
    WALL_ORDER.forEach((name, i) => {
      const end = wallEnd(WALLS[name])
      const next = WALLS[WALL_ORDER[(i + 1) % WALL_ORDER.length]].start
      expect(end.x).toBeCloseTo(next.x)
      expect(end.z).toBeCloseTo(next.z)
    })
  })

  it.each(WALL_ORDER)('has the floor on the %s wall\'s inner side and none on its outer side', (name) => {
    // Running clockwise seen from above, the room is on each wall's right: its
    // inward normal is `along` turned a quarter turn clockwise.
    const { start, along, length } = WALLS[name]
    const middle = { x: start.x + (along.x * length) / 2, z: start.z + (along.z * length) / 2 }
    const inward = { x: along.z, z: -along.x }
    const step = 0.01
    expect(isOnFloor({ x: middle.x + inward.x * step, z: middle.z + inward.z * step })).toBe(true)
    expect(isOnFloor({ x: middle.x - inward.x * step, z: middle.z - inward.z * step })).toBe(false)
  })
})

describe('isOnFloor', () => {
  it('includes the camera position', () => {
    expect(isOnFloor({ x: 0, z: 0 })).toBe(true)
  })

  it('includes the middle of the main room', () => {
    expect(isOnFloor({ x: 0, z: (FAR_Z + BACK_Z) / 2 })).toBe(true)
  })

  it('includes the inside of the nook', () => {
    expect(isOnFloor({ x: -1.5, z: 0 })).toBe(true)
  })

  it('excludes the space behind the nook\'s side wall', () => {
    expect(isOnFloor({ x: -1.5, z: 1.5 })).toBe(false)
  })

  it.each([
    ['north', { x: 0, z: FAR_Z + 0.1 }],
    ['east', { x: ROOM_HALF_WIDTH + 0.1, z: 0 }],
    ['south', { x: 0, z: BACK_Z - 0.1 }],
    ['south, behind the nook', { x: -1.5, z: BACK_Z - 0.1 }],
    ['the nook\'s back', { x: NOOK_X - 0.1, z: 0 }],
    ['west', { x: -ROOM_HALF_WIDTH - 0.1, z: (NOOK_FRONT_Z + FAR_Z) / 2 }],
  ])('excludes points beyond the %s wall', (_, point) => {
    expect(isOnFloor(point)).toBe(false)
  })

  it('excludes points far outside the room', () => {
    expect(isOnFloor({ x: 10, z: 10 })).toBe(false)
    expect(isOnFloor({ x: -10, z: 0 })).toBe(false)
  })
})

// The nook's place: WALL_VIEW_DISTANCE in front of the nook's back wall, level with the start.
const NOOK_EYE: FloorPoint = { x: PLACES.nook.x, z: PLACES.nook.z }

// Evenly spaced points along a wall, including both ends.
function pointsAlong(name: WallName, count = 20): FloorPoint[] {
  const { start, along, length } = WALLS[name]
  return Array.from({ length: count + 1 }, (_, i) => ({
    x: start.x + (along.x * length * i) / count,
    z: start.z + (along.z * length * i) / count,
  }))
}

describe('isVisible', () => {
  describe('from the start', () => {
    it.each(WALL_ORDER)('sees every point on the %s wall', (name) => {
      for (const point of pointsAlong(name)) expect(isVisible(point, ORIGIN)).toBe(true)
    })

    it('sees every corner of the floor plan', () => {
      for (const corner of FLOOR_PLAN) expect(isVisible(corner, ORIGIN)).toBe(true)
    })

    it('sees the nook\'s floor', () => {
      for (const x of [-1.9, -1.5, -1.1]) {
        for (const z of [-0.9, 0, 0.9]) expect(isVisible({ x, z }, ORIGIN)).toBe(true)
      }
    })

    it('sees the main room\'s floor', () => {
      for (const x of [-0.9, 0, 0.9]) {
        for (const z of [-0.9, 0.5, FAR_Z - 0.1]) expect(isVisible({ x, z }, ORIGIN)).toBe(true)
      }
    })

    it('sees its own position', () => {
      expect(isVisible(ORIGIN, ORIGIN)).toBe(true)
    })

    it('does not see a point behind the main room\'s left wall', () => {
      expect(isVisible({ x: -1.5, z: 2 }, ORIGIN)).toBe(false)
    })

    it('does not see points outside the room beyond the far and right walls', () => {
      expect(isVisible({ x: 0, z: FAR_Z + 0.5 }, ORIGIN)).toBe(false)
      expect(isVisible({ x: ROOM_HALF_WIDTH + 0.5, z: 0 }, ORIGIN)).toBe(false)
    })
  })

  describe('from the nook', () => {
    it('does not see the main room\'s left wall behind the nook\'s side wall', () => {
      for (let z = 1.2; z <= FAR_Z; z += 0.1) {
        expect(isVisible({ x: -ROOM_HALF_WIDTH, z }, NOOK_EYE)).toBe(false)
      }
      expect(isVisible({ x: -ROOM_HALF_WIDTH, z: FAR_Z }, NOOK_EYE)).toBe(false)
    })

    it('does not see the left end of the far wall', () => {
      expect(isVisible({ x: -0.9, z: FAR_Z }, NOOK_EYE)).toBe(false)
      expect(isVisible({ x: -ROOM_HALF_WIDTH, z: FAR_Z }, NOOK_EYE)).toBe(false)
    })

    it('sees the right part of the far wall', () => {
      expect(isVisible({ x: 0.5, z: FAR_Z }, NOOK_EYE)).toBe(true)
      expect(isVisible({ x: ROOM_HALF_WIDTH, z: FAR_Z }, NOOK_EYE)).toBe(true)
    })

    it('sees the far wall just right of where the nook\'s side wall stops hiding it', () => {
      // The sight line past the nook's front corner (-1, 1) meets the far wall at
      // x = eye.x + (corner.x - eye.x) * FAR_Z / corner.z.
      const edge = NOOK_EYE.x + (-ROOM_HALF_WIDTH - NOOK_EYE.x) * FAR_Z / NOOK_FRONT_Z
      expect(isVisible({ x: edge - 0.01, z: FAR_Z }, NOOK_EYE)).toBe(false)
      expect(isVisible({ x: edge + 0.01, z: FAR_Z }, NOOK_EYE)).toBe(true)
    })

    it.each([
      ['back', { x: NOOK_X, z: BACK_Z }],
      ['front', { x: NOOK_X, z: NOOK_FRONT_Z }],
      ['front-right', { x: -ROOM_HALF_WIDTH, z: NOOK_FRONT_Z }],
    ])('sees the nook\'s %s corner', (_, corner) => {
      expect(isVisible(corner, NOOK_EYE)).toBe(true)
    })

    it.each(['nook-back', 'nook-side', 'south', 'east'] as const)('sees every point on the %s wall', (name) => {
      for (const point of pointsAlong(name)) expect(isVisible(point, NOOK_EYE)).toBe(true)
    })

    it('sees the sign\'s position', () => {
      expect(isVisible({ x: 0, z: 1.14 }, NOOK_EYE)).toBe(true)
    })

    it('sees the start', () => {
      expect(isVisible(ORIGIN, NOOK_EYE)).toBe(true)
    })
  })

  it('is symmetric between points on the open floor', () => {
    const points: FloorPoint[] = [ORIGIN, NOOK_EYE, { x: -1.8, z: 0.8 }, { x: -0.5, z: 1.6 }, { x: 0.8, z: -0.8 }]
    for (const a of points) {
      for (const b of points) expect(isVisible(a, b)).toBe(isVisible(b, a))
    }
  })
})

describe('roomPixels', () => {
  it('is deterministic', () => {
    expect(roomPixels(WIDTH, HEIGHT)).toEqual(roomPixels(WIDTH, HEIGHT))
  })

  it('defaults to facing north', () => {
    expect(roomPixels(WIDTH, HEIGHT)).toEqual(roomPixels(WIDTH, HEIGHT, 0))
  })

  it.each([0, Math.PI / 2, Math.PI])('defaults the eye to the start at yaw %f', (yaw) => {
    expect(roomPixels(WIDTH, HEIGHT, yaw)).toEqual(roomPixels(WIDTH, HEIGHT, yaw, ORIGIN))
  })

  it.each([
    [WIDTH, HEIGHT, 0],
    [WIDTH, HEIGHT, 0.3],
    [WIDTH, HEIGHT, Math.PI / 2],
    [WIDTH, HEIGHT, Math.PI],
    [WIDTH, HEIGHT, (3 * Math.PI) / 2],
    [640, 480, 0],
    [640, 480, Math.PI / 2],
  ])('uses integer coordinates within a %ix%i canvas at yaw %f', (width, height, yaw) => {
    const pixels = roomPixels(width, height, yaw)
    expect(pixels.length).toBeGreaterThan(0)
    for (const { x, y } of pixels) {
      expect(Number.isInteger(x)).toBe(true)
      expect(Number.isInteger(y)).toBe(true)
      expect(x).toBeGreaterThanOrEqual(0)
      expect(x).toBeLessThan(width)
      expect(y).toBeGreaterThanOrEqual(0)
      expect(y).toBeLessThan(height)
    }
  })

  it.each([0, 0.3, Math.PI / 2, Math.PI, (3 * Math.PI) / 2])('only uses the dim and worn colours at yaw %f', (yaw) => {
    for (const { colour } of roomPixels(WIDTH, HEIGHT, yaw)) {
      expect([FOREGROUND_DIM, FOREGROUND_WORN]).toContain(colour)
    }
  })

  it('is the same after a full turn', () => {
    // Float rounding can change the order and duplication of pixels, but not which are drawn.
    expect(pixelSet(roomPixels(WIDTH, HEIGHT, 2 * Math.PI))).toEqual(pixelSet(roomPixels(WIDTH, HEIGHT, 0)))
  })

  it('is the same for a quarter turn left and three quarter turns right', () => {
    expect(pixelSet(roomPixels(WIDTH, HEIGHT, -(3 * Math.PI) / 2))).toEqual(pixelSet(roomPixels(WIDTH, HEIGHT, Math.PI / 2)))
  })

  it('looks different facing each direction', () => {
    const views = [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2].map((yaw) =>
      JSON.stringify(roomPixels(WIDTH, HEIGHT, yaw)),
    )
    expect(new Set(views).size).toBe(4)
  })

  describe('facing north', () => {
    const pixels = roomPixels(WIDTH, HEIGHT, 0)

    it.each([
      ['left', FAR_WALL.left],
      ['right', FAR_WALL.right],
    ])('draws the far wall\'s %s edge as a worn vertical line', (_, x) => {
      const rows = [...wornRowsIn(pixels, x - 1, x + 1)].filter((y) => y >= FAR_WALL.top && y <= FAR_WALL.bottom)
      expect(rows.length).toBeGreaterThan((FAR_WALL.bottom - FAR_WALL.top) / 2)
    })

    it.each([
      ['top', FAR_WALL.top],
      ['bottom', FAR_WALL.bottom],
    ])('draws the far wall\'s %s edge as a worn horizontal line', (_, y) => {
      const columns = new Set(
        worn(pixels)
          .filter((p) => Math.abs(p.y - y) <= 1 && p.x >= FAR_WALL.left && p.x <= FAR_WALL.right)
          .map((p) => p.x),
      )
      expect(columns.size).toBeGreaterThan((FAR_WALL.right - FAR_WALL.left) / 2)
    })

    it('runs worn edges into each corner region outside the far wall', () => {
      const quadrants = [
        (p: Pixel) => p.x < FAR_WALL.left - 10 && p.y < FAR_WALL.top - 10,
        (p: Pixel) => p.x > FAR_WALL.right + 10 && p.y < FAR_WALL.top - 10,
        (p: Pixel) => p.x < FAR_WALL.left - 10 && p.y > FAR_WALL.bottom + 10,
        (p: Pixel) => p.x > FAR_WALL.right + 10 && p.y > FAR_WALL.bottom + 10,
      ]
      for (const inQuadrant of quadrants) {
        expect(worn(pixels).filter(inQuadrant).length).toBeGreaterThan(10)
      }
    })

    // The nook's front corner (-1, *, NOOK_FRONT_Z) is 1 left and 1 ahead: 160 - 128.
    const NOOK_CORNER_X = 32

    it('draws the nook\'s front corner as a tall worn vertical edge near the left of the view', () => {
      expect(Math.round(WIDTH / 2 - ROOM_HALF_WIDTH * 0.8 * (WIDTH / 2) / NOOK_FRONT_Z)).toBe(NOOK_CORNER_X)
      const rows = [...wornRowsIn(pixels, NOOK_CORNER_X - 1, NOOK_CORNER_X + 1)].filter((y) => y >= 24 && y <= 216)
      expect(rows.length).toBeGreaterThan(HEIGHT * 0.4)
    })

    it('has no tall vertical edges other than the far wall\'s and the nook corner', () => {
      for (const x of verticalEdgeColumns(pixels, HEIGHT * 0.25)) {
        expect([FAR_WALL.left, FAR_WALL.right, NOOK_CORNER_X].some((edge) => Math.abs(x - edge) <= 1)).toBe(true)
      }
    })

    it('draws the right-hand corner edges along the diagonals to the view corners', () => {
      // The right wall's edges run from the far wall's corners to the view's corners,
      // so in the corner regions worn pixels sit near the line through the canvas centre.
      const corners = worn(pixels).filter(
        (p) => p.x > FAR_WALL.right + 10 && (p.y < FAR_WALL.top - 10 || p.y > FAR_WALL.bottom + 10),
      )
      expect(corners.length).toBeGreaterThan(0)
      for (const p of corners) {
        const expectedY = HEIGHT / 2 + (p.x - WIDTH / 2) * (HEIGHT / WIDTH) * Math.sign(p.y - HEIGHT / 2)
        expect(Math.abs(p.y - expectedY)).toBeLessThanOrEqual(2)
      }
    })

    it('draws the left-hand edges from the far wall\'s corners to the nook corner', () => {
      // The left wall now ends at the nook corner, at (32, 24) and (32, 216), which
      // still lie on the diagonals through the canvas centre.
      const corners = worn(pixels).filter(
        (p) => p.x > NOOK_CORNER_X + 1 && p.x < FAR_WALL.left - 10 && (p.y < FAR_WALL.top - 10 || p.y > FAR_WALL.bottom + 10),
      )
      expect(corners.length).toBeGreaterThan(0)
      for (const p of corners) {
        const expectedY = HEIGHT / 2 - (p.x - WIDTH / 2) * (HEIGHT / WIDTH) * Math.sign(p.y - HEIGHT / 2)
        expect(Math.abs(p.y - expectedY)).toBeLessThanOrEqual(2)
      }
    })

    it('draws the nook\'s side wall edges as horizontal lines left of the nook corner', () => {
      // The nook's side wall is face-on, 1 away: floor and ceiling at 120 ± 96.
      const left = worn(pixels).filter((p) => p.x < NOOK_CORNER_X - 1)
      expect(left.length).toBeGreaterThan(0)
      for (const p of left) expect([24, 216].some((y) => Math.abs(p.y - y) <= 1)).toBe(true)
    })

    it('draws some floor detail below the far wall', () => {
      expect(dim(pixels).filter((p) => p.y > FAR_WALL.bottom + 2).length).toBeGreaterThan(0)
    })

    it('draws some brick detail on the far wall', () => {
      const onFarWall = dim(pixels).filter(
        (p) => p.x > FAR_WALL.left + 1 && p.x < FAR_WALL.right - 1 && p.y > FAR_WALL.top + 1 && p.y < FAR_WALL.bottom - 1,
      )
      expect(onFarWall.length).toBeGreaterThan(0)
    })

    it('scales with the canvas size', () => {
      const large = roomPixels(640, 480, 0)
      const rows = [...wornRowsIn(large, FAR_WALL.left * 2 - 1, FAR_WALL.left * 2 + 1)].filter(
        (y) => y >= FAR_WALL.top * 2 && y <= FAR_WALL.bottom * 2,
      )
      expect(rows.length).toBeGreaterThan(FAR_WALL.bottom - FAR_WALL.top)
    })
  })

  describe('facing west', () => {
    const pixels = roomPixels(WIDTH, HEIGHT, Math.PI / 2)
    // The nook's back wall is -NOOK_X (7/3) away, from z BACK_Z on the left to
    // NOOK_FRONT_Z on the right: 160 ± 128 * 3/7 across and 120 ± 96 * 3/7 down.
    const NOOK = {
      left: columnAt(BACK_Z, -NOOK_X),
      top: rowAt(CEILING_Y, -NOOK_X),
      right: columnAt(NOOK_FRONT_Z, -NOOK_X),
      bottom: rowAt(FLOOR_Y, -NOOK_X),
    }
    // The main room's left wall starts at (-1, NOOK_FRONT_Z): 1 right at distance 1.
    const WEST_CORNER_X = columnAt(NOOK_FRONT_Z, ROOM_HALF_WIDTH)

    it('draws the nook back wall\'s corners as worn vertical edges', () => {
      expect(NOOK).toEqual({ left: 105, top: 79, right: 215, bottom: 161 })
      for (const x of [NOOK.left, NOOK.right]) {
        const rows = [...wornRowsIn(pixels, x - 1, x + 1)].filter((y) => y >= NOOK.top && y <= NOOK.bottom)
        expect(rows.length).toBeGreaterThan((NOOK.bottom - NOOK.top) / 2)
      }
    })

    it.each([
      ['ceiling', NOOK.top],
      ['floor', NOOK.bottom],
    ])('draws the nook back wall\'s %s edge as a worn horizontal line', (_, y) => {
      const columns = new Set(
        worn(pixels)
          .filter((p) => Math.abs(p.y - y) <= 1 && p.x >= NOOK.left && p.x <= NOOK.right)
          .map((p) => p.x),
      )
      expect(columns.size).toBeGreaterThan((NOOK.right - NOOK.left) / 2)
    })

    it('draws the main room\'s left wall corner as a tall worn vertical edge', () => {
      expect(WEST_CORNER_X).toBe(288)
      expect(wornRowsIn(pixels, WEST_CORNER_X - 1, WEST_CORNER_X + 1).size).toBeGreaterThan(HEIGHT * 0.4)
    })

    it('has no other tall vertical edges, since the far wall is out of view', () => {
      for (const x of verticalEdgeColumns(pixels, HEIGHT * 0.25)) {
        expect([NOOK.left, NOOK.right, WEST_CORNER_X].some((edge) => Math.abs(x - edge) <= 1)).toBe(true)
      }
    })

    it('draws the main room\'s left wall face-on, with its floor and ceiling edges horizontal', () => {
      // The wall is parallel to the view, 1 unit away: floor and ceiling at 120 ± 96.
      // Only a short stretch is in view, so allow for the gaps in the broken edges.
      for (const y of [rowAt(CEILING_Y, ROOM_HALF_WIDTH), rowAt(FLOOR_Y, ROOM_HALF_WIDTH)]) {
        const columns = new Set(
          worn(pixels)
            .filter((p) => Math.abs(p.y - y) <= 1 && p.x > WEST_CORNER_X)
            .map((p) => p.x),
        )
        expect(columns.size).toBeGreaterThan((WIDTH - WEST_CORNER_X) / 3)
      }
    })

    it('draws floor detail inside the nook', () => {
      const inNook = dim(pixels).filter((p) => p.x > NOOK.left && p.x < NOOK.right && p.y > NOOK.bottom + 1)
      expect(inNook.length).toBeGreaterThan(0)
    })

    it('draws no flagstone along the nook back wall\'s floor edge', () => {
      expect(dim(pixels).filter((p) => p.y === NOOK.bottom && p.x > NOOK.left && p.x < NOOK.right)).toEqual([])
    })

    it('draws no flagstone along the main room\'s left wall floor edge', () => {
      expect(dim(pixels).filter((p) => Math.abs(p.y - rowAt(FLOOR_Y, ROOM_HALF_WIDTH)) <= 1 && p.x > WEST_CORNER_X + 1)).toEqual([])
    })

    it('differs from the north view', () => {
      expect(pixels).not.toEqual(roomPixels(WIDTH, HEIGHT, 0))
    })
  })

  describe('facing east', () => {
    const pixels = roomPixels(WIDTH, HEIGHT, (3 * Math.PI) / 2)
    // The back wall's corner with the east wall, -BACK_Z right and ROOM_HALF_WIDTH ahead.
    const CORNER_X = columnAt(-BACK_Z, ROOM_HALF_WIDTH)

    it('draws the back wall corner as a tall worn vertical edge, mirroring the west view', () => {
      expect(CORNER_X).toBe(288)
      expect(wornRowsIn(pixels, CORNER_X - 1, CORNER_X + 1).size).toBeGreaterThan(HEIGHT * 0.4)
    })

    it('has no other tall vertical edges', () => {
      for (const x of verticalEdgeColumns(pixels, HEIGHT * 0.25)) {
        expect(Math.abs(x - CORNER_X)).toBeLessThanOrEqual(1)
      }
    })
  })

  describe('facing south', () => {
    const pixels = roomPixels(WIDTH, HEIGHT, Math.PI)

    it('draws brick detail on the back wall', () => {
      expect(dim(pixels).length).toBeGreaterThan(0)
    })

    // The back wall is -BACK_Z (1) away and runs from x 1 (on the left) to NOOK_X:
    // its east corner is at 160 - 128 and its west corner, at 160 + 128 * 7/3, is off-screen.
    const EAST_CORNER_X = columnAt(-ROOM_HALF_WIDTH, -BACK_Z)
    const WEST_CORNER_X = columnAt(-NOOK_X, -BACK_Z)

    it('puts the back wall\'s west corner off-screen', () => {
      expect(WEST_CORNER_X).toBeGreaterThan(WIDTH)
    })

    it('draws the back wall\'s east corner as a tall worn vertical edge', () => {
      expect(EAST_CORNER_X).toBe(32)
      expect(wornRowsIn(pixels, EAST_CORNER_X - 1, EAST_CORNER_X + 1).size).toBeGreaterThan(HEIGHT * 0.4)
    })

    it('has no other tall vertical edges, since the back wall\'s west end is off-screen', () => {
      for (const x of verticalEdgeColumns(pixels, HEIGHT * 0.25)) {
        expect(Math.abs(x - EAST_CORNER_X)).toBeLessThanOrEqual(1)
      }
    })

    it('draws the back wall\'s floor and ceiling edges as horizontal lines to the right edge of the view', () => {
      for (const y of [rowAt(CEILING_Y, -BACK_Z), rowAt(FLOOR_Y, -BACK_Z)]) {
        const columns = new Set(
          worn(pixels)
            .filter((p) => Math.abs(p.y - y) <= 1 && p.x > EAST_CORNER_X)
            .map((p) => p.x),
        )
        expect(columns.size).toBeGreaterThan((WIDTH - EAST_CORNER_X) / 2)
        expect(Math.max(...columns)).toBeGreaterThan(WIDTH - 20)
      }
    })

    it('draws no flagstone along the back wall\'s floor edge', () => {
      expect(dim(pixels).filter((p) => Math.abs(p.y - rowAt(FLOOR_Y, -BACK_Z)) <= 1 && p.x > EAST_CORNER_X + 1)).toEqual([])
    })
  })

  describe('from the nook facing west', () => {
    const pixels = roomPixels(WIDTH, HEIGHT, Math.PI / 2, NOOK_EYE)
    // The nook's back wall is WALL_VIEW_DISTANCE ahead and runs from BACK_Z (left)
    // to NOOK_FRONT_Z (right) of the eye: 160 ± 128 across and 120 ± 96 down.
    const depth = NOOK_EYE.x - NOOK_X
    const BACK = {
      left: columnAt(BACK_Z - NOOK_EYE.z, depth),
      top: rowAt(CEILING_Y, depth),
      right: columnAt(NOOK_FRONT_Z - NOOK_EYE.z, depth),
      bottom: rowAt(FLOOR_Y, depth),
    }

    it('frames the nook\'s back wall inside the view', () => {
      expect(depth).toBeCloseTo(WALL_VIEW_DISTANCE)
      expect(BACK).toEqual({ left: 32, top: 24, right: 288, bottom: 216 })
    })

    it.each([
      ['left', BACK.left],
      ['right', BACK.right],
    ])('draws the back wall\'s %s corner as a worn vertical edge', (_, x) => {
      const rows = [...wornRowsIn(pixels, x - 1, x + 1)].filter((y) => y >= BACK.top && y <= BACK.bottom)
      expect(rows.length).toBeGreaterThan((BACK.bottom - BACK.top) / 2)
    })

    it.each([
      ['ceiling', BACK.top],
      ['floor', BACK.bottom],
    ])('draws the back wall\'s %s edge as a worn horizontal line', (_, y) => {
      const columns = new Set(
        worn(pixels)
          .filter((p) => Math.abs(p.y - y) <= 1 && p.x >= BACK.left && p.x <= BACK.right)
          .map((p) => p.x),
      )
      expect(columns.size).toBeGreaterThan((BACK.right - BACK.left) / 2)
    })

    it('has no other tall vertical edges', () => {
      for (const x of verticalEdgeColumns(pixels, HEIGHT * 0.25)) {
        expect([BACK.left, BACK.right].some((edge) => Math.abs(x - edge) <= 1)).toBe(true)
      }
    })

    it('draws brick detail on the back wall', () => {
      const onWall = dim(pixels).filter(
        (p) => p.x > BACK.left + 1 && p.x < BACK.right - 1 && p.y > BACK.top + 1 && p.y < BACK.bottom - 1,
      )
      expect(onWall.length).toBeGreaterThan(0)
    })

    it('differs from the west view at the start', () => {
      expect(pixelSet(pixels)).not.toEqual(pixelSet(roomPixels(WIDTH, HEIGHT, Math.PI / 2)))
    })
  })

  describe('from the nook facing north', () => {
    const pixels = roomPixels(WIDTH, HEIGHT, 0, NOOK_EYE)
    // The nook's side wall is NOOK_FRONT_Z (WALL_VIEW_DISTANCE) ahead.
    const SIDE_DEPTH = NOOK_FRONT_Z - NOOK_EYE.z
    // The nook's front corner (-1, 1) is 1/3 right of the eye.
    const CORNER_X = columnAt(-ROOM_HALF_WIDTH - NOOK_EYE.x, SIDE_DEPTH)
    // The side wall's floor and ceiling edges.
    const SIDE_ROWS = [rowAt(CEILING_Y, SIDE_DEPTH), rowAt(FLOOR_Y, SIDE_DEPTH)]
    // The far wall's top edge, FAR_Z ahead.
    const FAR_TOP_Y = rowAt(CEILING_Y, FAR_Z - NOOK_EYE.z)
    // Where the far wall's left end would be without the nook's side wall in the way.
    const FAR_LEFT_X = columnAt(-ROOM_HALF_WIDTH - NOOK_EYE.x, FAR_Z - NOOK_EYE.z)

    it('puts the nook\'s front corner right of centre and the far wall\'s left end behind it', () => {
      expect(SIDE_DEPTH).toBeCloseTo(WALL_VIEW_DISTANCE)
      expect(CORNER_X).toBe(203)
      expect(SIDE_ROWS).toEqual([24, 216])
      expect(FAR_TOP_Y).toBe(66)
      expect(FAR_LEFT_X).toBeLessThan(CORNER_X)
    })

    it('draws the nook\'s front corner as a tall worn vertical edge', () => {
      const rows = [...wornRowsIn(pixels, CORNER_X - 1, CORNER_X + 1)].filter((y) => y >= SIDE_ROWS[0] && y <= SIDE_ROWS[1])
      expect(rows.length).toBeGreaterThan(HEIGHT * 0.4)
    })

    it('draws the nook\'s side wall face-on, left of its front corner', () => {
      // The side wall is 1 ahead: floor and ceiling at 120 ± 96.
      for (const y of SIDE_ROWS) {
        const columns = new Set(
          worn(pixels)
            .filter((p) => Math.abs(p.y - y) <= 1 && p.x < CORNER_X - 1)
            .map((p) => p.x),
        )
        expect(columns.size).toBeGreaterThan(CORNER_X / 3)
      }
    })

    it('hides the far wall\'s left part behind the nook\'s side wall', () => {
      const hidden = worn(pixels).filter((p) => Math.abs(p.y - FAR_TOP_Y) <= 1 && p.x >= FAR_LEFT_X - 2 && p.x < CORNER_X - 1)
      expect(hidden).toEqual([])
    })

    it('draws the far wall\'s top edge right of the nook\'s front corner', () => {
      const shown = worn(pixels).filter((p) => Math.abs(p.y - FAR_TOP_Y) <= 1 && p.x > CORNER_X + 1)
      expect(shown.length).toBeGreaterThan(0)
    })

    it('draws no worn edges across the nook\'s side wall between its corners', () => {
      // The side wall runs from the nook's back corner (WALL_VIEW_DISTANCE left of the
      // eye) to its front corner. Everything behind it (the main room's left wall,
      // the far wall's left end) is hidden, so only its own dim bricks show there.
      const BACK_CORNER_X = columnAt(NOOK_X - NOOK_EYE.x, SIDE_DEPTH)
      expect(BACK_CORNER_X).toBe(32)
      const behind = worn(pixels).filter(
        (p) => p.x > BACK_CORNER_X + 1 && p.x < CORNER_X - 1 && p.y > SIDE_ROWS[0] + 2 && p.y < SIDE_ROWS[1] - 2,
      )
      expect(behind).toEqual([])
    })

    it('differs from the north view at the start', () => {
      expect(pixelSet(pixels)).not.toEqual(pixelSet(roomPixels(WIDTH, HEIGHT, 0)))
    })
  })

  describe('near walls framed from WALL_VIEW_DISTANCE', () => {
    // Facing west from the nook and facing south from the start, the wall ahead is
    // WALL_VIEW_DISTANCE away, so it's framed the same way.
    const nookWest = roomPixels(WIDTH, HEIGHT, Math.PI / 2, NOOK_EYE)
    const startSouth = roomPixels(WIDTH, HEIGHT, Math.PI)
    const startEast = roomPixels(WIDTH, HEIGHT, (3 * Math.PI) / 2)
    const ROWS = [rowAt(CEILING_Y, WALL_VIEW_DISTANCE), rowAt(FLOOR_Y, WALL_VIEW_DISTANCE)]
    const COLUMNS = [columnAt(-WALL_VIEW_DISTANCE, WALL_VIEW_DISTANCE), columnAt(WALL_VIEW_DISTANCE, WALL_VIEW_DISTANCE)]

    it('puts the near wall\'s edges at rows 24 and 216 and its corners at columns 32 and 288', () => {
      expect(ROWS).toEqual([24, 216])
      expect(COLUMNS).toEqual([32, 288])
    })

    it('draws the near wall\'s floor and ceiling edges on the same rows from both places', () => {
      expect(sorted(horizontalEdgeRows(nookWest, WIDTH / 4))).toEqual(ROWS)
      expect(sorted(horizontalEdgeRows(startSouth, WIDTH / 4))).toEqual(ROWS)
    })

    it('draws the nook back wall\'s corners where the start\'s near walls have theirs', () => {
      // From the start facing south only the left corner is on the back wall; the
      // right one at x -1 is the nook's opening. Facing east, the corner on the right
      // is the same distance away.
      expect(sorted(verticalEdgeColumns(startSouth, HEIGHT * 0.4))).toEqual([COLUMNS[0]])
      expect(sorted(verticalEdgeColumns(startEast, HEIGHT * 0.4))).toEqual([COLUMNS[1]])
      expect(sorted(verticalEdgeColumns(nookWest, HEIGHT * 0.4))).toEqual(COLUMNS)
    })
  })

  describe('along the path to the nook', () => {
    const eyes: FloorPoint[] = [0, 0.25, 0.5, 0.75, 1].map((t) => ({ x: t * NOOK_EYE.x, z: 0 }))

    it.each(eyes)('uses integer coordinates within the canvas from %o', (eye) => {
      for (const yaw of [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2]) {
        const pixels = roomPixels(WIDTH, HEIGHT, yaw, eye)
        expect(pixels.length).toBeGreaterThan(0)
        for (const { x, y } of pixels) {
          expect(Number.isInteger(x)).toBe(true)
          expect(Number.isInteger(y)).toBe(true)
          expect(x).toBeGreaterThanOrEqual(0)
          expect(x).toBeLessThan(WIDTH)
          expect(y).toBeGreaterThanOrEqual(0)
          expect(y).toBeLessThan(HEIGHT)
        }
      }
    })

    it.each(eyes)('is deterministic from %o', (eye) => {
      expect(roomPixels(WIDTH, HEIGHT, Math.PI / 2, eye)).toEqual(roomPixels(WIDTH, HEIGHT, Math.PI / 2, eye))
    })

    it.each(eyes)('only uses the dim and worn colours from %o', (eye) => {
      for (const { colour } of roomPixels(WIDTH, HEIGHT, Math.PI / 2, eye)) {
        expect([FOREGROUND_DIM, FOREGROUND_WORN]).toContain(colour)
      }
    })

    it('changes the view as the eye moves', () => {
      const views = eyes.map((eye) => JSON.stringify(roomPixels(WIDTH, HEIGHT, Math.PI / 2, eye)))
      expect(new Set(views).size).toBe(eyes.length)
    })
  })

  describe('stability while turning', () => {
    it('keeps most detail in place for a slight pan', () => {
      const north = roomPixels(WIDTH, HEIGHT, 0)
      const panned = roomPixels(WIDTH, HEIGHT, 0.01)
      expect(fractionNear(panned, north, 4)).toBeGreaterThan(0.95)
      expect(fractionNear(north, panned, 4)).toBeGreaterThan(0.95)
    })

    it('shifts detail sideways rather than redrawing it while panning', () => {
      // A small left turn moves things right on screen, so the brick pattern
      // seen at a slight pan overlaps the north view's pattern shifted right.
      const north = dim(roomPixels(WIDTH, HEIGHT, 0)).filter((p) => p.y < FAR_WALL.bottom && p.x > FAR_WALL.left && p.x < FAR_WALL.right)
      const panned = new Set(dim(roomPixels(WIDTH, HEIGHT, 0.05)).map(key))
      const shift = Math.round(0.05 * 0.8 * (WIDTH / 2))
      const matched = north.filter((p) => [-2, -1, 0, 1, 2].some((d) => panned.has(key({ x: p.x + shift + d, y: p.y }))))
      expect(north.length).toBeGreaterThan(0)
      expect(matched.length / north.length).toBeGreaterThan(0.8)
    })
  })

  it.each([
    [320, 240],
    [640, 480],
    [100, 75],
  ])('completes quickly for a %ix%i canvas', (width, height) => {
    const start = performance.now()
    const pixels = roomPixels(width, height, 0.7)
    expect(performance.now() - start).toBeLessThan(500)
    expect(pixels.length).toBeGreaterThan(0)
  }, 2000)

  it('completes quickly from the nook', () => {
    const start = performance.now()
    const pixels = roomPixels(WIDTH, HEIGHT, 0.7, NOOK_EYE)
    expect(performance.now() - start).toBeLessThan(500)
    expect(pixels.length).toBeGreaterThan(0)
  }, 2000)
})

describe('mirrorPixels', () => {
  const WEST = Math.PI / 2
  const EAST = (3 * Math.PI) / 2
  // The mirror's wall is straight ahead of the nook's place facing west.
  const depth = PLACES.nook.x - NOOK_X
  const wallTop = rowAt(CEILING_Y, depth)
  const wallBottom = rowAt(FLOOR_Y, depth)
  const fromNook = mirrorPixels(WIDTH, HEIGHT, WEST, NOOK_EYE)
  const extent = (pixels: Pixel[]) => ({
    left: Math.min(...pixels.map((p) => p.x)),
    right: Math.max(...pixels.map((p) => p.x)),
    top: Math.min(...pixels.map((p) => p.y)),
    bottom: Math.max(...pixels.map((p) => p.y)),
  })

  it('hangs on the nook\'s back wall, which faces the nook\'s place', () => {
    const wall = WALLS[MIRROR_WALL]
    expect(MIRROR_WALL).toBe('nook-back')
    expect(wall.start.x).toBe(NOOK_X)
    expect(wall.start.z).toBe(BACK_Z)
    expect(wallEnd(wall)).toEqual({ x: NOOK_X, z: NOOK_FRONT_Z })
  })

  it('fits within its wall', () => {
    expect(MIRROR_BOUNDS.right - MIRROR_BOUNDS.left).toBeLessThan(WALLS[MIRROR_WALL].length)
  })

  it('draws the mirror from the nook facing west', () => {
    expect(fromNook.length).toBeGreaterThan(0)
  })

  it('is deterministic', () => {
    expect(mirrorPixels(WIDTH, HEIGHT, WEST, NOOK_EYE)).toEqual(fromNook)
  })

  it('uses integer coordinates within the canvas', () => {
    for (const { x, y } of fromNook) {
      expect(Number.isInteger(x)).toBe(true)
      expect(Number.isInteger(y)).toBe(true)
      expect(x).toBeGreaterThanOrEqual(0)
      expect(x).toBeLessThan(WIDTH)
      expect(y).toBeGreaterThanOrEqual(0)
      expect(y).toBeLessThan(HEIGHT)
    }
  })

  it('uses the dim, worn and full foreground colours', () => {
    expect(new Set(fromNook.map((p) => p.colour))).toEqual(new Set([FOREGROUND_DIM, FOREGROUND_WORN, FOREGROUND]))
  })

  it('is centred horizontally from the nook facing west', () => {
    const { left, right } = extent(fromNook)
    expect(Math.abs((left + right) / 2 - WIDTH / 2)).toBeLessThanOrEqual(2)
  })

  it('matches the projected width of its bounds from the nook', () => {
    const { left, right } = extent(fromNook)
    // Facing west, the wall's +z runs left on screen, so s runs left to right.
    expect(right - left).toBeCloseTo(columnAt(MIRROR_BOUNDS.right, depth) - columnAt(MIRROR_BOUNDS.left, depth), -1)
  })

  it('spans most of the wall\'s projected height without reaching the floor or ceiling', () => {
    const { top, bottom } = extent(fromNook)
    expect(top).toBeGreaterThan(wallTop)
    expect(bottom).toBeLessThan(wallBottom)
    expect((bottom - top) / (wallBottom - wallTop)).toBeGreaterThan(0.8)
  })

  it('is centred vertically near the middle of the view', () => {
    const { top, bottom } = extent(fromNook)
    expect(Math.abs((top + bottom) / 2 - HEIGHT / 2)).toBeLessThan(HEIGHT * 0.05)
  })

  it('draws nothing from the nook facing east, with the mirror behind the camera', () => {
    expect(mirrorPixels(WIDTH, HEIGHT, EAST, NOOK_EYE)).toEqual([])
  })

  it('defaults to the start facing north', () => {
    expect(mirrorPixels(WIDTH, HEIGHT)).toEqual(mirrorPixels(WIDTH, HEIGHT, 0, ORIGIN))
  })

  it('draws a smaller mirror from the start facing west', () => {
    const fromStart = mirrorPixels(WIDTH, HEIGHT, WEST)
    expect(fromStart.length).toBeGreaterThan(0)
    const near = extent(fromNook)
    const far = extent(fromStart)
    expect(far.bottom - far.top).toBeLessThan(near.bottom - near.top)
    expect(far.right - far.left).toBeLessThan(near.right - near.left)
  })

  it('keeps room detail off the glass from the nook facing west', () => {
    // The glass edge is the worn mirror layer; stay a pixel inside its extent.
    const glass = extent(worn(fromNook))
    const onGlass = roomPixels(WIDTH, HEIGHT, WEST, NOOK_EYE).filter(
      (p) => p.x > glass.left + 1 && p.x < glass.right - 1 && p.y > glass.top + 1 && p.y < glass.bottom - 1,
    )
    expect(onGlass).toEqual([])
  })

  it('still draws bricks on the rest of the mirror\'s wall', () => {
    const frame = extent(fromNook)
    const bricks = dim(roomPixels(WIDTH, HEIGHT, WEST, NOOK_EYE)).filter(
      (p) => p.y > wallTop && p.y < wallBottom && (p.x < frame.left || p.x > frame.right),
    )
    expect(bricks.length).toBeGreaterThan(0)
  })
})

describe('ripplePixels', () => {
  const WEST = Math.PI / 2
  const EAST = (3 * Math.PI) / 2
  const CENTRE: MirrorPoint = { s: 0, t: 0 }
  const duration = rippleDuration(CENTRE)
  // Every ring has started and the first is part-way out.
  const MID_MS = 900
  const fromNook = (origin: MirrorPoint, elapsedMs: number) =>
    ripplePixels(WIDTH, HEIGHT, { origin, elapsedMs }, WEST, NOOK_EYE)

  it('draws pixels mid-ripple from the nook facing west', () => {
    expect(fromNook(CENTRE, MID_MS).length).toBeGreaterThan(0)
  })

  it('keeps every pixel within the mirror\'s bounds from the nook facing west', () => {
    const { left, top, right, bottom } = extent(mirrorPixels(WIDTH, HEIGHT, WEST, NOOK_EYE))
    for (const origin of [CENTRE, { s: 0.3, t: -0.45 }, { s: -0.2, t: 0.4 }]) {
      for (let ms = 100; ms < rippleDuration(origin); ms += 100) {
        const outside = fromNook(origin, ms).filter(({ x, y }) => x < left || x > right || y < top || y > bottom)
        expect(outside).toEqual([])
      }
    }
  })

  it('uses integer coordinates within the canvas', () => {
    for (const { x, y } of fromNook(CENTRE, MID_MS)) {
      expect(Number.isInteger(x)).toBe(true)
      expect(Number.isInteger(y)).toBe(true)
      expect(x).toBeGreaterThanOrEqual(0)
      expect(x).toBeLessThan(WIDTH)
      expect(y).toBeGreaterThanOrEqual(0)
      expect(y).toBeLessThan(HEIGHT)
    }
  })

  it('centres a small ring on the click', () => {
    const pixels = fromNook(CENTRE, 400)
    const xs = pixels.map((p) => p.x)
    const ys = pixels.map((p) => p.y)
    expect(Math.abs((Math.min(...xs) + Math.max(...xs)) / 2 - WIDTH / 2)).toBeLessThanOrEqual(1)
    expect(Math.abs((Math.min(...ys) + Math.max(...ys)) / 2 - HEIGHT / 2)).toBeLessThanOrEqual(1)
  })

  it('draws nothing at the click', () => {
    expect(fromNook(CENTRE, 0)).toEqual([])
  })

  it('draws nothing past the duration', () => {
    expect(fromNook(CENTRE, duration + 1)).toEqual([])
  })

  it('draws nothing from the nook facing east, with the mirror behind the camera', () => {
    expect(ripplePixels(WIDTH, HEIGHT, { origin: CENTRE, elapsedMs: MID_MS }, EAST, NOOK_EYE)).toEqual([])
  })

  it('is deterministic', () => {
    expect(fromNook(CENTRE, duration - 100)).toEqual(fromNook(CENTRE, duration - 100))
  })

  it('draws strong rings in the worn colour', () => {
    // Early on both rings are near the click, so strong.
    expect(rippleRings(CENTRE, 300).every(({ strength }) => strength > 0.6)).toBe(true)
    const colours = new Set(fromNook(CENTRE, 300).map((p) => p.colour))
    expect(colours).toEqual(new Set([FOREGROUND_WORN]))
  })

  it('draws weak rings in the dim colour', () => {
    const late = duration - 100
    expect(rippleRings(CENTRE, late).every(({ strength }) => strength < 0.6)).toBe(true)
    const pixels = fromNook(CENTRE, late)
    expect(pixels.length).toBeGreaterThan(0)
    expect(new Set(pixels.map((p) => p.colour))).toEqual(new Set([FOREGROUND_DIM]))
  })

  describe('with a set ring', () => {
    const RADIUS = 0.2
    // A lone ring of RADIUS around the centre with the given strength.
    const ringWith = (strength: number) => {
      vi.mocked(rippleRings).mockReturnValueOnce([{ radius: RADIUS, strength }])
      return fromNook(CENTRE, MID_MS)
    }
    const key = (p: Pixel) => `${p.x},${p.y}`

    it('draws a ring stronger than 0.6 in the worn colour', () => {
      expect(new Set(ringWith(0.61).map((p) => p.colour))).toEqual(new Set([FOREGROUND_WORN]))
    })

    it('draws a ring of 0.6 or weaker in the dim colour', () => {
      expect(new Set(ringWith(0.6).map((p) => p.colour))).toEqual(new Set([FOREGROUND_DIM]))
    })

    it('keeps every pixel of a ring at strength 0.35 or more', () => {
      const solid = ringWith(1).map(key)
      expect(ringWith(0.35).map(key)).toEqual(solid)
      expect(ringWith(0.5).map(key)).toEqual(solid)
    })

    it('keeps fewer pixels of a fainter ring, all from the solid ring', () => {
      const solid = new Set(ringWith(0.5).map(key))
      const faded = ringWith(0.1).map(key)
      expect(faded.length).toBeGreaterThan(0)
      expect(faded.length).toBeLessThan(solid.size * 0.5)
      for (const k of faded) expect(solid.has(k)).toBe(true)
    })

    it('keeps fewer pixels the fainter the ring gets', () => {
      const counts = [0.3, 0.2, 0.1, 0.02].map((strength) => ringWith(strength).length)
      for (let i = 1; i < counts.length; i++) expect(counts[i]).toBeLessThan(counts[i - 1])
    })

    it('drops the same pixels each time', () => {
      expect(ringWith(0.15)).toEqual(ringWith(0.15))
    })
  })
})

describe('screenToMirror', () => {
  const WEST = Math.PI / 2
  const EAST = (3 * Math.PI) / 2
  // One canvas pixel on the mirror's wall from the nook, in mirror units.
  const PIXEL = 1 / FOCAL
  const fromNook = (x: number, y: number) => screenToMirror(x, y, WIDTH, HEIGHT, WEST, NOOK_EYE)

  it('maps the centre of the view to the centre of the glass from the nook facing west', () => {
    const point = fromNook(WIDTH / 2, HEIGHT / 2)!
    expect(point.s).toBeCloseTo(0)
    expect(point.t).toBeCloseTo(0)
  })

  it('maps one pixel to about 1/128 of a mirror unit', () => {
    expect(PIXEL).toBeCloseTo(1 / 128)
    expect(fromNook(WIDTH / 2 + 10, HEIGHT / 2)!.s).toBeCloseTo(10 * PIXEL)
    expect(fromNook(WIDTH / 2, HEIGHT / 2 - 10)!.t).toBeCloseTo(10 * PIXEL)
  })

  it('maps right on screen to +s', () => {
    expect(fromNook(WIDTH / 2 + 20, HEIGHT / 2)!.s).toBeGreaterThan(0)
  })

  it('maps up on screen to +t', () => {
    expect(fromNook(WIDTH / 2, HEIGHT / 2 - 20)!.t).toBeGreaterThan(0)
  })

  it('returns points on the glass', () => {
    for (const [x, y] of [[130, 90], [200, 170], [160, 60], [190, 120]]) {
      const point = fromNook(x, y)
      expect(point).not.toBeNull()
      expect(isOnGlass(point!)).toBe(true)
    }
  })

  it.each([
    ['the right side of the frame', WIDTH / 2 + 47, HEIGHT / 2],
    ['the left side of the frame', WIDTH / 2 - 47, HEIGHT / 2],
    ['the crest', WIDTH / 2, 42],
    ['a top shoulder corner, outside the arch', WIDTH / 2 + 38, HEIGHT / 2 - 58],
  ])('returns null on %s, inside the mirror\'s bounds', (_, x, y) => {
    const { left, top, right, bottom } = extent(mirrorPixels(WIDTH, HEIGHT, WEST, NOOK_EYE))
    expect(x >= left && x <= right && y >= top && y <= bottom).toBe(true)
    expect(fromNook(x, y)).toBeNull()
  })

  it('returns null beside the mirror', () => {
    expect(fromNook(40, HEIGHT / 2)).toBeNull()
  })

  it('returns null above the wall', () => {
    expect(fromNook(WIDTH / 2, 0)).toBeNull()
  })

  it('returns null from the nook facing east, with the mirror behind the camera', () => {
    expect(screenToMirror(WIDTH / 2, HEIGHT / 2, WIDTH, HEIGHT, EAST, NOOK_EYE)).toBeNull()
  })

  it('returns null from the start facing north, with the mirror off to the side', () => {
    expect(screenToMirror(WIDTH / 2, HEIGHT / 2, WIDTH, HEIGHT)).toBeNull()
  })

  it('maps the projected centre of the glass back to the centre from the start facing west', () => {
    const point = screenToMirror(WIDTH / 2, HEIGHT / 2, WIDTH, HEIGHT, WEST)!
    expect(point.s).toBeCloseTo(0)
    expect(point.t).toBeCloseTo(0)
  })

  it('lands each ripple pixel near its ring', () => {
    // Round-trips a ring through ripplePixels and back.
    const origin = { s: 0, t: 0 }
    const radii = rippleRings(origin, 500).map(({ radius }) => radius)
    const pixels = ripplePixels(WIDTH, HEIGHT, { origin, elapsedMs: 500 }, WEST, NOOK_EYE)
    expect(pixels.length).toBeGreaterThan(0)
    for (const { x, y } of pixels) {
      const point = fromNook(x, y)!
      const distance = Math.hypot(point.s, point.t)
      expect(Math.min(...radii.map((r) => Math.abs(distance - r)))).toBeLessThan(2 * PIXEL)
    }
  })
})

describe('previewPixels', () => {
  const WEST = Math.PI / 2
  const EAST = (3 * Math.PI) / 2
  const CELLS = PREVIEW_WIDTH * PREVIEW_HEIGHT
  const filled = (tone: number) => new Uint8Array(CELLS).fill(tone)
  // Stripes of every tone, a few cells wide, so a ripple's shift shows.
  const striped = Uint8Array.from({ length: CELLS }, (_, i) => Math.floor((i % PREVIEW_WIDTH) / 3) % 4)
  const fromNook = (preview: Uint8Array, ripple?: { origin: MirrorPoint; elapsedMs: number }) =>
    previewPixels(WIDTH, HEIGHT, preview, WEST, NOOK_EYE, ripple)
  const within = (bounds: { left: number; top: number; right: number; bottom: number }, p: Pixel) =>
    p.x >= bounds.left && p.x <= bounds.right && p.y >= bounds.top && p.y <= bounds.bottom

  it('draws one pixel per glass cell in the full foreground from the nook facing west', () => {
    const pixels = fromNook(filled(3))
    expect(pixels).toHaveLength(GLASS_CELLS.length)
    expect(new Set(pixels.map((p) => p.colour))).toEqual(new Set([FOREGROUND]))
  })

  it('draws each cell at its own pixel from the nook facing west', () => {
    expect(new Set(fromNook(filled(3)).map(key)).size).toBe(GLASS_CELLS.length)
  })

  it('keeps every pixel within the mirror\'s bounds from the nook facing west', () => {
    const bounds = extent(mirrorPixels(WIDTH, HEIGHT, WEST, NOOK_EYE))
    expect(fromNook(filled(3)).every((p) => within(bounds, p))).toBe(true)
  })

  it('uses integer coordinates within the canvas', () => {
    for (const { x, y } of fromNook(filled(3))) {
      expect(Number.isInteger(x)).toBe(true)
      expect(Number.isInteger(y)).toBe(true)
      expect(x).toBeGreaterThanOrEqual(0)
      expect(x).toBeLessThan(WIDTH)
      expect(y).toBeGreaterThanOrEqual(0)
      expect(y).toBeLessThan(HEIGHT)
    }
  })

  it.each([1, 2, 3])('colours tone %i with its preview colour', (tone) => {
    expect(new Set(fromNook(filled(tone)).map((p) => p.colour))).toEqual(new Set([PREVIEW_COLOURS[tone]]))
  })

  it('draws nothing for an all-background preview', () => {
    expect(fromNook(filled(0))).toEqual([])
  })

  it('skips background cells', () => {
    expect(fromNook(striped).length).toBeLessThan(GLASS_CELLS.length)
    expect(fromNook(striped).every((p) => p.colour !== PREVIEW_COLOURS[0])).toBe(true)
  })

  it('draws nothing from the nook facing east, with the mirror behind the camera', () => {
    expect(previewPixels(WIDTH, HEIGHT, filled(3), EAST, NOOK_EYE)).toEqual([])
  })

  it('draws fewer pixels from the start facing west, all within that view\'s mirror bounds', () => {
    const pixels = previewPixels(WIDTH, HEIGHT, filled(3), WEST, ORIGIN)
    const bounds = extent(mirrorPixels(WIDTH, HEIGHT, WEST, ORIGIN))
    expect(pixels.length).toBeGreaterThan(0)
    expect(new Set(pixels.map(key)).size).toBeLessThan(GLASS_CELLS.length)
    expect(pixels.every((p) => within(bounds, p))).toBe(true)
  })

  it('defaults to the start facing north, where the mirror is out of view', () => {
    expect(previewPixels(WIDTH, HEIGHT, filled(3))).toEqual(previewPixels(WIDTH, HEIGHT, filled(3), 0, ORIGIN))
  })

  it('changes some pixels of a patterned preview mid-ripple', () => {
    const centre = { s: 0, t: 0 }
    const still = pixelSet(fromNook(striped))
    const rippled = pixelSet(fromNook(striped, { origin: centre, elapsedMs: rippleDuration(centre) / 2 }))
    expect(rippled).not.toEqual(still)
  })

  it('draws the plain preview once the ripple is over', () => {
    const centre = { s: 0, t: 0 }
    const after = fromNook(striped, { origin: centre, elapsedMs: rippleDuration(centre) + 1 })
    expect(after).toEqual(fromNook(striped))
  })

  it('draws the plain preview at the moment of the click, before any ring has set off', () => {
    const centre = { s: 0, t: 0 }
    expect(fromNook(striped, { origin: centre, elapsedMs: 0 })).toEqual(fromNook(striped))
  })

  it('is deterministic', () => {
    const ripple = { origin: { s: 0.1, t: -0.2 }, elapsedMs: 900 }
    expect(fromNook(striped, ripple)).toEqual(fromNook(striped, ripple))
  })
})

describe('screenToWall', () => {
  const WEST = Math.PI / 2
  const EAST = (3 * Math.PI) / 2
  const PIXEL = 1 / FOCAL
  const fromNook = (x: number, y: number) => screenToWall(x, y, WIDTH, HEIGHT, WEST, NOOK_EYE)

  it('maps the centre of the view to the mirror\'s centre from the nook facing west', () => {
    const point = fromNook(WIDTH / 2, HEIGHT / 2)!
    expect(point.s).toBeCloseTo(0)
    expect(point.t).toBeCloseTo(0)
  })

  it('maps right on screen to +s and up to +t, about 1/128 of a unit per pixel', () => {
    const point = fromNook(WIDTH / 2 + 30, HEIGHT / 2 - 20)!
    expect(point.s).toBeCloseTo(30 * PIXEL)
    expect(point.t).toBeCloseTo(20 * PIXEL)
  })

  it.each([
    ['the right side of the frame', WIDTH / 2 + 47, HEIGHT / 2],
    ['the crest', WIDTH / 2, 42],
    ['beside the mirror', 40, HEIGHT / 2],
  ])('returns a point on %s, where screenToMirror returns null', (_, x, y) => {
    const point = fromNook(x, y)
    expect(point).not.toBeNull()
    expect(point!.s).toBeCloseTo((x - WIDTH / 2) * PIXEL)
    expect(point!.t).toBeCloseTo((HEIGHT / 2 - y) * PIXEL)
    expect(screenToMirror(x, y, WIDTH, HEIGHT, WEST, NOOK_EYE)).toBeNull()
  })

  it('finds the pull where it\'s drawn from the nook facing west', () => {
    const handle = pullPixels(WIDTH, HEIGHT, 0, WEST, NOOK_EYE).filter((p) => p.colour === FOREGROUND)
    expect(handle.length).toBeGreaterThan(0)
    for (const { x, y } of handle) expect(isOnPull(fromNook(x + 0.5, y + 0.5)!)).toBe(true)
  })

  it('maps the pull\'s cord column to PULL_S', () => {
    expect(fromNook(WIDTH / 2 + PULL_S * FOCAL, HEIGHT / 2)!.s).toBeCloseTo(PULL_S)
  })

  it.each([
    ['above the ceiling', WIDTH / 2, 0],
    ['below the floor', WIDTH / 2, HEIGHT - 1],
    ['left of the wall', 10, HEIGHT / 2],
    ['right of the wall', WIDTH - 10, HEIGHT / 2],
  ])('returns null %s', (_, x, y) => {
    expect(fromNook(x, y)).toBeNull()
  })

  it('returns null from the nook facing east, with the wall behind the camera', () => {
    expect(screenToWall(WIDTH / 2, HEIGHT / 2, WIDTH, HEIGHT, EAST, NOOK_EYE)).toBeNull()
  })

  it('returns null from the start facing north, with the wall off to the side', () => {
    expect(screenToWall(WIDTH / 2, HEIGHT / 2, WIDTH, HEIGHT)).toBeNull()
  })

  it('maps the view\'s centre to the mirror\'s centre from the start facing west', () => {
    const point = screenToWall(WIDTH / 2, HEIGHT / 2, WIDTH, HEIGHT, WEST)!
    expect(point.s).toBeCloseTo(0)
    expect(point.t).toBeCloseTo(0)
  })

  it('agrees with screenToMirror: the same point on the glass, null elsewhere', () => {
    let onGlass = 0
    for (let x = 0; x < WIDTH; x += 7) {
      for (let y = 0; y < HEIGHT; y += 7) {
        const wall = fromNook(x, y)
        const mirror = screenToMirror(x, y, WIDTH, HEIGHT, WEST, NOOK_EYE)
        if (wall && isOnGlass(wall)) {
          onGlass++
          expect(mirror).toEqual(wall)
        } else {
          expect(mirror).toBeNull()
        }
      }
    }
    expect(onGlass).toBeGreaterThan(0)
  })
})

describe('pullPixels', () => {
  const WEST = Math.PI / 2
  const EAST = (3 * Math.PI) / 2
  const fromNook = (drop = 0) => pullPixels(WIDTH, HEIGHT, drop, WEST, NOOK_EYE)
  const handle = (pixels: Pixel[]) => pixels.filter((p) => p.colour === FOREGROUND)

  it('draws the pull from the nook facing west', () => {
    expect(fromNook().length).toBeGreaterThan(0)
  })

  it('uses integer coordinates within the canvas', () => {
    for (const { x, y } of fromNook()) {
      expect(Number.isInteger(x)).toBe(true)
      expect(Number.isInteger(y)).toBe(true)
      expect(x).toBeGreaterThanOrEqual(0)
      expect(x).toBeLessThan(WIDTH)
      expect(y).toBeGreaterThanOrEqual(0)
      expect(y).toBeLessThan(HEIGHT)
    }
  })

  it('uses the worn and full foreground colours', () => {
    expect(new Set(fromNook().map((p) => p.colour))).toEqual(new Set([FOREGROUND_WORN, FOREGROUND]))
  })

  it('is deterministic', () => {
    expect(fromNook(0.05)).toEqual(fromNook(0.05))
  })

  it('defaults to no drop', () => {
    expect(pullPixels(WIDTH, HEIGHT, undefined, WEST, NOOK_EYE)).toEqual(fromNook(0))
  })

  it('hangs right of the mirror from the nook facing west', () => {
    const mirror = extent(mirrorPixels(WIDTH, HEIGHT, WEST, NOOK_EYE))
    expect(extent(fromNook()).left).toBeGreaterThan(mirror.right)
  })

  it('hangs at the cord\'s column, from the ceiling to around eye height', () => {
    const { left, top, right, bottom } = extent(fromNook())
    const cord = columnAt(PULL_S, 1)
    expect(left).toBeLessThan(cord)
    expect(right).toBeGreaterThan(cord)
    expect(top).toBe(rowAt(CEILING_Y, 1))
    expect(bottom).toBeGreaterThan(HEIGHT / 2 - 5)
    expect(bottom).toBeLessThan(HEIGHT / 2 + 10)
  })

  it('lowers the handle about 128 pixels per mirror unit of drop', () => {
    const rest = extent(handle(fromNook()))
    const dropped = extent(handle(fromNook(0.1)))
    expect(Math.abs(dropped.bottom - rest.bottom - 0.1 * FOCAL)).toBeLessThanOrEqual(1)
    expect(Math.abs(dropped.top - rest.top - 0.1 * FOCAL)).toBeLessThanOrEqual(1)
  })

  it('keeps the cord\'s top at the ceiling when dropped', () => {
    expect(extent(fromNook(0.1)).top).toBe(extent(fromNook()).top)
  })

  it('draws more cord when dropped', () => {
    const cord = (pixels: Pixel[]) => pixels.filter((p) => p.colour === FOREGROUND_WORN)
    expect(cord(fromNook(0.1)).length).toBeGreaterThan(cord(fromNook()).length)
  })

  it('draws nothing from the nook facing east, with the pull behind the camera', () => {
    expect(pullPixels(WIDTH, HEIGHT, 0, EAST, NOOK_EYE)).toEqual([])
  })

  it('draws a smaller pull from the start facing west', () => {
    const fromStart = pullPixels(WIDTH, HEIGHT, 0, WEST)
    expect(fromStart.length).toBeGreaterThan(0)
    const near = extent(fromNook())
    const far = extent(fromStart)
    expect(far.bottom - far.top).toBeLessThan(near.bottom - near.top)
  })
})

describe('roomPixels around the pull', () => {
  const WEST = Math.PI / 2

  it('keeps bricks off the pull\'s rest bounds from the nook facing west', () => {
    const bounds = {
      left: columnAt(PULL_BOUNDS.left, 1),
      right: columnAt(PULL_BOUNDS.right, 1),
      top: rowAt(PULL_BOUNDS.top, 1),
      bottom: rowAt(PULL_BOUNDS.bottom, 1),
    }
    const under = dim(roomPixels(WIDTH, HEIGHT, WEST, NOOK_EYE)).filter(
      (p) => p.x >= bounds.left && p.x <= bounds.right && p.y >= bounds.top && p.y <= bounds.bottom,
    )
    expect(under).toEqual([])
  })

  it('still draws bricks on the back wall away from the mirror and the pull', () => {
    const mirror = extent(mirrorPixels(WIDTH, HEIGHT, WEST, NOOK_EYE))
    const pull = extent(pullPixels(WIDTH, HEIGHT, 0, WEST, NOOK_EYE))
    const bricks = dim(roomPixels(WIDTH, HEIGHT, WEST, NOOK_EYE)).filter(
      (p) =>
        p.x > 33 && p.x < 287 && p.y > 25 && p.y < 215 &&
        (p.x < mirror.left || p.x > mirror.right) &&
        (p.x < pull.left || p.x > pull.right || p.y > pull.bottom),
    )
    expect(bricks.length).toBeGreaterThan(0)
  })
})

describe('previewPixels with a shimmer', () => {
  const WEST = Math.PI / 2
  const CELLS = PREVIEW_WIDTH * PREVIEW_HEIGHT
  const filled = (tone: number) => new Uint8Array(CELLS).fill(tone)
  const striped = Uint8Array.from({ length: CELLS }, (_, i) => Math.floor((i % PREVIEW_WIDTH) / 3) % 4)
  const fromNook = (preview: Uint8Array | null, shimmer?: Shimmer, ripple?: { origin: MirrorPoint; elapsedMs: number }) =>
    previewPixels(WIDTH, HEIGHT, preview, WEST, NOOK_EYE, ripple, shimmer)
  const colours = (pixels: Pixel[]) => new Set(pixels.map((p) => p.colour))

  it('draws nothing for a null preview without a shimmer', () => {
    expect(fromNook(null)).toEqual([])
  })

  it('draws the old preview alone at progress 0', () => {
    expect(fromNook(filled(2), { from: striped, progress: 0 })).toEqual(fromNook(striped))
  })

  it('draws the new preview alone at progress 1', () => {
    expect(fromNook(striped, { from: filled(2), progress: 1 })).toEqual(fromNook(striped))
  })

  it('mixes both previews mid-shimmer, with some cells flashing brighter', () => {
    const pixels = fromNook(filled(2), { from: filled(1), progress: 0.5 })
    expect(pixels).toHaveLength(GLASS_CELLS.length)
    // Dim cells are still the old preview, worn cells the new one (or the old
    // one flashing); full foreground only comes from the new one flashing.
    expect(colours(pixels)).toEqual(new Set([FOREGROUND_DIM, FOREGROUND_WORN, FOREGROUND]))
  })

  it('fades in from empty glass when there was no old preview', () => {
    expect(fromNook(filled(3), { from: null, progress: 0 })).toEqual([])
    const middle = fromNook(filled(3), { from: null, progress: 0.5 })
    expect(middle.length).toBeGreaterThan(0)
    expect(middle.length).toBeLessThan(GLASS_CELLS.length)
    expect(fromNook(filled(3), { from: null, progress: 1 })).toEqual(fromNook(filled(3)))
  })

  it('fades out to empty glass for a null preview', () => {
    expect(fromNook(null, { from: filled(3), progress: 0 })).toEqual(fromNook(filled(3)))
    const middle = fromNook(null, { from: filled(3), progress: 0.5 })
    expect(middle.length).toBeGreaterThan(0)
    expect(middle.length).toBeLessThan(GLASS_CELLS.length)
    expect(fromNook(null, { from: filled(3), progress: 1 })).toEqual([])
  })

  it('ignores a ripple while shimmering', () => {
    const centre = { s: 0, t: 0 }
    const ripple = { origin: centre, elapsedMs: rippleDuration(centre) / 2 }
    expect(fromNook(striped, { from: null, progress: 1 }, ripple)).toEqual(fromNook(striped))
  })

  it('is deterministic', () => {
    const shimmer = { from: striped, progress: 0.4 }
    expect(fromNook(filled(2), shimmer)).toEqual(fromNook(filled(2), shimmer))
  })
})
