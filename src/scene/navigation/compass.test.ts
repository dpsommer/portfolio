import { describe, expect, it } from 'vitest'
import { FOREGROUND, FOREGROUND_DIM, FOREGROUND_WORN } from '../core/palette.ts'
import { GLYPH_HEIGHT, textPixels } from '../core/pixelFont.ts'
import type { Pixel } from '../core/types.ts'
import { COMPASS_CENTRE, COMPASS_LETTERS, COMPASS_RADIUS, compassPixels, facedLetter } from './compass.ts'

const LETTER_SCALE = 2
// The camera yaw facing each letter's way.
const YAW: Record<string, number> = Object.fromEntries(COMPASS_LETTERS.map(({ letter, yaw }) => [letter, yaw]))
const LETTERS = COMPASS_LETTERS.map(({ letter }) => letter)
// The four headings and a few yaws part way through a turn.
const SAMPLE_YAWS = [0, Math.PI / 2, Math.PI, -Math.PI / 2, 0.3, Math.PI / 4 - 0.1, 2.5, -2]

const key = ({ x, y }: { x: number; y: number }) => `${x},${y}`
const distance = (p: { x: number; y: number }) => Math.hypot(p.x - COMPASS_CENTRE.x, p.y - COMPASS_CENTRE.y)
// Radians anticlockwise from straight up of `p` around the centre.
const angleOf = (p: { x: number; y: number }) => Math.atan2(-(p.x - COMPASS_CENTRE.x), -(p.y - COMPASS_CENTRE.y))
const angleBetween = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)))
const RING_TOP = COMPASS_CENTRE.y - COMPASS_RADIUS

// The marker: pixels above the ring's top.
const markerOf = (pixels: Pixel[]) => pixels.filter((p) => p.y < RING_TOP)
// Letter pixels lie well inside the ring and outside the ticks' colour.
const letterPixelsOf = (pixels: Pixel[]) =>
  pixels.filter((p) => p.y >= RING_TOP && p.colour !== FOREGROUND_DIM && distance(p) < COMPASS_RADIUS - 4)

// The letter pixels on the side of the centre at screen angle `angle`: letters
// sit well out from the centre, so those 90 degrees round are excluded.
function letterPixelsToward(pixels: Pixel[], angle: number): Pixel[] {
  const dx = -Math.sin(angle)
  const dy = -Math.cos(angle)
  return letterPixelsOf(pixels).filter(
    (p) => (p.x - COMPASS_CENTRE.x) * dx + (p.y - COMPASS_CENTRE.y) * dy > 20,
  )
}

// Positions moved so the top-left of their bounding box is at (0, 0), as keys.
function normalised(points: { x: number; y: number }[]): string[] {
  const left = Math.min(...points.map((p) => p.x))
  const top = Math.min(...points.map((p) => p.y))
  return points.map((p) => key({ x: p.x - left, y: p.y - top })).sort()
}

function centroid(points: { x: number; y: number }[]): { x: number; y: number } {
  return {
    x: points.reduce((sum, p) => sum + p.x, 0) / points.length,
    y: points.reduce((sum, p) => sum + p.y, 0) / points.length,
  }
}

describe('COMPASS_LETTERS', () => {
  it('lists N, W, S and E in left-turn order', () => {
    expect(LETTERS).toEqual(['N', 'W', 'S', 'E'])
  })

  it.each([
    ['N', 0],
    ['W', Math.PI / 2],
    ['S', Math.PI],
    ['E', -Math.PI / 2],
  ])('gives %s the yaw %s', (letter, yaw) => {
    expect(YAW[letter]).toBeCloseTo(yaw)
  })
})

describe('facedLetter', () => {
  it.each(COMPASS_LETTERS.map(({ letter, yaw }) => [letter, yaw] as const))(
    'is %s when facing yaw %s exactly',
    (letter, yaw) => {
      expect(facedLetter(yaw)).toBe(letter)
    },
  )

  it.each([
    ['N', 0.7],
    ['N', -0.7],
    ['W', Math.PI / 4 + 0.1],
    ['W', (3 * Math.PI) / 4 - 0.1],
    ['S', (3 * Math.PI) / 4 + 0.1],
    ['S', -Math.PI + 0.2],
    ['E', -Math.PI / 4 - 0.1],
  ])('is %s when part way through a turn at yaw %s', (letter, yaw) => {
    expect(facedLetter(yaw)).toBe(letter)
  })

  it.each([
    ['N', 2 * Math.PI],
    ['W', (5 * Math.PI) / 2],
    ['E', (3 * Math.PI) / 2],
    ['S', -Math.PI],
    ['W', -(3 * Math.PI) / 2],
    ['N', -4 * Math.PI],
  ])('is %s for yaw %s, beyond a full turn', (letter, yaw) => {
    expect(facedLetter(yaw)).toBe(letter)
  })
})

