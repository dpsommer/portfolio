import { FAR_Z, ORIGIN } from '../core/camera.ts'
import type { FloorPoint } from '../core/camera.ts'
import { FOREGROUND } from '../core/palette.ts'
import type { Pixel } from '../core/types.ts'
import type { MirrorLine, MirrorPoint } from '../mirror/frame.ts'
import { SIGN_WALL, WALLS, cellPixels, onWall, rasterise, signToWall } from '../room/room.ts'
import type { Segment } from '../room/room.ts'
import { SIGN_LAYERS, SIGN_TEXT_CELLS } from './board.ts'

// The welcome sign projected onto its wall.

const toWorld = (p: MirrorPoint) => {
  const { u, v } = signToWall(p)
  return onWall(WALLS[SIGN_WALL], u, v)
}

const LAYERS = SIGN_LAYERS.map(({ colour, lines }) => ({
  colour,
  segments: lines.map(([a, b]: MirrorLine): Segment => [toWorld(a), toWorld(b)]),
}))
const TEXT_POINTS = SIGN_TEXT_CELLS.map(toWorld)

// Pixels for the sign, seen the same way as `roomPixels`. Its text's cells are
// one pixel each from the start.
export function signPixels(canvasWidth: number, canvasHeight: number, yaw = 0, eye: FloorPoint = ORIGIN): Pixel[] {
  const view = { yaw, eye, width: canvasWidth, height: canvasHeight }
  const inCanvas = (p: Pixel) => p.x >= 0 && p.x < canvasWidth && p.y >= 0 && p.y < canvasHeight
  const pixels = LAYERS.flatMap(({ colour, segments }) => rasterise(segments, colour, view)).filter(inCanvas)
  for (const point of TEXT_POINTS) cellPixels(pixels, point, FOREGROUND, view, FAR_Z)
  return pixels
}
