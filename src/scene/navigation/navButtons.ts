import { linePoints } from '../core/line.ts'
import { FOREGROUND, FOREGROUND_DIM } from '../core/palette.ts'
import type { Bounds, Pixel } from '../core/types.ts'

// Four direction buttons to the right of the compass, laid out like a
// keyboard's arrow keys, in panel canvas pixels: forward on top, and back in
// a row with the turns either side of it.
export type NavButton = 'forward' | 'back' | 'left' | 'right'

// The centre of the two rows of buttons.
const PAD_CENTRE = { x: 230, y: 66 }
export const BUTTON_SIZE = 30
const BUTTON_GAP = 2
// How far a keycap's top face is inset from its base: it sits up and back, so
// more of the base shows below it.
const FACE_INSET = { side: 3, top: 2, bottom: 6 }
// How far (pixels) a fully pressed key's face sinks towards its base.
export const PRESS_DEPTH = 3

// A key being pressed, and how far down it is from 0 (up) to 1 (fully down).
export type KeyPress = { button: NavButton; depth: number }

// Bounds of the button in `column` (−1 to 1, from the left) and `row` (0 on
// top, 1 below).
function buttonAt(column: number, row: number): Bounds {
  const step = BUTTON_SIZE + BUTTON_GAP
  const left = Math.round(PAD_CENTRE.x - BUTTON_SIZE / 2) + column * step
  const top = Math.round(PAD_CENTRE.y - step + BUTTON_GAP / 2) + row * step
  return { left, top, right: left + BUTTON_SIZE - 1, bottom: top + BUTTON_SIZE - 1 }
}

// Inclusive bounds of each button.
export const NAV_BUTTON_BOUNDS: Record<NavButton, Bounds> = {
  forward: buttonAt(0, 0),
  left: buttonAt(-1, 1),
  back: buttonAt(0, 1),
  right: buttonAt(1, 1),
}

const NAV_BUTTONS = Object.keys(NAV_BUTTON_BOUNDS) as NavButton[]

// The button under panel point (x, y), if any.
export function navButtonAt(x: number, y: number): NavButton | null {
  return (
    NAV_BUTTONS.find((button) => {
      const { left, top, right, bottom } = NAV_BUTTON_BOUNDS[button]
      return x >= left && x < right + 1 && y >= top && y < bottom + 1
    }) ?? null
  )
}

// An arrow pointing up, as a closed outline through points on an
// ARROW_SIZE×ARROW_SIZE grid. The other buttons' arrows are this turned to
// face their way.
export const ARROW_SIZE = 11
export const ARROW_OUTLINE = [
  { x: 5, y: 0 },
  { x: 10, y: 5 },
  { x: 6, y: 5 },
  { x: 6, y: 10 },
  { x: 4, y: 10 },
  { x: 4, y: 5 },
  { x: 0, y: 5 },
  { x: 5, y: 0 },
]

// Rotates grid coordinates (x, y) in an n×n grid to face `button`.
function turnArrow(button: NavButton, x: number, y: number, n: number): { x: number; y: number } {
  switch (button) {
    case 'forward':
      return { x, y }
    case 'back':
      return { x, y: n - 1 - y }
    case 'left':
      return { x: y, y: x }
    case 'right':
      return { x: n - 1 - y, y: x }
  }
}

// Points on a rectangle's outline. With `cutCorners` its corner pixels are
// left out, for the stepped corners of the pane's frame.
function rectOutline({ left, top, right, bottom }: Bounds, cutCorners = false): { x: number; y: number }[] {
  const points: { x: number; y: number }[] = []
  const inset = cutCorners ? 1 : 0
  for (let x = left + inset; x <= right - inset; x++) points.push({ x, y: top }, { x, y: bottom })
  for (let y = top + 1; y < bottom; y++) points.push({ x: left, y }, { x: right, y })
  return points
}

// Pixels for one keycap, drawn like the logo plaque in its niche: the base's
// outline, the top face's outline sitting up and back from it, lines joining
// their corners, and the arrow's outline on the face. A key that can't be used
// is drawn all dim. Pressing sinks the face and its arrow `sink` whole pixels
// down towards the front of the base.
function keycapPixels(button: NavButton, enabled: boolean, sink: number): Pixel[] {
  const base = NAV_BUTTON_BOUNDS[button]
  const face = {
    left: base.left + FACE_INSET.side,
    top: base.top + FACE_INSET.top + sink,
    right: base.right - FACE_INSET.side,
    bottom: base.bottom - FACE_INSET.bottom + sink,
  }
  const bright = enabled ? FOREGROUND : FOREGROUND_DIM
  const corners = [
    linePoints(face.left, face.top, base.left + 1, base.top + 1),
    linePoints(face.right, face.top, base.right - 1, base.top + 1),
    linePoints(face.left, face.bottom, base.left + 1, base.bottom - 1),
    linePoints(face.right, face.bottom, base.right - 1, base.bottom - 1),
  ].flat()

  const arrowLeft = face.left + Math.floor((face.right - face.left + 1 - ARROW_SIZE) / 2)
  const arrowTop = face.top + Math.floor((face.bottom - face.top + 1 - ARROW_SIZE) / 2)
  const turned = ARROW_OUTLINE.map(({ x, y }) => {
    const p = turnArrow(button, x, y, ARROW_SIZE)
    return { x: arrowLeft + p.x, y: arrowTop + p.y }
  })
  const arrow = turned.slice(1).flatMap((p, i) => linePoints(turned[i].x, turned[i].y, p.x, p.y))

  const parts: [{ x: number; y: number }[], string][] = [
    [rectOutline(base, true), FOREGROUND_DIM],
    [corners, FOREGROUND_DIM],
    [rectOutline(face), bright],
    [arrow, bright],
  ]
  return parts.flatMap(([points, colour]) => points.map((p) => ({ ...p, colour })))
}

// Pixels for all four buttons, drawn as keycaps with arrows. Buttons that
// can't be used are drawn dim, and `press` sinks the key being pressed.
export function navButtonPixels(enabled: Record<NavButton, boolean>, press?: KeyPress): Pixel[] {
  return NAV_BUTTONS.flatMap((button) => {
    const sink = press?.button === button ? Math.round(Math.min(1, Math.max(0, press.depth)) * PRESS_DEPTH) : 0
    return keycapPixels(button, enabled[button], sink)
  })
}
