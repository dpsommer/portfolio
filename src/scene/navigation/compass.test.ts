import { describe, expect, it } from 'vitest'
import { FOREGROUND, FOREGROUND_WORN } from '../core/palette.ts'
import { GLYPH_HEIGHT, textPixels } from '../core/pixelFont.ts'
import type { Pixel } from '../core/types.ts'
import {
  COMPASS_CENTRE,
  COMPASS_LETTERS,
  COMPASS_RADIUS,
  COMPASS_WINDOW,
  compassPixels,
  facedLetter,
} from './compass.ts'

const LETTER_SCALE = 2
// The lower panel's drawing size, which the compass must fit in.
const PANEL_WIDTH = 320
const PANEL_HEIGHT = 132
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
// The arc: the pixels near the ring's radius, below the marker.
const arcOf = (pixels: Pixel[]) => pixels.filter((p) => p.y >= RING_TOP && distance(p) > COMPASS_RADIUS - 2)
// Letter pixels lie well inside the ring.
const letterPixelsOf = (pixels: Pixel[]) => pixels.filter((p) => p.y >= RING_TOP && distance(p) < COMPASS_RADIUS - 4)
// `angle` wrapped to −π…π.
const wrap = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle))
// The letters that should show at `yaw`, with their angle from the top.
const visibleLetters = (yaw: number) =>
  COMPASS_LETTERS.map(({ letter, yaw: letterYaw }) => ({ letter, angle: wrap(letterYaw - yaw) })).filter(
    ({ angle }) => Math.abs(angle) < COMPASS_WINDOW,
  )

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

