import { linePoints } from '../core/line.ts'
import { FOREGROUND, FOREGROUND_DIM, FOREGROUND_WORN } from '../core/palette.ts'
import { GLYPH_HEIGHT, textPixels, textWidth } from '../core/pixelFont.ts'
import type { Pixel } from '../core/types.ts'

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
// COMPASS_RADIUS and a worn inner one BEZEL_WIDTH in, ending in a scroll at
// each end. Notches between the arcs turn with the rose, one every NOTCH_STEP.
const BEZEL_WIDTH = 4
const NOTCH_STEP = Math.PI / 8
// The bezel's end scrolls: their starting radius, where they finish, and how
// far round (radians) they curl.
const SCROLL_RADIUS = 6
const SCROLL_END_RADIUS = 1.5
const SCROLL_SWEEP = Math.PI * 1.6
// The rose inside the bezel: a hub arc, a kite-shaped point at each
// intercardinal and a diamond bead above each letter. They turn with it.
const HUB_RADIUS = 22
const POINT_BASE = 24
const POINT_SHOULDER = 32
const POINT_TIP = 49
const POINT_HALF_WIDTH = 4
const BEAD_RADIUS = 48.5
const BEAD_HALF_SIZE = 2
// How far in from the ring the letters' centres sit.
const LETTER_RADIUS = 38
const LETTER_SCALE = 2
// The marker is a diamond, like the mirror's crest, just above the ring's top,
// with a curl either side resting on the ring.
const MARKER_GAP = 2
const MARKER_HALF_WIDTH = 4
const CURL_OFFSET = 9
const CURL_RADIUS = 4
const CURL_END_RADIUS = 1.5
const CURL_SWEEP = Math.PI * 1.6

type Point = { x: number; y: number }

// Each letter's direction as a camera yaw (radians anticlockwise from north).
export const COMPASS_LETTERS = [
  { letter: 'N', yaw: 0 },
  { letter: 'W', yaw: Math.PI / 2 },
  { letter: 'S', yaw: Math.PI },
  { letter: 'E', yaw: -Math.PI / 2 },
] as const

// Where a direction at `angle` radians anticlockwise from straight up lands at
// `radius` from the centre.
function onRose(angle: number, radius: number): Point {
  return {
    x: COMPASS_CENTRE.x - Math.sin(angle) * radius,
    y: COMPASS_CENTRE.y - Math.cos(angle) * radius,
  }
}

// `angle` wrapped to −π…π.
function wrapAngle(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle))
}

// Whether a pixel lies within COMPASS_WINDOW of the top, so it shows.
function inWindow({ x, y }: Point): boolean {
  return Math.abs(Math.atan2(-(x - COMPASS_CENTRE.x), -(y - COMPASS_CENTRE.y))) < COMPASS_WINDOW
}

// The pixels of a line through `points`, each drawn once.
function strokePixels(points: Point[], colour: string): Pixel[] {
  const seen = new Set<string>()
  return points.slice(1).flatMap((end, i) =>
    linePoints(points[i].x, points[i].y, end.x, end.y).flatMap((p) => {
      const key = `${p.x},${p.y}`
      if (seen.has(key)) return []
      seen.add(key)
      return [{ ...p, colour }]
    }),
  )
}

// Points along a spiral around `centre`, from angle `from` to `to` (radians,
// clockwise on screen from +x) as the radius goes from `r0` to `r1`, like the
// mirror's scrolls. A circular arc when the radii match.
function spiral(centre: Point, r0: number, r1: number, from: number, to: number): Point[] {
  const steps = Math.max(2, Math.ceil(Math.abs(to - from) * Math.max(r0, r1)))
  return Array.from({ length: steps + 1 }, (_, i) => {
    const k = i / steps
    const angle = from + (to - from) * k
    const r = r0 + (r1 - r0) * k
    return { x: centre.x + r * Math.cos(angle), y: centre.y + r * Math.sin(angle) }
  })
}

// An arc of `radius` across the window at the top.
function arcPoints(radius: number): Point[] {
  const steps = Math.ceil(2 * COMPASS_WINDOW * radius)
  return Array.from({ length: steps + 1 }, (_, i) => onRose(-COMPASS_WINDOW + (i / steps) * 2 * COMPASS_WINDOW, radius))
}

// `points` reflected across the compass's vertical centre line.
const reflected = (points: Point[]) => points.map(({ x, y }) => ({ x: 2 * COMPASS_CENTRE.x - x, y }))

