import { describe, expect, it } from 'vitest'
import { BAY_CEILING_Y, CEILING_Y, FLOOR_Y } from '../core/camera.ts'
import { FOREGROUND, FOREGROUND_DIM, FOREGROUND_WORN } from '../core/palette.ts'
import { polyline } from '../mirror/frame.ts'
import type { MirrorPoint } from '../mirror/frame.ts'
import { WALLS, WINDOW_WALL } from '../room/room.ts'
import {
  ARCH_OUTLINE,
  OPEN_PANE,
  PANES,
  QUATREFOIL_OUTLINE,
  ROUNDEL_OUTLINE,
  WINDOW_BOUNDS,
  WINDOW_LAYERS,
  clipToOutline,
  leading,
  pointedArch,
  quatrefoil,
  rectangle,
  roundArch,
} from './tracery.ts'
import type { WindowLine, WindowPoint } from './tracery.ts'

const EPSILON = 1e-9
const [DIM, WORN, OPENINGS] = WINDOW_LAYERS
const allPoints = WINDOW_LAYERS.flatMap(({ lines }) => lines.flat())
const samePoint = (a: MirrorPoint, b: MirrorPoint) => {
  expect(a.s).toBeCloseTo(b.s, 9)
  expect(a.t).toBeCloseTo(b.t, 9)
}
const distance = (a: MirrorPoint, b: MirrorPoint) => Math.hypot(a.s - b.s, a.t - b.t)
const hasPointNear = (points: MirrorPoint[], target: MirrorPoint) => points.some((p) => distance(p, target) < 1e-9)
const box = (points: MirrorPoint[]) => ({
  left: Math.min(...points.map(({ s }) => s)),
  right: Math.max(...points.map(({ s }) => s)),
  bottom: Math.min(...points.map(({ t }) => t)),
  top: Math.max(...points.map(({ t }) => t)),
})
const slope = ([a, b]: WindowLine) => (b.t - a.t) / (b.s - a.s)
// Whether a point stands out of the wall, and whether a line has any point that does.
// (Points on the hinge can come out a rounding error either side of the wall.)
const isOffWall = ({ d = 0 }: WindowPoint) => Math.abs(d) > EPSILON
const isOnWall = (line: WindowLine) => !line.some(isOffWall)
const middleOf = ([a, b]: WindowLine) => ({ s: (a.s + b.s) / 2, t: (a.t + b.t) / 2 })

// Whether a point is inside or on a closed convex outline, to within `margin`.
function isInsideConvex(p: MirrorPoint, outline: MirrorPoint[], margin = 1e-9): boolean {
  const corners = outline.slice(0, -1)
  const signs = corners.map((a, i) => {
    const b = corners[(i + 1) % corners.length]
    const length = distance(a, b)
    if (length === 0) return 0
    return ((b.s - a.s) * (p.t - a.t) - (b.t - a.t) * (p.s - a.s)) / length
  })
  return signs.every((side) => side >= -margin) || signs.every((side) => side <= margin)
}

// Distance from a point to the nearest part of a polyline.
function distanceToOutline(p: MirrorPoint, outline: MirrorPoint[]): number {
  return Math.min(
    ...polyline(outline).map(([a, b]) => {
      const ds = b.s - a.s
      const dt = b.t - a.t
      const k = Math.max(0, Math.min(1, ((p.s - a.s) * ds + (p.t - a.t) * dt) / (ds * ds + dt * dt || 1)))
      return distance(p, { s: a.s + ds * k, t: a.t + dt * k })
    }),
  )
}

// The outer arch's shape, from the window's design: half-width 0.45, springing
// at t 1.11, standing on the sill at t -0.65. Its head's arcs have radius 0.9,
// each centred on the other side's springing point.
const ARCH = { halfWidth: 0.45, spring: 1.11, sill: -0.65 }
const ARCH_RADIUS = 2 * ARCH.halfWidth
// The first window's arch sprang at t -0.16 from the same sill and width.
const FIRST_HEIGHT = -0.16 + Math.sqrt(3) * ARCH.halfWidth - ARCH.sill

