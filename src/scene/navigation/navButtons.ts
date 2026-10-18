import { FOREGROUND, FOREGROUND_DIM, FOREGROUND_WORN } from '../core/palette.ts'
import type { Pixel } from '../core/types.ts'
import type { Bounds } from '../signpost/signpost.ts'

// Four direction buttons to the right of the compass, laid out like a
// keyboard's arrow keys, in panel canvas pixels: forward on top, and back in
// a row with the turns either side of it.
export type NavButton = 'forward' | 'back' | 'left' | 'right'

// The centre of the two rows of buttons.
const PAD_CENTRE = { x: 230, y: 66 }
export const BUTTON_SIZE = 30
const BUTTON_GAP = 2
const INNER_INSET = 2

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

function rectOutline({ left, top, right, bottom }: Bounds, colour: string): Pixel[] {
  const pixels: Pixel[] = []
  for (let x = left; x <= right; x++) pixels.push({ x, y: top, colour }, { x, y: bottom, colour })
  for (let y = top + 1; y < bottom; y++) pixels.push({ x: left, y, colour }, { x: right, y, colour })
  return pixels
}

// Pixels for all four buttons: a double outline like the frame's and an arrow.
// Buttons that can't be used are drawn dim.
export function navButtonPixels(enabled: Record<NavButton, boolean>): Pixel[] {
  return NAV_BUTTONS.flatMap((button) => {
    const bounds = NAV_BUTTON_BOUNDS[button]
    const outer = enabled[button] ? FOREGROUND : FOREGROUND_DIM
    const inner = enabled[button] ? FOREGROUND_WORN : FOREGROUND_DIM
    const inset = {
      left: bounds.left + INNER_INSET,
      top: bounds.top + INNER_INSET,
      right: bounds.right - INNER_INSET,
      bottom: bounds.bottom - INNER_INSET,
    }
    const n = ARROW_MAP.length
    const arrowLeft = bounds.left + Math.floor((BUTTON_SIZE - n) / 2)
    const arrowTop = bounds.top + Math.floor((BUTTON_SIZE - n) / 2)
    const arrow: Pixel[] = []
    ARROW_MAP.forEach((row, y) =>
      row.split('').forEach((cell, x) => {
        if (cell !== '#') return
        const turned = turnArrow(button, x, y, n)
        arrow.push({ x: arrowLeft + turned.x, y: arrowTop + turned.y, colour: outer })
      }),
    )
    return [...rectOutline(bounds, outer), ...rectOutline(inset, inner), ...arrow]
  })
}
