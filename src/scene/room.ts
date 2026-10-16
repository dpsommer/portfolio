import { BACK_Z, CEILING_Y, FAR_Z, FLOOR_Y, NOOK_FRONT_Z, NOOK_X, ROOM_HALF_WIDTH, projectSegment } from './camera.ts'
import type { Vec3 } from './camera.ts'
import { linePoints } from './line.ts'
import { FOREGROUND_DIM, FOREGROUND_WORN } from './palette.ts'
import { createRandom, hashRandom, hashSeed } from './random.ts'
import type { Pixel } from './types.ts'

// The room is seen from inside, drawn as the classic dungeon-crawler "narrowing
// box": facing north, the far wall is a small rectangle in the middle of the
// view and the wall edges run out to the view's corners. A nook to the left of
// the start breaks the box. Everything is sparse, so the viewer fills in the
// rest. All detail is placed in world space with per-element seeds, so it stays
// put while the view turns. Every wall can be seen in full from the camera's
// position, so nothing needs hiding.

const BRICK_WIDTH = 0.25
const BRICK_HEIGHT = 0.125
// World-space gap between neighbouring bricks' outlines.
const BRICK_GAP = 0.03
const BRICK_CHANCE = 0.1
const FLOOR_TILE_SIZE = 1 / 3
const FLOOR_EDGE_CHANCE = 0.3
// Inset of floor edges from the tile corners.
const FLOOR_EDGE_INSET = 0.04
const SEED = 21

// Seeds for each kind of detail, so their random streams don't overlap.
const EDGE_SEED = 1
const BRICK_SEED = 2
const FLOOR_SEED = 3

type Segment = [Vec3, Vec3]

const vec = (x: number, y: number, z: number): Vec3 => ({ x, y, z })
const lerp = (a: Vec3, b: Vec3, t: number): Vec3 =>
  vec(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t)
const distance = (a: Vec3, b: Vec3) => Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z)

// A wall seen from inside the room: `start` is its top-left corner and `along`
// points to the right, so wall-local (u, v) runs right and down. `seed` keeps
// each wall's bricks independent of the others.
type Wall = { start: Vec3; along: Vec3; length: number; seed: number }
type FloorPoint = { x: number; z: number }

const LEFT = -ROOM_HALF_WIDTH
const RIGHT = ROOM_HALF_WIDTH

export type WallName = 'north' | 'east' | 'south' | 'nook-back' | 'nook-side' | 'west'

// The floor plan's corners, clockwise seen from above, each followed by the wall
// that runs from it to the next corner (left to right, seen from inside).
const PLAN: [FloorPoint, WallName, number][] = [
  [{ x: LEFT, z: FAR_Z }, 'north', 0],
  [{ x: RIGHT, z: FAR_Z }, 'east', 3],
  [{ x: RIGHT, z: BACK_Z }, 'south', 2],
  [{ x: NOOK_X, z: BACK_Z }, 'nook-back', 4],
  [{ x: NOOK_X, z: NOOK_FRONT_Z }, 'nook-side', 5],
  [{ x: LEFT, z: NOOK_FRONT_Z }, 'west', 1],
]
export const FLOOR_PLAN: FloorPoint[] = PLAN.map(([corner]) => corner)

export const WALLS = Object.fromEntries(
  PLAN.map(([corner, name, seed], i) => {
    const next = FLOOR_PLAN[(i + 1) % FLOOR_PLAN.length]
    const length = Math.hypot(next.x - corner.x, next.z - corner.z)
    const along = vec((next.x - corner.x) / length, 0, (next.z - corner.z) / length)
    return [name, { start: vec(corner.x, CEILING_Y, corner.z), along, length, seed }]
  }),
) as Record<WallName, Wall>

// Whether a point on the floor is inside the floor plan (even-odd rule).
export function isOnFloor({ x, z }: FloorPoint): boolean {
  let inside = false
  for (let i = 0, j = FLOOR_PLAN.length - 1; i < FLOOR_PLAN.length; j = i++) {
    const a = FLOOR_PLAN[i]
    const b = FLOOR_PLAN[j]
    if (a.z > z !== b.z > z && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x) inside = !inside
  }
  return inside
}

function onWall(wall: Wall, u: number, v: number): Vec3 {
  const { start, along } = wall
  return vec(start.x + along.x * u, start.y - v, start.z + along.z * u)
}

// Splits a segment into drawn runs with gaps between them, measured in world
// units so the pattern doesn't change as the view moves.
function brokenSegment(a: Vec3, b: Vec3, seed: number, minRun: number, maxRun: number): Segment[] {
  const random = createRandom(seed)
  const length = distance(a, b)
  const runs: Segment[] = []
  let position = random() < 0.7 ? 0 : random() * maxRun
  while (position < length) {
    const end = Math.min(length, position + minRun + random() * (maxRun - minRun))
    runs.push([lerp(a, b, position / length), lerp(a, b, end / length)])
    position = end + 0.03 + random() * 0.06
  }
  return runs
}

// The room's edges: where each wall meets the floor and the ceiling, and the
// vertical corner at the wall's left end.
function edgeSegments(): Segment[] {
  return Object.values(WALLS).flatMap(({ start, along, length, seed }) => {
    const end = vec(start.x + along.x * length, 0, start.z + along.z * length)
    const edges: Segment[] = [
      [vec(start.x, FLOOR_Y, start.z), vec(end.x, FLOOR_Y, end.z)],
      [vec(start.x, CEILING_Y, start.z), vec(end.x, CEILING_Y, end.z)],
      [vec(start.x, CEILING_Y, start.z), vec(start.x, FLOOR_Y, start.z)],
    ]
    return edges.flatMap(([a, b], i) => brokenSegment(a, b, hashSeed(SEED, EDGE_SEED, seed, i), 0.1, 0.35))
  })
}

