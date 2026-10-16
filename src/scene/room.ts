import { brokenLinePoints, linePoints } from './line.ts'
import { FOREGROUND_DIM, FOREGROUND_WORN } from './palette.ts'
import { createRandom } from './random.ts'
import type { Pixel } from './types.ts'

// The room is drawn as a dungeon-crawler "narrowing box": the far wall is a
// smaller rectangle centred on the vanishing point, and diagonal edges run from
// its corners to the corners of the view. Everything is sparse, so the viewer
// fills in the rest.

// Size of the far wall as a fraction of the view.
export const FAR_WALL_SCALE = 0.45
// Rows of floor tiles between the far wall and the viewer, as fractions of the
// far wall's distance (perspective puts them closer together towards the back).
const FLOOR_TILE_DEPTH = 0.2
const FLOOR_TILE_COLUMNS = 6
const BRICK_ROWS = 12
const BRICKS_PER_ROW = 8
const BRICK_CHANCE = 0.14
const FLOOR_EDGE_CHANCE = 0.3
const SEED = 21

export type FarWall = { left: number; top: number; right: number; bottom: number }

export function farWallRect(canvasWidth: number, canvasHeight: number): FarWall {
  const halfWidth = Math.round((canvasWidth * FAR_WALL_SCALE) / 2)
  const halfHeight = Math.round((canvasHeight * FAR_WALL_SCALE) / 2)
  const centreX = canvasWidth / 2
  const centreY = canvasHeight / 2
  return {
    left: centreX - halfWidth,
    top: centreY - halfHeight,
    right: centreX + halfWidth,
    bottom: centreY + halfHeight,
  }
}

function inCanvas(width: number, height: number) {
  return (p: { x: number; y: number }) => p.x >= 0 && p.x < width && p.y >= 0 && p.y < height
}

// The box edges: the far wall's outline and the four corner diagonals.
function edgePixels(wall: FarWall, width: number, height: number, random: () => number): Pixel[] {
  const { left, top, right, bottom } = wall
  const segments: [number, number, number, number][] = [
    [left, top, right, top],
    [left, bottom, right, bottom],
    [left, top, left, bottom],
    [right, top, right, bottom],
    [left, top, 0, 0],
    [right, top, width - 1, 0],
    [left, bottom, 0, height - 1],
    [right, bottom, width - 1, height - 1],
  ]
  return segments.flatMap(([x0, y0, x1, y1]) =>
    brokenLinePoints(x0, y0, x1, y1, random, 6, 24).map((p) => ({ ...p, colour: FOREGROUND_WORN })),
  )
}

// A few scattered bricks on the far wall, each drawn as just its top and left edges.
function brickPixels(wall: FarWall, random: () => number): Pixel[] {
  const brickWidth = (wall.right - wall.left) / BRICKS_PER_ROW
  const brickHeight = (wall.bottom - wall.top) / BRICK_ROWS
  const pixels: Pixel[] = []
  for (let row = 0; row < BRICK_ROWS; row++) {
    const offset = row % 2 === 1 ? brickWidth / 2 : 0
    for (let column = -1; column < BRICKS_PER_ROW; column++) {
      if (random() >= BRICK_CHANCE) continue
      const x0 = Math.round(wall.left + offset + column * brickWidth)
      const x1 = Math.round(x0 + brickWidth) - 2
      const y0 = Math.round(wall.top + row * brickHeight)
      const y1 = Math.round(y0 + brickHeight) - 2
      // Keep bricks off the wall's own edges.
      if (x0 <= wall.left || x1 >= wall.right || y0 <= wall.top || y1 >= wall.bottom) continue
      for (const p of [...linePoints(x0, y0, x1, y0), ...linePoints(x0, y0 + 1, x0, y1)]) {
        pixels.push({ ...p, colour: FOREGROUND_DIM })
      }
    }
  }
  return pixels
}

// Scattered flagstone edges on the floor, projected towards the vanishing point.
function floorPixels(wall: FarWall, width: number, height: number, random: () => number): Pixel[] {
  const centreX = width / 2
  const centreY = height / 2
  const floorDrop = wall.bottom - centreY
  const tileWidth = (wall.right - wall.left) / FLOOR_TILE_COLUMNS
  // Screen position of a point on the floor at a far-wall x and a relative depth (1 = far wall).
  const project = (farX: number, depth: number) => ({
    x: centreX + (farX - centreX) / depth,
    y: centreY + floorDrop / depth,
  })

  const pixels: Pixel[] = []
  // Extra columns either side reach the corners of the view as the floor widens.
  const extraColumns = FLOOR_TILE_COLUMNS
  for (let row = 0; ; row++) {
    const depth = 1 - row * FLOOR_TILE_DEPTH
    const nearDepth = depth - FLOOR_TILE_DEPTH
    // Stop once a row starts below the view or would reach the viewer's eye. Depths
    // are multiples of FLOOR_TILE_DEPTH, so anything under half a step is float error
    // around zero (e.g. 1 - 0.8 - 0.2 ≈ 5.5e-17), which would project to infinity.
    if (nearDepth < FLOOR_TILE_DEPTH / 2 || project(0, depth).y >= height) break
    for (let column = -extraColumns; column < FLOOR_TILE_COLUMNS + extraColumns; column++) {
      const farLeft = wall.left + column * tileWidth
      const farRight = farLeft + tileWidth
      // The tile's near edge.
      if (random() < FLOOR_EDGE_CHANCE) {
        const a = project(farLeft, nearDepth)
        const b = project(farRight, nearDepth)
        pixels.push(...brokenLinePoints(a.x + 2, a.y, b.x - 2, b.y, random).map((p) => ({ ...p, colour: FOREGROUND_DIM })))
      }
      // The tile's left edge, running towards the vanishing point.
      if (column > -extraColumns && column !== 0 && random() < FLOOR_EDGE_CHANCE) {
        const a = project(farLeft, depth)
        const b = project(farLeft, nearDepth)
        pixels.push(...brokenLinePoints(a.x, a.y + 2, b.x, b.y - 2, random).map((p) => ({ ...p, colour: FOREGROUND_DIM })))
      }
    }
  }
  // Only the part of the floor inside the floor trapezoid is visible.
  return pixels.filter((p) => {
    if (p.y <= wall.bottom) return false
    const spread = (p.y - centreY) / floorDrop
    const halfWidth = ((wall.right - wall.left) / 2) * spread
    return Math.abs(p.x - centreX) < halfWidth - 1
  })
}

export function roomPixels(canvasWidth: number, canvasHeight: number): Pixel[] {
  const random = createRandom(SEED)
  const wall = farWallRect(canvasWidth, canvasHeight)
  return [
    ...brickPixels(wall, random),
    ...floorPixels(wall, canvasWidth, canvasHeight, random),
    ...edgePixels(wall, canvasWidth, canvasHeight, random),
  ].filter(inCanvas(canvasWidth, canvasHeight))
}
