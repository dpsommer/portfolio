import { FLOOR_Y } from '../core/camera.ts'
import type { Vec3 } from '../core/camera.ts'
import { BACKGROUND, FOREGROUND, FOREGROUND_WORN } from '../core/palette.ts'
import { GLYPH_HEIGHT, textPixels, textWidth } from '../core/pixelFont.ts'
import { createRandom } from '../core/random.ts'
import type { Pixel } from '../core/types.ts'

export const SIGN_TEXT = 'WELCOME'
export const BOARD_WIDTH = 120
export const BOARD_HEIGHT = 40
// Vertical pixels per horizontal pixel; negative tilts the right side up.
export const BOARD_SLOPE = -0.08

const TEXT_SCALE = 2
const INNER_INSET = 3
const POST_WIDTH = 6
// How far the post sticks up above the top of the board.
const POST_PROTRUSION = 6
const CHIP_SIZE = 5
const SEED = 7

// Where the post meets the floor in the world (see camera.ts), straight ahead
// of the starting position. Its ground line is drawn at 0.85 of the view's height.
export const SIGN_POSITION: Vec3 = { x: 0, y: FLOOR_Y, z: 1.14 }

type Point = { x: number; y: number }

function rectOutline(left: number, top: number, right: number, bottom: number): Point[] {
  const points: Point[] = []
  for (let x = left; x <= right; x++) points.push({ x, y: top }, { x, y: bottom })
  for (let y = top + 1; y < bottom; y++) points.push({ x: left, y }, { x: right, y })
  return points
}

// Board pixels in board-local coordinates, before tilting.
function boardPixels(random: () => number): Pixel[] {
  const right = BOARD_WIDTH - 1
  const bottom = BOARD_HEIGHT - 1
  const isChipped = (p: Point) => right - p.x + p.y < CHIP_SIZE

  const frame = [
    ...rectOutline(0, 0, right, bottom),
    ...rectOutline(INNER_INSET, INNER_INSET, right - INNER_INSET, bottom - INNER_INSET),
  ].filter((p) => !isChipped(p))
  // The broken edge where the top-right corner has chipped off.
  for (let i = 0; i <= CHIP_SIZE; i++) frame.push({ x: right - CHIP_SIZE + i, y: i })

  const textLeft = Math.floor((BOARD_WIDTH - textWidth(SIGN_TEXT, TEXT_SCALE)) / 2)
  const textTop = Math.floor((BOARD_HEIGHT - GLYPH_HEIGHT * TEXT_SCALE) / 2)
  const text = textPixels(SIGN_TEXT, TEXT_SCALE).map((p) => ({
    x: p.x + textLeft,
    y: p.y + textTop,
  }))

  // A crack running up from the bottom edge to the inner frame.
  const crack: Point[] = [
    { x: 30, y: bottom - 1 },
    { x: 31, y: bottom - 2 },
  ]

  const weather = (points: Point[], dropChance: number, wornChance: number): Pixel[] =>
    points
      .filter(() => random() >= dropChance)
      .map((p) => ({ ...p, colour: random() < wornChance ? FOREGROUND_WORN : FOREGROUND }))

  return [
    ...weather(frame, 0.05, 0.2),
    ...weather(text, 0.06, 0.25),
    ...crack.map((p) => ({ ...p, colour: FOREGROUND_WORN })),
  ].filter((p) => !(p.x === 30 && p.y === bottom)) // the crack breaks the bottom edge
}

