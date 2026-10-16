import { describe, expect, it } from 'vitest'
import { isOnGlass } from './frame.ts'
import type { MirrorPoint } from './frame.ts'
import { ringLines, rippleDuration, rippleOffset, rippleRings } from './ripple.ts'

const CENTRE: MirrorPoint = { s: 0, t: 0 }
// Near the glass's lower right corner.
const NEAR_EDGE: MirrorPoint = { s: 0.3, t: -0.45 }
// Seconds between rings (EMIT_INTERVAL) in ms.
const INTERVAL_MS = 350

describe('rippleRings', () => {
  // Every ring has started by now and none has reached the edge yet.
  const ALL_STARTED_MS = 2 * INTERVAL_MS + 300

  it('has every ring alive once they\'ve all started, before any fades', () => {
    expect(rippleRings(CENTRE, ALL_STARTED_MS)).toHaveLength(3)
  })

  it('lists the rings outermost first', () => {
    const radii = rippleRings(CENTRE, ALL_STARTED_MS).map(({ radius }) => radius)
    expect(radii).toEqual([...radii].sort((a, b) => b - a))
  })

  it('spaces consecutive rings further apart further out', () => {
    const radii = rippleRings(CENTRE, ALL_STARTED_MS).map(({ radius }) => radius)
    const gaps = radii.slice(1).map((r, i) => radii[i] - r)
    for (let i = 1; i < gaps.length; i++) expect(gaps[i - 1]).toBeGreaterThan(gaps[i])
  })

  it('gives larger rings less strength', () => {
    const rings = rippleRings(CENTRE, ALL_STARTED_MS)
    for (let i = 1; i < rings.length; i++) expect(rings[i - 1].strength).toBeLessThan(rings[i].strength)
  })

  it('keeps every ring\'s strength in (0, 1] throughout', () => {
    const duration = rippleDuration(CENTRE)
    for (let ms = 0; ms <= duration; ms += 20) {
      for (const { strength } of rippleRings(CENTRE, ms)) {
        expect(strength).toBeGreaterThan(0)
        expect(strength).toBeLessThanOrEqual(1)
      }
    }
  })

  it('grows a ring over time', () => {
    const [early] = rippleRings(CENTRE, 100)
    const [later] = rippleRings(CENTRE, 200)
    expect(later.radius).toBeGreaterThan(early.radius)
  })

  it('has nothing alive at the click', () => {
    expect(rippleRings(CENTRE, 0)).toEqual([])
  })

  it('has only the first ring before the second has started', () => {
    expect(rippleRings(CENTRE, INTERVAL_MS - 10)).toHaveLength(1)
  })

  it.each([
    ['the centre', CENTRE],
    ['near an edge', NEAR_EDGE],
  ])('has nothing alive at the duration for a click at %s', (_, origin) => {
    expect(rippleRings(origin, rippleDuration(origin))).toEqual([])
  })

  it.each([
    ['the centre', CENTRE],
    ['near an edge', NEAR_EDGE],
  ])('has nothing alive 1 ms after the duration for a click at %s', (_, origin) => {
    expect(rippleRings(origin, rippleDuration(origin) + 1)).toEqual([])
  })

  it('has nothing alive after the duration', () => {
    expect(rippleRings(CENTRE, rippleDuration(CENTRE) + 500)).toEqual([])
  })

  it('still has a ring alive just before the duration', () => {
    expect(rippleRings(CENTRE, rippleDuration(CENTRE) - 20).length).toBeGreaterThan(0)
  })
})

describe('rippleDuration', () => {
  it('is positive and finite', () => {
    const duration = rippleDuration(CENTRE)
    expect(duration).toBeGreaterThan(0)
    expect(Number.isFinite(duration)).toBe(true)
  })

  it('lasts longer for a click near an edge than at the centre', () => {
    expect(rippleDuration(NEAR_EDGE)).toBeGreaterThan(rippleDuration(CENTRE))
  })

  it('is the same for mirror-image clicks', () => {
    expect(rippleDuration({ s: -0.2, t: 0.1 })).toBeCloseTo(rippleDuration({ s: 0.2, t: 0.1 }))
  })
})