// The bezel: a bright outer arc and a worn inner one, and a bright scroll at
// each end where the outer arc rolls under, round the inner arc's end.
function bezelPixels(): Pixel[] {
  const end = onRose(-COMPASS_WINDOW, COMPASS_RADIUS)
  // Outwards from the centre at the right-hand end.
  const out = { x: Math.sin(COMPASS_WINDOW), y: -Math.cos(COMPASS_WINDOW) }
  const centre = { x: end.x - out.x * SCROLL_RADIUS, y: end.y - out.y * SCROLL_RADIUS }
  const from = Math.atan2(out.y, out.x)
  const scroll = spiral(centre, SCROLL_RADIUS, SCROLL_END_RADIUS, from, from + SCROLL_SWEEP)
  return [
    ...strokePixels(arcPoints(COMPASS_RADIUS - BEZEL_WIDTH), FOREGROUND_WORN),
    ...strokePixels(arcPoints(COMPASS_RADIUS), FOREGROUND),
    ...strokePixels(scroll, FOREGROUND),
    ...strokePixels(reflected(scroll), FOREGROUND),
  ]
}

// Notches across the bezel that turn with the rose: long bright ones at the
// letters, shorter worn ones half-way between and dim pips between those.
function notchPixels(yaw: number): Pixel[] {
  const pixels: Pixel[] = []
  for (let index = 0; index < (2 * Math.PI) / NOTCH_STEP; index++) {
    const angle = wrapAngle(index * NOTCH_STEP - yaw)
    if (Math.abs(angle) >= COMPASS_WINDOW) continue
    const length = index % 4 === 0 ? 3 : index % 2 === 0 ? 2 : 1
    const colour = index % 4 === 0 ? FOREGROUND : index % 2 === 0 ? FOREGROUND_WORN : FOREGROUND_DIM
    pixels.push(...strokePixels([onRose(angle, COMPASS_RADIUS - 1), onRose(angle, COMPASS_RADIUS - length)], colour))
  }
  return pixels
}

// The rose inside the bezel, turned `yaw`: a dim hub arc, a worn kite at each
// intercardinal with a dim line down its middle, and a worn diamond bead above
// each letter. It's cut off at the window's edges, under the end scrolls.
function rosePixels(yaw: number): Pixel[] {
  const hub = strokePixels(arcPoints(HUB_RADIUS), FOREGROUND_DIM)
  const parts = COMPASS_LETTERS.flatMap(({ yaw: letterYaw }) => {
    const angle = wrapAngle(letterYaw - yaw)
    const between = angle - Math.PI / 4
    // Sideways from the point's middle line.
    const side = { x: -Math.cos(between) * POINT_HALF_WIDTH, y: Math.sin(between) * POINT_HALF_WIDTH }
    const shoulder = onRose(between, POINT_SHOULDER)
    const tip = onRose(between, POINT_TIP)
    const base = onRose(between, POINT_BASE)
    const kite = [
      base,
      { x: shoulder.x + side.x, y: shoulder.y + side.y },
      tip,
      { x: shoulder.x - side.x, y: shoulder.y - side.y },
      base,
    ]
    const bead = onRose(angle, BEAD_RADIUS)
    const diamond = [
      { x: bead.x, y: bead.y - BEAD_HALF_SIZE },
      { x: bead.x + BEAD_HALF_SIZE, y: bead.y },
      { x: bead.x, y: bead.y + BEAD_HALF_SIZE },
      { x: bead.x - BEAD_HALF_SIZE, y: bead.y },
      { x: bead.x, y: bead.y - BEAD_HALF_SIZE },
    ]
    return [
      ...strokePixels([base, tip], FOREGROUND_DIM),
      ...strokePixels(kite, FOREGROUND_WORN),
      ...strokePixels(diamond, FOREGROUND_WORN),
    ]
  })
  return [...hub, ...parts.filter(inWindow)]
}

// The fixed marker: a bright diamond above the ring's top, and a worn curl
// either side resting on the ring, like the mirror's crest.
function markerPixels(): Pixel[] {
  const bottom = COMPASS_CENTRE.y - COMPASS_RADIUS - MARKER_GAP
  const { x } = COMPASS_CENTRE
  const diamond = [
    { x, y: bottom },
    { x: x + MARKER_HALF_WIDTH, y: bottom - MARKER_HALF_WIDTH },
    { x, y: bottom - 2 * MARKER_HALF_WIDTH },
    { x: x - MARKER_HALF_WIDTH, y: bottom - MARKER_HALF_WIDTH },
    { x, y: bottom },
  ]
  // The ring's height under the curl, so the curl's lowest point rests on it.
  const ringY = COMPASS_CENTRE.y - Math.sqrt(COMPASS_RADIUS ** 2 - CURL_OFFSET ** 2)
  // Each curl starts at its bottom, on the ring, and rolls up and over
  // towards the diamond.
  const curl = spiral(
    { x: x + CURL_OFFSET, y: ringY - CURL_RADIUS - 1 },
    CURL_RADIUS,
    CURL_END_RADIUS,
    Math.PI / 2,
    Math.PI / 2 - CURL_SWEEP,
  )
  return [
    ...strokePixels(curl, FOREGROUND_WORN),
    ...strokePixels(reflected(curl), FOREGROUND_WORN),
    ...strokePixels(diamond, FOREGROUND),
  ]
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
  return [...rosePixels(yaw), ...bezelPixels(), ...notchPixels(yaw), ...letters, ...markerPixels()]
}
