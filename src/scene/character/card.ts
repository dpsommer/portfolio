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
// with keyboard and mouse icons and a health readout stacked to its right,
// split by dim rules, in a worn border.

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
// Space between the avatar and its dim outline.
const AVATAR_OUTLINE_GAP = 2
// Space either side of the dim rules between the keyboard, mouse and health,
// and between the rules' ends and the column's edges.
const RULE_GAP = 3
const RULE_INSET = 2
// Space between the second rule and the health readout, wider than the other
// rules' gaps so the readout stands apart.
const HEALTH_GAP = 2 * RULE_GAP
// The health's numbers are drawn bold at HEALTH_SCALE, the current in the
// top left and the total in the bottom right, with a worn slash between them,
// HEALTH_SLASH_GAP rows below the current and above the total.
const HEALTH_SCALE = 1
const HEALTH_SLASH_GAP = 1
// Space between the numbers and the column's edges, so they don't touch the
// avatar's outline or the border.
const HEALTH_INSET = 3
const SLASH_ROWS = 5
const HEALTH_HEIGHT = 2 * GLYPH_HEIGHT * HEALTH_SCALE + 2 * HEALTH_SLASH_GAP + SLASH_ROWS

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

// Points current and total, as on the card's health readout.
export type Health = { current: number; total: number }

// Pixels for `text` in bold at `scale`: each pixel is widened by one to the
// right, so it's one pixel wider than at that scale. Each pixel is listed once.
function boldTextPixels(text: string, scale: number): { x: number; y: number }[] {
  const keys = new Set(textPixels(text, scale).flatMap(({ x, y }) => [`${x},${y}`, `${x + 1},${y}`]))
  return [...keys].map((key) => {
    const [x, y] = key.split(',').map(Number)
    return { x, y }
  })
}
const boldTextWidth = (text: string, scale: number) => textWidth(text, scale) + 1

// Pixels for the health readout in a column `width` pixels wide, from its
// top-left corner: the current bold in the top left, the total bold in the
// bottom right, and a worn slash centred between them, as a diagonal
// fraction.
export function healthPixels({ current, total }: Health, width: number): Pixel[] {
  const pixels: Pixel[] = []
  const currentText = String(current)
  const totalText = String(total)
  const numberHeight = GLYPH_HEIGHT * HEALTH_SCALE
  const totalLeft = width - boldTextWidth(totalText, HEALTH_SCALE)
  const totalTop = numberHeight + 2 * HEALTH_SLASH_GAP + SLASH_ROWS
  for (const { x, y } of boldTextPixels(currentText, HEALTH_SCALE)) pixels.push({ x, y, colour: FOREGROUND })
  for (const { x, y } of boldTextPixels(totalText, HEALTH_SCALE)) {
    pixels.push({ x: totalLeft + x, y: totalTop + y, colour: FOREGROUND })
  }
  // The slash is centred between the current's left edge (0) and the total's
  // right edge (`width`). Its glyph has an empty row above and below its stroke.
  const middle = width / 2
  const slashLeft = Math.round(middle - boldTextWidth('/', 1) / 2)
  const slashTop = numberHeight + HEALTH_SLASH_GAP - 1
  for (const { x, y } of boldTextPixels('/', 1)) {
    pixels.push({ x: slashLeft + x, y: slashTop + y, colour: FOREGROUND_WORN })
  }
  return pixels
}

// Pixels for the card showing `name` and `health`, with `avatar`
// (AVATAR_CARD_SIZE square) once it's loaded.
export function cardPixels(name: string, health: Health, avatar: Picture | null): Pixel[] {
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
  // The keyboard, mouse and health share the column between the avatar's
  // outline and the border, each centred in it, stacked in that order with a
  // dim rule between each, and centred on the avatar's height as a whole.
  const columnLeft = AVATAR_LEFT + AVATAR_CARD_SIZE + AVATAR_OUTLINE_GAP
  const columnRight = CARD_BOUNDS.right - 1
  const columnWidth = columnRight - columnLeft + 1
  const centred = (width: number) => columnLeft + Math.floor((columnWidth - width) / 2)
  const sectionGap = 2 * RULE_GAP + 1
  const stackHeight =
    iconHeight(KEYBOARD_MAP) + sectionGap + iconHeight(MOUSE_MAP) + sectionGap + (HEALTH_GAP - RULE_GAP) + HEALTH_HEIGHT
  let top = AVATAR_TOP + Math.floor((AVATAR_CARD_SIZE - stackHeight) / 2)
  const rule = () => {
    const y = top + RULE_GAP
    for (let x = columnLeft + RULE_INSET; x <= columnRight - RULE_INSET; x++) pixels.push({ x, y, colour: FOREGROUND_DIM })
    top += sectionGap
  }
  pixels.push(...iconPixels(KEYBOARD_MAP, centred(iconWidth(KEYBOARD_MAP)), top))
  top += iconHeight(KEYBOARD_MAP)
  rule()
  pixels.push(...iconPixels(MOUSE_MAP, centred(iconWidth(MOUSE_MAP)), top))
  top += iconHeight(MOUSE_MAP)
  rule()
  // The rule has left RULE_GAP below itself already.
  top += HEALTH_GAP - RULE_GAP
  for (const pixel of healthPixels(health, columnWidth - 2 * HEALTH_INSET)) {
    pixels.push({ ...pixel, x: columnLeft + HEALTH_INSET + pixel.x, y: top + pixel.y })
  }
  return pixels
}

// Draws the side panel: the card, and the selection carets around it, `inset`
// pixels in, while it's selected (`inset` null otherwise).
export function drawSidePanel(
  ctx: CanvasRenderingContext2D,
  name: string,
  health: Health,
  avatar: Picture | null,
  inset: number | null,
) {
  clearPanel(ctx)
  drawPixels(ctx, cardPixels(name, health, avatar))
  if (inset !== null) {
    const { width, height } = ctx.canvas
    drawPixels(ctx, selectionPixels(CARD_BOUNDS, inset, width, height))
  }
}