describe('ringLines', () => {
  it('keeps every point on the glass for a large ring', () => {
    for (const point of ringLines(CENTRE, 0.5).flat()) expect(isOnGlass(point)).toBe(true)
  })

  it('keeps every point on the glass for a ring around a point near an edge', () => {
    for (const point of ringLines(NEAR_EDGE, 0.2).flat()) expect(isOnGlass(point)).toBe(true)
  })

  it('keeps every point on its ring', () => {
    for (const { s, t } of ringLines(CENTRE, 0.2).flat()) expect(Math.hypot(s, t)).toBeCloseTo(0.2)
  })

  it('draws a small ring at the centre whole, as a closed loop', () => {
    const lines = ringLines(CENTRE, 0.1)
    expect(lines.length).toBeGreaterThanOrEqual(8)
    for (let i = 1; i < lines.length; i++) expect(lines[i][0]).toEqual(lines[i - 1][1])
    expect(lines[lines.length - 1][1].s).toBeCloseTo(lines[0][0].s)
    expect(lines[lines.length - 1][1].t).toBeCloseTo(lines[0][0].t)
  })

  it('clips a ring larger than the glass to fewer segments than the full circle', () => {
    const radius = 0.5
    const full = Math.ceil((2 * Math.PI * radius) / 0.02)
    const lines = ringLines(CENTRE, radius)
    expect(lines.length).toBeGreaterThan(0)
    expect(lines.length).toBeLessThan(full)
  })

  it('draws nothing for a ring entirely off the glass', () => {
    expect(ringLines(CENTRE, 2)).toEqual([])
  })
})

describe('rippleOffset', () => {
  const RING = { radius: 0.2, strength: 1 }
  // Signed push along the direction from the origin to `point`.
  const radial = (origin: MirrorPoint, point: MirrorPoint) => {
    const offset = rippleOffset(origin, [RING], point)
    const distance = Math.hypot(point.s - origin.s, point.t - origin.t)
    return (offset.s * (point.s - origin.s) + offset.t * (point.t - origin.t)) / distance
  }

  it('is zero with no rings', () => {
    expect(rippleOffset(CENTRE, [], { s: 0.1, t: 0.1 })).toEqual({ s: 0, t: 0 })
  })

  it('is zero at the origin', () => {
    expect(rippleOffset(CENTRE, [RING], CENTRE)).toEqual({ s: 0, t: 0 })
  })

  it('is negligible far from every ring', () => {
    const { s, t } = rippleOffset(CENTRE, [RING], { s: 0, t: 0.6 })
    expect(Math.hypot(s, t)).toBeLessThan(1e-9)
  })

  it('is zero on a ring\'s crest', () => {
    const { s, t } = rippleOffset(CENTRE, [RING], { s: RING.radius, t: 0 })
    expect(Math.hypot(s, t)).toBeCloseTo(0, 12)
  })

  it('pushes outward just inside a ring', () => {
    expect(radial(CENTRE, { s: RING.radius - 0.02, t: 0 })).toBeGreaterThan(0)
  })

  it('pulls inward just outside a ring', () => {
    expect(radial(CENTRE, { s: RING.radius + 0.02, t: 0 })).toBeLessThan(0)
  })

  it('points along the line from the origin', () => {
    const origin = { s: 0.05, t: -0.1 }
    const point = { s: origin.s + 0.1, t: origin.t + 0.15 }
    const { s, t } = rippleOffset(origin, [RING], point)
    expect(Math.hypot(s, t)).toBeGreaterThan(0)
    // Parallel to (0.1, 0.15).
    expect(s * 0.15 - t * 0.1).toBeCloseTo(0, 12)
  })

  it('is the same size in every direction at the same distance', () => {
    const at = (angle: number) => {
      const { s, t } = rippleOffset(CENTRE, [RING], { s: 0.18 * Math.cos(angle), t: 0.18 * Math.sin(angle) })
      return Math.hypot(s, t)
    }
    for (const angle of [1, 2, 3, 4, 5]) expect(at(angle)).toBeCloseTo(at(0), 12)
  })

  it('peaks at 0.03 for a full-strength ring', () => {
    // The scaled Gaussian derivative peaks at x = 1/√2, i.e. 0.03/√2 inside the ring.
    const point = { s: RING.radius - 0.03 / Math.SQRT2, t: 0 }
    expect(radial(CENTRE, point)).toBeCloseTo(0.03, 10)
  })

  it('scales with the ring\'s strength', () => {
    const point = { s: 0.18, t: 0 }
    const full = rippleOffset(CENTRE, [RING], point).s
    const half = rippleOffset(CENTRE, [{ ...RING, strength: 0.5 }], point).s
    expect(half).toBeCloseTo(full / 2, 12)
  })

  it('sums the pushes of several rings', () => {
    const other = { radius: 0.25, strength: 0.7 }
    const point = { s: 0.22, t: 0 }
    const both = rippleOffset(CENTRE, [RING, other], point).s
    const apart = rippleOffset(CENTRE, [RING], point).s + rippleOffset(CENTRE, [other], point).s
    expect(both).toBeCloseTo(apart, 12)
  })
})
