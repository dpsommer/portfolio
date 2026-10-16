import { describe, expect, it } from 'vitest'
import { CEILING_Y, FLOOR_Y } from './camera.ts'
import { MIRROR_BOUNDS, MIRROR_LAYERS } from './mirror.ts'
import type { MirrorLine, MirrorPoint } from './mirror.ts'
import { FOREGROUND, FOREGROUND_DIM, FOREGROUND_WORN } from './palette.ts'

const WALL_HEIGHT = CEILING_Y - FLOOR_Y
const [GLINTS, GLASS, FRAME] = MIRROR_LAYERS
const allPoints = (lines: MirrorLine[]) => lines.flat()

// Lines as order-independent keys, rounded so reflections compare equal.
const round = (n: number) => (Math.round(n * 1e6) / 1e6 || 0).toFixed(6)
const pointKey = ({ s, t }: MirrorPoint) => `${round(s)},${round(t)}`
const lineKey = ([a, b]: MirrorLine) => [pointKey(a), pointKey(b)].sort().join('|')
const reflect = ([a, b]: MirrorLine): MirrorLine => [
  { s: -a.s, t: a.t },
  { s: -b.s, t: b.t },
]

// The s positions of a layer's long vertical lines: the straight sides of an arch.
function sideColumns(lines: MirrorLine[]): number[] {
  return lines
    .filter(([a, b]) => Math.abs(a.s - b.s) < 1e-9 && Math.abs(a.t - b.t) > 0.3)
    .map(([a]) => a.s)
    .sort((x, y) => x - y)
}

// Whether a point is inside the closed outline made by `lines` (even-odd rule).
function isInside({ s, t }: MirrorPoint, lines: MirrorLine[]): boolean {
  let inside = false
  for (const [a, b] of lines) {
    if (a.t > t !== b.t > t && s < ((b.s - a.s) * (t - a.t)) / (b.t - a.t) + a.s) inside = !inside
  }
  return inside
}

describe('MIRROR_LAYERS', () => {
  it('draws the glints, then the glass edge, then the frame', () => {
    expect(MIRROR_LAYERS.map(({ colour }) => colour)).toEqual([FOREGROUND_DIM, FOREGROUND_WORN, FOREGROUND])
  })

  it('has lines in every layer', () => {
    for (const { lines } of MIRROR_LAYERS) expect(lines.length).toBeGreaterThan(0)
  })

  it('only uses finite coordinates', () => {
    for (const { lines } of MIRROR_LAYERS) {
      for (const { s, t } of allPoints(lines)) {
        expect(Number.isFinite(s)).toBe(true)
        expect(Number.isFinite(t)).toBe(true)
      }
    }
  })

  it('gives the frame straight sides 0.8 apart, centred on s 0', () => {
    const [left, right] = sideColumns(FRAME.lines)
    expect(sideColumns(FRAME.lines)).toHaveLength(2)
    expect(right - left).toBeCloseTo(0.8)
    expect(left + right).toBeCloseTo(0)
  })

  it('sets the glass edge 0.07 inside the frame on each side', () => {
    const [frameLeft, frameRight] = sideColumns(FRAME.lines)
    const [glassLeft, glassRight] = sideColumns(GLASS.lines)
    expect(glassLeft - frameLeft).toBeCloseTo(0.07)
    expect(frameRight - glassRight).toBeCloseTo(0.07)
  })

  it('closes the glass edge into a loop', () => {
    const points = allPoints(GLASS.lines)
    expect(pointKey(points[0])).toBe(pointKey(points[points.length - 1]))
    for (let i = 1; i < GLASS.lines.length; i++) {
      expect(pointKey(GLASS.lines[i][0])).toBe(pointKey(GLASS.lines[i - 1][1]))
    }
  })

  it('makes the frame and its ornaments left/right symmetric', () => {
    const keys = new Set(FRAME.lines.map(lineKey))
    for (const line of FRAME.lines) expect(keys.has(lineKey(reflect(line)))).toBe(true)
  })

  it('makes the glass edge left/right symmetric', () => {
    const keys = new Set(GLASS.lines.map(lineKey))
    for (const line of GLASS.lines) expect(keys.has(lineKey(reflect(line)))).toBe(true)
  })

  it('puts the glints on the glass, inside its edge', () => {
    for (const point of allPoints(GLINTS.lines)) expect(isInside(point, GLASS.lines)).toBe(true)
  })

  it('puts the glints in the glass\'s upper left', () => {
    for (const { s } of allPoints(GLINTS.lines)) expect(s).toBeLessThan(0)
  })

  it('reaches above and below the frame with the crest and pendant on the centre line', () => {
    const framePoints = allPoints(FRAME.lines)
    const top = framePoints.find(({ t }) => t === MIRROR_BOUNDS.top)!
    const bottom = framePoints.find(({ t }) => t === MIRROR_BOUNDS.bottom)!
    expect(top.s).toBeCloseTo(0)
    expect(bottom.s).toBeCloseTo(0)
  })
})

describe('MIRROR_BOUNDS', () => {
  const points = MIRROR_LAYERS.flatMap(({ lines }) => allPoints(lines))

  it('contains every point of every layer', () => {
    for (const { s, t } of points) {
      expect(s).toBeGreaterThanOrEqual(MIRROR_BOUNDS.left)
      expect(s).toBeLessThanOrEqual(MIRROR_BOUNDS.right)
      expect(t).toBeGreaterThanOrEqual(MIRROR_BOUNDS.bottom)
      expect(t).toBeLessThanOrEqual(MIRROR_BOUNDS.top)
    }
  })

  it('is tight around the points', () => {
    expect(points.some(({ s }) => s === MIRROR_BOUNDS.left)).toBe(true)
    expect(points.some(({ s }) => s === MIRROR_BOUNDS.right)).toBe(true)
    expect(points.some(({ t }) => t === MIRROR_BOUNDS.bottom)).toBe(true)
    expect(points.some(({ t }) => t === MIRROR_BOUNDS.top)).toBe(true)
  })

  it('is a little shorter than the wall', () => {
    const height = MIRROR_BOUNDS.top - MIRROR_BOUNDS.bottom
    expect(height).toBeGreaterThan(1.2)
    expect(height).toBeLessThan(WALL_HEIGHT)
  })

  it('is centred vertically around t 0', () => {
    expect((MIRROR_BOUNDS.top + MIRROR_BOUNDS.bottom) / 2).toBeCloseTo(0, 1)
  })

  it('fits between the floor and the ceiling when centred at eye height', () => {
    expect(MIRROR_BOUNDS.top).toBeLessThan(CEILING_Y)
    expect(MIRROR_BOUNDS.bottom).toBeGreaterThan(FLOOR_Y)
  })

  it('is centred horizontally on s 0, wider than the frame for the scrolls', () => {
    expect(MIRROR_BOUNDS.left).toBeCloseTo(-MIRROR_BOUNDS.right)
    expect(MIRROR_BOUNDS.right - MIRROR_BOUNDS.left).toBeGreaterThan(0.8)
  })
})
