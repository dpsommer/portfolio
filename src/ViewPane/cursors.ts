import { BACKGROUND, FOREGROUND, FOREGROUND_WORN } from '../scene/palette.ts'

export type CursorZone = 'turn-left' | 'forward' | 'turn-right'

// Fraction of the pane's width at each side that turns the viewer.
export const EDGE_ZONE_FRACTION = 0.15

const PIXEL_SIZE = 2

// Maps the horizontal position within the pane (0 = left edge, 1 = right edge) to a zone.
export function getCursorZone(fraction: number): CursorZone {
  if (fraction < EDGE_ZONE_FRACTION) return 'turn-left'
  if (fraction > 1 - EDGE_ZONE_FRACTION) return 'turn-right'
  return 'forward'
}

// Pixel maps are 16×16 grids where '#' is the top face of an arrow, '+' is its
// side (shown in a dimmer colour) and '.' is transparent. Outlines are generated,
// so arrows must leave a 1-pixel transparent border.
const MAP_SIZE = 16

// Arrows are flat shapes lying on the floor, seen from above at 45° with the same
// forced perspective as the room: their far ends are foreshortened and narrower.
// Shapes are polygons in floor coordinates: x runs 0–1 left to right and z runs
// 0–1 from near to far.
type FloorPoint = [x: number, z: number]

const FORWARD_SHAPE: FloorPoint[][] = [
  [[0.33, 0], [0.67, 0], [0.67, 0.5], [0.33, 0.5]],
  [[0.02, 0.5], [0.98, 0.5], [0.5, 1]],
]

// Comes towards the viewer's left: up from the near edge, bending to point left.
const TURN_LEFT_SHAPE: FloorPoint[][] = [
  [[0.6, 0], [0.9, 0], [0.9, 0.75], [0.6, 0.75]],
  [[0.35, 0.45], [0.9, 0.45], [0.9, 0.75], [0.35, 0.75]],
  [[0.4, 0.2], [0.4, 1], [0.02, 0.6]],
]

// An open hand lying on the floor, fingers spread away from the viewer: "can't
// go this way". The fingers fan out slightly so each lands on its own pixel
// column once foreshortened.
const finger = (baseX: number, baseZ: number, tipX: number, tipZ: number, width: number): FloorPoint[] => [
  [baseX - width / 2, baseZ],
  [baseX + width / 2, baseZ],
  [tipX + width / 2, tipZ],
  [tipX - width / 2, tipZ],
]
const BLOCKED_SHAPE: FloorPoint[][] = [
  [[0.37, 0], [0.85, 0], [0.89, 0.48], [0.33, 0.48]],
  finger(0.37, 0.4, 0.33, 0.88, 0.07),
  finger(0.53, 0.4, 0.53, 1, 0.07),
  finger(0.69, 0.4, 0.72, 1, 0.07),
  finger(0.85, 0.4, 0.91, 0.88, 0.07),
  // The thumb, out to the left.
  finger(0.37, 0.08, 0.13, 0.36, 0.12),
]

const COS_45 = Math.SQRT1_2
// Width of the arrow's near edge in map pixels.
const FACE_WIDTH = 14
// The top face spans rows NEAR_Y up to NEAR_Y - FACE_DEPTH; foreshortened by cos 45°.
const NEAR_Y = 12
const FACE_DEPTH = Math.round(FACE_WIDTH * COS_45)
// How much narrower the far end is than the near end (matches the room's narrowing).
const PERSPECTIVE = 0.35
// Rows of side face visible below the top face.
const THICKNESS = 2

function insidePolygon([x, z]: FloorPoint, polygon: FloorPoint[]): boolean {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, zi] = polygon[i]
    const [xj, zj] = polygon[j]
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside
  }
  return inside
}

// Maps a map pixel back onto the floor (inverse of the perspective projection),
// or returns null if it lies outside the arrow's depth.
function unproject(px: number, py: number): FloorPoint | null {
  const projectedDepth = (NEAR_Y - (py + 0.5)) / FACE_DEPTH
  if (projectedDepth < 0 || projectedDepth > 1) return null
  const z = projectedDepth / (1 + PERSPECTIVE - PERSPECTIVE * projectedDepth)
  const scale = 1 / (1 + PERSPECTIVE * z)
  const x = 0.5 + (px + 0.5 - MAP_SIZE / 2) / (FACE_WIDTH * scale)
  return [x, z]
}