describe('compassPixels', () => {
  it('keeps every pixel inside the ring or the marker above it', () => {
    for (const yaw of SAMPLE_YAWS) {
      for (const p of compassPixels(yaw)) {
        if (p.y < RING_TOP) continue
        expect(distance(p)).toBeLessThanOrEqual(COMPASS_RADIUS + 1)
      }
    }
  })

  it('uses only the three foreground colours', () => {
    const colours = new Set(compassPixels(0.3).map((p) => p.colour))

    expect([...colours].sort()).toEqual([FOREGROUND, FOREGROUND_DIM, FOREGROUND_WORN].sort())
  })

  describe('ring', () => {
    // The worn pixels near the ring's radius.
    const ringOf = (pixels: Pixel[]) =>
      pixels.filter((p) => p.colour === FOREGROUND_WORN && distance(p) > COMPASS_RADIUS - 2)

    it('is a circle of COMPASS_RADIUS round COMPASS_CENTRE', () => {
      for (const p of ringOf(compassPixels(0))) {
        expect(distance(p)).toBeGreaterThan(COMPASS_RADIUS - 1)
        expect(distance(p)).toBeLessThan(COMPASS_RADIUS + 1)
      }
    })

    it('reaches the top, bottom, left and right of the circle', () => {
      const ring = new Set(ringOf(compassPixels(0)).map(key))
      const { x, y } = COMPASS_CENTRE

      expect(ring.has(key({ x, y: y - COMPASS_RADIUS }))).toBe(true)
      expect(ring.has(key({ x, y: y + COMPASS_RADIUS }))).toBe(true)
      expect(ring.has(key({ x: x - COMPASS_RADIUS, y }))).toBe(true)
      expect(ring.has(key({ x: x + COMPASS_RADIUS, y }))).toBe(true)
    })

    it('has no gaps: every ring pixel touches two others', () => {
      const ring = ringOf(compassPixels(0))
      const keys = new Set(ring.map(key))
      for (const { x, y } of ring) {
        let neighbours = 0
        for (let dx = -1; dx <= 1; dx++) {
          for (let dy = -1; dy <= 1; dy++) {
            if ((dx || dy) && keys.has(key({ x: x + dx, y: y + dy }))) neighbours++
          }
        }
        expect(neighbours).toBeGreaterThanOrEqual(2)
      }
    })

    it('does not repeat pixels', () => {
      const ring = ringOf(compassPixels(0))

      expect(new Set(ring.map(key)).size).toBe(ring.length)
    })

    it('is the same whichever way the camera faces', () => {
      const ring = ringOf(compassPixels(0)).map(key).sort()

      for (const yaw of SAMPLE_YAWS) expect(ringOf(compassPixels(yaw)).map(key).sort()).toEqual(ring)
    })
  })

  describe('marker', () => {
    it('is a downward-pointing triangle centred above the ring', () => {
      const marker = markerOf(compassPixels(0))
      const rows = new Map<number, number[]>()
      for (const p of marker) rows.set(p.y, [...(rows.get(p.y) ?? []), p.x])
      const ys = [...rows.keys()].sort((a, b) => a - b)

      // Widest at the top, narrowing by one pixel each side to a single-pixel tip.
      const widths = ys.map((y) => rows.get(y)!.length)
      expect(widths[widths.length - 1]).toBe(1)
      for (let i = 1; i < widths.length; i++) expect(widths[i]).toBe(widths[i - 1] - 2)
      for (const y of ys) {
        const xs = rows.get(y)!
        expect((Math.min(...xs) + Math.max(...xs)) / 2).toBe(COMPASS_CENTRE.x)
      }
    })

    it('points just above the ring\'s top', () => {
      const tip = Math.max(...markerOf(compassPixels(0)).map((p) => p.y))

      expect(tip).toBeLessThan(RING_TOP)
      expect(tip).toBeGreaterThanOrEqual(RING_TOP - 3)
    })

    it('is drawn in the full foreground colour', () => {
      expect(markerOf(compassPixels(0)).every((p) => p.colour === FOREGROUND)).toBe(true)
    })

    it('stays put whichever way the camera faces', () => {
      const marker = markerOf(compassPixels(0)).map(key).sort()

      for (const yaw of SAMPLE_YAWS) expect(markerOf(compassPixels(yaw)).map(key).sort()).toEqual(marker)
    })

    it('is drawn after the rest, so nothing covers it', () => {
      const pixels = compassPixels(0)
      const marker = markerOf(pixels)

      expect(pixels.slice(-marker.length)).toEqual(marker)
    })
  })

  describe('letters', () => {
    it.each(SAMPLE_YAWS)('draws each letter at its yaw less the camera\'s, from the top (yaw %s)', (yaw) => {
      const pixels = compassPixels(yaw)
      for (const { letter, yaw: letterYaw } of COMPASS_LETTERS) {
        const angle = letterYaw - yaw
        const drawn = letterPixelsToward(pixels, angle)

        expect(normalised(drawn)).toEqual(normalised(textPixels(letter, LETTER_SCALE)))
        expect(angleBetween(angleOf(centroid(drawn)), angle)).toBeLessThan(0.1)
      }
    })

    it('puts N at the top, W on the left, S at the bottom and E on the right facing north', () => {
      const pixels = compassPixels(0)
      const middle = (letter: string) => centroid(letterPixelsToward(pixels, YAW[letter]))

      expect(middle('N').y).toBeLessThan(COMPASS_CENTRE.y)
      expect(middle('S').y).toBeGreaterThan(COMPASS_CENTRE.y)
      expect(middle('W').x).toBeLessThan(COMPASS_CENTRE.x)
      expect(middle('E').x).toBeGreaterThan(COMPASS_CENTRE.x)
    })

    it('turns N to the right and S to the left facing west', () => {
      const pixels = compassPixels(Math.PI / 2)
      const n = centroid(letterPixelsToward(pixels, -Math.PI / 2))
      const s = centroid(letterPixelsToward(pixels, Math.PI / 2))

      expect(normalised(letterPixelsToward(pixels, -Math.PI / 2))).toEqual(normalised(textPixels('N', LETTER_SCALE)))
      expect(normalised(letterPixelsToward(pixels, Math.PI / 2))).toEqual(normalised(textPixels('S', LETTER_SCALE)))
      expect(n.x).toBeGreaterThan(COMPASS_CENTRE.x)
      expect(s.x).toBeLessThan(COMPASS_CENTRE.x)
    })

    it.each(LETTERS)('puts %s straight above the centre when facing its way', (letter) => {
      const drawn = letterPixelsToward(compassPixels(YAW[letter]), 0)
      const xs = drawn.map((p) => p.x)

      expect(normalised(drawn)).toEqual(normalised(textPixels(letter, LETTER_SCALE)))
      expect(Math.abs((Math.min(...xs) + Math.max(...xs)) / 2 - COMPASS_CENTRE.x)).toBeLessThanOrEqual(0.5)
    })

    it('keeps the letters upright and full size as the rose turns', () => {
      const pixels = compassPixels(0.6)
      for (const { letter, yaw } of COMPASS_LETTERS) {
        const drawn = letterPixelsToward(pixels, yaw - 0.6)
        const ys = drawn.map((p) => p.y)
        expect(Math.max(...ys) - Math.min(...ys) + 1).toBe(GLYPH_HEIGHT * LETTER_SCALE)
        expect(normalised(drawn)).toEqual(normalised(textPixels(letter, LETTER_SCALE)))
      }
    })

    it.each(SAMPLE_YAWS)('draws only the faced letter in the full foreground colour (yaw %s)', (yaw) => {
      const pixels = compassPixels(yaw)
      const faced = facedLetter(yaw)
      for (const { letter, yaw: letterYaw } of COMPASS_LETTERS) {
        const colours = new Set(letterPixelsToward(pixels, letterYaw - yaw).map((p) => p.colour))
        expect([...colours]).toEqual([letter === faced ? FOREGROUND : FOREGROUND_WORN])
      }
    })

    it('draws the faced letter and the marker as the only full foreground pixels', () => {
      const pixels = compassPixels(0)
      const bright = pixels.filter((p) => p.colour === FOREGROUND)

      expect(bright).toHaveLength(textPixels('N', LETTER_SCALE).length + markerOf(pixels).length)
    })

    it('swaps the bright letter as a turn passes the half-way point', () => {
      const before = compassPixels(Math.PI / 4 - 0.05)
      const after = compassPixels(Math.PI / 4 + 0.05)
      const brightLetter = (pixels: Pixel[]) =>
        normalised(letterPixelsOf(pixels).filter((p) => p.colour === FOREGROUND))

      expect(brightLetter(before)).toEqual(normalised(textPixels('N', LETTER_SCALE)))
      expect(brightLetter(after)).toEqual(normalised(textPixels('W', LETTER_SCALE)))
    })
  })

  describe('ticks', () => {
    const ticksOf = (pixels: Pixel[]) => pixels.filter((p) => p.colour === FOREGROUND_DIM)

    it.each(SAMPLE_YAWS)('sit inside the ring half-way between the letters (yaw %s)', (yaw) => {
      const ticks = ticksOf(compassPixels(yaw))
      const between = COMPASS_LETTERS.map(({ yaw: letterYaw }) => letterYaw + Math.PI / 4 - yaw)

      expect(ticks.length).toBeGreaterThan(0)
      for (const p of ticks) {
        expect(distance(p)).toBeLessThan(COMPASS_RADIUS)
        expect(distance(p)).toBeGreaterThan(COMPASS_RADIUS - 12)
        expect(Math.min(...between.map((angle) => angleBetween(angleOf(p), angle)))).toBeLessThan(0.15)
      }
    })

    it('draws one tick in each gap between letters', () => {
      const ticks = ticksOf(compassPixels(0))
      for (const { yaw } of COMPASS_LETTERS) {
        const angle = yaw + Math.PI / 4
        expect(ticks.some((p) => angleBetween(angleOf(p), angle) < 0.15)).toBe(true)
      }
    })
  })
})
