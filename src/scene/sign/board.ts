import { WALL_VIEW_DISTANCE } from '../core/camera.ts'
import { FOREGROUND, FOREGROUND_WORN } from '../core/palette.ts'
import { GLYPH_HEIGHT, textPixels, textWidth } from '../core/pixelFont.ts'
import { point, polyline } from '../mirror/frame.ts'
import type { MirrorLayer, MirrorPoint } from '../mirror/frame.ts'
import { PIXELS_PER_UNIT } from '../mirror/preview.ts'

// The welcome sign, drawn like the mirror as sparse lines: a board with
// "WELCOME" on it, hung slightly crooked from a nail by two cords. Its shape
// is in sign-local world units: s runs right and t up from the board's centre.
// room.ts hangs it on a wall.

export const SIGN_TEXT = 'WELCOME'
const BOARD_HALF_WIDTH = 0.6
const BOARD_HALF_HEIGHT = 0.19
// How far the board rises per unit to the right, so it hangs crooked.
export const BOARD_RISE = 0.08
// The nail's height above the board's centre, and its half-size.
const NAIL_T = 0.38
const NAIL_HALF_SIZE = 0.015
const TEXT_SCALE = 3

// One text cell per canvas pixel from the place in front of the sign,
// WALL_VIEW_DISTANCE from its wall.
export const SIGN_CELL_SIZE = WALL_VIEW_DISTANCE / PIXELS_PER_UNIT

// Tilts a point on the board by shearing it, which keeps its verticals upright.
const skew = ({ s, t }: MirrorPoint) => point(s, t + BOARD_RISE * s)

const corners = {
  topLeft: skew(point(-BOARD_HALF_WIDTH, BOARD_HALF_HEIGHT)),
  topRight: skew(point(BOARD_HALF_WIDTH, BOARD_HALF_HEIGHT)),
  bottomRight: skew(point(BOARD_HALF_WIDTH, -BOARD_HALF_HEIGHT)),
  bottomLeft: skew(point(-BOARD_HALF_WIDTH, -BOARD_HALF_HEIGHT)),
}

export const NAIL = point(0, NAIL_T)
const nail = [
  point(0, NAIL_T + NAIL_HALF_SIZE),
  point(NAIL_HALF_SIZE, NAIL_T),
  point(0, NAIL_T - NAIL_HALF_SIZE),
  point(-NAIL_HALF_SIZE, NAIL_T),
  point(0, NAIL_T + NAIL_HALF_SIZE),
]

// The board's outline, closed, in the order it's drawn.
export const BOARD_OUTLINE = [
  corners.topLeft,
  corners.topRight,
  corners.bottomRight,
  corners.bottomLeft,
  corners.topLeft,
]

// Layers in drawing order: the nail and cords, then the board over them.
export const SIGN_LAYERS: MirrorLayer[] = [
  {
    colour: FOREGROUND_WORN,
    lines: [...polyline(nail), [NAIL, corners.topLeft], [NAIL, corners.topRight]],
  },
  { colour: FOREGROUND, lines: polyline(BOARD_OUTLINE) },
]

// The text's cells, TEXT_SCALE square per glyph pixel, centred on the board
// and tilted with it. Each glyph pixel's square moves as one, so its cells
// stay together, and each cell sits in the middle of a canvas pixel seen from
// in front of the sign, so none double up or leave gaps there.
export const SIGN_TEXT_CELLS: MirrorPoint[] = (() => {
  const left = -Math.floor(textWidth(SIGN_TEXT, TEXT_SCALE) / 2)
  const top = -Math.floor((GLYPH_HEIGHT * TEXT_SCALE) / 2)
  const cell = (x: number, y: number) => point((left + x + 0.5) * SIGN_CELL_SIZE, -(top + y + 0.5) * SIGN_CELL_SIZE)
  return textPixels(SIGN_TEXT).flatMap(({ x, y }) => {
    const square = { x: x * TEXT_SCALE, y: y * TEXT_SCALE }
    const middle = cell(square.x + (TEXT_SCALE - 1) / 2, square.y + (TEXT_SCALE - 1) / 2)
    const rise = skew(middle).t - middle.t
    return Array.from({ length: TEXT_SCALE ** 2 }, (_, i) => {
      const { s, t } = cell(square.x + (i % TEXT_SCALE), square.y + Math.floor(i / TEXT_SCALE))
      return point(s, t + rise)
    })
  })
})()

// The rectangle the sign covers, in sign-local units.
export const SIGN_BOUNDS = (() => {
  const points = [...SIGN_LAYERS.flatMap(({ lines }) => lines.flat()), ...SIGN_TEXT_CELLS]
  const ss = points.map(({ s }) => s)
  const ts = points.map(({ t }) => t)
  return { left: Math.min(...ss), right: Math.max(...ss), bottom: Math.min(...ts), top: Math.max(...ts) }
})()
