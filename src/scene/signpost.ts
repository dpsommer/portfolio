import { FOREGROUND, FOREGROUND_WORN } from './palette.ts'
import { GLYPH_HEIGHT, textPixels, textWidth } from './pixelFont.ts'
import { createRandom } from './random.ts'
import type { Pixel } from './types.ts'

export const SIGN_TEXT = 'WELCOME'
export const BOARD_WIDTH = 120
export const BOARD_HEIGHT = 40
// Vertical pixels per horizontal pixel; negative tilts the right side up.
export const BOARD_SLOPE = -0.08

const TEXT_SCALE = 2
const INNER_INSET = 3
const POST_WIDTH = 6
const CHIP_SIZE = 5
const SEED = 7

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

// Pixels for the welcome signpost: a tilted, weathered board on a single post,
// standing on a short stretch of ground. Coordinates are canvas pixels.
export function signpostPixels(canvasWidth: number, canvasHeight: number): Pixel[] {
  const random = createRandom(SEED)
  const centreX = Math.floor(canvasWidth / 2)
  const boardLeft = centreX - BOARD_WIDTH / 2
  const boardTop = Math.floor(canvasHeight * 0.3)
  const groundY = Math.floor(canvasHeight * 0.78)

  const board = boardPixels(random).map((p) => ({
    ...p,
    x: boardLeft + p.x,
    y: boardTop + p.y + Math.round((p.x - BOARD_WIDTH / 2) * BOARD_SLOPE),
  }))

  const post: Pixel[] = []
  const postLeft = centreX - POST_WIDTH / 2
  const postRight = postLeft + POST_WIDTH - 1
  for (let y = boardTop + BOARD_HEIGHT; y < groundY; y++) {
    for (const x of [postLeft, postRight]) {
      post.push({ x, y, colour: random() < 0.3 ? FOREGROUND_WORN : FOREGROUND })
    }
    // Sparse wood grain inside the post.
    if (random() < 0.12) {
      post.push({ x: postLeft + 2 + Math.floor(random() * 2), y, colour: FOREGROUND_WORN })
    }
  }

  // Ground that fades out with distance from the post.
  const ground: Pixel[] = []
  const groundHalfWidth = 60
  for (let dx = -groundHalfWidth; dx <= groundHalfWidth; dx++) {
    if (random() < 1 - Math.abs(dx) / groundHalfWidth) {
      ground.push({ x: centreX + dx, y: groundY, colour: Math.abs(dx) < 20 ? FOREGROUND : FOREGROUND_WORN })
    }
  }

  return [...board, ...post, ...ground]
}