function layout(canvasWidth: number, canvasHeight: number) {
  const centreX = Math.floor(canvasWidth / 2)
  const boardLeft = centreX - BOARD_WIDTH / 2
  const boardTop = Math.floor((canvasHeight - BOARD_HEIGHT) / 2)
  const postLeft = centreX - POST_WIDTH / 2
  const placeOnBoard = <T extends Point>(p: T): T => ({
    ...p,
    x: boardLeft + p.x,
    y: boardTop + p.y + Math.round((p.x - BOARD_WIDTH / 2) * BOARD_SLOPE),
  })
  return {
    centreX,
    boardLeft,
    boardTop,
    // Where the post meets the floor, in front of the far wall.
    groundY: Math.floor(canvasHeight * 0.85),
    postLeft,
    postRight: postLeft + POST_WIDTH - 1,
    postTop: boardTop - POST_PROTRUSION,
    // Maps a board-local point to the canvas, tilting it along BOARD_SLOPE.
    placeOnBoard,
    // Whether canvas point (x, y) is hidden behind the tilted board.
    isBehindBoard: (x: number, y: number) => {
      const top = placeOnBoard({ x: x - boardLeft, y: 0 }).y
      return y >= top && y < top + BOARD_HEIGHT
    },
  }
}

// Pixels for the welcome signpost: a tilted, weathered board on a single post,
// standing on a short stretch of ground. Coordinates are canvas pixels.
export function signpostPixels(canvasWidth: number, canvasHeight: number): Pixel[] {
  const random = createRandom(SEED)
  const { centreX, groundY, postLeft, postRight, postTop, placeOnBoard, isBehindBoard } = layout(
    canvasWidth,
    canvasHeight,
  )

  const board = boardPixels(random).map(placeOnBoard)

  // The post runs from just above the board down to the floor, hidden behind the board.
  const post: Pixel[] = []
  for (let x = postLeft; x <= postRight; x++) {
    post.push({ x, y: postTop, colour: random() < 0.3 ? FOREGROUND_WORN : FOREGROUND })
  }
  for (let y = postTop + 1; y < groundY; y++) {
    for (const x of [postLeft, postRight]) {
      if (isBehindBoard(x, y)) continue
      post.push({ x, y, colour: random() < 0.3 ? FOREGROUND_WORN : FOREGROUND })
    }
    // Sparse wood grain inside the post.
    if (!isBehindBoard(postLeft + 2, y) && random() < 0.12) {
      post.push({ x: postLeft + 2 + Math.floor(random() * 2), y, colour: FOREGROUND_WORN })
    }
  }

  // Ground at the foot of the post, fading out with distance from it.
  const ground: Pixel[] = []
  const groundHalfWidth = 30
  for (let dx = -groundHalfWidth; dx <= groundHalfWidth; dx++) {
    if (random() < 1 - Math.abs(dx) / groundHalfWidth) {
      ground.push({ x: centreX + dx, y: groundY, colour: Math.abs(dx) < 12 ? FOREGROUND : FOREGROUND_WORN })
    }
  }

  return [...board, ...post, ...ground]
}

export type Bounds = { left: number; top: number; right: number; bottom: number }

// A rectangle from the tilted board's lower-left corner to its upper-right corner,
// in canvas pixels (inclusive). Used as the sign's hover area.
export function signBoardBounds(canvasWidth: number, canvasHeight: number): Bounds {
  const { placeOnBoard } = layout(canvasWidth, canvasHeight)
  const lowerLeft = placeOnBoard({ x: 0, y: BOARD_HEIGHT - 1 })
  const upperRight = placeOnBoard({ x: BOARD_WIDTH - 1, y: 0 })
  return { left: lowerLeft.x, top: upperRight.y, right: upperRight.x, bottom: lowerLeft.y }
}

// Background-coloured pixels covering the board and post, drawn before the
// signpost so the room behind it doesn't show through.
export function signpostBackingPixels(canvasWidth: number, canvasHeight: number): Pixel[] {
  const { groundY, postLeft, postRight, postTop, placeOnBoard } = layout(canvasWidth, canvasHeight)
  const pixels: Pixel[] = []
  for (let y = 0; y < BOARD_HEIGHT; y++) {
    for (let x = 0; x < BOARD_WIDTH; x++) {
      if (BOARD_WIDTH - 1 - x + y < CHIP_SIZE) continue
      pixels.push(placeOnBoard({ x, y, colour: BACKGROUND }))
    }
  }
  for (let y = postTop; y < groundY; y++) {
    for (let x = postLeft; x <= postRight; x++) pixels.push({ x, y, colour: BACKGROUND })
  }
  return pixels
}
