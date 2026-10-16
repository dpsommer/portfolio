import { projectPoint, toCamera, NEAR } from './camera.ts'
import { BACKGROUND } from './palette.ts'
import { roomPixels } from './room.ts'
import { SIGN_POSITION, signpostBackingPixels, signpostPixels } from './signpost.ts'
import type { Pixel } from './types.ts'

export function drawPixels(ctx: CanvasRenderingContext2D, pixels: Pixel[]) {
  for (const { x, y, colour } of pixels) {
    ctx.fillStyle = colour
    ctx.fillRect(x, y, 1, 1)
  }
}

// How far the signpost sprite shifts sideways at `yaw`, or null when it's behind
// the camera. The sprite is drawn for the north view, so the shift is 0 there.
export function signOffset(yaw: number, width: number, height: number): number | null {
  const anchor = toCamera(SIGN_POSITION, yaw)
  if (anchor.z < NEAR) return null
  return Math.round(projectPoint(anchor, width, height).x - width / 2)
}

// Draws the scene with the camera turned `yaw` radians left of north.
export function drawScene(ctx: CanvasRenderingContext2D, yaw = 0) {
  const { width, height } = ctx.canvas
  ctx.fillStyle = BACKGROUND
  ctx.fillRect(0, 0, width, height)
  drawPixels(ctx, roomPixels(width, height, yaw))
  const offset = signOffset(yaw, width, height)
  if (offset === null) return
  const shift = (pixels: Pixel[]) =>
    pixels.map((p) => ({ ...p, x: p.x + offset })).filter((p) => p.x >= 0 && p.x < width)
  drawPixels(ctx, shift(signpostBackingPixels(width, height)))
  drawPixels(ctx, shift(signpostPixels(width, height)))
}