// Whether a point lies strictly inside the outer arch, at least `margin` from its edges.
function isInsideArch({ s, t }: MirrorPoint, margin = EPSILON): boolean {
  if (Math.abs(s) > ARCH.halfWidth - margin || t < ARCH.sill + margin) return false
  if (t <= ARCH.spring) return true
  const left = { s: -ARCH.halfWidth, t: ARCH.spring }
  const right = { s: ARCH.halfWidth, t: ARCH.spring }
  return distance({ s, t }, left) < ARCH_RADIUS - margin && distance({ s, t }, right) < ARCH_RADIUS - margin
}

// The roundel's centre and radius, read from its outline.
// Its points are evenly spaced round the circle, so they average to its centre.
const ROUNDEL = (() => {
  const points = ROUNDEL_OUTLINE.slice(0, -1)
  const centre = {
    s: points.reduce((sum, { s }) => sum + s, 0) / points.length,
    t: points.reduce((sum, { t }) => sum + t, 0) / points.length,
  }
  return { centre, radius: Math.max(...points.map((p) => distance(p, centre))) }
})()

const PANE_NAMES = Object.keys(PANES) as (keyof typeof PANES)[]
const CLOSED_PANES = PANE_NAMES.filter((name) => name !== OPEN_PANE)
const OPEN = box(PANES[OPEN_PANE])
// The open casement swings about the open pane's right edge.
const HINGE_S = OPEN.right

describe('pointedArch', () => {
  const CENTRE = 0.3
  const HALF_WIDTH = 0.2
  const SPRING = 0.1
  const BOTTOM = -0.4
  const arch = pointedArch(CENTRE, HALF_WIDTH, SPRING, BOTTOM)
  const head = arch.filter(({ t }) => t > SPRING + EPSILON)

  it('is closed, ending where it starts', () => {
    samePoint(arch[arch.length - 1], arch[0])
  })

  it('is symmetric about its centre', () => {
    for (const { s, t } of arch) expect(hasPointNear(arch, { s: 2 * CENTRE - s, t })).toBe(true)
  })

  it('rises to a single apex at spring + √3 · halfWidth over its centre', () => {
    const { top } = box(arch)
    expect(top).toBeCloseTo(SPRING + Math.sqrt(3) * HALF_WIDTH, 9)
    const apexes = arch.filter(({ t }) => t > top - EPSILON)
    for (const { s } of apexes) expect(s).toBeCloseTo(CENTRE, 9)
  })

  it('has its sides at centre ± halfWidth, from the bottom up to the spring', () => {
    const { left, right, bottom } = box(arch)
    expect(left).toBeCloseTo(CENTRE - HALF_WIDTH, 9)
    expect(right).toBeCloseTo(CENTRE + HALF_WIDTH, 9)
    expect(bottom).toBeCloseTo(BOTTOM, 9)
    for (const side of [CENTRE - HALF_WIDTH, CENTRE + HALF_WIDTH]) {
      expect(hasPointNear(arch, { s: side, t: BOTTOM })).toBe(true)
      expect(hasPointNear(arch, { s: side, t: SPRING })).toBe(true)
    }
  })

  it('curves each half of its head about the other side\'s springing point', () => {
    expect(head.length).toBeGreaterThan(2)
    for (const p of head) {
      const pivot = { s: p.s < CENTRE ? CENTRE + HALF_WIDTH : CENTRE - HALF_WIDTH, t: SPRING }
      expect(distance(p, pivot)).toBeCloseTo(2 * HALF_WIDTH, 9)
    }
  })
})

describe('roundArch', () => {
  const CENTRE = -0.2
  const HALF_WIDTH = 0.15
  const SPRING = 0.5
  const BOTTOM = -0.3
  const arch = roundArch(CENTRE, HALF_WIDTH, SPRING, BOTTOM)
  const head = arch.filter(({ t }) => t > SPRING + EPSILON)

  it('is closed, ending where it starts', () => {
    samePoint(arch[arch.length - 1], arch[0])
  })

  it('has its sides at centre ± halfWidth, from the bottom up to the spring', () => {
    const { left, right, bottom } = box(arch)
    expect(left).toBeCloseTo(CENTRE - HALF_WIDTH, 9)
    expect(right).toBeCloseTo(CENTRE + HALF_WIDTH, 9)
    expect(bottom).toBeCloseTo(BOTTOM, 9)
    for (const side of [CENTRE - HALF_WIDTH, CENTRE + HALF_WIDTH]) {
      expect(hasPointNear(arch, { s: side, t: BOTTOM })).toBe(true)
      expect(hasPointNear(arch, { s: side, t: SPRING })).toBe(true)
    }
  })

  it('rises to its apex at spring + halfWidth over its centre', () => {
    const { top } = box(arch)
    expect(top).toBeCloseTo(SPRING + HALF_WIDTH, 9)
    expect(hasPointNear(arch, { s: CENTRE, t: SPRING + HALF_WIDTH })).toBe(true)
  })

  it('curves its head as a semicircle about the middle of its springing line', () => {
    expect(head.length).toBeGreaterThan(2)
    for (const p of head) expect(distance(p, { s: CENTRE, t: SPRING })).toBeCloseTo(HALF_WIDTH, 9)
  })
})