export function projectArrow(shape: FloorPoint[][]): string[] {
  const top = Array.from({ length: MAP_SIZE }, (_, py) =>
    Array.from({ length: MAP_SIZE }, (_, px) => {
      const point = unproject(px, py)
      return point !== null && shape.some((polygon) => insidePolygon(point, polygon))
    }),
  )
  return top.map((row, py) =>
    row
      .map((isTop, px) => {
        if (isTop) return '#'
        // The arrow's thickness shows below any top-face pixel within THICKNESS rows.
        for (let d = 1; d <= THICKNESS; d++) if (top[py - d]?.[px]) return '+'
        return '.'
      })
      .join(''),
  )
}

const TURN_LEFT_MAP = projectArrow(TURN_LEFT_SHAPE)
const FORWARD_MAP = projectArrow(FORWARD_SHAPE)

export function mirror(map: string[]): string[] {
  return map.map((row) => row.split('').reverse().join(''))
}

const PIXEL_COLOURS: Record<string, string> = { '#': FOREGROUND, '+': FOREGROUND_WORN }

function isFilled(map: string[], x: number, y: number): boolean {
  const cell = map[y]?.[x]
  return cell !== undefined && cell in PIXEL_COLOURS
}

function isOutline(map: string[], x: number, y: number): boolean {
  if (isFilled(map, x, y)) return false
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (isFilled(map, x + dx, y + dy)) return true
    }
  }
  return false
}

// Builds a CSS `cursor` value from a pixel map. The hotspot is given in map
// pixels and defaults to the centre.
export function pixelMapToCursor(
  map: string[],
  fallback: string,
  hotspot: [x: number, y: number] = [map[0].length / 2, map.length / 2],
): string {
  const height = map.length
  const width = map[0].length
  const rects: string[] = []
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const colour = isFilled(map, x, y) ? PIXEL_COLOURS[map[y][x]] : isOutline(map, x, y) ? BACKGROUND : null
      if (colour) {
        rects.push(`<rect x="${x}" y="${y}" width="1" height="1" fill="${colour}"/>`)
      }
    }
  }
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width * PIXEL_SIZE}" height="${height * PIXEL_SIZE}" ` +
    `viewBox="0 0 ${width} ${height}" shape-rendering="crispEdges">${rects.join('')}</svg>`
  const hotspotX = Math.round(hotspot[0] * PIXEL_SIZE)
  const hotspotY = Math.round(hotspot[1] * PIXEL_SIZE)
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") ${hotspotX} ${hotspotY}, ${fallback}`
}

export const CURSOR_MAPS: Record<CursorZone, string[]> = {
  'turn-left': TURN_LEFT_MAP,
  forward: FORWARD_MAP,
  'turn-right': mirror(TURN_LEFT_MAP),
}

export const CURSORS: Record<CursorZone, string> = {
  'turn-left': pixelMapToCursor(CURSOR_MAPS['turn-left'], 'w-resize'),
  forward: pixelMapToCursor(CURSOR_MAPS.forward, 'n-resize'),
  'turn-right': pixelMapToCursor(CURSOR_MAPS['turn-right'], 'e-resize'),
}

// Shown in the centre of the view when there's no way forward.
export const BLOCKED_MAP = projectArrow(BLOCKED_SHAPE)
export const BLOCKED_CURSOR = pixelMapToCursor(BLOCKED_MAP, 'not-allowed')

// A pointing hand for clickable things in the scene. Unlike the arrows it is
// upright rather than lying on the floor; '+' marks the creases between fingers.
export const HAND_MAP = [
  '................',
  '................',
  '....##..........',
  '....+#+.........',
  '.....##+........',
  '.....+##.#+.....',
  '...##.##+##+#+..',
  '...##+##+##+##..',
  '...+##########..',
  '....##########..',
  '.....#########..',
  '......#######+..',
  '.......++++++...',
  '................',
  '................',
  '................',
]

// The hotspot is the tip of the index finger.
export const HAND_CURSOR = pixelMapToCursor(HAND_MAP, 'pointer', [5, 2])
