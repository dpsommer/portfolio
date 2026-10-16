import { BACKGROUND } from './palette.ts'
import { roomPixels } from './room.ts'
import { signpostBackingPixels, signpostPixels } from './signpost.ts'
import type { Pixel } from './types.ts'

export function drawPixels(ctx: CanvasRenderingContext2D, pixels: Pixel[]) {
  for (const { x, y, colour } of pixels) {
    ctx.fillStyle = colour
    ctx.fillRect(x, y, 1, 1)
  }
}

export function drawScene(ctx: CanvasRenderingContext2D) {
  const { width, height } = ctx.canvas
  ctx.fillStyle = BACKGROUND
  ctx.fillRect(0, 0, width, height)
  drawPixels(ctx, roomPixels(width, height))
  drawPixels(ctx, signpostBackingPixels(width, height))
  drawPixels(ctx, signpostPixels(width, height))
}