describe('rectangle', () => {
  const outline = rectangle(-0.1, -0.2, 0.3, 0.4)

  it('is closed, ending where it starts', () => {
    samePoint(outline[outline.length - 1], outline[0])
  })

  it('runs through its four corners and spans exactly them', () => {
    expect(outline).toHaveLength(5)
    expect(box(outline)).toEqual({ left: -0.1, right: 0.3, bottom: -0.2, top: 0.4 })
    for (const s of [-0.1, 0.3]) {
      for (const t of [-0.2, 0.4]) expect(hasPointNear(outline, { s, t })).toBe(true)
    }
  })

  it('has only horizontal and vertical sides', () => {
    for (const [a, b] of polyline(outline)) expect(a.s === b.s || a.t === b.t).toBe(true)
  })
})

describe('clipToOutline', () => {
  const square = rectangle(0, 0, 1, 1)
  const triangle = [
    { s: 0, t: 0 },
    { s: 2, t: 0 },
    { s: 1, t: 2 },
    { s: 0, t: 0 },
  ]

  describe.each([
    ['anticlockwise', square],
    ['clockwise', [...square].reverse()],
  ])('on a unit square wound %s', (_, outline) => {
    const expectLine = (line: WindowLine | null, a: MirrorPoint, b: MirrorPoint) => {
      expect(line).not.toBeNull()
      samePoint(line![0], a)
      samePoint(line![1], b)
    }

    it('keeps a line inside the outline as it is', () => {
      expectLine(clipToOutline({ s: 0.2, t: 0.3 }, { s: 0.7, t: 0.9 }, outline), { s: 0.2, t: 0.3 }, { s: 0.7, t: 0.9 })
    })

    it('cuts a line crossing the outline at both edges it crosses, keeping its direction', () => {
      expectLine(clipToOutline({ s: -1, t: 0.5 }, { s: 2, t: 0.5 }, outline), { s: 0, t: 0.5 }, { s: 1, t: 0.5 })
      expectLine(clipToOutline({ s: 2, t: 1.5 }, { s: -1, t: -1.5 }, outline), { s: 1, t: 0.5 }, { s: 0.5, t: 0 })
    })

    it('cuts a line running out of the outline at the edge it leaves by', () => {
      expectLine(clipToOutline({ s: 0.5, t: 0.5 }, { s: 0.5, t: 3 }, outline), { s: 0.5, t: 0.5 }, { s: 0.5, t: 1 })
    })

    it.each([
      ['beside it', { s: 1.5, t: 0 }, { s: 1.5, t: 1 }],
      ['across a corner without touching it', { s: 1.2, t: 2 }, { s: 2, t: 1.2 }],
      ['along an edge\'s line beyond it', { s: 2, t: 0.5 }, { s: 3, t: 0.5 }],
      ['that only touches a corner', { s: 0, t: 2 }, { s: 2, t: 0 }],
    ])('gives null for a line %s', (_, a, b) => {
      expect(clipToOutline(a, b, outline)).toBeNull()
    })
  })

  it('cuts a line onto a slanted edge', () => {
    // Across the triangle at t 1, its sloping sides are at s 0.5 and 1.5.
    const line = clipToOutline({ s: -1, t: 1 }, { s: 3, t: 1 }, triangle)!
    samePoint(line[0], { s: 0.5, t: 1 })
    samePoint(line[1], { s: 1.5, t: 1 })
  })
})

