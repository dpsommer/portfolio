import { ORIGIN } from '../core/camera.ts'
import type { FloorPoint } from '../core/camera.ts'
import type { Pixel } from '../core/types.ts'
import { WALLS, WINDOW_WALL, onWall, rasterise, vec, windowToWall } from '../room/room.ts'
import type { Segment } from '../room/room.ts'
import { WINDOW_LAYERS } from './tracery.ts'
import type { WindowLine, WindowPoint } from './tracery.ts'

// The tracery window set in its wall, with its open casement standing out
// into the hall.

// Where a window point is in the world.
export const windowToWorld = ({ s, t, d = 0 }: WindowPoint) => {
  const wall = WALLS[WINDOW_WALL]
  const { u, v } = windowToWall({ s, t })
  const onFace = onWall(wall, u, v)
  // Out of the wall, square to it into the room.
  return vec(onFace.x + wall.along.z * d, onFace.y, onFace.z - wall.along.x * d)
}

const LAYERS = WINDOW_LAYERS.map(({ colour, lines }) => ({
  colour,
  segments: lines.map(([a, b]: WindowLine): Segment => [windowToWorld(a), windowToWorld(b)]),
}))

// Pixels for the window, seen the same way as `roomPixels`.
export function windowPixels(canvasWidth: number, canvasHeight: number, yaw = 0, eye: FloorPoint = ORIGIN): Pixel[] {
  const view = { yaw, eye, width: canvasWidth, height: canvasHeight }
  const inCanvas = (p: Pixel) => p.x >= 0 && p.x < canvasWidth && p.y >= 0 && p.y < canvasHeight
  return LAYERS.flatMap(({ colour, segments }) => rasterise(segments, colour, view)).filter(inCanvas)
}
