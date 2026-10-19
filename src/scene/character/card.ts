import { drawPixels } from '../draw.ts'
import { FOREGROUND, FOREGROUND_DIM, FOREGROUND_WORN } from '../core/palette.ts'
import { GLYPH_HEIGHT, textPixels, textWidth } from '../core/pixelFont.ts'
import type { Bounds, Pixel } from '../core/types.ts'
import { clearPanel } from '../panels/panelCanvas.ts'
import { selectionPixels } from '../selection/selection.ts'
import { KEYBOARD_MAP, MOUSE_MAP, iconHeight, iconPixels, iconWidth } from './icons.ts'
import { picturePixels } from './picture.ts'
import type { Picture } from './picture.ts'

// The character card at the top of the side panel: a name over the avatar,
// with keyboard and mouse icons stacked to its right, in a worn border.

// The side panel's width, which the card is centred in.
const PANEL_WIDTH = 132
// The card's border sits CARD_MARGIN in from the panel's edges, leaving room
// for the selection carets, and its contents CARD_PADDING inside the border.
const CARD_MARGIN = 9
const CARD_PADDING = 6
const NAME_SCALE = 2
// Space between the name and the avatar, with a dim rule half-way.
const NAME_GAP = 10
export const AVATAR_CARD_SIZE = 72
// Space between the avatar and its dim outline, and between the keyboard and mouse.
const AVATAR_OUTLINE_GAP = 2
const ICON_GAP = 8

const INNER_LEFT = CARD_MARGIN + CARD_PADDING
const INNER_RIGHT = PANEL_WIDTH - 1 - CARD_MARGIN - CARD_PADDING
const NAME_TOP = CARD_MARGIN + CARD_PADDING
const AVATAR_TOP = NAME_TOP + GLYPH_HEIGHT * NAME_SCALE + NAME_GAP
const AVATAR_LEFT = INNER_LEFT
const AVATAR_BOTTOM = AVATAR_TOP + AVATAR_CARD_SIZE - 1

// The card's border, inclusive. Selection carets go around it.
export const CARD_BOUNDS: Bounds = {
  left: CARD_MARGIN,
  top: CARD_MARGIN,
  right: PANEL_WIDTH - 1 - CARD_MARGIN,
  bottom: AVATAR_BOTTOM + CARD_PADDING,
}

// A one-pixel rectangle outline in `colour`, with its corner pixels left out
// for a softer pixel-art corner.
function outline(bounds: Bounds, colour: string): Pixel[] {
  const { left, top, right, bottom } = bounds
  const pixels: Pixel[] = []
  for (let x = left + 1; x < right; x++) pixels.push({ x, y: top, colour }, { x, y: bottom, colour })
  for (let y = top + 1; y < bottom; y++) pixels.push({ x: left, y, colour }, { x: right, y, colour })
  return pixels
}

// Pixels for the card showing `name`, with `avatar` (AVATAR_CARD_SIZE square)
// once it's loaded.
export function cardPixels(name: string, avatar: Picture | null): Pixel[] {
  const pixels = outline(CARD_BOUNDS, FOREGROUND_WORN)
  const nameLeft = CARD_BOUNDS.left + Math.floor((CARD_BOUNDS.right - CARD_BOUNDS.left + 1 - textWidth(name, NAME_SCALE)) / 2)
  for (const { x, y } of textPixels(name, NAME_SCALE)) pixels.push({ x: nameLeft + x, y: NAME_TOP + y, colour: FOREGROUND })
  const ruleY = AVATAR_TOP - NAME_GAP / 2
  for (let x = INNER_LEFT; x <= INNER_RIGHT; x++) pixels.push({ x, y: ruleY, colour: FOREGROUND_DIM })
  pixels.push(
    ...outline(
      {
        left: AVATAR_LEFT - AVATAR_OUTLINE_GAP,
        top: AVATAR_TOP - AVATAR_OUTLINE_GAP,
        right: AVATAR_LEFT + AVATAR_CARD_SIZE - 1 + AVATAR_OUTLINE_GAP,
        bottom: AVATAR_BOTTOM + AVATAR_OUTLINE_GAP,
      },
      FOREGROUND_DIM,
    ),
  )
  if (avatar) pixels.push(...picturePixels(avatar, AVATAR_LEFT, AVATAR_TOP))
  // The icons share the column right of the avatar's outline, centred in it
  // and stacked keyboard over mouse, centred on the avatar's height.
  const columnLeft = AVATAR_LEFT + AVATAR_CARD_SIZE + AVATAR_OUTLINE_GAP + 1
  const columnWidth = INNER_RIGHT + CARD_PADDING - columnLeft + 1
  const stackHeight = iconHeight(KEYBOARD_MAP) + ICON_GAP + iconHeight(MOUSE_MAP)
  const keyboardTop = AVATAR_TOP + Math.floor((AVATAR_CARD_SIZE - stackHeight) / 2)
  const iconLeft = (map: string[]) => columnLeft + Math.floor((columnWidth - iconWidth(map)) / 2)
  pixels.push(...iconPixels(KEYBOARD_MAP, iconLeft(KEYBOARD_MAP), keyboardTop))
  pixels.push(...iconPixels(MOUSE_MAP, iconLeft(MOUSE_MAP), keyboardTop + iconHeight(KEYBOARD_MAP) + ICON_GAP))
  return pixels
}

// Draws the side panel: the card, and the selection carets around it, `inset`
// pixels in, while it's selected (`inset` null otherwise).
export function drawSidePanel(ctx: CanvasRenderingContext2D, name: string, avatar: Picture | null, inset: number | null) {
  clearPanel(ctx)
  drawPixels(ctx, cardPixels(name, avatar))
  if (inset !== null) {
    const { width, height } = ctx.canvas
    drawPixels(ctx, selectionPixels(CARD_BOUNDS, inset, width, height))
  }
}
