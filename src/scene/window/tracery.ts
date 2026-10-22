import { FOREGROUND, FOREGROUND_DIM, FOREGROUND_WORN } from '../core/palette.ts'
import { point, polyline, spiral } from '../mirror/frame.ts'
import type { MirrorPoint } from '../mirror/frame.ts'

// A tall medieval plate tracery window, drawn like the mirror as sparse lines.
// Under one pointed arch on a sill nearly at the floor, a stone plate is cut
// through with two lights, each split by a transom into a rectangular lower
// pane and a round-headed upper pane, and a quatrefoil in a roundel above
// them. The closed panes are leaded in diamond quarries; the lower right one
// is a casement swung open into the hall. Its shape is in window-local world
// units: s runs right and t up from the window's centre at eye height, and d
// out of the wall into the room (0 on the wall). room.ts sets it in a wall.

export type WindowPoint = MirrorPoint & { d?: number }
export type WindowLine = [WindowPoint, WindowPoint]
export type WindowLayer = { colour: string; lines: WindowLine[] }

// The outer arch's half-width, where its sides meet its pointed head, and the
// sill. It stands twice as tall as the room, so it needs the hall's raised bay.
const HALF_WIDTH = 0.45
const SPRING_T = 1.11
const SILL_T = -0.65
// How far the sill reaches past the arch's sides.
const SILL_OVERHANG = 0.07
// The lights' half-width and centres, their bottoms just above the sill, the
// transom between their panes, and where their round heads begin.
const LIGHT_HALF_WIDTH = 0.15
const LIGHT_S = 0.2
const LIGHT_BOTTOM = -0.6
const TRANSOM_BOTTOM = 0.35
const TRANSOM_TOP = 0.43
const LIGHT_SPRING = 1.15
// The roundel's centre and radius, the quatrefoil's lobes inside it (each
// centred its own radius out from the middle), and the boss at its heart.
const ROUNDEL_T = 1.55
const ROUNDEL_RADIUS = 0.2
const LOBE_RADIUS = 0.08
const BOSS_RADIUS = 0.025
// The leading: diamond quarries QUARRY_WIDTH across and twice as tall.
const QUARRY_WIDTH = 0.1
const QUARRY_SLOPE = 2
// How far the open casement is swung into the hall about its hinge, its
// outer (right) edge.
const OPEN_ANGLE = Math.PI / 3

// A closed outline with straight sides from `bottom` up to `spring`, then an
// equilateral pointed head: each half an arc centred on the other side's
// springing point, meeting at the apex.
export function pointedArch(centre: number, halfWidth: number, spring: number, bottom: number): MirrorPoint[] {
  const radius = 2 * halfWidth
  return [
    point(centre - halfWidth, bottom),
    ...spiral(centre + halfWidth, spring, radius, radius, Math.PI, (Math.PI * 2) / 3),
    ...spiral(centre - halfWidth, spring, radius, radius, Math.PI / 3, 0),
    point(centre + halfWidth, bottom),
    point(centre - halfWidth, bottom),
  ]
}

// A closed outline with straight sides from `bottom` up to `spring`, then a
// semicircular head.
export function roundArch(centre: number, halfWidth: number, spring: number, bottom: number): MirrorPoint[] {
  return [
    point(centre - halfWidth, bottom),
    ...spiral(centre, spring, halfWidth, halfWidth, Math.PI, 0),
    point(centre + halfWidth, bottom),
    point(centre - halfWidth, bottom),
  ]
}

// A closed rectangle from (left, bottom) to (right, top).
export function rectangle(left: number, bottom: number, right: number, top: number): MirrorPoint[] {
  return [point(left, bottom), point(left, top), point(right, top), point(right, bottom), point(left, bottom)]
}

// A closed quatrefoil around (s, t): four semicircular lobes, each centred
// `radius` out from the middle, meeting at cusps on the diagonals.
export function quatrefoil(s: number, t: number, radius: number): MirrorPoint[] {
  return [0, 1, 2, 3].flatMap((i) => {
    const angle = (Math.PI / 2) * i
    const lobe = spiral(
      s + radius * Math.cos(angle),
      t + radius * Math.sin(angle),
      radius,
      radius,
      angle - Math.PI / 2,
      angle + Math.PI / 2,
    )
    // Each lobe starts at the cusp the one before ended on.
    return i === 0 ? lobe : lobe.slice(1)
  })
}

// How short a clipped run (as a fraction of the line) counts as none.
const CLIP_TOLERANCE = 1e-9

// The part of the line from `a` to `b` inside a closed convex outline, or null.
export function clipToOutline(a: MirrorPoint, b: MirrorPoint, outline: MirrorPoint[]): WindowLine | null {
  const corners = outline.slice(0, -1)
  const middle = point(
    corners.reduce((sum, { s }) => sum + s, 0) / corners.length,
    corners.reduce((sum, { t }) => sum + t, 0) / corners.length,
  )
  let low = 0
  let high = 1
  for (let i = 0; i < corners.length; i++) {
    const p = corners[i]
    const q = corners[(i + 1) % corners.length]
    // The edge's normal, turned to face the middle.
    let ns = p.t - q.t
    let nt = q.s - p.s
    if (ns * (middle.s - p.s) + nt * (middle.t - p.t) < 0) [ns, nt] = [-ns, -nt]
    const inside = ns * (a.s - p.s) + nt * (a.t - p.t)
    const towards = ns * (b.s - a.s) + nt * (b.t - a.t)
    if (towards === 0) {
      if (inside < 0) return null
    } else if (towards > 0) low = Math.max(low, -inside / towards)
    else high = Math.min(high, -inside / towards)
  }
  // A line that only touches a corner has nothing inside to draw.
  if (high - low < CLIP_TOLERANCE) return null
  const at = (k: number) => point(a.s + (b.s - a.s) * k, a.t + (b.t - a.t) * k)
  return [at(low), at(high)]
}

