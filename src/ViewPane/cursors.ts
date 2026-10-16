export type CursorZone = 'turn-left' | 'forward' | 'turn-right'

// Fraction of the pane's width at each side that turns the viewer.
export const EDGE_ZONE_FRACTION = 0.25

const FILL = '#f2efe6'
const OUTLINE = '#0d0d0d'
const PIXEL_SIZE = 2

// Maps the horizontal position within the pane (0 = left edge, 1 = right edge) to a zone.
export function getCursorZone(fraction: number): CursorZone {
  if (fraction < EDGE_ZONE_FRACTION) return 'turn-left'
  if (fraction > 1 - EDGE_ZONE_FRACTION) return 'turn-right'
  return 'forward'
}

// Pixel maps are 16×16 grids where '#' is a filled pixel and '.' is transparent.
// Outlines are generated, so fills must leave a 1-pixel transparent border.
const TURN_LEFT_MAP = [
  '................',
  '.....#..........',
  '....##..........',
  '...###..........',
  '..##########....',
  '.############...',
  '..############..',
  '...###.....###..',
  '....##.....###..',
  '.....#.....###..',
  '...........###..',
  '...........###..',
  '...........###..',
  '...........###..',
  '...........###..',
  '................',
]

const FORWARD_MAP = [
  '................',
  '.......##.......',
  '......####......',
  '.....######.....',
  '....########....',
  '...##########...',
  '..############..',
  '......####......',
  '......####......',
  '......####......',
  '......####......',
  '......####......',
  '......####......',
  '......####......',
  '......####......',
  '................',
]

export function mirror(map: string[]): string[] {
  return map.map((row) => row.split('').reverse().join(''))
}

function isFilled(map: string[], x: number, y: number): boolean {
  return map[y]?.[x] === '#'
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

// Builds a CSS `cursor` value from a pixel map, with the hotspot at the centre.
export function pixelMapToCursor(map: string[], fallback: string): string {
  const height = map.length
  const width = map[0].length
  const rects: string[] = []
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const colour = isFilled(map, x, y) ? FILL : isOutline(map, x, y) ? OUTLINE : null
      if (colour) {
        rects.push(`<rect x="${x}" y="${y}" width="1" height="1" fill="${colour}"/>`)
      }
    }
  }
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width * PIXEL_SIZE}" height="${height * PIXEL_SIZE}" ` +
    `viewBox="0 0 ${width} ${height}" shape-rendering="crispEdges">${rects.join('')}</svg>`
  const hotspotX = (width * PIXEL_SIZE) / 2
  const hotspotY = (height * PIXEL_SIZE) / 2
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