describe('leading', () => {
  const CENTRE = 0.2
  const pane = rectangle(CENTRE - 0.15, -0.6, CENTRE + 0.15, 0.35)
  const lines = leading(pane, CENTRE)

  it.each([
    ['a rectangular pane', pane, CENTRE],
    ['a round-headed pane', roundArch(-0.2, 0.15, 1.15, 0.43), -0.2],
  ])('keeps every line within %s', (_, outline, centre) => {
    const crossed = leading(outline, centre)
    expect(crossed.length).toBeGreaterThan(0)
    for (const line of crossed) {
      for (const p of line) expect(isInsideConvex(p, outline)).toBe(true)
    }
  })

  it('runs every line at a slope of 2 one way or the other', () => {
    for (const line of lines) expect(Math.abs(slope(line))).toBeCloseTo(2, 9)
  })

  it('crosses the pane both ways, each way in evenly spaced parallel lines', () => {
    for (const sign of [1, -1]) {
      // Where each line of this slope crosses t 0.
      const crossings = lines
        .filter((line) => Math.sign(slope(line)) === sign)
        .map((line) => line[0].s - line[0].t / slope(line))
        .sort((a, b) => a - b)
      expect(crossings.length).toBeGreaterThan(3)
      const gaps = crossings.slice(1).map((s, i) => s - crossings[i])
      expect(gaps[0]).toBeGreaterThan(0)
      for (const gap of gaps) expect(gap).toBeCloseTo(gaps[0], 9)
    }
  })

  it('is symmetric about its centre', () => {
    const mirrored = lines.map(([a, b]): WindowLine => [
      { s: 2 * CENTRE - a.s, t: a.t },
      { s: 2 * CENTRE - b.s, t: b.t },
    ])
    for (const [a, b] of mirrored) {
      const match = lines.some(
        ([p, q]) =>
          (distance(p, a) < 1e-9 && distance(q, b) < 1e-9) || (distance(p, b) < 1e-9 && distance(q, a) < 1e-9),
      )
      expect(match).toBe(true)
    }
  })

  it('reaches every part of the pane, leaving no quarry wider than the lattice', () => {
    // Sample the pane: every point is close to some line.
    for (let s = CENTRE - 0.14; s <= CENTRE + 0.14; s += 0.02) {
      for (let t = -0.59; t <= 0.34; t += 0.02) {
        const nearest = Math.min(...lines.map((line) => distanceToOutline({ s, t }, line)))
        expect(nearest).toBeLessThan(0.1)
      }
    }
  })
})

describe('quatrefoil', () => {
  const CENTRE = { s: -0.2, t: 0.4 }
  const RADIUS = 0.1
  const foil = quatrefoil(CENTRE.s, CENTRE.t, RADIUS)

  it('is closed, ending where it starts', () => {
    samePoint(foil[foil.length - 1], foil[0])
  })

  it('stays within 2 · radius of its centre', () => {
    for (const p of foil) expect(distance(p, CENTRE)).toBeLessThanOrEqual(2 * RADIUS + EPSILON)
  })

  it('reaches 2 · radius out along each axis', () => {
    const { left, right, bottom, top } = box(foil)
    expect(left).toBeCloseTo(CENTRE.s - 2 * RADIUS, 9)
    expect(right).toBeCloseTo(CENTRE.s + 2 * RADIUS, 9)
    expect(bottom).toBeCloseTo(CENTRE.t - 2 * RADIUS, 9)
    expect(top).toBeCloseTo(CENTRE.t + 2 * RADIUS, 9)
  })

  it.each([
    [1, 1],
    [-1, 1],
    [-1, -1],
    [1, -1],
  ])('passes through the cusp on the (%i, %i) diagonal', (ds, dt) => {
    expect(hasPointNear(foil, { s: CENTRE.s + ds * RADIUS, t: CENTRE.t + dt * RADIUS })).toBe(true)
  })

  it('comes no closer to its centre than the cusps', () => {
    for (const p of foil) expect(distance(p, CENTRE)).toBeGreaterThanOrEqual(Math.SQRT2 * RADIUS - EPSILON)
  })
})

