import { describe, expect, it } from 'vitest'
import { linePoints } from '../core/line.ts'
import { FOREGROUND, FOREGROUND_DIM, FOREGROUND_WORN } from '../core/palette.ts'
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

type Point = { x: number; y: number }

const LETTER_SCALE = 2
// The bezel's inner arc is this far in from COMPASS_RADIUS.
const BEZEL_WIDTH = 4
const INNER_RADIUS = COMPASS_RADIUS - BEZEL_WIDTH
const NOTCH_STEP = Math.PI / 8
const NOTCH_COUNT = 16
// Letters lie well inside this; the bezel and its notches well outside it.
const LETTER_LIMIT = 50
// The lower panel's drawing size, which the compass must fit in.
const PANEL_WIDTH = 320
const PANEL_HEIGHT = 132
// The camera yaw facing each letter's way.
const YAW: Record<string, number> = Object.fromEntries(COMPASS_LETTERS.map(({ letter, yaw }) => [letter, yaw]))
const LETTERS = COMPASS_LETTERS.map(({ letter }) => letter)
// The four headings and a few yaws part way through a turn.
const SAMPLE_YAWS = [0, Math.PI / 2, Math.PI, -Math.PI / 2, 0.3, Math.PI / 4 - 0.1, 2.5, -2]
const PALETTE = [FOREGROUND, FOREGROUND_WORN, FOREGROUND_DIM]

const key = ({ x, y }: Point) => `${x},${y}`
const distance = (p: Point) => Math.hypot(p.x - COMPASS_CENTRE.x, p.y - COMPASS_CENTRE.y)
// Radians anticlockwise from straight up of `p` around the centre.
const angleOf = (p: Point) => Math.atan2(-(p.x - COMPASS_CENTRE.x), -(p.y - COMPASS_CENTRE.y))
const angleBetween = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)))
const RING_TOP = COMPASS_CENTRE.y - COMPASS_RADIUS
// `angle` wrapped to −π…π.
const wrap = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle))
// Where a direction `angle` from the top lands at `radius` from the centre.
const onRose = (angle: number, radius: number): Point => ({
  x: COMPASS_CENTRE.x - Math.sin(angle) * radius,
  y: COMPASS_CENTRE.y - Math.cos(angle) * radius,
})
const roseLine = (angle: number, from: number, to: number) => {
  const a = onRose(angle, from)
  const b = onRose(angle, to)
  return linePoints(a.x, a.y, b.x, b.y)
}

// The marker: pixels above the ring's top.
const markerOf = (pixels: Pixel[]) => pixels.filter((p) => p.y < RING_TOP)
// The bezel and its notches: pixels out near the ring, below the marker.
const ringOf = (pixels: Pixel[]) => pixels.filter((p) => p.y >= RING_TOP && distance(p) > LETTER_LIMIT)
// Letter pixels lie well inside the ring.
const letterPixelsOf = (pixels: Pixel[]) => pixels.filter((p) => p.y >= RING_TOP && distance(p) < LETTER_LIMIT)
// The letters that should show at `yaw`, with their angle from the top.
const visibleLetters = (yaw: number) =>
  COMPASS_LETTERS.map(({ letter, yaw: letterYaw }) => ({ letter, angle: wrap(letterYaw - yaw) })).filter(
    ({ angle }) => Math.abs(angle) < COMPASS_WINDOW,
  )

// Every pixel an arc of `radius` across the window could cover.
function arcKeys(radius: number): Set<string> {
  const keys = new Set<string>()
  const steps = 4000
  for (let i = 0; i <= steps; i++) {
    const p = onRose(-COMPASS_WINDOW + (i / steps) * 2 * COMPASS_WINDOW, radius)
    keys.add(key({ x: Math.round(p.x), y: Math.round(p.y) }))
  }
  return keys
}

