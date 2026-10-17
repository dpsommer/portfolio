import { describe, expect, it } from 'vitest'
import { FLOOR_Y } from '../core/camera.ts'
import { FOREGROUND_DIM, FOREGROUND_WORN } from '../core/palette.ts'
import { MIRROR_BOUNDS } from './frame.ts'
import type { MirrorLine, MirrorPoint } from './frame.ts'
import { LOGO_SIZE, PLAQUE_BOUNDS, logoCells, parseLogo, plaqueLayers } from './plaque.ts'
import type { LogoMap } from './plaque.ts'
import { PIXELS_PER_UNIT } from './preview.ts'
import { PULL_BOUNDS, PULL_S } from './pull.ts'

// The plaque's centre height, half-way between PLAQUE_BOUNDS' top and bottom.
const CENTRE_T = (PLAQUE_BOUNDS.top + PLAQUE_BOUNDS.bottom) / 2
// The face's half-size at rest, and one logo cell's size in mirror units.
const FACE_HALF_SIZE = 0.075
const CELL = 1 / PIXELS_PER_UNIT
// How far the pull's handle drops when tugged (as in ViewPane).
const PULL_DROP = 0.1

// A logo map of `char` everywhere, with `rows` (by index) overriding rows.
function logoMap(char: string, rows: Record<number, string> = {}): LogoMap {
  return Array.from({ length: LOGO_SIZE }, (_, r) => rows[r] ?? char.repeat(LOGO_SIZE))
}
// A full logo, every cell at the full foreground.
const FULL = logoMap('#')

const allPoints = (lines: MirrorLine[]) => lines.flat()
const extent = (points: MirrorPoint[]) => ({
  left: Math.min(...points.map(({ s }) => s)),
  right: Math.max(...points.map(({ s }) => s)),
  bottom: Math.min(...points.map(({ t }) => t)),
  top: Math.max(...points.map(({ t }) => t)),
})
const length = ([a, b]: MirrorLine) => Math.hypot(b.s - a.s, b.t - a.t)
// plaqueLayers' niche layer is its four edges then the four corner lines.
const nicheEdges = (depth = 0, turn = 0) => plaqueLayers(depth, turn)[0].lines.slice(0, 4)
const cornerLines = (depth = 0, turn = 0) => plaqueLayers(depth, turn)[0].lines.slice(4)
const face = (depth = 0, turn = 0) => extent(allPoints(plaqueLayers(depth, turn)[1].lines))

describe('LOGO_SIZE', () => {
  it('is 16 cells', () => {
    expect(LOGO_SIZE).toBe(16)
  })
})

describe('parseLogo', () => {
  it.each([
    ['#', 3],
    ['+', 2],
    ['-', 1],
  ])('gives \'%s\' tone %i', (char, tone) => {
    expect(parseLogo(logoMap(char)).every((cell) => cell.tone === tone)).toBe(true)
  })

  it('skips empty \'.\' cells', () => {
    expect(parseLogo(logoMap('.'))).toEqual([])
  })

  it('keeps every non-empty cell', () => {
    expect(parseLogo(FULL)).toHaveLength(LOGO_SIZE * LOGO_SIZE)
  })

  it('gives each cell its column and row in the map', () => {
    const map = logoMap('.', { 2: '.....#.........+', 15: '-...............' })
    expect(parseLogo(map)).toEqual([
      { col: 5, row: 2, tone: 3 },
      { col: 15, row: 2, tone: 2 },
      { col: 0, row: 15, tone: 1 },
    ])
  })

  it('throws for too few rows', () => {
    expect(() => parseLogo(FULL.slice(1))).toThrow('16×16')
  })

  it('throws for too many rows', () => {
    expect(() => parseLogo([...FULL, FULL[0]])).toThrow('16×16')
  })

  it('throws for a row of the wrong width', () => {
    expect(() => parseLogo(logoMap('#', { 7: '#'.repeat(15) }))).toThrow('16×16')
  })

  it('throws for an unknown character, naming it', () => {
    expect(() => parseLogo(logoMap('#', { 3: '#######x########' }))).toThrow('\'x\'')
  })
})

