import { describe, expect, it } from 'vitest'
import { CEILING_Y, FLOOR_Y } from '../core/camera.ts'
import { FOREGROUND, FOREGROUND_DIM, FOREGROUND_WORN } from '../core/palette.ts'
import { GLASS_OUTLINE, MIRROR_BOUNDS, MIRROR_LAYERS, isOnGlass } from './frame.ts'
import type { MirrorLine, MirrorPoint } from './frame.ts'

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

  it.each([
    ['the frame and its ornaments', FRAME],
    ['the glass edge', GLASS],
  ])('makes %s left/right symmetric', (_, { lines }) => {
    const keys = new Set(lines.map(lineKey))
    for (const line of lines) expect(keys.has(lineKey(reflect(line)))).toBe(true)
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

describe('GLASS_OUTLINE', () => {
  it('is the glass edge drawn in the worn layer', () => {
    expect(GLASS.lines.flat().map(pointKey)).toEqual(
      GLASS_OUTLINE.slice(1).flatMap((p, i) => [pointKey(GLASS_OUTLINE[i]), pointKey(p)]),
    )
  })
})

describe('isOnGlass', () => {
  it.each([
    ['at the centre', 0, 0],
    ['near the top of the arch', 0, 0.45],
    ['inside the arch, off the centre line', 0.2, 0.35],
    ['near a straight side', -0.32, -0.2],
    ['just above the bottom edge', 0.1, -0.47],
  ])('is true %s', (_, s, t) => {
    expect(isOnGlass({ s, t })).toBe(true)
  })

  it.each([
    ['at the top right shoulder corner, outside the arch', 0.3, 0.45],
    ['at the top left shoulder corner, outside the arch', -0.3, 0.45],
    ['on the frame band at the right side', 0.36, 0],
    ['on the frame band at the left side', -0.36, 0],
    ['on the frame band at the arch', 0, 0.52],
    ['on the frame band at the bottom', 0, -0.52],
    ['outside the mirror altogether', 1, 0],
  ])('is false %s', (_, s, t) => {
    expect(isOnGlass({ s, t })).toBe(false)
  })

  it('is true on the bottom edge and false just below it', () => {
    expect(isOnGlass({ s: 0, t: -0.48 })).toBe(true)
    expect(isOnGlass({ s: 0, t: -0.481 })).toBe(false)
  })

  // The outline is the boundary, so test points a hair inside it, clear of rounding.
  it('is true just inside every point of the glass outline', () => {
    for (const { s, t } of GLASS_OUTLINE) expect(isOnGlass({ s: s * 0.999, t: t * 0.999 })).toBe(true)
  })

  it('is false just outside every point of the glass outline', () => {
    for (const { s, t } of GLASS_OUTLINE) expect(isOnGlass({ s: s * 1.01, t: t * 1.01 })).toBe(false)
  })

  it('is left/right symmetric', () => {
    for (const s of [0.1, 0.25, 0.33, 0.34]) {
      for (const t of [-0.5, 0, 0.3, 0.45]) expect(isOnGlass({ s: -s, t })).toBe(isOnGlass({ s, t }))
    }
  })
})