// The lines closing the bezel at either end of the window.
const END_KEYS = new Set(
  [-COMPASS_WINDOW, COMPASS_WINDOW].flatMap((angle) => roseLine(angle, COMPASS_RADIUS, INNER_RADIUS)).map(key),
)
const OUTER_KEYS = arcKeys(COMPASS_RADIUS)
const INNER_KEYS = arcKeys(INNER_RADIUS)

type NotchKind = 'long' | 'half' | 'pip'
type Notch = { index: number; angle: number; kind: NotchKind; length: number; points: Point[] }
const kindOf = (index: number): NotchKind => (index % 4 === 0 ? 'long' : index % 2 === 0 ? 'half' : 'pip')
const LENGTH: Record<NotchKind, number> = { long: 3, half: 2, pip: 1 }

// The notches inside the window at `yaw`, and where each should be drawn: in
// from just inside the outer arc.
function visibleNotches(yaw: number): Notch[] {
  const notches: Notch[] = []
  for (let index = 0; index < NOTCH_COUNT; index++) {
    const angle = wrap(index * NOTCH_STEP - yaw)
    if (Math.abs(angle) >= COMPASS_WINDOW) continue
    const kind = kindOf(index)
    const length = LENGTH[kind]
    notches.push({ index, angle, kind, length, points: roseLine(angle, COMPASS_RADIUS - 1, COMPASS_RADIUS - length) })
  }
  return notches
}

type Part = 'outer' | 'inner' | 'ends' | NotchKind
// Where each part of the bezel should be at `yaw`, keeping only the pixels
// that belong to that part alone, so a drawn pixel's part is certain.
function partsAt(yaw: number): Record<Part, Set<string>> {
  const all: Record<Part, Set<string>> = {
    outer: OUTER_KEYS,
    inner: INNER_KEYS,
    ends: END_KEYS,
    long: new Set(),
    half: new Set(),
    pip: new Set(),
  }
  for (const notch of visibleNotches(yaw)) for (const p of notch.points) all[notch.kind].add(key(p))
  const counts = new Map<string, number>()
  for (const keys of Object.values(all)) for (const k of keys) counts.set(k, (counts.get(k) ?? 0) + 1)
  const only = (keys: Set<string>) => new Set([...keys].filter((k) => counts.get(k) === 1))
  return {
    outer: only(all.outer),
    inner: only(all.inner),
    ends: only(all.ends),
    long: only(all.long),
    half: only(all.half),
    pip: only(all.pip),
  }
}

// Everywhere the bezel and its notches may be drawn at `yaw`.
function bezelKeysAt(yaw: number): Set<string> {
  const keys = new Set([...OUTER_KEYS, ...INNER_KEYS, ...END_KEYS])
  for (const notch of visibleNotches(yaw)) for (const p of notch.points) keys.add(key(p))
  return keys
}

// The share of 101 evenly spread points across the window on an arc of
// `radius` that are drawn.
function arcCoverage(pixels: Pixel[], radius: number): number {
  const drawn = new Set(pixels.map(key))
  let hit = 0
  for (let i = 0; i <= 100; i++) {
    const p = onRose(-COMPASS_WINDOW + (i / 100) * 2 * COMPASS_WINDOW, radius)
    if (drawn.has(key({ x: Math.round(p.x), y: Math.round(p.y) }))) hit++
  }
  return hit / 101
}

// The drawn pixels whose keys are in `keys`.
const drawnIn = (pixels: Pixel[], keys: Set<string>) => pixels.filter((p) => keys.has(key(p)))
const coloursOf = (pixels: Pixel[]) => new Set(pixels.map((p) => p.colour))
const share = (pixels: Pixel[], colour: string) => pixels.filter((p) => p.colour === colour).length / pixels.length

// The letter pixels on the side of the centre at screen angle `angle`: letters
// sit well out from the centre, so those 90 degrees round are excluded.
function letterPixelsToward(pixels: Pixel[], angle: number): Pixel[] {
  const dx = -Math.sin(angle)
  const dy = -Math.cos(angle)
  return letterPixelsOf(pixels).filter((p) => (p.x - COMPASS_CENTRE.x) * dx + (p.y - COMPASS_CENTRE.y) * dy > 20)
}

