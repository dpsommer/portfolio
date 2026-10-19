import { FAR_Z } from '../core/camera.ts'
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
const BOARD_HALF_WIDTH = 0.7
const BOARD_HALF_HEIGHT = 0.22
// How far the board rises per unit to the right, so it hangs crooked.
export const BOARD_RISE = 0.08
// The nail's height above the board's centre, and its half-size.
const NAIL_T = 0.45
const NAIL_HALF_SIZE = 0.015
const TEXT_SCALE = 2

// One text cell per canvas pixel from the start, which faces the sign's wall
// FAR_Z away.
export const SIGN_CELL_SIZE = FAR_Z / PIXELS_PER_UNIT

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

// The text's cells, centred on the board and tilted with it. Each sits in the
// middle of a canvas pixel seen from the start, so none double up or leave gaps.
export const SIGN_TEXT_CELLS: MirrorPoint[] = (() => {
  const left = -Math.floor(textWidth(SIGN_TEXT, TEXT_SCALE) / 2)
  const top = -Math.floor((GLYPH_HEIGHT * TEXT_SCALE) / 2)
  return textPixels(SIGN_TEXT, TEXT_SCALE).map(({ x, y }) =>
    skew(point((left + x + 0.5) * SIGN_CELL_SIZE, -(top + y + 0.5) * SIGN_CELL_SIZE)),
  )
})()

// The rectangle the sign covers, in sign-local units.
export const SIGN_BOUNDS = (() => {
  const points = [...SIGN_LAYERS.flatMap(({ lines }) => lines.flat()), ...SIGN_TEXT_CELLS]
  const ss = points.map(({ s }) => s)
  const ts = points.map(({ t }) => t)
  return { left: Math.min(...ss), right: Math.max(...ss), bottom: Math.min(...ts), top: Math.max(...ts) }
})()
