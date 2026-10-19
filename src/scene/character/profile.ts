import { drawPixels } from '../draw.ts'
import { FOREGROUND, FOREGROUND_DIM, FOREGROUND_WORN } from '../core/palette.ts'
import { GLYPH_HEIGHT, textPixels } from '../core/pixelFont.ts'
import type { Pixel } from '../core/types.ts'
import { clearPanel } from '../panels/panelCanvas.ts'
import type { Health } from './card.ts'
import { equipmentPixels } from './equipment.ts'
import type { EquipmentSlot } from './equipment.ts'
import { POTION_HEIGHT, POTION_WIDTH, potionPixels } from './potion.ts'
import { picturePixels } from './picture.ts'
import type { Picture } from './picture.ts'

// The profile view the room canvas shows while the character card is open.
// The avatar is in the upper left, in a dim outline, with the full name beside
// it, a word a line, and the character's title in worn text under that. A dim
// rule under the avatar runs across the view, and a dim rule down the middle
// splits the area below it: a health potion on the left and the equipment
// table on the right. The About Me text goes in the lower panel's text box.

// What the profile view shows besides the avatar.
export type Profile = { fullName: string; title: string; health: Health; equipment: EquipmentSlot[] }

// The room canvas's size.
const VIEW_WIDTH = 320
const VIEW_HEIGHT = 240
export const AVATAR_PROFILE_SIZE = 96
// The avatar's distance from the canvas's top left, and the name's from the avatar.
const PROFILE_MARGIN = 16
const NAME_GAP = 16
const NAME_SCALE = 2
const NAME_LINE_GAP = 6
const AVATAR_OUTLINE_GAP = 2
// The rules run between the avatar outline's left edge and its mirror on the
// right. The horizontal rule sits RULE_GAP below the outline, and the area
// under it ends LOWER_MARGIN above the canvas's bottom.
const OUTLINE_LEFT = PROFILE_MARGIN - AVATAR_OUTLINE_GAP
const OUTLINE_BOTTOM = PROFILE_MARGIN + AVATAR_PROFILE_SIZE - 1 + AVATAR_OUTLINE_GAP
const RULES_RIGHT = VIEW_WIDTH - 1 - OUTLINE_LEFT
const RULE_GAP = 6
const LOWER_MARGIN = 8
const RULE_Y = OUTLINE_BOTTOM + RULE_GAP
const LOWER_BOTTOM = VIEW_HEIGHT - 1 - LOWER_MARGIN
const DIVIDER_X = Math.floor((OUTLINE_LEFT + RULES_RIGHT) / 2)
// The equipment table's space from the rules and the area's edges.
const SECTION_PADDING = 6

// Corner-less one-pixel rectangle outline, as on the card.
function outline(left: number, top: number, right: number, bottom: number, colour: string): Pixel[] {
  const pixels: Pixel[] = []
  for (let x = left + 1; x < right; x++) pixels.push({ x, y: top, colour }, { x, y: bottom, colour })
  for (let y = top + 1; y < bottom; y++) pixels.push({ x: left, y, colour }, { x: right, y, colour })
  return pixels
}

// Moves `pixels` by (left, top).
const offset = (pixels: Pixel[], left: number, top: number) =>
  pixels.map((pixel) => ({ ...pixel, x: pixel.x + left, y: pixel.y + top }))

// Pixels for the profile view showing `profile`, with `avatar`
// (AVATAR_PROFILE_SIZE square) once it's loaded.
export function profilePixels({ fullName, title, health, equipment }: Profile, avatar: Picture | null): Pixel[] {
  const pixels = outline(OUTLINE_LEFT, OUTLINE_LEFT, OUTLINE_LEFT + AVATAR_PROFILE_SIZE + 2 * AVATAR_OUTLINE_GAP - 1, OUTLINE_BOTTOM, FOREGROUND_DIM)
  if (avatar) pixels.push(...picturePixels(avatar, PROFILE_MARGIN, PROFILE_MARGIN))
  const nameLeft = PROFILE_MARGIN + AVATAR_PROFILE_SIZE + NAME_GAP
  const words = fullName.split(' ')
  const lineAdvance = GLYPH_HEIGHT * NAME_SCALE + NAME_LINE_GAP
  words.forEach((word, line) => {
    const top = PROFILE_MARGIN + line * lineAdvance
    for (const { x, y } of textPixels(word, NAME_SCALE)) pixels.push({ x: nameLeft + x, y: top + y, colour: FOREGROUND })
  })
  const titleTop = PROFILE_MARGIN + words.length * lineAdvance
  for (const { x, y } of textPixels(title)) pixels.push({ x: nameLeft + x, y: titleTop + y, colour: FOREGROUND_WORN })
  // The rules: across under the avatar, then down the middle of the area below.
  for (let x = OUTLINE_LEFT; x <= RULES_RIGHT; x++) pixels.push({ x, y: RULE_Y, colour: FOREGROUND_DIM })
  for (let y = RULE_Y + 1; y <= LOWER_BOTTOM; y++) pixels.push({ x: DIVIDER_X, y, colour: FOREGROUND_DIM })
  // The potion, centred in the left section.
  const potionLeft = Math.floor((OUTLINE_LEFT + DIVIDER_X - POTION_WIDTH) / 2)
  const potionTop = RULE_Y + 1 + Math.floor((LOWER_BOTTOM - RULE_Y - POTION_HEIGHT) / 2)
  pixels.push(...offset(potionPixels(health), potionLeft, potionTop))
  // The equipment table, filling the right section inside its padding.
  const tableLeft = DIVIDER_X + 1 + SECTION_PADDING
  const tableTop = RULE_Y + 1 + SECTION_PADDING
  const tableWidth = RULES_RIGHT - SECTION_PADDING - tableLeft + 1
  const tableHeight = LOWER_BOTTOM - tableTop + 1
  pixels.push(...offset(equipmentPixels(equipment, tableWidth, tableHeight), tableLeft, tableTop))
  return pixels
}

// Clears the room canvas and draws the profile view on it.
export function drawProfile(ctx: CanvasRenderingContext2D, profile: Profile, avatar: Picture | null) {
  clearPanel(ctx)
  drawPixels(ctx, profilePixels(profile, avatar))
}