// Pixels moved so the top-left of their bounding box is at (0, 0), as keys
// with colours, so two drawings of a letter can be compared.
function normalisedWithColour(pixels: Pixel[]): string[] {
  const left = Math.min(...pixels.map((p) => p.x))
  const top = Math.min(...pixels.map((p) => p.y))
  return pixels.map((p) => `${key({ x: p.x - left, y: p.y - top })}:${p.colour}`).sort()
}

// Whether `drawn` is `letter`'s glyph with at most a few pixels worn away: it
// fits the glyph at some small offset (in case a whole edge row or column
// dropped out) and keeps most of its pixels.
function isWornGlyph(drawn: Point[], letter: string): boolean {
  const glyph = textPixels(letter, LETTER_SCALE)
  const glyphKeys = new Set(glyph.map(key))
  if (drawn.length < 0.85 * glyph.length || drawn.length > glyph.length) return false
  const left = Math.min(...drawn.map((p) => p.x))
  const top = Math.min(...drawn.map((p) => p.y))
  for (let ox = 0; ox <= 2; ox++) {
    for (let oy = 0; oy <= 2; oy++) {
      if (drawn.every((p) => glyphKeys.has(key({ x: p.x - left + ox, y: p.y - top + oy })))) return true
    }
  }
  return false
}