describe('COMPASS_WINDOW', () => {
  it('is a sixth of a turn either side of the top', () => {
    expect(COMPASS_WINDOW).toBeCloseTo(Math.PI / 3)
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

  it('fits inside the lower panel', () => {
    for (const yaw of SAMPLE_YAWS) {
      for (const p of compassPixels(yaw)) {
        expect(p.x).toBeGreaterThanOrEqual(0)
        expect(p.x).toBeLessThan(PANEL_WIDTH)
        expect(p.y).toBeGreaterThanOrEqual(0)
        expect(p.y).toBeLessThan(PANEL_HEIGHT)
      }
    }
  })

  it.each(SAMPLE_YAWS)('uses only the full and worn foreground colours (yaw %s)', (yaw) => {
    const colours = new Set(compassPixels(yaw).map((p) => p.colour))

    expect([...colours].sort()).toEqual([FOREGROUND, FOREGROUND_WORN].sort())
  })

  describe('arc', () => {
    it('lies on a circle of COMPASS_RADIUS round COMPASS_CENTRE', () => {
      const arc = arcOf(compassPixels(0))

      expect(arc.length).toBeGreaterThan(0)
      for (const p of arc) {
        expect(distance(p)).toBeGreaterThan(COMPASS_RADIUS - 1)
        expect(distance(p)).toBeLessThan(COMPASS_RADIUS + 1)
      }
    })

    it('is drawn in the worn foreground colour', () => {
      expect(arcOf(compassPixels(0)).every((p) => p.colour === FOREGROUND_WORN)).toBe(true)
    })

    it('stays within COMPASS_WINDOW of the top', () => {
      for (const p of arcOf(compassPixels(0))) {
        expect(Math.abs(angleOf(p))).toBeLessThanOrEqual(COMPASS_WINDOW + 0.03)
      }
    })

    it('runs from one end of the window, through the top, to the other', () => {
      const arc = new Set(arcOf(compassPixels(0)).map(key))
      const at = (angle: number) =>
        key({
          x: Math.round(COMPASS_CENTRE.x - Math.sin(angle) * COMPASS_RADIUS),
          y: Math.round(COMPASS_CENTRE.y - Math.cos(angle) * COMPASS_RADIUS),
        })

      expect(arc.has(at(0))).toBe(true)
      expect(arc.has(at(COMPASS_WINDOW))).toBe(true)
      expect(arc.has(at(-COMPASS_WINDOW))).toBe(true)
    })

    it('is symmetric about the top', () => {
      const arc = arcOf(compassPixels(0))
      const mirrored = arc.map((p) => key({ x: 2 * COMPASS_CENTRE.x - p.x, y: p.y })).sort()

      expect(mirrored).toEqual(arc.map(key).sort())
    })

    it('has no gaps: every pixel touches another and the arc is all one piece', () => {
      const arc = arcOf(compassPixels(0))
      const keys = new Set(arc.map(key))
      const neighbours = ({ x, y }: { x: number; y: number }) => {
        const found: string[] = []
        for (let dx = -1; dx <= 1; dx++) {
          for (let dy = -1; dy <= 1; dy++) {
            const k = key({ x: x + dx, y: y + dy })
            if ((dx || dy) && keys.has(k)) found.push(k)
          }
        }
        return found
      }
      for (const p of arc) expect(neighbours(p).length).toBeGreaterThanOrEqual(1)

      const reached = new Set([key(arc[0])])
      const queue: { x: number; y: number }[] = [arc[0]]
      while (queue.length) {
        for (const k of neighbours(queue.pop()!)) {
          if (reached.has(k)) continue
          reached.add(k)
          const [x, y] = k.split(',').map(Number)
          queue.push({ x, y })
        }
      }
      expect(reached.size).toBe(keys.size)
    })

    it('does not repeat pixels', () => {
      const arc = arcOf(compassPixels(0))

      expect(new Set(arc.map(key)).size).toBe(arc.length)
    })

    it('is the same whichever way the camera faces', () => {
      const arc = arcOf(compassPixels(0)).map(key).sort()

      for (const yaw of SAMPLE_YAWS) expect(arcOf(compassPixels(yaw)).map(key).sort()).toEqual(arc)
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
    it.each(SAMPLE_YAWS)('draws only the letters within COMPASS_WINDOW of the top (yaw %s)', (yaw) => {
      const visible = visibleLetters(yaw)
      const expected = visible.reduce((sum, { letter }) => sum + textPixels(letter, LETTER_SCALE).length, 0)

      expect(visible.length).toBeGreaterThan(0)
      expect(letterPixelsOf(compassPixels(yaw))).toHaveLength(expected)
    })

    it.each(SAMPLE_YAWS)('draws each shown letter at its yaw less the camera\'s, from the top (yaw %s)', (yaw) => {
      const pixels = compassPixels(yaw)
      for (const { letter, angle } of visibleLetters(yaw)) {
        const drawn = letterPixelsToward(pixels, angle)

        expect(normalised(drawn)).toEqual(normalised(textPixels(letter, LETTER_SCALE)))
        expect(angleBetween(angleOf(centroid(drawn)), angle)).toBeLessThan(0.1)
      }
    })

    it.each(LETTERS)('draws only %s, straight above the centre, when facing its way', (letter) => {
      const pixels = compassPixels(YAW[letter])
      const drawn = letterPixelsOf(pixels)
      const xs = drawn.map((p) => p.x)

      expect(normalised(drawn)).toEqual(normalised(textPixels(letter, LETTER_SCALE)))
      expect(centroid(drawn).y).toBeLessThan(COMPASS_CENTRE.y)
      expect(Math.abs((Math.min(...xs) + Math.max(...xs)) / 2 - COMPASS_CENTRE.x)).toBeLessThanOrEqual(0.5)
      expect(drawn.every((p) => p.colour === FOREGROUND)).toBe(true)
    })

    it('shows N and W either side of the top half-way through a left turn from north', () => {
      const pixels = compassPixels(Math.PI / 4)
      const n = letterPixelsToward(pixels, -Math.PI / 4)
      const w = letterPixelsToward(pixels, Math.PI / 4)

      expect(normalised(n)).toEqual(normalised(textPixels('N', LETTER_SCALE)))
      expect(normalised(w)).toEqual(normalised(textPixels('W', LETTER_SCALE)))
      expect(centroid(n).x).toBeGreaterThan(COMPASS_CENTRE.x)
      expect(centroid(w).x).toBeLessThan(COMPASS_CENTRE.x)
      expect(Math.min(...n.map((p) => p.y))).toBe(Math.min(...w.map((p) => p.y)))
      expect(letterPixelsOf(pixels)).toHaveLength(n.length + w.length)
    })

    it('draws one of the two mid-turn letters bright and the other worn', () => {
      const pixels = compassPixels(Math.PI / 4)
      const colourOf = (angle: number) => [...new Set(letterPixelsToward(pixels, angle).map((p) => p.colour))]
      const faced = facedLetter(Math.PI / 4)

      expect(['N', 'W']).toContain(faced)
      expect(colourOf(-Math.PI / 4)).toEqual([faced === 'N' ? FOREGROUND : FOREGROUND_WORN])
      expect(colourOf(Math.PI / 4)).toEqual([faced === 'W' ? FOREGROUND : FOREGROUND_WORN])
    })

    it('has dropped the outgoing letter near the end of a turn', () => {
      const yaw = Math.PI / 2 - 0.1
      const drawn = letterPixelsOf(compassPixels(yaw))

      expect(normalised(drawn)).toEqual(normalised(textPixels('W', LETTER_SCALE)))
      expect(drawn.every((p) => p.colour === FOREGROUND)).toBe(true)
    })

    it('has not yet brought in the incoming letter just after a turn starts', () => {
      const drawn = letterPixelsOf(compassPixels(-0.1))

      expect(normalised(drawn)).toEqual(normalised(textPixels('N', LETTER_SCALE)))
    })

    it('hides a letter exactly COMPASS_WINDOW from the top', () => {
      const drawn = letterPixelsOf(compassPixels(Math.PI / 2 - COMPASS_WINDOW))

      expect(normalised(drawn)).toEqual(normalised(textPixels('N', LETTER_SCALE)))
    })

    it('keeps the letters upright and full size as the rose turns', () => {
      const pixels = compassPixels(0.6)
      for (const { letter, angle } of visibleLetters(0.6)) {
        const drawn = letterPixelsToward(pixels, angle)
        const ys = drawn.map((p) => p.y)
        expect(Math.max(...ys) - Math.min(...ys) + 1).toBe(GLYPH_HEIGHT * LETTER_SCALE)
        expect(normalised(drawn)).toEqual(normalised(textPixels(letter, LETTER_SCALE)))
      }
    })

    it.each(SAMPLE_YAWS)('draws only the faced letter in the full foreground colour (yaw %s)', (yaw) => {
      const pixels = compassPixels(yaw)
      const faced = facedLetter(yaw)
      for (const { letter, angle } of visibleLetters(yaw)) {
        const colours = new Set(letterPixelsToward(pixels, angle).map((p) => p.colour))
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
})
