import { CEILING_Y, FLOOR_Y, FOCAL_RATIO, NEAR, ORIGIN, projectPoint, toCamera } from '../core/camera.ts'
import type { FloorPoint, Vec3 } from '../core/camera.ts'
import { FOREGROUND_DIM, FOREGROUND_WORN } from '../core/palette.ts'
import { hashRandom } from '../core/random.ts'
import type { Pixel } from '../core/types.ts'
import { MIRROR_WALL, WALLS, isVisible, mirrorToWall, onWall, rasterise, vec } from '../room/room.ts'
import type { Segment, View } from '../room/room.ts'
import { MIRROR_LAYERS, isOnGlass } from './frame.ts'
import type { MirrorLine, MirrorPoint } from './frame.ts'
import { logoCells, plaqueLayers } from './plaque.ts'
import type { Plaque } from './plaque.ts'
import { GLASS_CELLS, PREVIEW_COLOURS, shimmerTone, toneAt } from './preview.ts'
import type { Preview, Shimmer } from './preview.ts'
import { pullLayers } from './pull.ts'
import { rippleOffset, rippleRings, ringLines } from './ripple.ts'

// The mirror and its fixtures projected onto the mirror's wall: their lines,
// the preview on the glass and the ripple over it, and the reverse, from a
// canvas position back to a point on the wall.

// World-space segments for lines drawn on the mirror.
function mirrorSegments(lines: MirrorLine[]): Segment[] {
  return lines.map((line): Segment => {
    const [a, b] = line.map((p) => {
      const { u, v } = mirrorToWall(p)
      return onWall(WALLS[MIRROR_WALL], u, v)
    })
    return [a, b]
  })
}

const MIRROR = MIRROR_LAYERS.map(({ colour, lines }) => ({ colour, segments: mirrorSegments(lines) }))

// Pixels for the mirror, seen the same way as `roomPixels`.
export function mirrorPixels(canvasWidth: number, canvasHeight: number, yaw = 0, eye: FloorPoint = ORIGIN): Pixel[] {
  const view = { yaw, eye, width: canvasWidth, height: canvasHeight }
  const inCanvas = (p: Pixel) => p.x >= 0 && p.x < canvasWidth && p.y >= 0 && p.y < canvasHeight
  return MIRROR.flatMap(({ colour, segments }) => rasterise(segments, colour, view)).filter(inCanvas)
}

// Rings stronger than this are worn; weaker ones are dim.
const RIPPLE_WORN_STRENGTH = 0.6
// Below this strength a ring loses pixels, more of them the weaker it gets.
const RIPPLE_SOLID_STRENGTH = 0.35

export type RippleState = { origin: MirrorPoint; elapsedMs: number }

// Pixels for a ripple on the mirror's glass, seen the same way as `mirrorPixels`.
export function ripplePixels(
  canvasWidth: number,
  canvasHeight: number,
  { origin, elapsedMs }: RippleState,
  yaw = 0,
  eye: FloorPoint = ORIGIN,
): Pixel[] {
  const view = { yaw, eye, width: canvasWidth, height: canvasHeight }
  const inCanvas = (p: Pixel) => p.x >= 0 && p.x < canvasWidth && p.y >= 0 && p.y < canvasHeight
  return rippleRings(origin, elapsedMs).flatMap(({ radius, strength }, ring) => {
    const colour = strength > RIPPLE_WORN_STRENGTH ? FOREGROUND_WORN : FOREGROUND_DIM
    const kept = Math.min(1, strength / RIPPLE_SOLID_STRENGTH)
    return rasterise(mirrorSegments(ringLines(origin, radius)), colour, view).filter(
      (p) => inCanvas(p) && (kept === 1 || hashRandom(p.x, p.y, ring) < kept),
    )
  })
}

// The point on the mirror's glass under a canvas position, or null if the
// position isn't over the glass in this view.
export function screenToMirror(
  x: number,
  y: number,
  canvasWidth: number,
  canvasHeight: number,
  yaw = 0,
  eye: FloorPoint = ORIGIN,
): MirrorPoint | null {
  const point = screenToWall(x, y, canvasWidth, canvasHeight, yaw, eye)
  return point && isOnGlass(point) ? point : null
}

// The mirror-local point on the mirror's wall under a canvas position, or null
// if the wall isn't there in this view.
export function screenToWall(
  x: number,
  y: number,
  canvasWidth: number,
  canvasHeight: number,
  yaw = 0,
  eye: FloorPoint = ORIGIN,
): MirrorPoint | null {
  // The ray through the position, in camera space and then in the world.
  const focal = (FOCAL_RATIO * canvasWidth) / 2
  const cameraX = (x - canvasWidth / 2) / focal
  const cameraY = (canvasHeight / 2 - y) / focal
  const cos = Math.cos(yaw)
  const sin = Math.sin(yaw)
  const ray = vec(cameraX * cos - sin, cameraY, cameraX * sin + cos)
  // Where it meets the mirror's wall, if in front of the camera.
  const { start, along, length } = WALLS[MIRROR_WALL]
  const normal = vec(-along.z, 0, along.x)
  const facing = normal.x * ray.x + normal.z * ray.z
  if (facing === 0) return null
  const distanceAlong = (normal.x * (start.x - eye.x) + normal.z * (start.z - eye.z)) / facing
  if (distanceAlong <= 0) return null
  const hit = vec(eye.x + ray.x * distanceAlong, ray.y * distanceAlong, eye.z + ray.z * distanceAlong)
  if (!isVisible(hit, eye)) return null
  const u = (hit.x - start.x) * along.x + (hit.z - start.z) * along.z
  if (u < 0 || u > length || hit.y < FLOOR_Y || hit.y > CEILING_Y) return null
  // Inverse of mirrorToWall: s = u - length / 2, t = CEILING_Y - v = hit.y.
  return { s: u - length / 2, t: hit.y }
}