describe('the window\'s shape', () => {
  it('fits inside its wall when centred on it at eye height, under the bay\'s raised ceiling', () => {
    const halfLength = WALLS[WINDOW_WALL].length / 2
    expect(WINDOW_BOUNDS.left).toBeGreaterThan(-halfLength)
    expect(WINDOW_BOUNDS.right).toBeLessThan(halfLength)
    expect(WINDOW_BOUNDS.bottom).toBeGreaterThan(FLOOR_Y)
    expect(WINDOW_BOUNDS.top).toBeLessThan(BAY_CEILING_Y)
  })

  it('rises above the main ceiling', () => {
    expect(WINDOW_BOUNDS.top).toBeGreaterThan(CEILING_Y)
  })

  it('stands within 0.15 of the floor', () => {
    expect(WINDOW_BOUNDS.bottom - FLOOR_Y).toBeLessThan(0.15)
  })

  it('is the outer arch described by its design', () => {
    const { left, right, bottom, top } = box(ARCH_OUTLINE)
    expect(left).toBeCloseTo(-ARCH.halfWidth, 9)
    expect(right).toBeCloseTo(ARCH.halfWidth, 9)
    expect(bottom).toBeCloseTo(ARCH.sill, 9)
    expect(top).toBeCloseTo(ARCH.spring + Math.sqrt(3) * ARCH.halfWidth, 9)
  })

  it('stands about 2.54 tall, twice the first window\'s height', () => {
    const { bottom, top } = box(ARCH_OUTLINE)
    expect(top - bottom).toBeCloseTo(2.54, 2)
    expect((top - bottom) / FIRST_HEIGHT).toBeCloseTo(2, 2)
  })

  it.each(PANE_NAMES)('keeps the %s pane strictly inside the outer arch', (name) => {
    for (const p of PANES[name]) expect(isInsideArch(p)).toBe(true)
  })

  it.each([
    ['roundel', ROUNDEL_OUTLINE],
    ['quatrefoil', QUATREFOIL_OUTLINE],
  ])('keeps the %s strictly inside the outer arch\'s head', (_, outline) => {
    for (const p of outline) {
      expect(isInsideArch(p)).toBe(true)
      expect(p.t).toBeGreaterThan(ARCH.spring)
    }
  })

  it('stands the lower panes above the sill', () => {
    expect(box(PANES.lowerLeft).bottom).toBeGreaterThan(ARCH.sill)
    expect(box(PANES.lowerRight).bottom).toBeGreaterThan(ARCH.sill)
  })

  it('splits the window into two lights, mirroring each other across the centre line', () => {
    for (const [left, right] of [
      [PANES.lowerLeft, PANES.lowerRight],
      [PANES.upperLeft, PANES.upperRight],
    ]) {
      expect(box(left).right).toBeLessThan(0)
      expect(box(right).left).toBeGreaterThan(0)
      for (const { s, t } of left) expect(hasPointNear(right, { s: -s, t })).toBe(true)
    }
  })

  it('splits each light into a rectangular lower pane and a round-headed upper pane, with a transom between', () => {
    for (const [lower, upper] of [
      [PANES.lowerLeft, PANES.upperLeft],
      [PANES.lowerRight, PANES.upperRight],
    ]) {
      expect(lower).toHaveLength(5)
      for (const [a, b] of polyline(lower)) expect(a.s === b.s || a.t === b.t).toBe(true)
      expect(box(lower).top).toBeLessThan(box(upper).bottom)
      expect(box(lower).left).toBeCloseTo(box(upper).left, 9)
      expect(box(lower).right).toBeCloseTo(box(upper).right, 9)
      // A semicircular head: its apex is half its width above where its sides stop.
      const { left, right, top } = box(upper)
      const spring = Math.max(...upper.filter(({ s }) => s === left).map(({ t }) => t))
      expect(top - spring).toBeCloseTo((right - left) / 2, 9)
    }
  })

  it('keeps the panes apart from each other', () => {
    for (const a of PANE_NAMES) {
      for (const b of PANE_NAMES.filter((name) => name !== a)) {
        const p = box(PANES[a])
        const q = box(PANES[b])
        expect(p.right < q.left || q.right < p.left || p.top < q.bottom || q.top < p.bottom).toBe(true)
      }
    }
  })

  it.each(PANE_NAMES)('keeps the %s pane clear of the roundel', (name) => {
    for (const p of PANES[name]) expect(distance(p, ROUNDEL.centre)).toBeGreaterThan(ROUNDEL.radius)
  })

  it('centres the roundel on the centre line, above the panes', () => {
    expect(ROUNDEL.centre.s).toBeCloseTo(0, 9)
    for (const name of PANE_NAMES) expect(box(ROUNDEL_OUTLINE).bottom).toBeGreaterThan(box(PANES[name]).top)
  })

  it('sets the quatrefoil in the roundel, centred on it', () => {
    const foil = box(QUATREFOIL_OUTLINE)
    expect((foil.left + foil.right) / 2).toBeCloseTo(ROUNDEL.centre.s, 9)
    expect((foil.bottom + foil.top) / 2).toBeCloseTo(ROUNDEL.centre.t, 9)
    expect(ROUNDEL.radius).toBeGreaterThan(0)
    for (const p of QUATREFOIL_OUTLINE) expect(distance(p, ROUNDEL.centre)).toBeLessThan(ROUNDEL.radius)
  })

  it('opens the lower right pane', () => {
    expect(OPEN_PANE).toBe('lowerRight')
  })
})