function centroid(points: Point[]): Point {
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

  it.each(SAMPLE_YAWS)('uses only the full, worn and dim foreground colours (yaw %s)', (yaw) => {
    for (const colour of coloursOf(compassPixels(yaw))) expect(PALETTE).toContain(colour)
  })

  describe('bezel', () => {
    it.each(SAMPLE_YAWS)('draws nothing near the ring but its arcs, end lines and notches (yaw %s)', (yaw) => {
      const allowed = bezelKeysAt(yaw)

      for (const p of ringOf(compassPixels(yaw))) expect(allowed.has(key(p))).toBe(true)
    })

    it('stays within COMPASS_WINDOW of the top', () => {
      for (const yaw of SAMPLE_YAWS) {
        for (const p of ringOf(compassPixels(yaw))) {
          expect(Math.abs(angleOf(p))).toBeLessThanOrEqual(COMPASS_WINDOW + 0.05)
        }
      }
    })

    it.each([
      ['outer arc at COMPASS_RADIUS', COMPASS_RADIUS, OUTER_KEYS],
      ['inner arc BEZEL_WIDTH inside it', INNER_RADIUS, INNER_KEYS],
    ])('draws most of the %s, through the top, from one end of the window to the other', (_, radius, keys) => {
      const arc = drawnIn(compassPixels(0), keys)
      const angles = arc.map(angleOf)

      expect(arcCoverage(compassPixels(0), radius)).toBeGreaterThan(0.85)
      expect(Math.max(...angles)).toBeGreaterThan(COMPASS_WINDOW - 0.05)
      expect(Math.min(...angles)).toBeLessThan(-COMPASS_WINDOW + 0.05)
      expect(arc.some((p) => Math.abs(angleOf(p)) < 0.05)).toBe(true)
    })

    it('closes both ends of the bezel with lines from the outer arc to the inner', () => {
      const ends = drawnIn(compassPixels(0), partsAt(0).ends)
      const left = ends.filter((p) => p.x < COMPASS_CENTRE.x)
      const right = ends.filter((p) => p.x > COMPASS_CENTRE.x)

      expect(left.length).toBeGreaterThan(0)
      expect(right.length).toBeGreaterThan(0)
      expect(ends.length).toBeGreaterThanOrEqual(0.75 * partsAt(0).ends.size)
    })

    it('draws the outer arc bright, a few pixels faded to worn', () => {
      const outer = drawnIn(compassPixels(0), partsAt(0).outer)

      expect([...coloursOf(outer)].sort()).toEqual([FOREGROUND, FOREGROUND_WORN].sort())
      expect(share(outer, FOREGROUND)).toBeGreaterThan(0.65)
    })

    it('draws the inner arc worn, a few pixels faded to dim', () => {
      const inner = drawnIn(compassPixels(0), partsAt(0).inner)

      expect([...coloursOf(inner)].sort()).toEqual([FOREGROUND_WORN, FOREGROUND_DIM].sort())
      expect(share(inner, FOREGROUND_WORN)).toBeGreaterThan(0.65)
    })

    it('draws the end lines worn or dim', () => {
      const ends = drawnIn(compassPixels(0), partsAt(0).ends)

      for (const colour of coloursOf(ends)) expect([FOREGROUND_WORN, FOREGROUND_DIM]).toContain(colour)
      expect(share(ends, FOREGROUND_WORN)).toBeGreaterThan(0.5)
    })

    it('leaves some of the arcs\' pixels out', () => {
      const pixels = compassPixels(0)
      const { outer, inner } = partsAt(0)

      expect(drawnIn(pixels, outer).length + drawnIn(pixels, inner).length).toBeLessThan(outer.size + inner.size)
    })

    it('is worn the same whichever way the camera faces', () => {
      const bezelAt = (yaw: number) => {
        const { outer, inner, ends } = partsAt(yaw)
        return new Set([...outer, ...inner, ...ends])
      }
      const reference = compassPixels(0)
      for (const yaw of SAMPLE_YAWS) {
        const shared = new Set([...bezelAt(0)].filter((k) => bezelAt(yaw).has(k)))
        const describe = (pixels: Pixel[]) => drawnIn(pixels, shared).map((p) => `${key(p)}:${p.colour}`).sort()

        expect(describe(compassPixels(yaw))).toEqual(describe(reference))
      }
    })
  })

  describe('notches', () => {
    it.each(SAMPLE_YAWS)('draws only the notches within COMPASS_WINDOW of the top (yaw %s)', (yaw) => {
      const ring = new Set(ringOf(compassPixels(yaw)).map(key))
      const { long, half, pip } = partsAt(yaw)
      const hidden = Array.from({ length: NOTCH_COUNT }, (_, index) => wrap(index * NOTCH_STEP - yaw))
        .filter((angle) => Math.abs(angle) >= COMPASS_WINDOW + 0.1)
        .flatMap((angle) => roseLine(angle, COMPASS_RADIUS - 1, COMPASS_RADIUS - 3))
        .map(key)
        .filter((k) => !long.has(k) && !half.has(k) && !pip.has(k))

      for (const k of hidden) expect(ring.has(k)).toBe(false)
    })

    it('draws most of the visible notches, one every π/8 of the rose', () => {
      let shown = 0
      let total = 0
      for (const yaw of SAMPLE_YAWS) {
        const pixels = compassPixels(yaw)
        const parts = partsAt(yaw)
        for (const notch of visibleNotches(yaw)) {
          const own = notch.points.map(key).filter((k) => parts[notch.kind].has(k))
          if (own.length === 0) continue
          total++
          if (drawnIn(pixels, new Set(own)).length > 0) shown++
        }
      }

      expect(total).toBeGreaterThan(30)
      expect(shown / total).toBeGreaterThan(0.8)
    })

    it('shows 5 notches at rest, at 0, ±π/8 and ±π/4 from the top', () => {
      const angles = visibleNotches(0).map((notch) => notch.angle).sort((a, b) => a - b)

      expect(angles.map((a) => a / NOTCH_STEP)).toEqual([-2, -1, 0, 1, 2].map((n) => expect.closeTo(n)))
    })

    // At yaw index × π/8, notch `index` is straight up, running down the
    // column through the centre from just under the outer arc (y 48) towards
    // the inner arc (y 52).
    const topColumn = (pixels: Pixel[]) =>
      pixels.filter((p) => p.x === COMPASS_CENTRE.x && p.y > RING_TOP && p.y < COMPASS_CENTRE.y - INNER_RADIUS)

    it.each(Array.from({ length: NOTCH_COUNT }, (_, index) => [index, kindOf(index)] as const))(
      'runs notch %s (%s) in from just inside the outer arc for its length, in its colours',
      (index, kind) => {
        const column = topColumn(compassPixels(index * NOTCH_STEP))
        const deepest = RING_TOP + LENGTH[kind]
        const allowed = {
          long: [FOREGROUND, FOREGROUND_WORN],
          half: [FOREGROUND_WORN, FOREGROUND_DIM],
          pip: [FOREGROUND_DIM],
        }[kind]

        expect(column.length).toBeGreaterThanOrEqual(LENGTH[kind] - 1)
        for (const p of column) {
          expect(p.y).toBeLessThanOrEqual(deepest)
          expect(allowed).toContain(p.colour)
        }
      },
    )

    it('draws the long notches mostly bright and the half-way ones mostly worn', () => {
      const long: Pixel[] = []
      const half: Pixel[] = []
      for (const yaw of SAMPLE_YAWS) {
        const pixels = compassPixels(yaw)
        long.push(...drawnIn(pixels, partsAt(yaw).long))
        half.push(...drawnIn(pixels, partsAt(yaw).half))
      }

      expect(share(long, FOREGROUND)).toBeGreaterThan(0.6)
      expect(share(half, FOREGROUND_WORN)).toBeGreaterThan(0.6)
    })

    it('draws the pips dim', () => {
      for (const yaw of SAMPLE_YAWS) {
        for (const p of drawnIn(compassPixels(yaw), partsAt(yaw).pip)) expect(p.colour).toBe(FOREGROUND_DIM)
      }
    })

    it('keeps each notch\'s wear as it turns', () => {
      // Each step along a notch: its colour, null if dropped, or undefined if
      // the pixel is shared with another part.
      const stepsOf = (yaw: number, index: number) => {
        const notch = visibleNotches(yaw).find((n) => n.index === index)!
        const own = partsAt(yaw)[notch.kind]
        const pixels = compassPixels(yaw)
        return notch.points.map((p) =>
          own.has(key(p)) ? (pixels.find((q) => q.x === p.x && q.y === p.y)?.colour ?? null) : undefined,
        )
      }
      let compared = 0
      for (let index = 0; index < NOTCH_COUNT; index++) {
        const atTop = index * NOTCH_STEP
        const a = stepsOf(atTop, index)
        for (const turn of [0.2, -0.35, 0.5]) {
          const b = stepsOf(atTop + turn, index)
          if (b.length !== a.length) continue
          a.forEach((colour, step) => {
            if (colour === undefined || b[step] === undefined) return
            expect(b[step]).toBe(colour)
            compared++
          })
        }
      }

      expect(compared).toBeGreaterThan(40)
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

    it('draws its top row worn', () => {
      const marker = markerOf(compassPixels(0))
      const top = Math.min(...marker.map((p) => p.y))
      const row = marker.filter((p) => p.y === top)

      expect(row.length).toBeGreaterThan(1)
      expect(row.every((p) => p.colour === FOREGROUND_WORN)).toBe(true)
    })

    it('draws its left edge worn', () => {
      const marker = markerOf(compassPixels(0))
      const ys = [...new Set(marker.map((p) => p.y))]
      for (const y of ys) {
        const row = marker.filter((p) => p.y === y)
        const leftmost = row.reduce((a, b) => (b.x < a.x ? b : a))
        expect(leftmost.colour).toBe(FOREGROUND_WORN)
      }
    })

    it('draws the rest bright', () => {
      const marker = markerOf(compassPixels(0))
      const top = Math.min(...marker.map((p) => p.y))
      const rest = marker.filter((p) => {
        if (p.y === top) return false
        const leftmost = Math.min(...marker.filter((q) => q.y === p.y).map((q) => q.x))
        return p.x !== leftmost
      })

      expect(rest.length).toBeGreaterThan(0)
      expect(rest.every((p) => p.colour === FOREGROUND)).toBe(true)
    })

    it('is not weathered: no pixel is missing or dim', () => {
      const marker = markerOf(compassPixels(0))
      const rows = new Set(marker.map((p) => p.y)).size

      expect(marker).toHaveLength(rows * rows)
      expect(marker.some((p) => p.colour === FOREGROUND_DIM)).toBe(false)
    })

    it('stays put whichever way the camera faces', () => {
      const marker = markerOf(compassPixels(0))

      for (const yaw of SAMPLE_YAWS) expect(markerOf(compassPixels(yaw))).toEqual(marker)
    })

    it('is drawn after the rest, so nothing covers it', () => {
      const pixels = compassPixels(0)
      const marker = markerOf(pixels)

      expect(pixels.slice(-marker.length)).toEqual(marker)
    })
  })

  describe('letters', () => {
    it.each(SAMPLE_YAWS)('draws only the letters within COMPASS_WINDOW of the top (yaw %s)', (yaw) => {
      const pixels = compassPixels(yaw)
      const visible = visibleLetters(yaw)
      const drawn = visible.reduce((sum, { angle }) => sum + letterPixelsToward(pixels, angle).length, 0)

      expect(visible.length).toBeGreaterThan(0)
      expect(letterPixelsOf(pixels)).toHaveLength(drawn)
    })

    it.each(SAMPLE_YAWS)('draws each shown letter at its yaw less the camera\'s, from the top (yaw %s)', (yaw) => {
      const pixels = compassPixels(yaw)
      for (const { letter, angle } of visibleLetters(yaw)) {
        const drawn = letterPixelsToward(pixels, angle)

        expect(isWornGlyph(drawn, letter)).toBe(true)
        expect(angleBetween(angleOf(centroid(drawn)), angle)).toBeLessThan(0.1)
      }
    })

    it.each(LETTERS)('draws only %s, straight above the centre, when facing its way', (letter) => {
      const drawn = letterPixelsOf(compassPixels(YAW[letter]))
      const xs = drawn.map((p) => p.x)

      expect(isWornGlyph(drawn, letter)).toBe(true)
      expect(centroid(drawn).y).toBeLessThan(COMPASS_CENTRE.y)
      expect(Math.abs((Math.min(...xs) + Math.max(...xs)) / 2 - COMPASS_CENTRE.x)).toBeLessThanOrEqual(0.5)
    })

    it('shows N and W either side of the top half-way through a left turn from north', () => {
      const pixels = compassPixels(Math.PI / 4)
      const n = letterPixelsToward(pixels, -Math.PI / 4)
      const w = letterPixelsToward(pixels, Math.PI / 4)

      expect(isWornGlyph(n, 'N')).toBe(true)
      expect(isWornGlyph(w, 'W')).toBe(true)
      expect(centroid(n).x).toBeGreaterThan(COMPASS_CENTRE.x)
      expect(centroid(w).x).toBeLessThan(COMPASS_CENTRE.x)
      expect(letterPixelsOf(pixels)).toHaveLength(n.length + w.length)
    })

    it.each([
      ['has dropped the outgoing letter near the end of a turn', Math.PI / 2 - 0.1, 'W'],
      ['has not yet brought in the incoming letter just after a turn starts', -0.1, 'N'],
      ['hides a letter exactly COMPASS_WINDOW from the top', Math.PI / 2 - COMPASS_WINDOW, 'N'],
    ])('%s', (_, yaw, letter) => {
      expect(isWornGlyph(letterPixelsOf(compassPixels(yaw)), letter)).toBe(true)
    })

    it('keeps the letters upright and full size as the rose turns', () => {
      const pixels = compassPixels(0.6)
      for (const { letter, angle } of visibleLetters(0.6)) {
        const drawn = letterPixelsToward(pixels, angle)
        const ys = drawn.map((p) => p.y)
        expect(Math.max(...ys) - Math.min(...ys) + 1).toBeGreaterThanOrEqual(GLYPH_HEIGHT * LETTER_SCALE - 1)
        expect(Math.max(...ys) - Math.min(...ys) + 1).toBeLessThanOrEqual(GLYPH_HEIGHT * LETTER_SCALE)
        expect(isWornGlyph(drawn, letter)).toBe(true)
      }
    })

    it.each(SAMPLE_YAWS)('draws the faced letter bright with some pixels worn (yaw %s)', (yaw) => {
      const pixels = compassPixels(yaw)
      const faced = visibleLetters(yaw).find(({ letter }) => letter === facedLetter(yaw))!
      const drawn = letterPixelsToward(pixels, faced.angle)

      expect([...coloursOf(drawn)].sort()).toEqual([FOREGROUND, FOREGROUND_WORN].sort())
      expect(share(drawn, FOREGROUND)).toBeGreaterThan(0.65)
    })

    it.each(SAMPLE_YAWS)('draws any other shown letter worn with some pixels dim (yaw %s)', (yaw) => {
      const pixels = compassPixels(yaw)
      for (const { letter, angle } of visibleLetters(yaw)) {
        if (letter === facedLetter(yaw)) continue
        const drawn = letterPixelsToward(pixels, angle)

        expect(coloursOf(drawn).has(FOREGROUND)).toBe(false)
        expect(share(drawn, FOREGROUND_WORN)).toBeGreaterThan(0.65)
      }
    })

    it('swaps the bright letter as a turn passes the half-way point', () => {
      const brightSide = (yaw: number) =>
        [-Math.PI / 4, Math.PI / 4].filter((angle) =>
          letterPixelsToward(compassPixels(yaw), angle).some((p) => p.colour === FOREGROUND),
        )

      // N is on the right (−π/4) and W on the left (π/4) half-way through.
      expect(brightSide(Math.PI / 4 - 0.05)).toEqual([-Math.PI / 4])
      expect(brightSide(Math.PI / 4 + 0.05)).toEqual([Math.PI / 4])
    })

    it.each(LETTERS)('wears %s the same at every yaw it shows, as it slides round', (letter) => {
      const facing = YAW[letter]
      const reference = normalisedWithColour(letterPixelsOf(compassPixels(facing)))
      for (const turn of [0.1, -0.3, 0.6]) {
        const drawn = letterPixelsToward(compassPixels(facing + turn), -turn)

        expect(normalisedWithColour(drawn)).toEqual(reference)
      }
    })

    it('wears a letter in the same places when it is not the faced one, a tone dimmer', () => {
      const faced = letterPixelsOf(compassPixels(0))
      // Past half-way through a turn to W, N is still showing but no longer faced.
      const unfaced = letterPixelsToward(compassPixels(Math.PI / 4 + 0.2), -(Math.PI / 4 + 0.2))
      const dimmer: Record<string, string> = { [FOREGROUND]: FOREGROUND_WORN, [FOREGROUND_WORN]: FOREGROUND_DIM }

      expect(normalisedWithColour(unfaced)).toEqual(
        normalisedWithColour(faced.map((p) => ({ ...p, colour: dimmer[p.colour] }))),
      )
    })

    it('wears each letter differently', () => {
      // Where each faced letter's pixels are faded, relative to its glyph.
      const fadedOf = (letter: string) =>
        normalisedWithColour(letterPixelsOf(compassPixels(YAW[letter])))
          .filter((k) => k.endsWith(FOREGROUND_WORN))
          .map((k) => k.split(':')[0])
      const patterns = LETTERS.map((letter) => fadedOf(letter).join(' '))

      expect(new Set(patterns).size).toBe(LETTERS.length)
    })
  })
})
