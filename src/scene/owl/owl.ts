import { FOREGROUND, FOREGROUND_DIM, FOREGROUND_WORN } from '../core/palette.ts'
import { point, polyline, spiral } from '../mirror/frame.ts'
import type { MirrorPoint } from '../mirror/frame.ts'
import type { WindowLayer, WindowLine } from '../window/tracery.ts'

// A small owl perched in the window's open pane, drawn like the room as
// sparse lines: a rounded body and head with no neck between, ear tufts,
// big round eyes over a little beak, folded wings, chest feathers and toes.
// Its shape is in owl-local world units: u runs right and w up from between
// its feet. owl/pixels.ts sets it in the window.
//
// Its head can turn (about the vertical, 0 facing the visitor), tilt (in the
// wall's plane, about its neck) and blink. At rest it looks off to the
// visitor's right; used, it turns to look at them and back.

export type OwlPose = { turn: number; tilt: number; blink: number }

// The body: an ellipse whose bottom sits just above the feet, drawn up each
// side to its shoulders, where the head takes over.
const BODY_W = 0.11
const BODY_RADIUS_U = 0.08
const BODY_RADIUS_W = 0.1
const SHOULDER_ANGLE = 0.87
// The head: a circle drawn over the top between the shoulders, and the
// point it tilts about.
const HEAD_W = 0.225
const HEAD_RADIUS = 0.07
const HEAD_START_ANGLE = -0.7
export const NECK = point(0, 0.17)
// Each feature's angle round the head from its front, for a head facing the visitor.
const EYE_ANGLE = 0.5
const TUFT_ANGLE = 0.7
const EYE_RADIUS = 0.022
const EYE_W = HEAD_W - 0.005
// How far forward an eye or the beak must face to be seen, as the cosine of
// its angle from the visitor.
const MIN_FACING = 0.15
const BEAK_TOP = HEAD_W - 0.025
const BEAK_TIP = HEAD_W - 0.05
const BEAK_HALF_WIDTH = 0.011
const TUFT_HEIGHT = 0.035
const TUFT_HALF_WIDTH = 0.015

// At rest the head is turned to the visitor's right.
export const REST_TURN = 0.6
export const REST_POSE: OwlPose = { turn: REST_TURN, tilt: 0, blink: 0 }

// The resting animation. A blink closes, holds and opens over BLINK_MS, after
// each of BLINK_GAPS in turn so they don't come like clockwork. Every
// TILT_PERIOD_MS, TILT_START_MS in, the head eases over TILT_MS to
// TILT_ANGLE and back, alternately left and right.
const BLINK_GAPS = [3200, 4100, 2600, 5000]
export const BLINK_MS = 180
const TILT_PERIOD_MS = 7000
const TILT_START_MS = 4000
export const TILT_MS = 1200
export const TILT_ANGLE = 0.18
// Using it, the head turns to the visitor over OWL_TURN_MS, holds for
// OWL_HOLD_MS and turns back.
export const OWL_TURN_MS = 300
export const OWL_HOLD_MS = 1200
export const OWL_LOOK_MS = 2 * OWL_TURN_MS + OWL_HOLD_MS

// The same ease-in-out as the view's turns and moves.
const easeInOut = (k: number) => (1 - Math.cos(Math.PI * k)) / 2

// The resting pose's blink and tilt `elapsed` ms into the resting animation.
export function owlIdle(elapsed: number): { blink: number; tilt: number } {
  const blinkCycle = BLINK_GAPS.reduce((sum, gap) => sum + gap + BLINK_MS, 0)
  let into = elapsed % blinkCycle
  let blink = 0
  for (const gap of BLINK_GAPS) {
    if (into < gap) break
    into -= gap
    if (into < BLINK_MS) {
      // Closing over the first third, shut for the middle, opening over the last.
      blink = Math.min(1, 3 * Math.min(into, BLINK_MS - into) / BLINK_MS)
      break
    }
    into -= BLINK_MS
  }
  const period = Math.floor(elapsed / TILT_PERIOD_MS)
  const tiltInto = (elapsed % TILT_PERIOD_MS) - TILT_START_MS
  const side = period % 2 === 0 ? 1 : -1
  const tilt = tiltInto >= 0 && tiltInto < TILT_MS ? side * TILT_ANGLE * easeInOut(2 * Math.min(tiltInto, TILT_MS - tiltInto) / TILT_MS) : 0
  return { blink, tilt }
}

// The head's turn `elapsed` ms into a look at the visitor, or null once it's over.
export function owlLook(elapsed: number): number | null {
  if (elapsed < 0 || elapsed >= OWL_LOOK_MS) return null
  const away = Math.min(1, Math.min(elapsed, OWL_LOOK_MS - elapsed) / OWL_TURN_MS)
  return REST_TURN * (1 - easeInOut(away))
}

function ellipse(cu: number, cw: number, ru: number, rw: number, from: number, to: number): MirrorPoint[] {
  const steps = Math.max(2, Math.ceil((Math.abs(to - from) * Math.max(ru, rw)) / 0.01))
  return Array.from({ length: steps + 1 }, (_, i) => {
    const angle = from + ((to - from) * i) / steps
    return point(cu + ru * Math.cos(angle), cw + rw * Math.sin(angle))
  })
}

const mirrorU = (lines: WindowLine[]): WindowLine[] => lines.map(([a, b]) => [point(-a.s, a.t), point(-b.s, b.t)])

