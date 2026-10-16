import { GLASS_OUTLINE, isOnGlass } from './mirror.ts'
import type { MirrorLine, MirrorPoint } from './mirror.ts'

// A water ripple on the mirror's glass: rings spreading from where it was
// clicked, in mirror-local units. Each ring starts slowly and speeds up, so the
// outer rings are further apart, and fades as it nears the glass's far edge.

const RING_COUNT = 3
// Seconds between one ring setting off and the next.
const EMIT_INTERVAL = 0.35
// A ring's radius is SPEED · age^GROWTH (age in seconds).
const SPEED = 0.25
const GROWTH = 2
// Sample spacing (mirror units) around each ring.
const RING_STEP = 0.02

export type Ring = { radius: number; strength: number }

// How far the glass reaches from `origin`: the distance at which rings vanish.
function reach(origin: MirrorPoint): number {
  return Math.max(...GLASS_OUTLINE.map(({ s, t }) => Math.hypot(s - origin.s, t - origin.t)))
}

const radiusAt = (age: number) => SPEED * age ** GROWTH

// Milliseconds until the last ring has faded at the glass's far edge.
export function rippleDuration(origin: MirrorPoint): number {
  const lastAge = (reach(origin) / SPEED) ** (1 / GROWTH)
  return ((RING_COUNT - 1) * EMIT_INTERVAL + lastAge) * 1000
}

// The rings alive `elapsedMs` after the click, outermost first. Strength runs
// from 1 at the origin to 0 at the far edge.
export function rippleRings(origin: MirrorPoint, elapsedMs: number): Ring[] {
  // Checked directly, as rounding can leave the last ring a hair short of the edge.
  if (elapsedMs >= rippleDuration(origin)) return []
  const far = reach(origin)
  const rings: Ring[] = []
  for (let k = 0; k < RING_COUNT; k++) {
    const age = elapsedMs / 1000 - k * EMIT_INTERVAL
    if (age <= 0) continue
    const radius = radiusAt(age)
    if (radius < far) rings.push({ radius, strength: 1 - radius / far })
  }
  return rings
}

// The parts of a ring around `origin` that lie on the glass.
export function ringLines(origin: MirrorPoint, radius: number): MirrorLine[] {
  const steps = Math.max(8, Math.ceil((2 * Math.PI * radius) / RING_STEP))
  const points = Array.from({ length: steps + 1 }, (_, i) => {
    const angle = (2 * Math.PI * i) / steps
    return { s: origin.s + radius * Math.cos(angle), t: origin.t + radius * Math.sin(angle) }
  })
  const lines: MirrorLine[] = []
  for (let i = 1; i < points.length; i++) {
    if (isOnGlass(points[i - 1]) && isOnGlass(points[i])) lines.push([points[i - 1], points[i]])
  }
  return lines
}
