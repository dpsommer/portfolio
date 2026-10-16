import { describe, expect, it } from 'vitest'
import { BACK_Z, CEILING_Y, FAR_Z, NOOK_FRONT_Z, NOOK_X, ROOM_HALF_WIDTH } from './camera.ts'
import { FOREGROUND_DIM, FOREGROUND_WORN } from './palette.ts'
import { FLOOR_PLAN, WALLS, isOnFloor, roomPixels } from './room.ts'
import type { WallName } from './room.ts'
import type { Pixel } from './types.ts'

const WIDTH = 320
const HEIGHT = 240

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
    expect(WALLS.south.length).toBeCloseTo(3)
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

describe('roomPixels', () => {
  it('is deterministic', () => {
    expect(roomPixels(WIDTH, HEIGHT)).toEqual(roomPixels(WIDTH, HEIGHT))
  })

  it('defaults to facing north', () => {
    expect(roomPixels(WIDTH, HEIGHT)).toEqual(roomPixels(WIDTH, HEIGHT, 0))
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
    // The nook's back wall is 2 away, from z BACK_Z on the left to NOOK_FRONT_Z on the
    // right: 160 ± 64 across and 120 ± 48 down.
    const NOOK = { left: 96, top: 72, right: 224, bottom: 168 }
    // The main room's left wall starts at (-1, NOOK_FRONT_Z): 1 right at distance 1.
    const WEST_CORNER_X = 288

    it('draws the nook back wall\'s corners as worn vertical edges', () => {
      expect(Math.round(WIDTH / 2 + (BACK_Z * 0.8 * (WIDTH / 2)) / -NOOK_X)).toBe(NOOK.left)
      expect(Math.round(WIDTH / 2 + (NOOK_FRONT_Z * 0.8 * (WIDTH / 2)) / -NOOK_X)).toBe(NOOK.right)
      for (const x of [NOOK.left, NOOK.right]) {
        const rows = [...wornRowsIn(pixels, x - 1, x + 1)].filter((y) => y >= NOOK.top && y <= NOOK.bottom)
        expect(rows.length).toBeGreaterThan((NOOK.bottom - NOOK.top) / 2)
      }
    })

    it.each([
      ['ceiling', 72],
      ['floor', 168],
    ])('draws the nook back wall\'s %s edge as a worn horizontal line', (_, y) => {
      const columns = new Set(
        worn(pixels)
          .filter((p) => Math.abs(p.y - y) <= 1 && p.x >= NOOK.left && p.x <= NOOK.right)
          .map((p) => p.x),
      )
      expect(columns.size).toBeGreaterThan((NOOK.right - NOOK.left) / 2)
    })

    it('draws the main room\'s left wall corner as a tall worn vertical edge', () => {
      expect(Math.round(WIDTH / 2 + NOOK_FRONT_Z * 0.8 * (WIDTH / 2))).toBe(WEST_CORNER_X)
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
      for (const y of [24, 216]) {
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
      expect(dim(pixels).filter((p) => Math.abs(p.y - 216) <= 1 && p.x > WEST_CORNER_X + 1)).toEqual([])
    })

    it('differs from the north view', () => {
      expect(pixels).not.toEqual(roomPixels(WIDTH, HEIGHT, 0))
    })
  })

  describe('facing east', () => {
    const pixels = roomPixels(WIDTH, HEIGHT, (3 * Math.PI) / 2)
    const CORNER_X = Math.round(WIDTH / 2 - BACK_Z * 0.8 * (WIDTH / 2))

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
    // its east corner is at 160 - 128 and its west corner, at 160 + 256, is off-screen.
    const EAST_CORNER_X = Math.round(WIDTH / 2 + BACK_Z * 0.8 * (WIDTH / 2))

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
      for (const y of [24, 216]) {
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
      expect(dim(pixels).filter((p) => Math.abs(p.y - 216) <= 1 && p.x > EAST_CORNER_X + 1)).toEqual([])
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
})
