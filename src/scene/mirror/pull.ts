import { CEILING_Y } from '../core/camera.ts'
import { FOREGROUND, FOREGROUND_WORN } from '../core/palette.ts'
import { point, polyline } from './frame.ts'
import type { MirrorLayer, MirrorPoint } from './frame.ts'

// A curtain pull hanging beside the mirror: a cord from the ceiling ending in
// an acorn-shaped handle. Drawn like the mirror, as sparse lines in
// mirror-local units on the mirror's wall, to the right of its side scroll.

// Where the cord hangs, and where the handle's cap starts at rest: a little
// above eye height, clear of the brick below it.
export const PULL_S = 0.68
const HANDLE_TOP = 0.12
// The handle's cap, then its body widening and narrowing to a point.
const CAP_HALF_WIDTH = 0.012
const CAP_HEIGHT = 0.025
const BODY_HALF_WIDTH = 0.035
const BODY_WIDEST = 0.07
const HANDLE_HEIGHT = 0.14

// The handle's outline, its top at `top`. Points run down the right side and
// back up the left.
function handleOutline(top: number): MirrorPoint[] {
  const right = [
    point(PULL_S + CAP_HALF_WIDTH, top),
    point(PULL_S + CAP_HALF_WIDTH, top - CAP_HEIGHT),
    point(PULL_S + BODY_HALF_WIDTH, top - BODY_WIDEST),
    point(PULL_S + BODY_HALF_WIDTH * 0.6, top - HANDLE_HEIGHT + 0.025),
    point(PULL_S, top - HANDLE_HEIGHT),
  ]
  const left = right.slice(0, -1).reverse().map(({ s, t }) => point(2 * PULL_S - s, t))
  return [point(PULL_S - CAP_HALF_WIDTH, top), ...right, ...left]
}

// The pull's layers with the handle lowered `drop` mirror units, as when it's
// tugged. The cord stretches to follow.
export function pullLayers(drop = 0): MirrorLayer[] {
  const top = HANDLE_TOP - drop
  const cord = polyline([point(PULL_S, CEILING_Y), point(PULL_S, top)])
  // A band where the cap meets the body.
  const band = polyline([
    point(PULL_S - CAP_HALF_WIDTH * 1.8, top - CAP_HEIGHT - 0.012),
    point(PULL_S + CAP_HALF_WIDTH * 1.8, top - CAP_HEIGHT - 0.012),
  ])
  return [
    { colour: FOREGROUND_WORN, lines: [...cord, ...band] },
    { colour: FOREGROUND, lines: polyline(handleOutline(top)) },
  ]
}

type Rect = { left: number; right: number; bottom: number; top: number }

// The pull at rest, so bricks aren't drawn behind it.
export const PULL_BOUNDS: Rect = {
  left: PULL_S - BODY_HALF_WIDTH,
  right: PULL_S + BODY_HALF_WIDTH,
  bottom: HANDLE_TOP - HANDLE_HEIGHT,
  top: CEILING_Y,
}

// Where the pull can be clicked: the handle and the lower cord, padded so the
// one-pixel cord is easy to hit.
const PULL_HIT: Rect = {
  left: PULL_S - 0.05,
  right: PULL_S + 0.05,
  bottom: HANDLE_TOP - HANDLE_HEIGHT - 0.02,
  top: HANDLE_TOP + 0.25,
}

// Whether a mirror-local point on the wall is over the pull.
export function isOnPull({ s, t }: MirrorPoint): boolean {
  return s >= PULL_HIT.left && s <= PULL_HIT.right && t >= PULL_HIT.bottom && t <= PULL_HIT.top
}
