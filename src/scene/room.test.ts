import { describe, expect, it } from 'vitest'
import { BACK_Z, CEILING_Y, FAR_Z, ROOM_HALF_WIDTH } from './camera.ts'
import { FOREGROUND_DIM, FOREGROUND_WORN } from './palette.ts'
import { WALLS, roomPixels } from './room.ts'
import type { Pixel } from './types.ts'

const WIDTH = 320
const HEIGHT = 240

// The far wall's rect facing north at 320x240: FAR_WALL_SCALE (0.45) of the view, centred.
const FAR_WALL = { left: 88, top: 66, right: 232, bottom: 174 }

const key = (p: { x: number; y: number }) => `${p.x},${p.y}`
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

describe('WALLS', () => {
  it('places each wall on its side of the box', () => {
    expect(WALLS.north.start.z).toBe(FAR_Z)
    expect(WALLS.south.start.z).toBe(BACK_Z)
    expect(WALLS.west.start.x).toBe(-ROOM_HALF_WIDTH)
    expect(WALLS.east.start.x).toBe(ROOM_HALF_WIDTH)
  })

  it('starts every wall at the ceiling', () => {
    for (const wall of Object.values(WALLS)) expect(wall.start.y).toBe(CEILING_Y)
  })

  it('gives each wall the length of its side of the box', () => {
    expect(WALLS.north.length).toBeCloseTo(2 * ROOM_HALF_WIDTH)
    expect(WALLS.south.length).toBeCloseTo(2 * ROOM_HALF_WIDTH)
    expect(WALLS.west.length).toBeCloseTo(FAR_Z - BACK_Z)
    expect(WALLS.east.length).toBeCloseTo(FAR_Z - BACK_Z)
  })

  it('runs each wall left to right as seen from inside the room', () => {
    // Seen from the centre, a wall's right end is clockwise of its left end (from above).
    for (const wall of Object.values(WALLS)) {
      const { start, along, length } = wall
      const end = { x: start.x + along.x * length, z: start.z + along.z * length }
      const cross = start.x * end.z - start.z * end.x
      expect(cross).toBeLessThan(0)
    }
  })

  it('ends each wall where the next one clockwise begins', () => {
    const order = ['north', 'east', 'south', 'west'] as const
    order.forEach((name, i) => {
      const { start, along, length } = WALLS[name]
      const next = WALLS[order[(i + 1) % order.length]].start
      expect(start.x + along.x * length).toBeCloseTo(next.x)
      expect(start.z + along.z * length).toBeCloseTo(next.z)
    })
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
    expect(roomPixels(WIDTH, HEIGHT, 2 * Math.PI)).toEqual(roomPixels(WIDTH, HEIGHT, 0))
  })

  it('is the same for a quarter turn left and three quarter turns right', () => {
    expect(roomPixels(WIDTH, HEIGHT, -(3 * Math.PI) / 2)).toEqual(roomPixels(WIDTH, HEIGHT, Math.PI / 2))
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

    it('draws the corner edges along the diagonals to the view corners', () => {
      // Facing north the wall edges run from the far wall's corners to the view's corners,
      // so in the corner regions worn pixels sit near the line through the canvas centre.
      const corners = worn(pixels).filter(
        (p) => (p.x < FAR_WALL.left - 10 || p.x > FAR_WALL.right + 10) && (p.y < FAR_WALL.top - 10 || p.y > FAR_WALL.bottom + 10),
      )
      expect(corners.length).toBeGreaterThan(0)
      for (const p of corners) {
        const expectedY = HEIGHT / 2 + ((p.x - WIDTH / 2) * (HEIGHT / WIDTH)) * Math.sign(p.y - HEIGHT / 2) * Math.sign(p.x - WIDTH / 2)
        expect(Math.abs(p.y - expectedY)).toBeLessThanOrEqual(2)
      }
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
    // The back-west corner is -BACK_Z left of straight ahead at distance 1: 160 - 1 * 128.
    const CORNER_X = Math.round(WIDTH / 2 + BACK_Z * 0.8 * (WIDTH / 2))

    it('draws the back wall corner as a tall worn vertical edge', () => {
      expect(CORNER_X).toBe(32)
      expect(wornRowsIn(pixels, CORNER_X - 1, CORNER_X + 1).size).toBeGreaterThan(HEIGHT * 0.4)
    })

    it('has no other tall vertical edges, since the far wall is out of view', () => {
      for (const x of verticalEdgeColumns(pixels, HEIGHT * 0.25)) {
        expect(Math.abs(x - CORNER_X)).toBeLessThanOrEqual(1)
      }
    })

    it('draws the west wall face-on, with its floor and ceiling edges horizontal', () => {
      // The west wall is parallel to the view, 1 unit away: floor and ceiling at 120 ± 96.
      for (const y of [24, 216]) {
        const columns = new Set(
          worn(pixels)
            .filter((p) => Math.abs(p.y - y) <= 1 && p.x > CORNER_X)
            .map((p) => p.x),
        )
        expect(columns.size).toBeGreaterThan((WIDTH - CORNER_X) / 2)
      }
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

    it('frames the back wall with its edges, so the room is still visible', () => {
      // The back wall is -BACK_Z (1) away: its corners at 160 ± 128 and floor and ceiling at 120 ± 96.
      const left = Math.round(WIDTH / 2 + BACK_Z * 0.8 * (WIDTH / 2))
      const right = Math.round(WIDTH / 2 - BACK_Z * 0.8 * (WIDTH / 2))
      expect(wornRowsIn(pixels, left - 1, left + 1).size).toBeGreaterThan(HEIGHT * 0.4)
      expect(wornRowsIn(pixels, right - 1, right + 1).size).toBeGreaterThan(HEIGHT * 0.4)
      for (const y of [24, 216]) {
        const columns = new Set(worn(pixels).filter((p) => Math.abs(p.y - y) <= 1).map((p) => p.x))
        expect(columns.size).toBeGreaterThan((right - left) / 2)
      }
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
