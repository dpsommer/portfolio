import { FOREGROUND, FOREGROUND_WORN } from '../core/palette.ts'
import { GLYPH_HEIGHT, textPixels, textWidth } from '../core/pixelFont.ts'
import type { Pixel } from '../core/types.ts'

// A compass in the navigation panel. It's a rose that turns with the camera so
// the letter for the way the visitor faces sits at the top, under a fixed
// marker, but only the top of it shows: an arc of the ring and the letters
// within COMPASS_WINDOW of the top. At rest that's just the faced letter;
// during a turn it slides away round the arc as the next one slides in.
// Coordinates are panel canvas pixels. The rose's centre is below what's drawn.
export const COMPASS_CENTRE = { x: 78, y: 104 }
export const COMPASS_RADIUS = 56
// How far either side of the top (radians) the arc runs and letters show.
export const COMPASS_WINDOW = Math.PI / 3
// How far in from the ring the letters' centres sit.
const LETTER_RADIUS = 40
const LETTER_SCALE = 2
// The marker is a downward-pointing triangle just above the ring's top.
const MARKER_GAP = 2
const MARKER_HALF_WIDTH = 4

// Each letter's direction as a camera yaw (radians anticlockwise from north).
export const COMPASS_LETTERS = [
  { letter: 'N', yaw: 0 },
  { letter: 'W', yaw: Math.PI / 2 },
  { letter: 'S', yaw: Math.PI },
  { letter: 'E', yaw: -Math.PI / 2 },
] as const

// Where a direction at `angle` radians anticlockwise from straight up lands at
// `radius` from the centre.
function onRose(angle: number, radius: number): { x: number; y: number } {
  return {
    x: COMPASS_CENTRE.x - Math.sin(angle) * radius,
    y: COMPASS_CENTRE.y - Math.cos(angle) * radius,
  }
}

// `angle` wrapped to −π…π.
function wrapAngle(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle))
}

// The ring's arc across the window at the top.
function arcPixels(): Pixel[] {
  const seen = new Set<string>()
  const pixels: Pixel[] = []
  const steps = Math.ceil(2 * COMPASS_WINDOW * COMPASS_RADIUS * 2)
  for (let i = 0; i <= steps; i++) {
    const { x, y } = onRose(-COMPASS_WINDOW + (i / steps) * 2 * COMPASS_WINDOW, COMPASS_RADIUS)
    const point = { x: Math.round(x), y: Math.round(y) }
    const key = `${point.x},${point.y}`
    if (seen.has(key)) continue
    seen.add(key)
    pixels.push({ ...point, colour: FOREGROUND_WORN })
  }
  return pixels
}

function markerPixels(): Pixel[] {
  const tipY = COMPASS_CENTRE.y - COMPASS_RADIUS - MARKER_GAP
  const pixels: Pixel[] = []
  for (let row = 0; row <= MARKER_HALF_WIDTH; row++) {
    for (let dx = -row; dx <= row; dx++) {
      pixels.push({ x: COMPASS_CENTRE.x + dx, y: tipY - row, colour: FOREGROUND })
    }
  }
  return pixels
}

// The letter whose direction is nearest the way the camera faces.
export function facedLetter(yaw: number): string {
  const offset = (letterYaw: number) => Math.abs(wrapAngle(letterYaw - yaw))
  return COMPASS_LETTERS.reduce((best, entry) => (offset(entry.yaw) < offset(best.yaw) ? entry : best)).letter
}

// Pixels for the compass with the camera turned `yaw` radians left of north.
// Each letter is at `letterYaw − yaw` from the top, so the faced one is on
// top, and is drawn only inside the window. Letters move round the rose but
// stay upright, so they stay crisp.
export function compassPixels(yaw: number): Pixel[] {
  const faced = facedLetter(yaw)
  const letters = COMPASS_LETTERS.flatMap(({ letter, yaw: letterYaw }) => {
    const angle = wrapAngle(letterYaw - yaw)
    if (Math.abs(angle) >= COMPASS_WINDOW) return []
    const centre = onRose(angle, LETTER_RADIUS)
    const left = Math.round(centre.x - textWidth(letter, LETTER_SCALE) / 2)
    const top = Math.round(centre.y - (GLYPH_HEIGHT * LETTER_SCALE) / 2)
    const colour = letter === faced ? FOREGROUND : FOREGROUND_WORN
    return textPixels(letter, LETTER_SCALE).map((p) => ({ x: left + p.x, y: top + p.y, colour }))
  })
  return [...arcPixels(), ...letters, ...markerPixels()]
}
