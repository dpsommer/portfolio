import { BACKGROUND, FOREGROUND } from '../core/palette.ts'
import { GLYPH_HEIGHT, textPixels, textWidth } from '../core/pixelFont.ts'
import type { Pixel } from '../core/types.ts'

// A speech bubble for the profile view: a solid bright box with well-rounded
// corners and dark text, and a tail on its left pointing back at the avatar.
// The box is sized for the whole message, so it doesn't grow as the text
// types out.

// What the bubble says, and how many of its characters have typed out so far.
export type Bubble = { text: string; shown: number }

// The text is drawn at this multiple of the font's size, this far in from the
// box's edges.
export const BUBBLE_TEXT_SCALE = 2
export const BUBBLE_PADDING_X = 7
export const BUBBLE_PADDING_Y = 6
export const BUBBLE_HEIGHT = GLYPH_HEIGHT * BUBBLE_TEXT_SCALE + 2 * BUBBLE_PADDING_Y
// How many pixels each of the top rows is cut in from each side to round the
// corners, top first. The bottom rows mirror them.
const CORNER_INSETS = [5, 3, 2, 1, 1]
// How far the tail reaches left of the box. It narrows by a pixel each side
// per column, from 2 * BUBBLE_TAIL rows tall at the box to two rows, centred
// on the box's middle.
export const BUBBLE_TAIL = 4
const MIDDLE = (BUBBLE_HEIGHT - 1) / 2

// The box's width for `text`.
export const bubbleWidth = (text: string) => textWidth(text, BUBBLE_TEXT_SCALE) + 2 * BUBBLE_PADDING_X

// Pixels for `bubble`, with the box's top left at (0, 0) and the tail at
// negative x. The text's pixels are dark and the box is left out under them.
export function bubblePixels({ text, shown }: Bubble): Pixel[] {
  const width = bubbleWidth(text)
  const pixels: Pixel[] = textPixels(text.slice(0, shown), BUBBLE_TEXT_SCALE).map(({ x, y }) => ({
    x: BUBBLE_PADDING_X + x,
    y: BUBBLE_PADDING_Y + y,
    colour: BACKGROUND,
  }))
  const inText = new Set(pixels.map(({ x, y }) => `${x},${y}`))
  for (let y = 0; y < BUBBLE_HEIGHT; y++) {
    const inset = CORNER_INSETS[Math.min(y, BUBBLE_HEIGHT - 1 - y)] ?? 0
    for (let x = inset; x < width - inset; x++) if (!inText.has(`${x},${y}`)) pixels.push({ x, y, colour: FOREGROUND })
  }
  for (let column = 1; column <= BUBBLE_TAIL; column++) {
    const reach = BUBBLE_TAIL - column + 0.5
    for (let y = MIDDLE - reach; y <= MIDDLE + reach; y++) pixels.push({ x: -column, y, colour: FOREGROUND })
  }
  return pixels
}
