import { linePoints } from '../core/line.ts'
import { FOREGROUND, FOREGROUND_DIM, FOREGROUND_WORN } from '../core/palette.ts'
import { hashRandom } from '../core/random.ts'
import type { Pixel } from '../core/types.ts'
import { weather } from '../panels/panelCanvas.ts'
import type { Bounds } from '../signpost/signpost.ts'

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
const KEY_SEED = 43

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

// An arrow pointing up: '#' is drawn. The other buttons' arrows are this
// turned to face their way.
export const ARROW_MAP = [
  '.....##.....',
  '....####....',
  '...######...',
  '..########..',
  '.##########.',
  '############',
  '....####....',
  '....####....',
  '....####....',
  '....####....',
  '....####....',
  '....####....',
]

// Rotates map coordinates (x, y) in an n×n map to face `button`.
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

// Pixels for one keycap. Its top face sits up and back from its base, like the
// logo plaque's face in its niche: lines join the face's corners to the base's,
// and the deeper front edge below the face is shaded with a dotted line. The
// arrow on the face casts a worn shadow down and to the right. A key that
// can't be used is drawn dim, without the shadow.
function keycapPixels(button: NavButton, index: number, enabled: boolean): Pixel[] {
  const base = NAV_BUTTON_BOUNDS[button]
  const face = {
    left: base.left + FACE_INSET.side,
    top: base.top + FACE_INSET.top,
    right: base.right - FACE_INSET.side,
    bottom: base.bottom - FACE_INSET.bottom,
  }
  const bright = enabled ? FOREGROUND : FOREGROUND_DIM
  const worn = enabled ? FOREGROUND_WORN : FOREGROUND_DIM
  const corners = [
    linePoints(face.left, face.top, base.left + 1, base.top + 1),
    linePoints(face.right, face.top, base.right - 1, base.top + 1),
    linePoints(face.left, face.bottom, base.left + 1, base.bottom - 1),
    linePoints(face.right, face.bottom, base.right - 1, base.bottom - 1),
  ].flat()
  const frontShade: { x: number; y: number }[] = []
  const shadeY = Math.round((face.bottom + base.bottom) / 2)
  for (let x = face.left + 1; x < face.right; x += 2) frontShade.push({ x, y: shadeY })

  const n = ARROW_MAP.length
  const arrowLeft = face.left + Math.floor((face.right - face.left + 1 - n) / 2)
  const arrowTop = face.top + Math.floor((face.bottom - face.top + 1 - n) / 2)
  const arrow = new Set<string>()
  const arrowPoints: { x: number; y: number }[] = []
  ARROW_MAP.forEach((row, y) =>
    row.split('').forEach((cell, x) => {
      if (cell !== '#') return
      const turned = turnArrow(button, x, y, n)
      const point = { x: arrowLeft + turned.x, y: arrowTop + turned.y }
      arrow.add(`${point.x},${point.y}`)
      arrowPoints.push(point)
    }),
  )
  const shadow = enabled
    ? arrowPoints.map((p) => ({ x: p.x + 1, y: p.y + 1 })).filter((p) => !arrow.has(`${p.x},${p.y}`))
    : []

  const parts: [{ x: number; y: number }[], string, number][] = [
    [rectOutline(base, true), worn, 0.06],
    [corners, FOREGROUND_DIM, 0.1],
    [frontShade, FOREGROUND_DIM, 0.1],
    [rectOutline(face), bright, 0.04],
    [shadow, FOREGROUND_DIM, 0],
    [arrowPoints, bright, 0.02],
  ]
  return parts.flatMap(([points, colour, dropChance], part) =>
    points.flatMap((p) => {
      const roll = hashRandom(KEY_SEED, index, part, p.x - base.left, p.y - base.top)
      const weathered = weather(colour, roll, dropChance, 0.18)
      return weathered ? [{ ...p, colour: weathered }] : []
    }),
  )
}

// Pixels for all four buttons, drawn as worn keycaps with arrows. Buttons that
// can't be used are drawn dim.
export function navButtonPixels(enabled: Record<NavButton, boolean>): Pixel[] {
  return NAV_BUTTONS.flatMap((button, index) => keycapPixels(button, index, enabled[button]))
}
