import { drawPixels } from '../draw.ts'
import { FOREGROUND, FOREGROUND_DIM } from '../core/palette.ts'
import { GLYPH_HEIGHT, textPixels } from '../core/pixelFont.ts'
import type { Pixel } from '../core/types.ts'
import { clearPanel } from '../panels/panelCanvas.ts'
import { picturePixels } from './picture.ts'
import type { Picture } from './picture.ts'

// The profile view the room canvas shows while the character card is open:
// the avatar in the upper left, in a dim outline, with the full name beside
// it, a word a line. The About Me text goes in the lower panel's text box.

export const AVATAR_PROFILE_SIZE = 96
// The avatar's distance from the canvas's top left, and the name's from the avatar.
const PROFILE_MARGIN = 16
const NAME_GAP = 16
const NAME_SCALE = 2
const NAME_LINE_GAP = 6
const AVATAR_OUTLINE_GAP = 2

// Pixels for the profile view showing `fullName`, with `avatar`
// (AVATAR_PROFILE_SIZE square) once it's loaded.
export function profilePixels(fullName: string, avatar: Picture | null): Pixel[] {
  const pixels: Pixel[] = []
  const outlineLeft = PROFILE_MARGIN - AVATAR_OUTLINE_GAP
  const outlineRight = PROFILE_MARGIN + AVATAR_PROFILE_SIZE - 1 + AVATAR_OUTLINE_GAP
  // Corner pixels are left out, as on the card.
  for (let i = outlineLeft + 1; i < outlineRight; i++) {
    pixels.push(
      { x: i, y: outlineLeft, colour: FOREGROUND_DIM },
      { x: i, y: outlineRight, colour: FOREGROUND_DIM },
      { x: outlineLeft, y: i, colour: FOREGROUND_DIM },
      { x: outlineRight, y: i, colour: FOREGROUND_DIM },
    )
  }
  if (avatar) pixels.push(...picturePixels(avatar, PROFILE_MARGIN, PROFILE_MARGIN))
  const nameLeft = PROFILE_MARGIN + AVATAR_PROFILE_SIZE + NAME_GAP
  fullName.split(' ').forEach((word, line) => {
    const top = PROFILE_MARGIN + line * (GLYPH_HEIGHT * NAME_SCALE + NAME_LINE_GAP)
    for (const { x, y } of textPixels(word, NAME_SCALE)) pixels.push({ x: nameLeft + x, y: top + y, colour: FOREGROUND })
  })
  return pixels
}

// Clears the room canvas and draws the profile view on it.
export function drawProfile(ctx: CanvasRenderingContext2D, fullName: string, avatar: Picture | null) {
  clearPanel(ctx)
  drawPixels(ctx, profilePixels(fullName, avatar))
}
