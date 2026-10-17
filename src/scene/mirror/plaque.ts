import { FOREGROUND_DIM, FOREGROUND_WORN } from '../core/palette.ts'
import { point, polyline } from './frame.ts'
import type { MirrorLayer, MirrorLine, MirrorPoint } from './frame.ts'
import { PIXELS_PER_UNIT } from './preview.ts'
import { PULL_S } from './pull.ts'

// A stone block set into the mirror's wall below the curtain pull, its face
// showing the current site's logo. Drawn like the mirror, in mirror-local
// units on the mirror's wall. When the block sinks into its niche or turns on
// its vertical axis, the depth is drawn in the wall's plane, in the room's
// "narrowing box" style: the face shrinks toward the niche's centre and lines
// from the niche's corners to the face's show the recess's walls.

// The niche's centre, under the cord, and half its size.
const PLAQUE_S = PULL_S
const PLAQUE_T = -0.38
const NICHE_HALF_SIZE = 0.085
// The face's half-size at rest, a little inside the niche.
const FACE_HALF_SIZE = 0.075
// How much smaller the face looks when fully sunk.
const SINK_SCALE = 0.2

// Logo maps are 16×16 grids where '#' is the full foreground, '+' worn, '-'
// dim and '.' empty. One map cell is one canvas pixel from the nook.
export type LogoMap = string[]
export const LOGO_SIZE = 16
const CELL_SIZE = 1 / PIXELS_PER_UNIT
const LOGO_TONES: Record<string, number> = { '.': 0, '-': 1, '+': 2, '#': 3 }

export type LogoCell = { col: number; row: number; tone: number }

// The logo's non-empty cells, with tones as for a preview (1 dim to 3 full).
export function parseLogo(map: LogoMap): LogoCell[] {
  if (map.length !== LOGO_SIZE || map.some((row) => row.length !== LOGO_SIZE)) {
    throw new Error(`Logo maps must be ${LOGO_SIZE}×${LOGO_SIZE}`)
  }
  return map.flatMap((row, r) =>
    row.split('').flatMap((char, c) => {
      const tone = LOGO_TONES[char]
      if (tone === undefined) throw new Error(`Unknown logo map character '${char}'`)
      return tone === 0 ? [] : [{ col: c, row: r, tone }]
    }),
  )
}

// The block's face: `depth` (0 flush to 1 sunk) shrinks it toward the niche's
// centre, and `turn` (0 to 1, a half turn) narrows it as it turns edge-on.
export type Plaque = { logo: LogoMap; depth?: number; turn?: number }

function faceScale(depth: number, turn: number) {
  const scale = 1 - SINK_SCALE * depth
  return { across: scale * Math.abs(Math.cos(Math.PI * turn)), up: scale }
}

const square = (halfWidth: number, halfHeight: number): MirrorPoint[] => [
  point(PLAQUE_S - halfWidth, PLAQUE_T + halfHeight),
  point(PLAQUE_S + halfWidth, PLAQUE_T + halfHeight),
  point(PLAQUE_S + halfWidth, PLAQUE_T - halfHeight),
  point(PLAQUE_S - halfWidth, PLAQUE_T - halfHeight),
]

const closed = (points: MirrorPoint[]) => polyline([...points, points[0]])

// The niche, the recess walls and the face's outline.
export function plaqueLayers(depth = 0, turn = 0): MirrorLayer[] {
  const { across, up } = faceScale(depth, turn)
  const niche = square(NICHE_HALF_SIZE, NICHE_HALF_SIZE)
  const face = square(FACE_HALF_SIZE * across, FACE_HALF_SIZE * up)
  const walls = niche.map((corner, i): MirrorLine => [corner, face[i]])
  return [
    { colour: FOREGROUND_DIM, lines: [...closed(niche), ...walls] },
    { colour: FOREGROUND_WORN, lines: closed(face) },
  ]
}

// The logo's cells as mirror points on the face, scaled with it. A sunk block
// is in shadow, so its tones drop by up to one step.
export function logoCells(logo: LogoMap, depth = 0, turn = 0): (MirrorPoint & { tone: number })[] {
  const { across, up } = faceScale(depth, turn)
  const shade = Math.round(depth)
  return parseLogo(logo).flatMap(({ col, row, tone }) => {
    const shaded = tone - shade
    if (shaded <= 0) return []
    const s = PLAQUE_S + (col - (LOGO_SIZE - 1) / 2) * CELL_SIZE * across
    const t = PLAQUE_T - (row - (LOGO_SIZE - 1) / 2) * CELL_SIZE * up
    return [{ s, t, tone: shaded }]
  })
}

// The niche, so bricks aren't drawn behind it.
export const PLAQUE_BOUNDS = {
  left: PLAQUE_S - NICHE_HALF_SIZE,
  right: PLAQUE_S + NICHE_HALF_SIZE,
  bottom: PLAQUE_T - NICHE_HALF_SIZE,
  top: PLAQUE_T + NICHE_HALF_SIZE,
}
