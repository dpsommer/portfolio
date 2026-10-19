import { FOREGROUND_DIM, FOREGROUND_WORN } from '../core/palette.ts'
import { GLYPH_HEIGHT, textPixels, textWidth } from '../core/pixelFont.ts'
import type { Pixel } from '../core/types.ts'
import { iconHeight, iconPixels, iconWidth } from './icons.ts'
import type { IconMap } from './icons.ts'

// The profile view's equipment table: a worn "Equipment" heading over a 2×2
// grid of slots, each a dim box with its item's icon over its name.

// A slot's name, and the name and icon of what's in it. Only the icon is
// drawn; the item's name is for screen readers.
export type EquipmentSlot = { slot: string; item: string; icon: IconMap }

const COLUMNS = 2
const HEADING = 'Equipment'
// Space under the heading, between the slots, and between a slot's icon and name.
const HEADING_GAP = 6
const SLOT_GAP = 3
const LABEL_GAP = 4

// A one-pixel box outline in `colour` with its corner pixels left out, like
// the card's border.
function box(left: number, top: number, width: number, height: number, colour: string): Pixel[] {
  const right = left + width - 1
  const bottom = top + height - 1
  const pixels: Pixel[] = []
  for (let x = left + 1; x < right; x++) pixels.push({ x, y: top, colour }, { x, y: bottom, colour })
  for (let y = top + 1; y < bottom; y++) pixels.push({ x: left, y, colour }, { x: right, y, colour })
  return pixels
}

// Pixels for the table filling `width` × `height` from the origin, with
// `slots` laid out left to right and top to bottom.
export function equipmentPixels(slots: EquipmentSlot[], width: number, height: number): Pixel[] {
  const pixels: Pixel[] = []
  const headingLeft = Math.floor((width - textWidth(HEADING)) / 2)
  for (const { x, y } of textPixels(HEADING)) pixels.push({ x: headingLeft + x, y, colour: FOREGROUND_WORN })
  const rows = Math.ceil(slots.length / COLUMNS)
  const gridTop = GLYPH_HEIGHT + HEADING_GAP
  const slotWidth = Math.floor((width - (COLUMNS - 1) * SLOT_GAP) / COLUMNS)
  const slotHeight = Math.floor((height - gridTop - (rows - 1) * SLOT_GAP) / rows)
  // Every slot gives its icon the tallest icon's height, so the names line up.
  const iconArea = Math.max(...slots.map(({ icon }) => iconHeight(icon)))
  const blockHeight = iconArea + LABEL_GAP + GLYPH_HEIGHT
  slots.forEach(({ slot, icon }, index) => {
    const left = (index % COLUMNS) * (slotWidth + SLOT_GAP)
    const top = gridTop + Math.floor(index / COLUMNS) * (slotHeight + SLOT_GAP)
    pixels.push(...box(left, top, slotWidth, slotHeight, FOREGROUND_DIM))
    // The icon area and name are centred in the box as a block, and the icon
    // in its area.
    const blockTop = top + Math.floor((slotHeight - blockHeight) / 2)
    const iconTop = blockTop + Math.floor((iconArea - iconHeight(icon)) / 2)
    pixels.push(...iconPixels(icon, left + Math.floor((slotWidth - iconWidth(icon)) / 2), iconTop))
    const labelLeft = left + Math.floor((slotWidth - textWidth(slot)) / 2)
    const labelTop = blockTop + iconArea + LABEL_GAP
    for (const { x, y } of textPixels(slot)) pixels.push({ x: labelLeft + x, y: labelTop + y, colour: FOREGROUND_WORN })
  })
  return pixels
}