describe('plaqueLayers', () => {
  it('has a dim niche layer and a worn face layer', () => {
    expect(plaqueLayers().map(({ colour }) => colour)).toEqual([FOREGROUND_DIM, FOREGROUND_WORN])
  })

  it('defaults to flush and facing out', () => {
    expect(plaqueLayers()).toEqual(plaqueLayers(0, 0))
  })

  it('draws the niche as a closed square of four edges and four corner lines', () => {
    const [niche] = plaqueLayers()
    expect(niche.lines).toHaveLength(8)
    const edges = nicheEdges()
    expect(edges[0][0]).toEqual(edges[3][1])
    const { left, right, bottom, top } = extent(allPoints(edges))
    expect(right - left).toBeCloseTo(top - bottom)
  })

  it('centres the niche under the pull\'s cord', () => {
    const { left, right } = extent(allPoints(nicheEdges()))
    expect((left + right) / 2).toBeCloseTo(PULL_S)
  })

  it('draws the face as a closed outline of four edges', () => {
    const points = allPoints(plaqueLayers()[1].lines)
    expect(plaqueLayers()[1].lines).toHaveLength(4)
    expect(points[0]).toEqual(points[points.length - 1])
  })

  it('centres the face under the pull\'s cord at rest', () => {
    const { left, right, bottom, top } = face()
    expect((left + right) / 2).toBeCloseTo(PULL_S)
    expect((top + bottom) / 2).toBeCloseTo(CENTRE_T)
  })

  it('makes the face a 0.15 square at rest', () => {
    const { left, right, bottom, top } = face()
    expect(right - left).toBeCloseTo(2 * FACE_HALF_SIZE)
    expect(top - bottom).toBeCloseTo(2 * FACE_HALF_SIZE)
  })

  it('keeps the face inside the niche at rest', () => {
    const niche = extent(allPoints(nicheEdges()))
    const { left, right, bottom, top } = face()
    expect(left).toBeGreaterThan(niche.left)
    expect(right).toBeLessThan(niche.right)
    expect(bottom).toBeGreaterThan(niche.bottom)
    expect(top).toBeLessThan(niche.top)
  })

  it('runs each corner line from a niche corner to the face\'s matching corner', () => {
    const corners = allPoints(nicheEdges()).slice(0, 8).filter((_, i) => i % 2 === 0)
    const faceCorners = allPoints(plaqueLayers()[1].lines).filter((_, i) => i % 2 === 0)
    expect(cornerLines().map(([a]) => a)).toEqual(corners)
    expect(cornerLines().map(([, b]) => b)).toEqual(faceCorners)
  })

  it('keeps the niche the same however far the block is sunk or turned', () => {
    expect(nicheEdges(1, 0.3)).toEqual(nicheEdges())
  })

  it('shrinks the face to 0.8 of its size toward the centre when fully sunk', () => {
    const rest = face()
    const sunk = face(1)
    expect(sunk.right - sunk.left).toBeCloseTo(0.8 * (rest.right - rest.left))
    expect(sunk.top - sunk.bottom).toBeCloseTo(0.8 * (rest.top - rest.bottom))
    expect((sunk.left + sunk.right) / 2).toBeCloseTo(PULL_S)
    expect((sunk.top + sunk.bottom) / 2).toBeCloseTo(CENTRE_T)
  })

  it('shrinks the face further the deeper it sinks', () => {
    const width = (depth: number) => face(depth).right - face(depth).left
    expect(width(0.5)).toBeLessThan(width(0))
    expect(width(1)).toBeLessThan(width(0.5))
  })

  it('lengthens the corner lines as the block sinks', () => {
    for (const [i, line] of cornerLines(1).entries()) {
      expect(length(line)).toBeGreaterThan(length(cornerLines()[i]))
    }
  })

  it('narrows the face, not its height, as it turns', () => {
    const quarter = face(0, 0.25)
    expect(quarter.right - quarter.left).toBeCloseTo(2 * FACE_HALF_SIZE * Math.cos(Math.PI / 4))
    expect(quarter.top - quarter.bottom).toBeCloseTo(2 * FACE_HALF_SIZE)
  })

  it('turns the face edge-on, about zero width, half-way through the turn', () => {
    const { left, right } = face(1, 0.5)
    expect(right - left).toBeCloseTo(0)
    expect(left).toBeCloseTo(PULL_S)
  })

  it('brings the face back to full width at the end of the turn', () => {
    expect(face(1, 1)).toEqual(face(1, 0))
  })
})

