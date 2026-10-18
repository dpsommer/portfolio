import { linePoints } from '../core/line.ts'
import { FOREGROUND, FOREGROUND_DIM, FOREGROUND_WORN } from '../core/palette.ts'
import { GLYPH_HEIGHT, textPixels, textWidth } from '../core/pixelFont.ts'
import { hashRandom } from '../core/random.ts'
import type { Pixel } from '../core/types.ts'
import { weather } from '../panels/panelCanvas.ts'

// A compass in the navigation panel. It's a rose that turns with the camera so
// the letter for the way the visitor faces sits at the top, under a fixed
// marker, but only the top of it shows: an arc of its bezel and the letters
// within COMPASS_WINDOW of the top. At rest that's just the faced letter;
// during a turn it slides away round the arc as the next one slides in.
// Coordinates are panel canvas pixels. The rose's centre is below what's drawn.
export const COMPASS_CENTRE = { x: 78, y: 104 }
export const COMPASS_RADIUS = 56
// How far either side of the top (radians) the arc runs and letters show.
export const COMPASS_WINDOW = Math.PI / 3
// The bezel is a band like the pane's frame: a bright outer arc at
// COMPASS_RADIUS and a worn inner one BEZEL_WIDTH in, closed at both ends.
// Notches between them turn with the rose, one every NOTCH_STEP.
const BEZEL_WIDTH = 4
const NOTCH_STEP = Math.PI / 8
// How far in from the ring the letters' centres sit.
const LETTER_RADIUS = 40
const LETTER_SCALE = 2
// Seeds for each part's wear, so it stays put from frame to frame.
const BEZEL_SEED = 31
const NOTCH_SEED = 37
const LETTER_SEED = 41
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

// An arc of `radius` across the window at the top.
function arcPoints(radius: number): { x: number; y: number }[] {
  const seen = new Set<string>()
  const points: { x: number; y: number }[] = []
  const steps = Math.ceil(2 * COMPASS_WINDOW * radius * 2)
  for (let i = 0; i <= steps; i++) {
    const { x, y } = onRose(-COMPASS_WINDOW + (i / steps) * 2 * COMPASS_WINDOW, radius)
    const point = { x: Math.round(x), y: Math.round(y) }
    const key = `${point.x},${point.y}`
    if (seen.has(key)) continue
    seen.add(key)
    points.push(point)
  }
  return points
}

// The bezel: weathered outer and inner arcs, and lines closing their ends.
function bezelPixels(): Pixel[] {
  const ends = [-COMPASS_WINDOW, COMPASS_WINDOW].flatMap((angle) => {
    const outer = onRose(angle, COMPASS_RADIUS)
    const inner = onRose(angle, COMPASS_RADIUS - BEZEL_WIDTH)
    return linePoints(outer.x, outer.y, inner.x, inner.y)
  })
  const parts: [{ x: number; y: number }[], string][] = [
    [arcPoints(COMPASS_RADIUS), FOREGROUND],
    [arcPoints(COMPASS_RADIUS - BEZEL_WIDTH), FOREGROUND_WORN],
    [ends, FOREGROUND_WORN],
  ]
  return parts.flatMap(([points, colour]) =>
    points.flatMap((p) => {
      const weathered = weather(colour, hashRandom(BEZEL_SEED, p.x, p.y), 0.04, 0.2)
      return weathered ? [{ ...p, colour: weathered }] : []
    }),
  )
}

// Notches across the bezel that turn with the rose: long ones at the letters,
// shorter ones half-way between and pips between those. Each is worn by its
// place on the rose, so it keeps its look as it turns.
function notchPixels(yaw: number): Pixel[] {
  const pixels: Pixel[] = []
  for (let index = 0; index < (2 * Math.PI) / NOTCH_STEP; index++) {
    const angle = wrapAngle(index * NOTCH_STEP - yaw)
    if (Math.abs(angle) >= COMPASS_WINDOW) continue
    const length = index % 4 === 0 ? 3 : index % 2 === 0 ? 2 : 1
    const colour = index % 4 === 0 ? FOREGROUND : index % 2 === 0 ? FOREGROUND_WORN : FOREGROUND_DIM
    const outer = onRose(angle, COMPASS_RADIUS - 1)
    const inner = onRose(angle, COMPASS_RADIUS - length)
    linePoints(outer.x, outer.y, inner.x, inner.y).forEach((p, step) => {
      const weathered = weather(colour, hashRandom(NOTCH_SEED, index, step), 0.05, 0.15)
      if (weathered) pixels.push({ ...p, colour: weathered })
    })
  }
  return pixels
}

function markerPixels(): Pixel[] {
  const tipY = COMPASS_CENTRE.y - COMPASS_RADIUS - MARKER_GAP
  const pixels: Pixel[] = []
  for (let row = 0; row <= MARKER_HALF_WIDTH; row++) {
    for (let dx = -row; dx <= row; dx++) {
      // A worn edge on its upper side, like the bevel on the pane's frame.
      const colour = row === MARKER_HALF_WIDTH || dx === -row ? FOREGROUND_WORN : FOREGROUND
      pixels.push({ x: COMPASS_CENTRE.x + dx, y: tipY - row, colour })
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
// stay upright, so they stay crisp, and are worn by their own pixels, so the
// wear moves with them.
export function compassPixels(yaw: number): Pixel[] {
  const faced = facedLetter(yaw)
  const letters = COMPASS_LETTERS.flatMap(({ letter, yaw: letterYaw }) => {
    const angle = wrapAngle(letterYaw - yaw)
    if (Math.abs(angle) >= COMPASS_WINDOW) return []
    const centre = onRose(angle, LETTER_RADIUS)
    const left = Math.round(centre.x - textWidth(letter, LETTER_SCALE) / 2)
    const top = Math.round(centre.y - (GLYPH_HEIGHT * LETTER_SCALE) / 2)
    const colour = letter === faced ? FOREGROUND : FOREGROUND_WORN
    return textPixels(letter, LETTER_SCALE).flatMap((p) => {
      const weathered = weather(colour, hashRandom(LETTER_SEED, letter.charCodeAt(0), p.x, p.y), 0.04, 0.2)
      return weathered ? [{ x: left + p.x, y: top + p.y, colour: weathered }] : []
    })
  })
  return [...bezelPixels(), ...notchPixels(yaw), ...letters, ...markerPixels()]
}