// A few scattered bricks on each wall, each drawn as just its top and left edges.
function brickSegments(): Segment[] {
  const rows = Math.round((CEILING_Y - FLOOR_Y) / BRICK_HEIGHT)
  return Object.values(WALLS).flatMap((wall) => {
    const columns = Math.ceil(wall.length / BRICK_WIDTH)
    const segments: Segment[] = []
    for (let row = 0; row < rows; row++) {
      const offset = row % 2 === 1 ? BRICK_WIDTH / 2 : 0
      for (let column = -1; column < columns; column++) {
        if (hashRandom(SEED, BRICK_SEED, wall.seed, row, column) >= BRICK_CHANCE) continue
        const u0 = offset + column * BRICK_WIDTH
        const u1 = u0 + BRICK_WIDTH - BRICK_GAP
        const v0 = row * BRICK_HEIGHT
        const v1 = v0 + BRICK_HEIGHT - BRICK_GAP
        // Keep bricks off the wall's own edges.
        if (u0 <= 0 || u1 >= wall.length || v0 <= 0 || v1 >= CEILING_Y - FLOOR_Y) continue
        segments.push([onWall(wall, u0, v0), onWall(wall, u1, v0)], [onWall(wall, u0, v0), onWall(wall, u0, v1)])
      }
    }
    return segments
  })
}

// Scattered flagstone edges on a grid of square floor tiles. Grid lines are
// numbered from the main room's left wall, and only lines with floor on both
// sides are drawn (not those along the walls).
function floorSegments(): Segment[] {
  const x = (column: number) => LEFT + column * FLOOR_TILE_SIZE
  const z = (row: number) => Math.min(FAR_Z, BACK_Z + row * FLOOR_TILE_SIZE)
  const firstColumn = Math.round((NOOK_X - LEFT) / FLOOR_TILE_SIZE)
  const lastColumn = Math.round((RIGHT - LEFT) / FLOOR_TILE_SIZE)
  const rows = Math.ceil((FAR_Z - BACK_Z) / FLOOR_TILE_SIZE)
  const segments: Segment[] = []
  const add = (a: Vec3, b: Vec3, seed: number) => {
    const inset = FLOOR_EDGE_INSET / distance(a, b)
    segments.push(...brokenSegment(lerp(a, b, inset), lerp(a, b, 1 - inset), seed, 0.06, 0.25))
  }
  // Whether the floor is on both sides of a grid line, just off its midpoint.
  const isInterior = (a: Vec3, b: Vec3) => {
    const middle = lerp(a, b, 0.5)
    const nudge = 0.01
    return a.x === b.x
      ? isOnFloor({ x: middle.x - nudge, z: middle.z }) && isOnFloor({ x: middle.x + nudge, z: middle.z })
      : isOnFloor({ x: middle.x, z: middle.z - nudge }) && isOnFloor({ x: middle.x, z: middle.z + nudge })
  }
  for (let row = 0; row < rows; row++) {
    for (let column = firstColumn; column < lastColumn; column++) {
      // The tile's near edge and its left edge.
      const near: Segment = [vec(x(column), FLOOR_Y, z(row)), vec(x(column + 1), FLOOR_Y, z(row))]
      if (isInterior(...near) && hashRandom(SEED, FLOOR_SEED, 0, row, column) < FLOOR_EDGE_CHANCE) {
        add(...near, hashSeed(SEED, FLOOR_SEED, 1, row, column))
      }
      const left: Segment = [vec(x(column), FLOOR_Y, z(row)), vec(x(column), FLOOR_Y, z(row + 1))]
      if (isInterior(...left) && hashRandom(SEED, FLOOR_SEED, 2, row, column) < FLOOR_EDGE_CHANCE) {
        add(...left, hashSeed(SEED, FLOOR_SEED, 3, row, column))
      }
    }
  }
  return segments
}

// The room's detail doesn't depend on the view, so it's built once.
const BRICKS = brickSegments()
const FLOOR = floorSegments()
const EDGES = edgeSegments()

function rasterise(segments: Segment[], colour: string, yaw: number, width: number, height: number): Pixel[] {
  return segments.flatMap(([a, b]) => {
    const projected = projectSegment(a, b, yaw, width, height)
    if (!projected) return []
    const [p, q] = projected
    return linePoints(p.x, p.y, q.x, q.y).map((point) => ({ ...point, colour }))
  })
}

// Pixels for the room seen with the camera turned `yaw` radians left of north.
export function roomPixels(canvasWidth: number, canvasHeight: number, yaw = 0): Pixel[] {
  const inCanvas = (p: Pixel) => p.x >= 0 && p.x < canvasWidth && p.y >= 0 && p.y < canvasHeight
  return [
    ...rasterise(BRICKS, FOREGROUND_DIM, yaw, canvasWidth, canvasHeight),
    ...rasterise(FLOOR, FOREGROUND_DIM, yaw, canvasWidth, canvasHeight),
    ...rasterise(EDGES, FOREGROUND_WORN, yaw, canvasWidth, canvasHeight),
  ].filter(inCanvas)
}