describe('WINDOW_LAYERS', () => {
  it('draws the leading dim, then the stone worn, then the openings in the full foreground', () => {
    expect(WINDOW_LAYERS.map(({ colour }) => colour)).toEqual([FOREGROUND_DIM, FOREGROUND_WORN, FOREGROUND])
  })

  it('draws the outer arch, then the sill, then the roundel in the worn layer', () => {
    const arch = polyline(ARCH_OUTLINE)
    const roundel = polyline(ROUNDEL_OUTLINE)
    expect(WORN.lines.slice(0, arch.length)).toEqual(arch)
    expect(WORN.lines.slice(arch.length + 1)).toEqual(roundel)
  })

  it('lays the sill level across the arch\'s foot, overhanging both sides equally', () => {
    const [a, b] = WORN.lines[polyline(ARCH_OUTLINE).length]
    expect(a.t).toBeCloseTo(ARCH.sill, 9)
    expect(b.t).toBeCloseTo(ARCH.sill, 9)
    expect(Math.min(a.s, b.s)).toBeLessThan(-ARCH.halfWidth)
    expect(Math.max(a.s, b.s)).toBeGreaterThan(ARCH.halfWidth)
    expect(a.s + b.s).toBeCloseTo(0, 9)
  })

  it('draws the four panes and the quatrefoil as their outlines in the openings layer, then the casement', () => {
    const outlines = [...PANE_NAMES.map((name) => PANES[name]), QUATREFOIL_OUTLINE].flatMap(polyline)
    expect(OPENINGS.lines.slice(0, outlines.length)).toEqual(outlines)
    const casement = OPENINGS.lines.slice(outlines.length)
    expect(casement.length).toBeGreaterThan(0)
    expect(casement.filter((line) => line.some(isOffWall)).length).toBeGreaterThan(0)
  })

  it.each(CLOSED_PANES)('leads the closed %s pane in the dim layer', (name) => {
    const inPane = DIM.lines.filter(isOnWall).filter((line) => line.every((p) => isInsideConvex(p, PANES[name])))
    expect(inPane.length).toBeGreaterThan(3)
  })

  it('keeps the dim leading on the wall within the closed panes or the roundel', () => {
    for (const line of DIM.lines.filter(isOnWall)) {
      const within = [...CLOSED_PANES.map((name) => PANES[name]), ROUNDEL_OUTLINE].some((outline) =>
        line.every((p) => isInsideConvex(p, outline)),
      )
      expect(within).toBe(true)
    }
  })

  it('leaves the open pane\'s opening without leading on the wall', () => {
    const inOpening = DIM.lines.filter(isOnWall).filter((line) => {
      const { s, t } = middleOf(line)
      return s > OPEN.left && s < OPEN.right && t > OPEN.bottom && t < OPEN.top
    })
    expect(inOpening).toEqual([])
  })

  it('leads the rose with eight cames from the boss out to the quatrefoil\'s lobe tips and cusps', () => {
    const came = DIM.lines.filter(isOnWall).filter(([a, b]) => {
      const [inner, outer] = distance(a, ROUNDEL.centre) < distance(b, ROUNDEL.centre) ? [a, b] : [b, a]
      return distance(inner, ROUNDEL.centre) > EPSILON && distanceToOutline(outer, QUATREFOIL_OUTLINE) < 1e-3
    })
    expect(came).toHaveLength(8)
    const angles = came.map(([a, b]) => {
      const outer = distance(a, ROUNDEL.centre) < distance(b, ROUNDEL.centre) ? b : a
      return Math.round((Math.atan2(outer.t - ROUNDEL.centre.t, outer.s - ROUNDEL.centre.s) * 4) / Math.PI)
    })
    expect(new Set(angles.map((k) => (k + 8) % 8)).size).toBe(8)
    // Each came points straight out from the centre.
    for (const [a, b] of came) {
      const cross = (a.s - ROUNDEL.centre.s) * (b.t - ROUNDEL.centre.t) - (a.t - ROUNDEL.centre.t) * (b.s - ROUNDEL.centre.s)
      expect(cross).toBeCloseTo(0, 9)
    }
  })
})