describe('logoCells', () => {
  const cellExtent = (logo: LogoMap, depth?: number, turn?: number) => extent(logoCells(logo, depth, turn))

  it('defaults to flush and facing out', () => {
    expect(logoCells(FULL)).toEqual(logoCells(FULL, 0, 0))
  })

  it('gives one point per non-empty cell at rest, with the map\'s tones', () => {
    const map = logoMap('.', { 0: '#+-.............' })
    expect(logoCells(map).map(({ tone }) => tone)).toEqual([3, 2, 1])
  })

  it('centres the logo on the face at rest', () => {
    const { left, right, bottom, top } = cellExtent(FULL)
    expect((left + right) / 2).toBeCloseTo(PULL_S)
    expect((top + bottom) / 2).toBeCloseTo(CENTRE_T)
  })

  it('spaces cells one canvas pixel from the nook apart', () => {
    const [first, second] = logoCells(FULL)
    expect(second.s - first.s).toBeCloseTo(CELL)
    expect(first.t).toBeCloseTo(second.t)
  })

  it('puts the map\'s first row at the top and first column at the left', () => {
    const corner = logoCells(logoMap('.', { 0: '#...............' }))[0]
    const { left, top } = cellExtent(FULL)
    expect(corner.s).toBeCloseTo(left)
    expect(corner.t).toBeCloseTo(top)
  })

  it('keeps the logo inside the face at rest', () => {
    const cells = cellExtent(FULL)
    const { left, right, bottom, top } = face()
    expect(cells.left).toBeGreaterThan(left)
    expect(cells.right).toBeLessThan(right)
    expect(cells.bottom).toBeGreaterThan(bottom)
    expect(cells.top).toBeLessThan(top)
  })

  it('keeps the tones when only part-sunk', () => {
    expect(logoCells(FULL, 0.4).every(({ tone }) => tone === 3)).toBe(true)
  })

  it('drops each tone by one step when sunk', () => {
    const map = logoMap('.', { 0: '#+..............' })
    expect(logoCells(map, 1).map(({ tone }) => tone)).toEqual([2, 1])
  })

  it('drops dim cells that would reach the background when sunk', () => {
    expect(logoCells(logoMap('-'), 1)).toEqual([])
    expect(logoCells(logoMap('-', { 0: '#'.repeat(LOGO_SIZE) }), 1)).toHaveLength(LOGO_SIZE)
  })

  it('shrinks the logo with the face toward its centre when sunk', () => {
    const rest = cellExtent(FULL)
    const sunk = cellExtent(FULL, 1)
    expect(sunk.right - sunk.left).toBeCloseTo(0.8 * (rest.right - rest.left))
    expect(sunk.top - sunk.bottom).toBeCloseTo(0.8 * (rest.top - rest.bottom))
    expect((sunk.left + sunk.right) / 2).toBeCloseTo(PULL_S)
  })

  it('narrows the logo as it turns, keeping its height', () => {
    const rest = cellExtent(FULL, 1)
    const turning = cellExtent(FULL, 1, 0.3)
    expect(turning.right - turning.left).toBeLessThan(rest.right - rest.left)
    expect(turning.top - turning.bottom).toBeCloseTo(rest.top - rest.bottom)
  })

  it('collapses the logo to the centre line edge-on', () => {
    for (const { s } of logoCells(FULL, 1, 0.5)) expect(s).toBeCloseTo(PULL_S)
  })

  it('throws for a malformed map', () => {
    expect(() => logoCells(['#'])).toThrow()
  })
})

describe('PLAQUE_BOUNDS', () => {
  it('matches the niche', () => {
    const { left, right, bottom, top } = extent(allPoints(nicheEdges()))
    expect(PLAQUE_BOUNDS.left).toBeCloseTo(left)
    expect(PLAQUE_BOUNDS.right).toBeCloseTo(right)
    expect(PLAQUE_BOUNDS.bottom).toBeCloseTo(bottom)
    expect(PLAQUE_BOUNDS.top).toBeCloseTo(top)
  })

  it('contains everything drawn, however sunk or turned', () => {
    for (const [depth, turn] of [[0, 0], [1, 0], [1, 0.3], [0.5, 0.5]]) {
      const points = [...plaqueLayers(depth, turn).flatMap(({ lines }) => allPoints(lines)), ...logoCells(FULL, depth, turn)]
      for (const { s, t } of points) {
        expect(s).toBeGreaterThanOrEqual(PLAQUE_BOUNDS.left - 1e-9)
        expect(s).toBeLessThanOrEqual(PLAQUE_BOUNDS.right + 1e-9)
        expect(t).toBeGreaterThanOrEqual(PLAQUE_BOUNDS.bottom - 1e-9)
        expect(t).toBeLessThanOrEqual(PLAQUE_BOUNDS.top + 1e-9)
      }
    }
  })

  it('lies below the pull\'s handle at its lowest drop', () => {
    expect(PLAQUE_BOUNDS.top).toBeLessThan(PULL_BOUNDS.bottom - PULL_DROP)
  })

  it('stays above the floor and clear of the mirror', () => {
    expect(PLAQUE_BOUNDS.bottom).toBeGreaterThan(FLOOR_Y)
    expect(PLAQUE_BOUNDS.left).toBeGreaterThan(MIRROR_BOUNDS.right)
  })
})