// Pixels for the curtain pull beside the mirror, its handle lowered `drop`
// mirror units, seen the same way as `mirrorPixels`.
export function pullPixels(canvasWidth: number, canvasHeight: number, drop = 0, yaw = 0, eye: FloorPoint = ORIGIN): Pixel[] {
  const view = { yaw, eye, width: canvasWidth, height: canvasHeight }
  const inCanvas = (p: Pixel) => p.x >= 0 && p.x < canvasWidth && p.y >= 0 && p.y < canvasHeight
  return pullLayers(drop)
    .flatMap(({ colour, lines }) => rasterise(mirrorSegments(lines), colour, view))
    .filter(inCanvas)
}

// How far over a whole number of pixels a cell can come out and still be that
// many. Yaw isn't wrapped, so after turning round it's off by rounding error,
// which can put the nook's distance from the mirror a hair under 1 and double
// every cell.
const CELL_SIZE_TOLERANCE = 1e-9

// Adds a cell at `world` to `pixels`, as a block sized by how close it is: one
// pixel at distance 1, the nook's distance from the mirror.
function cellPixels(pixels: Pixel[], world: Vec3, colour: string, { yaw, eye, width, height }: View) {
  const camera = toCamera(world, yaw, eye)
  if (camera.z < NEAR || !isVisible(world, eye)) return
  const centre = projectPoint(camera, width, height)
  const size = Math.max(1, Math.ceil(1 / camera.z - CELL_SIZE_TOLERANCE))
  const left = Math.floor(centre.x - (size - 1) / 2)
  const top = Math.floor(centre.y - (size - 1) / 2)
  for (let y = top; y < top + size; y++) {
    for (let x = left; x < left + size; x++) {
      if (x >= 0 && x < width && y >= 0 && y < height) pixels.push({ x, y, colour })
    }
  }
}

// Where each glass cell of a preview sits in the world.
const GLASS_CELL_POINTS = GLASS_CELLS.map((cell) => {
  const { u, v } = mirrorToWall(cell)
  return onWall(WALLS[MIRROR_WALL], u, v)
})

// Pixels for a preview on the mirror's glass, seen the same way as
// `mirrorPixels`. Each cell is a block sized by how close it is, so from the
// nook a cell is one pixel. A ripple shifts which cell's tone shows where, and
// a shimmer changes it over from a previous preview. A null preview is empty.
export function previewPixels(
  canvasWidth: number,
  canvasHeight: number,
  preview: Preview | null,
  yaw = 0,
  eye: FloorPoint = ORIGIN,
  ripple?: RippleState,
  shimmer?: Shimmer,
): Pixel[] {
  const view = { yaw, eye, width: canvasWidth, height: canvasHeight }
  const rings = ripple ? rippleRings(ripple.origin, ripple.elapsedMs) : []
  const pixels: Pixel[] = []
  GLASS_CELLS.forEach((cell, i) => {
    let tone = preview ? preview[cell.index] : 0
    if (shimmer) {
      tone = shimmerTone(cell, shimmer.from ? shimmer.from[cell.index] : 0, tone, shimmer.progress)
    } else if (preview && ripple && rings.length > 0) {
      const offset = rippleOffset(ripple.origin, rings, cell)
      tone = toneAt(preview, cell.s - offset.s, cell.t - offset.t)
    }
    if (tone !== 0) cellPixels(pixels, GLASS_CELL_POINTS[i], PREVIEW_COLOURS[tone], view)
  })
  return pixels
}

// Pixels for the logo plaque below the pull, seen the same way as `mirrorPixels`.
export function plaquePixels(
  canvasWidth: number,
  canvasHeight: number,
  { logo, depth = 0, turn = 0 }: Plaque,
  yaw = 0,
  eye: FloorPoint = ORIGIN,
): Pixel[] {
  const view = { yaw, eye, width: canvasWidth, height: canvasHeight }
  const inCanvas = (p: Pixel) => p.x >= 0 && p.x < canvasWidth && p.y >= 0 && p.y < canvasHeight
  const pixels = plaqueLayers(depth, turn)
    .flatMap(({ colour, lines }) => rasterise(mirrorSegments(lines), colour, view))
    .filter(inCanvas)
  for (const cell of logoCells(logo, depth, turn)) {
    const { u, v } = mirrorToWall(cell)
    cellPixels(pixels, onWall(WALLS[MIRROR_WALL], u, v), PREVIEW_COLOURS[cell.tone], view)
  }
  return pixels
}