describe('the open casement', () => {
  const offWall = allPoints.filter(isOffWall)
  // The openings layer ends with the casement's frame, one line per side.
  const frame = OPENINGS.lines.slice(-(PANES[OPEN_PANE].length - 1))
  const casementLeading = DIM.lines.filter((line) => line.some(isOffWall))

  it('stands its frame and its leading out into the hall', () => {
    expect(frame.length).toBeGreaterThan(0)
    expect(casementLeading.length).toBeGreaterThan(0)
    expect(offWall.length).toBeGreaterThan(0)
    for (const p of offWall) expect(p.d).toBeGreaterThan(0)
  })

  it('draws nothing out of the wall in the worn layer', () => {
    expect(WORN.lines.flat().filter(isOffWall)).toEqual([])
  })

  it('swings 60° about the open pane\'s right edge, so it lies on the line d = √3 (hinge - s)', () => {
    for (const p of [...frame, ...casementLeading].flat()) {
      expect(p.d ?? 0).toBeCloseTo(Math.sqrt(3) * (HINGE_S - p.s), 9)
      expect(p.t).toBeGreaterThanOrEqual(OPEN.bottom - EPSILON)
      expect(p.t).toBeLessThanOrEqual(OPEN.top + EPSILON)
    }
  })

  it('reaches out the pane\'s width at 60°', () => {
    const reach = Math.max(...offWall.map(({ d = 0 }) => d))
    expect(reach).toBeCloseTo(((OPEN.right - OPEN.left) * Math.sqrt(3)) / 2, 9)
  })

  it('keeps its hinge edge on the wall along the pane\'s right side', () => {
    const hinge = frame.filter(([a, b]) =>
      [a, b].every((p) => (p.d ?? 0) === 0 && Math.abs(p.s - HINGE_S) < EPSILON),
    )
    const ts = hinge.flat().map(({ t }) => t)
    expect(Math.min(...ts)).toBeCloseTo(OPEN.bottom, 9)
    expect(Math.max(...ts)).toBeCloseTo(OPEN.top, 9)
  })

  it('swings the whole open pane\'s outline as its frame, with only the hinge side left on the wall', () => {
    expect(frame.filter((line) => line.some(isOffWall))).toHaveLength(frame.length - 1)
    for (const [[a, b], [p, q]] of frame.map((line, i) => [line, polyline(PANES[OPEN_PANE])[i]])) {
      expect(a.t).toBeCloseTo(p.t, 9)
      expect(b.t).toBeCloseTo(q.t, 9)
    }
  })
})

describe('WINDOW_BOUNDS', () => {
  it('contains every line point', () => {
    for (const { s, t } of allPoints) {
      expect(s).toBeGreaterThanOrEqual(WINDOW_BOUNDS.left)
      expect(s).toBeLessThanOrEqual(WINDOW_BOUNDS.right)
      expect(t).toBeGreaterThanOrEqual(WINDOW_BOUNDS.bottom)
      expect(t).toBeLessThanOrEqual(WINDOW_BOUNDS.top)
    }
  })

  it('is tight around them', () => {
    expect(allPoints.some(({ s }) => s === WINDOW_BOUNDS.left)).toBe(true)
    expect(allPoints.some(({ s }) => s === WINDOW_BOUNDS.right)).toBe(true)
    expect(allPoints.some(({ t }) => t === WINDOW_BOUNDS.bottom)).toBe(true)
    expect(allPoints.some(({ t }) => t === WINDOW_BOUNDS.top)).toBe(true)
  })
})
