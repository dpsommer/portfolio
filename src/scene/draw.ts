import { ORIGIN, NEAR, projectPoint, toCamera } from './camera.ts'
import type { FloorPoint, ScreenPoint } from './camera.ts'
import { BACKGROUND } from './palette.ts'
import { isVisible, mirrorPixels, roomPixels } from './room.ts'
import { SIGN_POSITION, signpostBackingPixels, signpostPixels } from './signpost.ts'
import type { Pixel } from './types.ts'

export function drawPixels(ctx: CanvasRenderingContext2D, pixels: Pixel[]) {
  for (const { x, y, colour } of pixels) {
    ctx.fillStyle = colour
    ctx.fillRect(x, y, 1, 1)
  }
}

// Where and how big to draw the signpost sprite. The sprite is drawn for the
// start position facing north; elsewhere it's a billboard, moved to where its
// anchor projects and scaled by the anchor's depth. Null when it's behind the
// camera or hidden by a wall.
export type SpritePlacement = { anchor: ScreenPoint; scale: number }

export function signPlacement(yaw: number, width: number, height: number, eye: FloorPoint = ORIGIN): SpritePlacement | null {
  if (!isVisible(SIGN_POSITION, eye)) return null
  const anchor = toCamera(SIGN_POSITION, yaw, eye)
  if (anchor.z < NEAR) return null
  return { anchor: projectPoint(anchor, width, height), scale: toCamera(SIGN_POSITION, 0).z / anchor.z }
}

// Moves and scales sprite pixels from their designed placement (anchor at
// `home`), keeping only those that land on the canvas.
export function placeSprite(
  pixels: Pixel[],
  home: ScreenPoint,
  { anchor, scale }: SpritePlacement,
  width: number,
  height: number,
): Pixel[] {
  // Enlarged sprites draw each pixel as a block so they don't break up.
  const size = Math.max(1, Math.ceil(scale))
  return pixels.flatMap((p) => {
    const x = Math.round(anchor.x + (p.x - home.x) * scale)
    const y = Math.round(anchor.y + (p.y - home.y) * scale)
    if (x + size <= 0 || x >= width || y + size <= 0 || y >= height) return []
    const block: Pixel[] = []
    for (let dy = 0; dy < size; dy++) {
      for (let dx = 0; dx < size; dx++) {
        const px = x + dx
        const py = y + dy
        if (px >= 0 && px < width && py >= 0 && py < height) block.push({ ...p, x: px, y: py })
      }
    }
    return block
  })
}

// Draws the scene from `eye` with the camera turned `yaw` radians left of north.
export function drawScene(ctx: CanvasRenderingContext2D, yaw = 0, eye: FloorPoint = ORIGIN) {
  const { width, height } = ctx.canvas
  ctx.fillStyle = BACKGROUND
  ctx.fillRect(0, 0, width, height)
  drawPixels(ctx, roomPixels(width, height, yaw, eye))
  drawPixels(ctx, mirrorPixels(width, height, yaw, eye))
  const placement = signPlacement(yaw, width, height, eye)
  if (!placement) return
  const home = projectPoint(toCamera(SIGN_POSITION, 0), width, height)
  for (const sprite of [signpostBackingPixels(width, height), signpostPixels(width, height)]) {
    drawPixels(ctx, placeSprite(sprite, home, placement, width, height))
  }
}
