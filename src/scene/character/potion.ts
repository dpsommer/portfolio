import { FOREGROUND, FOREGROUND_DIM, FOREGROUND_WORN } from '../core/palette.ts'
import { GLYPH_HEIGHT, textPixels, textWidth } from '../core/pixelFont.ts'
import type { Pixel } from '../core/types.ts'
import type { Health } from './card.ts'

// A round-bottomed health potion for the profile view: a corked flask filled
// to the share of health left, with the current and total health under it.

// The flask's round body, and its neck, lip and cork above it, centred on a
// column POTION_WIDTH wide. Widths are odd so everything has a middle column.
const BODY_RADIUS = 18
const NECK_WIDTH = 11
const NECK_HEIGHT = 8
const LIP_WIDTH = 15
const LIP_HEIGHT = 3
const CORK_WIDTH = 9
const CORK_HEIGHT = 4
// The health under the flask, at READOUT_SCALE, READOUT_GAP below it. Each
// number has at most four digits, so the potion is wide enough for the widest
// readout as well as the flask, and odd so it has a middle column.
const READOUT_SCALE = 2
const READOUT_GAP = 6
const WIDEST_READOUT = '9999/9999'
export const POTION_WIDTH = Math.max(2 * BODY_RADIUS + 1, textWidth(WIDEST_READOUT, READOUT_SCALE)) | 1
const MIDDLE = (POTION_WIDTH - 1) / 2
const LIP_TOP = CORK_HEIGHT
const NECK_TOP = LIP_TOP + LIP_HEIGHT
// The body's centre: its top edge meets the bottom of the neck.
const BODY_CENTRE_Y = NECK_TOP + NECK_HEIGHT + BODY_RADIUS - 2
const FLASK_HEIGHT = BODY_CENTRE_Y + BODY_RADIUS + 1
export const POTION_HEIGHT = FLASK_HEIGHT + READOUT_GAP + GLYPH_HEIGHT * READOUT_SCALE

// Whether a point is inside the glass of the neck or body. The circle test
// is padded by half a pixel's worth so the body's outline comes out round.
function inGlass(x: number, y: number): boolean {
  const inNeck = Math.abs(x - MIDDLE) <= (NECK_WIDTH - 1) / 2 && y >= NECK_TOP && y <= BODY_CENTRE_Y
  const dx = x - MIDDLE
  const dy = y - BODY_CENTRE_Y
  return inNeck || dx * dx + dy * dy <= BODY_RADIUS * BODY_RADIUS + BODY_RADIUS
}

// A one-pixel rectangle outline, every pixel in `colour`.
function rectangle(left: number, top: number, width: number, height: number, colour: string): Pixel[] {
  const pixels: Pixel[] = []
  for (let x = left; x < left + width; x++) {
    pixels.push({ x, y: top, colour }, { x, y: top + height - 1, colour })
  }
  for (let y = top + 1; y < top + height - 1; y++) {
    pixels.push({ x: left, y, colour }, { x: left + width - 1, y, colour })
  }
  return pixels
}

// Pixels for the potion with its top-left corner at the origin, filled to
// `current / total` of the glass's inside height. The liquid is worn with a
// bright surface; a worn glint shows on the empty glass.
export function potionPixels({ current, total }: Health): Pixel[] {
  const pixels: Pixel[] = []
  // The cork, worn with a dim grain, and the lip, bright like the glass.
  pixels.push(...rectangle(MIDDLE - (CORK_WIDTH - 1) / 2, 0, CORK_WIDTH, CORK_HEIGHT, FOREGROUND_WORN))
  // The grain stays inside the cork's outline.
  const grainRight = MIDDLE + (CORK_WIDTH - 3) / 2
  for (let x = MIDDLE - (CORK_WIDTH - 3) / 2; x <= grainRight; x += 2) {
    pixels.push({ x, y: 1, colour: FOREGROUND_DIM })
    if (x + 1 <= grainRight) pixels.push({ x: x + 1, y: 2, colour: FOREGROUND_DIM })
  }
  pixels.push(...rectangle(MIDDLE - (LIP_WIDTH - 1) / 2, LIP_TOP, LIP_WIDTH, LIP_HEIGHT, FOREGROUND))
  // The glass's outline: the inside pixels with a neighbour outside. The
  // neck's top is open under the lip.
  const inside: { x: number; y: number }[] = []
  for (let y = NECK_TOP; y < FLASK_HEIGHT; y++) {
    for (let x = 0; x < POTION_WIDTH; x++) {
      if (!inGlass(x, y)) continue
      const edge = !inGlass(x - 1, y) || !inGlass(x + 1, y) || (y > NECK_TOP && !inGlass(x, y - 1)) || !inGlass(x, y + 1)
      if (edge) pixels.push({ x, y, colour: FOREGROUND })
      else inside.push({ x, y })
    }
  }
  const insideTop = Math.min(...inside.map(({ y }) => y))
  const insideBottom = Math.max(...inside.map(({ y }) => y))
  const share = total > 0 ? Math.max(0, Math.min(1, current / total)) : 0
  const rows = Math.round(share * (insideBottom - insideTop + 1))
  const surface = insideBottom - rows + 1
  for (const { x, y } of inside) {
    if (rows > 0 && y === surface) pixels.push({ x, y, colour: FOREGROUND })
    else if (rows > 0 && y > surface) pixels.push({ x, y, colour: FOREGROUND_WORN })
  }
  // A short glint up and to the left on the body, where the glass is empty.
  for (let angle = 200; angle <= 245; angle += 9) {
    const radians = (angle * Math.PI) / 180
    const x = Math.round(MIDDLE + (BODY_RADIUS - 5) * Math.cos(radians))
    const y = Math.round(BODY_CENTRE_Y + (BODY_RADIUS - 5) * Math.sin(radians))
    if (rows === 0 || y < surface) pixels.push({ x, y, colour: FOREGROUND_WORN })
  }
  // The current and total health, centred under the flask.
  const readout = `${current}/${total}`
  const readoutLeft = Math.floor((POTION_WIDTH - textWidth(readout, READOUT_SCALE)) / 2)
  for (const { x, y } of textPixels(readout, READOUT_SCALE)) {
    pixels.push({ x: readoutLeft + x, y: FLASK_HEIGHT + READOUT_GAP + y, colour: FOREGROUND })
  }
  return pixels
}
