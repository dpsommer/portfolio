import { describe, expect, it } from 'vitest'
import { CEILING_Y, FLOOR_Y, ROOM_HALF_WIDTH, WALL_VIEW_DISTANCE, projectPoint } from '../core/camera.ts'
import { FOREGROUND, FOREGROUND_WORN } from '../core/palette.ts'
import { textPixels, textWidth } from '../core/pixelFont.ts'
import { polyline } from '../mirror/frame.ts'
import type { MirrorLine, MirrorPoint } from '../mirror/frame.ts'
import { BOARD_OUTLINE, BOARD_RISE, NAIL, SIGN_BOUNDS, SIGN_CELL_SIZE, SIGN_LAYERS, SIGN_TEXT, SIGN_TEXT_CELLS } from './board.ts'

const [WORN, BOARD] = SIGN_LAYERS
const allPoints = (lines: MirrorLine[]) => lines.flat()
const [topLeft, topRight, bottomRight, bottomLeft] = BOARD_OUTLINE
// Undoes the board's tilt, so its edges and text sit square.
const unskew = ({ s, t }: MirrorPoint) => ({ s, t: t - BOARD_RISE * s })
const samePoint = (a: MirrorPoint, b: MirrorPoint) => {
  expect(a.s).toBeCloseTo(b.s, 9)
  expect(a.t).toBeCloseTo(b.t, 9)
}

// Whether a point is inside the closed outline made by `lines` (even-odd rule).
function isInside({ s, t }: MirrorPoint, lines: MirrorLine[]): boolean {
  let inside = false
  for (const [a, b] of lines) {
    if (a.t > t !== b.t > t && s < ((b.s - a.s) * (t - a.t)) / (b.t - a.t) + a.s) inside = !inside
  }
  return inside
}

describe('BOARD_OUTLINE', () => {
  it('is closed, ending where it starts', () => {
    expect(BOARD_OUTLINE).toHaveLength(5)
    samePoint(BOARD_OUTLINE[4], BOARD_OUTLINE[0])
  })

  it('keeps its sides upright', () => {
    expect(topLeft.s).toBeCloseTo(bottomLeft.s, 9)
    expect(topRight.s).toBeCloseTo(bottomRight.s, 9)
  })

  it('rises BOARD_RISE per unit to the right along its top and bottom', () => {
    expect(BOARD_RISE).toBeGreaterThan(0)
    expect((topRight.t - topLeft.t) / (topRight.s - topLeft.s)).toBeCloseTo(BOARD_RISE, 9)
    expect((bottomRight.t - bottomLeft.t) / (bottomRight.s - bottomLeft.s)).toBeCloseTo(BOARD_RISE, 9)
  })

  it('is a rectangle centred on (0, 0) once the tilt is undone', () => {
    const square = BOARD_OUTLINE.slice(0, 4).map(unskew)
    expect(square[0].t).toBeCloseTo(square[1].t, 9)
    expect(square[2].t).toBeCloseTo(square[3].t, 9)
    expect(square[0].s + square[1].s).toBeCloseTo(0, 9)
    expect(square[0].t + square[2].t).toBeCloseTo(0, 9)
  })

  it('is wider than it is tall', () => {
    expect(topRight.s - topLeft.s).toBeGreaterThan(topLeft.t - bottomLeft.t)
  })
})

describe('NAIL', () => {
  it('is on the centre line, above the board', () => {
    expect(NAIL.s).toBe(0)
    for (const { t } of BOARD_OUTLINE) expect(NAIL.t).toBeGreaterThan(t)
  })
})

describe('SIGN_LAYERS', () => {
  it('draws the nail and cords worn, then the board in the full foreground', () => {
    expect(SIGN_LAYERS.map(({ colour }) => colour)).toEqual([FOREGROUND_WORN, FOREGROUND])
  })

  it('draws the board as its outline', () => {
    expect(BOARD.lines).toEqual(polyline(BOARD_OUTLINE))
  })

  it.each([
    ['top left', topLeft],
    ['top right', topRight],
  ])('hangs a cord from the nail to the board\'s %s corner', (_, corner) => {
    expect(WORN.lines).toContainEqual([NAIL, corner])
  })

  it('draws a small closed nail around NAIL', () => {
    const nail = WORN.lines.filter((line) => !line.some((p) => p === NAIL))
    expect(nail.length).toBeGreaterThan(0)
    samePoint(nail[0][0], nail[nail.length - 1][1])
    for (const { s, t } of allPoints(nail)) {
      expect(Math.abs(s - NAIL.s)).toBeLessThan(0.05)
      expect(Math.abs(t - NAIL.t)).toBeLessThan(0.05)
    }
  })
})

describe('SIGN_CELL_SIZE', () => {
  it('is one canvas pixel at 320 wide from WALL_VIEW_DISTANCE away, in front of the sign', () => {
    const a = projectPoint({ x: 0, y: 0, z: WALL_VIEW_DISTANCE }, 320, 240)
    const b = projectPoint({ x: SIGN_CELL_SIZE, y: SIGN_CELL_SIZE, z: WALL_VIEW_DISTANCE }, 320, 240)
    expect(b.x - a.x).toBeCloseTo(1, 9)
    expect(a.y - b.y).toBeCloseTo(1, 9)
  })
})

