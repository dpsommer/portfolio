import { BACKGROUND } from '../core/palette.ts'

// Logic shared by the display panels beside the room: the navigation panel
// below it and the side panel to its right.

// Clears a panel's canvas to the background.
export function clearPanel(ctx: CanvasRenderingContext2D) {
  const { width, height } = ctx.canvas
  ctx.fillStyle = BACKGROUND
  ctx.fillRect(0, 0, width, height)
}
