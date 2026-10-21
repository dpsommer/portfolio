import { ORIGIN } from './core/camera.ts'
import type { FloorPoint } from './core/camera.ts'
import { BACKGROUND } from './core/palette.ts'
import type { Pixel } from './core/types.ts'
import { mirrorPixels, plaquePixels, previewPixels, pullPixels, ripplePixels } from './mirror/pixels.ts'
import type { RippleState } from './mirror/pixels.ts'
import type { Plaque } from './mirror/plaque.ts'
import type { Preview, Shimmer } from './mirror/preview.ts'
import { roomPixels } from './room/room.ts'
import { signPixels } from './sign/pixels.ts'
import { windowPixels } from './window/pixels.ts'

export function drawPixels(ctx: CanvasRenderingContext2D, pixels: Pixel[]) {
  for (const { x, y, colour } of pixels) {
    ctx.fillStyle = colour
    ctx.fillRect(x, y, 1, 1)
  }
}

// What's changing on the mirror wall, beyond the camera: the preview on the
// glass (null or absent for empty glass), a ripple or shimmer playing on it,
// how far the curtain pull is tugged down, and the logo plaque below it
// (not drawn when absent).
export type MirrorExtras = {
  preview?: Preview | null
  ripple?: RippleState
  shimmer?: Shimmer
  pullDrop?: number
  plaque?: Plaque
}

// Draws the scene from `eye` with the camera turned `yaw` radians left of north.
export function drawScene(
  ctx: CanvasRenderingContext2D,
  yaw = 0,
  eye: FloorPoint = ORIGIN,
  { preview, ripple, shimmer, pullDrop = 0, plaque }: MirrorExtras = {},
) {
  const { width, height } = ctx.canvas
  ctx.fillStyle = BACKGROUND
  ctx.fillRect(0, 0, width, height)
  drawPixels(ctx, roomPixels(width, height, yaw, eye))
  drawPixels(ctx, signPixels(width, height, yaw, eye))
  drawPixels(ctx, windowPixels(width, height, yaw, eye))
  // Under the mirror, so its frame covers the picture's and rings' edges.
  if (preview || shimmer) drawPixels(ctx, previewPixels(width, height, preview ?? null, yaw, eye, ripple, shimmer))
  if (ripple) drawPixels(ctx, ripplePixels(width, height, ripple, yaw, eye))
  drawPixels(ctx, mirrorPixels(width, height, yaw, eye))
  drawPixels(ctx, pullPixels(width, height, pullDrop, yaw, eye))
  if (plaque) drawPixels(ctx, plaquePixels(width, height, plaque, yaw, eye))
}