describe('SIGN_TEXT_CELLS', () => {
  const square = SIGN_TEXT_CELLS.map(unskew)
  const cellIndex = (n: number) => n / SIGN_CELL_SIZE - 0.5

  it('has one cell per pixel of the text at scale 3', () => {
    expect(SIGN_TEXT_CELLS).toHaveLength(textPixels(SIGN_TEXT, 3).length)
  })

  it('puts every cell inside the board', () => {
    const outline = polyline(BOARD_OUTLINE)
    for (const cell of SIGN_TEXT_CELLS) expect(isInside(cell, outline)).toBe(true)
  })

  it('sits each cell in the middle of a cell-sized grid square across, and within the tilt of one up', () => {
    // Each glyph pixel's cells rise together, by the tilt at the glyph pixel's
    // middle, so undoing the tilt cell by cell leaves them a little off the grid.
    for (const { s, t } of square) {
      expect(cellIndex(s)).toBeCloseTo(Math.round(cellIndex(s)), 6)
      expect(Math.abs(cellIndex(t) - Math.round(cellIndex(t)))).toBeLessThanOrEqual(BOARD_RISE + 1e-9)
    }
  })

  it('raises the cells of each glyph pixel together', () => {
    // How far each cell sits above its grid square: the same for every cell in
    // a glyph pixel's 3-cell-wide column, so one value per glyph column.
    const gridT = (i: number) => (Math.round(cellIndex(square[i].t)) + 0.5) * SIGN_CELL_SIZE
    const firstColumn = Math.min(...SIGN_TEXT_CELLS.map(({ s }) => Math.round(cellIndex(s))))
    const rises = new Map<number, Set<string>>()
    SIGN_TEXT_CELLS.forEach((cell, i) => {
      const column = Math.floor((Math.round(cellIndex(cell.s)) - firstColumn) / 3)
      const set = rises.get(column) ?? new Set<string>()
      set.add((cell.t - gridT(i)).toFixed(9))
      rises.set(column, set)
    })
    expect(rises.size).toBeGreaterThan(1)
    for (const set of rises.values()) expect(set.size).toBe(1)
  })

  it('has no two cells in the same place', () => {
    const keys = square.map(({ s, t }) => `${Math.round(cellIndex(s))},${Math.round(cellIndex(t))}`)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('spans the text\'s width at scale 3, centred on the board within a cell', () => {
    const ss = square.map(({ s }) => s)
    const left = Math.min(...ss)
    const right = Math.max(...ss)
    expect(Math.round((right - left) / SIGN_CELL_SIZE) + 1).toBe(textWidth(SIGN_TEXT, 3))
    expect(Math.abs(left + right)).toBeLessThanOrEqual(SIGN_CELL_SIZE + 1e-9)
  })

  it('is centred on the board vertically within a cell', () => {
    const ts = square.map(({ t }) => t)
    expect(Math.abs(Math.min(...ts) + Math.max(...ts))).toBeLessThanOrEqual(SIGN_CELL_SIZE * (1 + 2 * BOARD_RISE) + 1e-9)
  })

  it('tilts with the board', () => {
    // Cells in the same text row rise to the right.
    const rowOf = (i: number) => Math.round(cellIndex(square[i].t))
    const row = SIGN_TEXT_CELLS.filter((_, i) => rowOf(i) === rowOf(0))
    const left = row.reduce((a, b) => (b.s < a.s ? b : a))
    const right = row.reduce((a, b) => (b.s > a.s ? b : a))
    expect((right.t - left.t) / (right.s - left.s)).toBeCloseTo(BOARD_RISE, 2)
  })
})

describe('SIGN_BOUNDS', () => {
  const points = [...SIGN_LAYERS.flatMap(({ lines }) => allPoints(lines)), ...SIGN_TEXT_CELLS]

  it('contains every line point and text cell', () => {
    for (const { s, t } of points) {
      expect(s).toBeGreaterThanOrEqual(SIGN_BOUNDS.left)
      expect(s).toBeLessThanOrEqual(SIGN_BOUNDS.right)
      expect(t).toBeGreaterThanOrEqual(SIGN_BOUNDS.bottom)
      expect(t).toBeLessThanOrEqual(SIGN_BOUNDS.top)
    }
  })

  it('is tight around them', () => {
    expect(points.some(({ s }) => s === SIGN_BOUNDS.left)).toBe(true)
    expect(points.some(({ s }) => s === SIGN_BOUNDS.right)).toBe(true)
    expect(points.some(({ t }) => t === SIGN_BOUNDS.bottom)).toBe(true)
    expect(points.some(({ t }) => t === SIGN_BOUNDS.top)).toBe(true)
  })

  it('reaches up to the top of the nail', () => {
    expect(SIGN_BOUNDS.top).toBeGreaterThan(NAIL.t)
    expect(SIGN_BOUNDS.top - NAIL.t).toBeLessThan(0.05)
  })

  it('fits on the far wall when centred on it at eye height', () => {
    expect(SIGN_BOUNDS.left).toBeGreaterThan(-ROOM_HALF_WIDTH)
    expect(SIGN_BOUNDS.right).toBeLessThan(ROOM_HALF_WIDTH)
    expect(SIGN_BOUNDS.top).toBeLessThan(CEILING_Y)
    expect(SIGN_BOUNDS.bottom).toBeGreaterThan(FLOOR_Y)
  })
})