// Lead cames across a pane in diamond quarries, centred on `centre`.
export function leading(outline: MirrorPoint[], centre: number): WindowLine[] {
  const ts = outline.map(({ t }) => t)
  const bottom = Math.min(...ts)
  const height = Math.max(...ts) - bottom
  const ss = outline.map(({ s }) => s)
  const reach = (Math.max(...ss) - Math.min(...ss)) / 2 + height / QUARRY_SLOPE
  const count = Math.ceil(reach / QUARRY_WIDTH) + 1
  const lines: WindowLine[] = []
  for (let k = -count; k <= count; k++) {
    const s = centre + (k + 0.5) * QUARRY_WIDTH
    for (const slope of [QUARRY_SLOPE, -QUARRY_SLOPE]) {
      const run = height / slope
      const clipped = clipToOutline(point(s - run, bottom - height), point(s + run, bottom + height), outline)
      if (clipped) lines.push(clipped)
    }
  }
  return lines
}

export const ARCH_OUTLINE = pointedArch(0, HALF_WIDTH, SPRING_T, SILL_T)
export const ROUNDEL_OUTLINE = spiral(0, ROUNDEL_T, ROUNDEL_RADIUS, ROUNDEL_RADIUS, 0, Math.PI * 2)
export const QUATREFOIL_OUTLINE = quatrefoil(0, ROUNDEL_T, LOBE_RADIUS)

// The four panes, left and right of the mullion, below and above the transom.
const lowerPane = (s: number) => rectangle(s - LIGHT_HALF_WIDTH, LIGHT_BOTTOM, s + LIGHT_HALF_WIDTH, TRANSOM_BOTTOM)
const upperPane = (s: number) => roundArch(s, LIGHT_HALF_WIDTH, LIGHT_SPRING, TRANSOM_TOP)
export const PANES = {
  lowerLeft: lowerPane(-LIGHT_S),
  lowerRight: lowerPane(LIGHT_S),
  upperLeft: upperPane(-LIGHT_S),
  upperRight: upperPane(LIGHT_S),
}
export const OPEN_PANE: keyof typeof PANES = 'lowerRight'

// The boss at the quatrefoil's heart, and lead cames from it out to each lobe
// and each cusp.
const BOSS_OUTLINE = spiral(0, ROUNDEL_T, BOSS_RADIUS, BOSS_RADIUS, 0, Math.PI * 2)
const ROSE_LEADING: WindowLine[] = Array.from({ length: 8 }, (_, i) => {
  const angle = (Math.PI / 4) * i
  // Out to a lobe's tip on the axes, or to a cusp on the diagonals.
  const reach = i % 2 === 0 ? 2 * LOBE_RADIUS : Math.SQRT2 * LOBE_RADIUS
  const at = (r: number) => point(r * Math.cos(angle), ROUNDEL_T + r * Math.sin(angle))
  return [at(BOSS_RADIUS), at(reach)]
})

// The open casement: the pane's frame and leading turned about its hinge.
const swing = ({ s, t }: MirrorPoint): WindowPoint => {
  const hinge = LIGHT_S + LIGHT_HALF_WIDTH
  const out = hinge - s
  return { s: hinge - out * Math.cos(OPEN_ANGLE), t, d: out * Math.sin(OPEN_ANGLE) }
}
const swingLine = ([a, b]: WindowLine): WindowLine => [swing(a), swing(b)]
const CASEMENT_FRAME = polyline(PANES[OPEN_PANE]).map(swingLine)
const CASEMENT_LEADING = leading(PANES[OPEN_PANE], LIGHT_S).map(swingLine)

const CLOSED_PANES = (Object.keys(PANES) as (keyof typeof PANES)[]).filter((name) => name !== OPEN_PANE)
const paneCentre = (name: keyof typeof PANES) => (name.endsWith('Left') ? -LIGHT_S : LIGHT_S)

// Layers in drawing order: the dim leading, then the worn stone (arch, sill
// and roundel), then the bright openings cut through it and the casement.
export const WINDOW_LAYERS: WindowLayer[] = [
  {
    colour: FOREGROUND_DIM,
    lines: [
      ...CLOSED_PANES.flatMap((name) => leading(PANES[name], paneCentre(name))),
      ...CASEMENT_LEADING,
      ...polyline(BOSS_OUTLINE),
      ...ROSE_LEADING,
    ],
  },
  {
    colour: FOREGROUND_WORN,
    lines: [
      ...polyline(ARCH_OUTLINE),
      [point(-HALF_WIDTH - SILL_OVERHANG, SILL_T), point(HALF_WIDTH + SILL_OVERHANG, SILL_T)],
      ...polyline(ROUNDEL_OUTLINE),
    ],
  },
  {
    colour: FOREGROUND,
    lines: [...Object.values(PANES).flatMap(polyline), ...polyline(QUATREFOIL_OUTLINE), ...CASEMENT_FRAME],
  },
]

// The rectangle the window covers on its wall, in window-local units.
export const WINDOW_BOUNDS = (() => {
  const points = WINDOW_LAYERS.flatMap(({ lines }) => lines.flat())
  const ss = points.map(({ s }) => s)
  const ts = points.map(({ t }) => t)
  return { left: Math.min(...ss), right: Math.max(...ss), bottom: Math.min(...ts), top: Math.max(...ts) }
})()
