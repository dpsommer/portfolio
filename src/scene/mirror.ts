import { FOREGROUND, FOREGROUND_DIM, FOREGROUND_WORN } from './palette.ts'

// An ornate wall mirror, drawn like the room as sparse lines: an arched frame
// with a crest, side scrolls and a pendant, an inner glass edge and a couple of
// glints on the glass. Its shape is in mirror-local world units: s runs right
// and t up from the mirror's centre. room.ts hangs it on a wall.

export type MirrorPoint = { s: number; t: number }
export type MirrorLine = [MirrorPoint, MirrorPoint]

const HALF_WIDTH = 0.4
// Where the straight sides meet the arched top, and the frame's bottom.
const SHOULDER = 0.15
const BOTTOM = -0.55
// How far the glass edge sits inside the frame.
const FRAME_WIDTH = 0.07

const point = (s: number, t: number): MirrorPoint => ({ s, t })
const mirrored = ({ s, t }: MirrorPoint) => point(-s, t)

function polyline(points: MirrorPoint[]): MirrorLine[] {
  return points.slice(1).map((p, i) => [points[i], p])
}

// Points along a spiral around (s, t), from angle `from` to `to` (radians,
// anticlockwise from +s) as the radius goes from `r0` to `r1`. A circular arc
// when the radii match.
function spiral(s: number, t: number, r0: number, r1: number, from: number, to: number): MirrorPoint[] {
  const steps = Math.max(2, Math.ceil((Math.abs(to - from) * Math.max(r0, r1)) / 0.02))
  return Array.from({ length: steps + 1 }, (_, i) => {
    const k = i / steps
    const angle = from + (to - from) * k
    const r = r0 + (r1 - r0) * k
    return point(s + r * Math.cos(angle), t + r * Math.sin(angle))
  })
}

// A closed arch-topped outline, `inset` inside the frame's outer edge.
function archOutline(inset: number): MirrorPoint[] {
  const half = HALF_WIDTH - inset
  return [
    point(-half, BOTTOM + inset),
    ...spiral(0, SHOULDER, half, half, Math.PI, 0),
    point(half, BOTTOM + inset),
    point(-half, BOTTOM + inset),
  ]
}

// The glass's edge, just inside the frame.
export const GLASS_OUTLINE = archOutline(FRAME_WIDTH)

// Whether a mirror-local point is on the glass, inside the worn inner edge.
export function isOnGlass({ s, t }: MirrorPoint): boolean {
  const half = HALF_WIDTH - FRAME_WIDTH
  if (Math.abs(s) > half || t < BOTTOM + FRAME_WIDTH) return false
  return t <= SHOULDER || Math.hypot(s, t - SHOULDER) <= half
}

// The right-hand half of each symmetric ornament; the left is its reflection.
function ornamentHalves(): MirrorPoint[][] {
  const top = SHOULDER + HALF_WIDTH
  return [
    // A scroll curling out from the frame's side at the shoulder.
    spiral(HALF_WIDTH + 0.07, SHOULDER, 0.07, 0.02, Math.PI, -Math.PI * 1.25),
    // A small curl either side of the crest, resting on the arch.
    spiral(0.1, top + 0.015, 0.045, 0.015, Math.PI * 0.75, -Math.PI),
    // A curl at each bottom corner.
    spiral(HALF_WIDTH - 0.03, BOTTOM - 0.035, 0.035, 0.012, Math.PI * 0.5, -Math.PI * 1.5),
    // The pendant under the frame, a shallow swag to a point.
    [point(0.16, BOTTOM), point(0.1, BOTTOM - 0.04), point(0.04, BOTTOM - 0.065), point(0, BOTTOM - 0.09)],
  ]
}

function ornaments(): MirrorLine[] {
  const top = SHOULDER + HALF_WIDTH
  // The crest: a diamond on top of the arch.
  const crest = [point(0, top), point(0.05, top + 0.05), point(0, top + 0.1), point(-0.05, top + 0.05), point(0, top)]
  // A diamond bead hanging from the pendant.
  const bead = BOTTOM - 0.09
  const drop = [point(0, bead), point(0.02, bead - 0.02), point(0, bead - 0.04), point(-0.02, bead - 0.02), point(0, bead)]
  return [
    ...ornamentHalves().flatMap((half) => [...polyline(half), ...polyline(half.map(mirrored))]),
    ...polyline(crest),
    ...polyline(drop),
  ]
}

// Glints on the glass: two short parallel slashes in its upper left.
const GLINTS: MirrorLine[] = [
  [point(-0.22, 0.02), point(-0.08, 0.2)],
  [point(-0.22, -0.1), point(-0.15, -0.01)],
]

export type MirrorLayer = { colour: string; lines: MirrorLine[] }

// Layers in drawing order, dimmest first so the frame draws over the glass.
export const MIRROR_LAYERS: MirrorLayer[] = [
  { colour: FOREGROUND_DIM, lines: GLINTS },
  { colour: FOREGROUND_WORN, lines: polyline(GLASS_OUTLINE) },
  { colour: FOREGROUND, lines: [...polyline(archOutline(0)), ...ornaments()] },
]

// The rectangle the mirror covers, in mirror-local units.
export const MIRROR_BOUNDS = (() => {
  const points = MIRROR_LAYERS.flatMap(({ lines }) => lines.flat())
  const ss = points.map(({ s }) => s)
  const ts = points.map(({ t }) => t)
  return { left: Math.min(...ss), right: Math.max(...ss), bottom: Math.min(...ts), top: Math.max(...ts) }
})()
