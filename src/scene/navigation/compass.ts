import { linePoints } from '../core/line.ts'
import { FOREGROUND, FOREGROUND_DIM, FOREGROUND_WORN } from '../core/palette.ts'
import { GLYPH_HEIGHT, textPixels, textWidth } from '../core/pixelFont.ts'
import type { Pixel } from '../core/types.ts'

// A compass rose in the navigation panel. The rose turns with the camera so the
// letter for the way the visitor faces sits at the top, under a fixed marker.
// Coordinates are panel canvas pixels.
export const COMPASS_CENTRE = { x: 78, y: 80 }
export const COMPASS_RADIUS = 56
// How far in from the ring the letters' centres sit.
const LETTER_RADIUS = 40
const LETTER_SCALE = 2
// Ticks between the letters run inward from the ring this far.
const TICK_LENGTH = 6
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

function ringPixels(): Pixel[] {
  const seen = new Set<string>()
  const pixels: Pixel[] = []
  const steps = Math.ceil(2 * Math.PI * COMPASS_RADIUS * 2)
  for (let i = 0; i < steps; i++) {
    const { x, y } = onRose((i / steps) * 2 * Math.PI, COMPASS_RADIUS)
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
  const offset = (letterYaw: number) => Math.abs(Math.atan2(Math.sin(letterYaw - yaw), Math.cos(letterYaw - yaw)))
  return COMPASS_LETTERS.reduce((best, entry) => (offset(entry.yaw) < offset(best.yaw) ? entry : best)).letter
}

// Pixels for the compass with the camera turned `yaw` radians left of north.
// Each letter is drawn at `letterYaw − yaw` from the top, so the faced one is
// on top. Letters move round the rose but stay upright, so they stay crisp.
export function compassPixels(yaw: number): Pixel[] {
  const faced = facedLetter(yaw)
  const letters = COMPASS_LETTERS.flatMap(({ letter, yaw: letterYaw }) => {
    const centre = onRose(letterYaw - yaw, LETTER_RADIUS)
    const left = Math.round(centre.x - textWidth(letter, LETTER_SCALE) / 2)
    const top = Math.round(centre.y - (GLYPH_HEIGHT * LETTER_SCALE) / 2)
    const colour = letter === faced ? FOREGROUND : FOREGROUND_WORN
    return textPixels(letter, LETTER_SCALE).map((p) => ({ x: left + p.x, y: top + p.y, colour }))
  })
  const ticks = COMPASS_LETTERS.flatMap(({ yaw: letterYaw }) => {
    const angle = letterYaw + Math.PI / 4 - yaw
    const outer = onRose(angle, COMPASS_RADIUS - 2)
    const inner = onRose(angle, COMPASS_RADIUS - 2 - TICK_LENGTH)
    return linePoints(outer.x, outer.y, inner.x, inner.y).map((p) => ({ ...p, colour: FOREGROUND_DIM }))
  })
  return [...ringPixels(), ...ticks, ...letters, ...markerPixels()]
}