const BODY = ellipse(0, BODY_W, BODY_RADIUS_U, BODY_RADIUS_W, Math.PI - SHOULDER_ANGLE, 2 * Math.PI + SHOULDER_ANGLE)
const HEAD = spiral(0, HEAD_W, HEAD_RADIUS, HEAD_RADIUS, HEAD_START_ANGLE, Math.PI - HEAD_START_ANGLE)
// A folded wing down the right side, inside the body's outline, and its mirror.
const WING = polyline(ellipse(0, BODY_W, BODY_RADIUS_U - 0.02, BODY_RADIUS_W - 0.015, 0.6, -1.2))
const WINGS = [...WING, ...mirrorU(WING)]
const chevron = (u: number, w: number): WindowLine[] =>
  polyline([point(u - 0.01, w + 0.006), point(u, w), point(u + 0.01, w + 0.006)])
const CHEST = [chevron(0, 0.13), chevron(-0.025, 0.09), chevron(0.025, 0.09), chevron(0, 0.055)].flat()
// Three toes from each foot spread on the ledge.
const foot = (u: number): WindowLine[] =>
  [-0.012, 0, 0.012].map((spread): WindowLine => [point(u, 0.015), point(u + spread, 0)])
const FEET = [...foot(-0.03), ...foot(0.03)]

// Where a feature `angle` round the head from its front sits across it, and
// how squarely it faces the visitor.
const across = (angle: number, inset: number) => ({ u: inset * HEAD_RADIUS * Math.sin(angle), facing: Math.cos(angle) })

// The head's top at `u`.
const headTop = (u: number) => HEAD_W + Math.sqrt(Math.max(0, HEAD_RADIUS ** 2 - u ** 2))

// The head's lines for `turn` and `blink`, before tilting: its outline, tufts
// and face in bright, and the brows in worn.
function headLines({ turn, blink }: OwlPose): { bright: WindowLine[]; worn: WindowLine[] } {
  const bright: WindowLine[] = polyline(HEAD)
  const worn: WindowLine[] = []
  for (const side of [-1, 1]) {
    // Tufts stand on the head's top whichever way it faces.
    const tuft = across(turn + side * TUFT_ANGLE, 0.75)
    const half = TUFT_HALF_WIDTH * Math.max(0.4, Math.abs(tuft.facing))
    const outward = Math.sign(tuft.u) || side
    bright.push(
      ...polyline([
        point(tuft.u - half, headTop(tuft.u - half) - 0.005),
        point(tuft.u + outward * 0.008, headTop(tuft.u) + TUFT_HEIGHT),
        point(tuft.u + half, headTop(tuft.u + half) - 0.005),
      ]),
    )
    const eye = across(turn + side * EYE_ANGLE, 0.85)
    if (eye.facing < MIN_FACING) continue
    const halfWidth = EYE_RADIUS * eye.facing
    const halfHeight = EYE_RADIUS * (1 - blink)
    if (halfHeight < 0.002) bright.push([point(eye.u - halfWidth, EYE_W), point(eye.u + halfWidth, EYE_W)])
    else {
      bright.push(...polyline(ellipse(eye.u, EYE_W, halfWidth, halfHeight, 0, 2 * Math.PI)))
      // The pupil, a single point.
      if (blink < 0.5) bright.push([point(eye.u, EYE_W), point(eye.u, EYE_W)])
    }
  }
  const beak = across(turn, 0.8)
  if (beak.facing >= MIN_FACING) {
    const half = BEAK_HALF_WIDTH * beak.facing
    bright.push(...polyline([point(beak.u - half, BEAK_TOP), point(beak.u, BEAK_TIP), point(beak.u + half, BEAK_TOP)]))
    // The brows: a V from above each seen eye down to the beak's top.
    for (const side of [-1, 1]) {
      const eye = across(turn + side * EYE_ANGLE, 0.85)
      if (eye.facing < MIN_FACING) continue
      worn.push([point(eye.u + side * EYE_RADIUS * eye.facing, EYE_W + EYE_RADIUS + 0.01), point(beak.u, BEAK_TOP + 0.008)])
    }
  }
  return { bright, worn }
}

// Turns a point `angle` radians anticlockwise about the neck.
function tiltPoint({ s, t }: MirrorPoint, angle: number): MirrorPoint {
  const du = s - NECK.s
  const dw = t - NECK.t
  return point(NECK.s + du * Math.cos(angle) - dw * Math.sin(angle), NECK.t + du * Math.sin(angle) + dw * Math.cos(angle))
}

// The owl's layers for `pose`, in drawing order: dim chest feathers, worn
// wings, brows and feet, then its bright outline, tufts and face.
export function owlLayers(pose: OwlPose): WindowLayer[] {
  const head = headLines(pose)
  const tilt = (lines: WindowLine[]) =>
    lines.map(([a, b]): WindowLine => [tiltPoint(a, pose.tilt), tiltPoint(b, pose.tilt)])
  return [
    { colour: FOREGROUND_DIM, lines: CHEST },
    { colour: FOREGROUND_WORN, lines: [...WINGS, ...FEET, ...tilt(head.worn)] },
    { colour: FOREGROUND, lines: [...polyline(BODY), ...tilt(head.bright)] },
  ]
}

// The pose `elapsed` ms into the resting animation, and `lookElapsed` ms into
// a look at the visitor if one is playing. Held `still` (for reduced motion)
// it doesn't blink or tilt, and a look turns its head straight round and back.
export function owlPose(elapsed: number, lookElapsed: number | null, still = false): OwlPose {
  const { blink, tilt } = still ? { blink: 0, tilt: 0 } : owlIdle(elapsed)
  const looking = lookElapsed !== null && lookElapsed >= 0 && lookElapsed < OWL_LOOK_MS
  const turn = !looking ? REST_TURN : still ? 0 : (owlLook(lookElapsed) ?? REST_TURN)
  return { turn, tilt, blink }
}
