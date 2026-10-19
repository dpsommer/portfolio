import { describe, expect, it, vi } from 'vitest'
import { FOREGROUND, FOREGROUND_DIM, FOREGROUND_WORN } from '../core/palette.ts'
import { GLYPH_HEIGHT, textPixels, textWidth } from '../core/pixelFont.ts'
import type { Pixel } from '../core/types.ts'
import { extent } from '../../test/pixels.ts'
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
const LETTER_RADIUS = 38
// The bezel's inner arc is this far in from COMPASS_RADIUS.
const INNER_RADIUS = COMPASS_RADIUS - 4
const HUB_RADIUS = 22
const BEAD_RADIUS = 48.5
const NOTCH_STEP = Math.PI / 8
const NOTCH_COUNT = 16
// The lower panel's drawing size, which the compass must fit in.
const PANEL_WIDTH = 320
const PANEL_HEIGHT = 132
// The camera yaw facing each letter's way.
const YAW: Record<string, number> = Object.fromEntries(COMPASS_LETTERS.map(({ letter, yaw }) => [letter, yaw]))
const LETTERS = COMPASS_LETTERS.map(({ letter }) => letter)
// The four headings and a few yaws part way through a turn.
const SAMPLE_YAWS = [0, Math.PI / 2, Math.PI, -Math.PI / 2, 0.3, Math.PI / 4 - 0.1, 2.5, -2]
const PALETTE = [FOREGROUND, FOREGROUND_WORN, FOREGROUND_DIM]
const RING_TOP = COMPASS_CENTRE.y - COMPASS_RADIUS
// How far round from the window's ends the end scrolls may reach.
const SCROLL_REACH = 0.15

const key = ({ x, y }: Point) => `${x},${y}`
const distance = (p: Point) => Math.hypot(p.x - COMPASS_CENTRE.x, p.y - COMPASS_CENTRE.y)
// Radians anticlockwise from straight up of `p` around the centre.
const angleOf = (p: Point) => Math.atan2(-(p.x - COMPASS_CENTRE.x), -(p.y - COMPASS_CENTRE.y))
const angleBetween = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)))
// `angle` wrapped to −π…π.
const wrap = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle))
// The pixel a direction `angle` from the top lands on at `radius` from the centre.
const roseAt = (angle: number, radius: number): Point => ({
  x: Math.round(COMPASS_CENTRE.x - Math.sin(angle) * radius),
  y: Math.round(COMPASS_CENTRE.y - Math.cos(angle) * radius),
})
// `p` reflected across the compass's vertical centre line.
const mirror = ({ x, y }: Point): Point => ({ x: 2 * COMPASS_CENTRE.x - x, y })

// What shows on the canvas: where a pixel is drawn more than once, the last one.
function shown(pixels: Pixel[]): Map<string, Pixel> {
  const last = new Map<string, Pixel>()
  for (const p of pixels) last.set(key(p), p)
  return last
}
const keysOf = (points: Point[]) => new Set(points.map(key))
const coloursOf = (pixels: Pixel[]) => new Set(pixels.map((p) => p.colour))
const ofColour = (pixels: Pixel[], colour: string) => pixels.filter((p) => p.colour === colour)
const sortedKeys = (points: Point[]) => [...keysOf(points)].sort()

// The pixels 8-connected to `start` within `points`.
function connectedTo(points: Point[], start: Point): Point[] {
  const remaining = new Map(points.map((p) => [key(p), p]))
  const found: Point[] = []
  const queue = remaining.has(key(start)) ? [start] : []
  remaining.delete(key(start))
  while (queue.length > 0) {
    const p = queue.pop()!
    found.push(p)
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const k = key({ x: p.x + dx, y: p.y + dy })
        const next = remaining.get(k)
        if (!next) continue
        remaining.delete(k)
        queue.push(next)
      }
    }
  }
  return found
}

// The pixels of an arc of `radius` in `colour`: those that colour within a
// pixel of the radius.
const arcOf = (pixels: Pixel[], radius: number, colour: string) =>
  ofColour(pixels, colour).filter((p) => Math.abs(distance(p) - radius) < 0.8)

// The marker's diamond (bright, above the ring) and its curls (worn, resting on it).
const diamondOf = (pixels: Pixel[]) => ofColour(pixels, FOREGROUND).filter((p) => p.y < RING_TOP)
const curlsOf = (pixels: Pixel[]) => ofColour(pixels, FOREGROUND_WORN).filter((p) => p.y <= RING_TOP)
const markerOf = (pixels: Pixel[]) => [...diamondOf(pixels), ...curlsOf(pixels)]

// Bright pixels by the ends of the bezel: its outer arc's ends and the scrolls.
const endsOf = (pixels: Pixel[]) =>
  ofColour(pixels, FOREGROUND).filter((p) => p.y >= RING_TOP && Math.abs(angleOf(p)) > COMPASS_WINDOW - 0.25)

// Where `letter` is drawn when `angle` from the top: its glyph centred
// LETTER_RADIUS from the centre.
function letterGlyph(letter: string, angle: number): Point[] {
  const centreX = COMPASS_CENTRE.x - Math.sin(angle) * LETTER_RADIUS
  const centreY = COMPASS_CENTRE.y - Math.cos(angle) * LETTER_RADIUS
  const left = Math.round(centreX - textWidth(letter, LETTER_SCALE) / 2)
  const top = Math.round(centreY - (GLYPH_HEIGHT * LETTER_SCALE) / 2)
  return textPixels(letter, LETTER_SCALE).map((p) => ({ x: left + p.x, y: top + p.y }))
}
// Each letter's angle from the top at `yaw`, and whether it's in the window.
const lettersAt = (yaw: number) =>
  COMPASS_LETTERS.map(({ letter, yaw: letterYaw }) => {
    const angle = wrap(letterYaw - yaw)
    return { letter, angle, visible: Math.abs(angle) < COMPASS_WINDOW }
  })
// Where the shown letters are at `yaw`.
const letterKeysAt = (yaw: number) =>
  keysOf(lettersAt(yaw).flatMap(({ letter, angle, visible }) => (visible ? letterGlyph(letter, angle) : [])))

// The rose's turning parts at `yaw`: what's drawn between the hub and the
// bezel's inner arc, less the letters and the bright end scrolls curling in.
function roseOf(pixels: Pixel[], yaw: number): Pixel[] {
  const letters = letterKeysAt(yaw)
  return pixels.filter(
    (p) =>
      distance(p) > HUB_RADIUS + 1 &&
      distance(p) < INNER_RADIUS - 1 &&
      !letters.has(key(p)) &&
      p.colour !== FOREGROUND,
  )
}
// The middle lines of the rose's points (the dim parts of the rose).
const pointLinesOf = (pixels: Pixel[], yaw: number) => ofColour(roseOf(pixels, yaw), FOREGROUND_DIM)
// The angles from the top of the points (half-way between letters) at `yaw`.
const pointAnglesAt = (yaw: number) => COMPASS_LETTERS.map(({ yaw: letterYaw }) => wrap(letterYaw - yaw - Math.PI / 4))

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
        if (p.y <= RING_TOP) continue
        expect(distance(p)).toBeLessThanOrEqual(COMPASS_RADIUS + 1)
      }
    }
  })

  it('fits inside the lower panel', () => {
    for (const yaw of SAMPLE_YAWS) {
      for (const p of compassPixels(yaw)) {
        expect(Number.isInteger(p.x) && Number.isInteger(p.y)).toBe(true)
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

  it('draws nothing beyond the window but the end scrolls\' curl', () => {
    for (const yaw of SAMPLE_YAWS) {
      for (const p of compassPixels(yaw)) expect(Math.abs(angleOf(p))).toBeLessThan(COMPASS_WINDOW + SCROLL_REACH)
    }
  })

  it.each(SAMPLE_YAWS)('draws the same pixels each time for the same yaw (yaw %s)', (yaw) => {
    expect(compassPixels(yaw)).toEqual(compassPixels(yaw))
  })

  it('uses no randomness', () => {
    const random = vi.spyOn(Math, 'random')

    for (const yaw of SAMPLE_YAWS) compassPixels(yaw)

    expect(random).not.toHaveBeenCalled()
    random.mockRestore()
  })

  describe('bezel', () => {
    it.each([
      ['outer arc', COMPASS_RADIUS, FOREGROUND],
      ['inner arc', INNER_RADIUS, FOREGROUND_WORN],
    ])('draws the %s unbroken from one end of the window to the other', (_, radius, colour) => {
      const arc = arcOf(compassPixels(0), radius, colour)
      const chain = connectedTo(arc, roseAt(0, radius))
      const angles = chain.map(angleOf)

      expect(Math.max(...angles)).toBeGreaterThan(COMPASS_WINDOW - 0.03)
      expect(Math.min(...angles)).toBeLessThan(-COMPASS_WINDOW + 0.03)
    })

    it.each([
      ['outer arc', COMPASS_RADIUS, FOREGROUND],
      ['inner arc', INNER_RADIUS, FOREGROUND_WORN],
    ])('draws every pixel of the %s in one solid tone', (_, radius, colour) => {
      const pixels = compassPixels(0)
      for (let i = 0; i <= 200; i++) {
        const angle = -COMPASS_WINDOW + 0.02 + (i / 200) * (2 * COMPASS_WINDOW - 0.04)
        const p = roseAt(angle, radius)
        // The pixel on the arc at this angle, or a neighbour where the arc cuts a corner.
        const near = pixels.filter((q) => Math.abs(q.x - p.x) <= 1 && Math.abs(q.y - p.y) <= 1)

        expect(near.some((q) => q.colour === colour && Math.abs(distance(q) - radius) < 0.8)).toBe(true)
      }
    })

    it('draws nothing worn or dim on the outer arc, nor bright on the inner arc', () => {
      for (const yaw of SAMPLE_YAWS) {
        const pixels = compassPixels(yaw)
        const outer = pixels.filter((p) => Math.abs(distance(p) - COMPASS_RADIUS) < 0.3 && p.y > RING_TOP)
        // Away from the ends, where the scrolls roll under it.
        const inner = pixels.filter(
          (p) => Math.abs(distance(p) - INNER_RADIUS) < 0.3 && Math.abs(angleOf(p)) < COMPASS_WINDOW - 0.2,
        )

        expect([...coloursOf(outer)]).toEqual([FOREGROUND])
        expect([...coloursOf(inner)]).toEqual([FOREGROUND_WORN])
      }
    })

    it('ends in a bright scroll at each end, curling in under the band', () => {
      const ends = endsOf(compassPixels(0))
      for (const side of [-1, 1]) {
        const end = roseAt(-side * COMPASS_WINDOW, COMPASS_RADIUS)
        const scroll = connectedTo(ends, end)

        // It rolls from the outer arc's end round in past the inner arc.
        expect(scroll.some((p) => distance(p) < INNER_RADIUS - 2)).toBe(true)
        expect(scroll.every((p) => Math.sign(p.x - COMPASS_CENTRE.x) === side)).toBe(true)
      }
    })

    it('mirrors the scroll at one end in the other', () => {
      const ends = endsOf(compassPixels(0))
      const left = ends.filter((p) => p.x < COMPASS_CENTRE.x)
      const right = ends.filter((p) => p.x > COMPASS_CENTRE.x)

      expect(right.length).toBeGreaterThan(10)
      expect(sortedKeys(left.map(mirror))).toEqual(sortedKeys(right))
    })

    it('stays put as the rose turns', () => {
      const bezel = [
        ...endsOf(compassPixels(0)),
        ...arcOf(compassPixels(0), COMPASS_RADIUS, FOREGROUND),
        ...arcOf(compassPixels(0), INNER_RADIUS, FOREGROUND_WORN),
      ]
      for (const yaw of SAMPLE_YAWS) {
        const drawn = new Set(compassPixels(yaw).map((p) => `${key(p)}:${p.colour}`))

        for (const p of bezel) expect(drawn.has(`${key(p)}:${p.colour}`)).toBe(true)
      }
    })
  })

  describe('notches', () => {
    // Each notch's length and colour by kind: long at the letters, half-way
    // ones between those, and pips between those.
    const notchOf = (index: number) =>
      index % 4 === 0
        ? { length: 3, colour: FOREGROUND }
        : index % 2 === 0
          ? { length: 2, colour: FOREGROUND_WORN }
          : { length: 1, colour: FOREGROUND_DIM }
    // The column between the arcs straight above the centre.
    const BETWEEN_ARCS = [RING_TOP + 1, RING_TOP + 2, RING_TOP + 3]

    it.each(Array.from({ length: NOTCH_COUNT }, (_, index) => [index, notchOf(index).length] as const))(
      'runs notch %s, when at the top, %s pixels in from the outer arc, solid in its tone',
      (index, length) => {
        const drawn = shown(compassPixels(index * NOTCH_STEP))
        const column = BETWEEN_ARCS.map((y) => drawn.get(key({ x: COMPASS_CENTRE.x, y }))?.colour)

        expect(column).toEqual(BETWEEN_ARCS.map((_, i) => (i < length ? notchOf(index).colour : undefined)))
      },
    )

    it.each(SAMPLE_YAWS)('draws each notch in the window from just inside the outer arc (yaw %s)', (yaw) => {
      const drawn = shown(compassPixels(yaw))
      let count = 0
      for (let index = 0; index < NOTCH_COUNT; index++) {
        const angle = wrap(index * NOTCH_STEP - yaw)
        // Leave out notches under the end scrolls.
        if (Math.abs(angle) >= COMPASS_WINDOW - SCROLL_REACH) continue
        const { length, colour } = notchOf(index)
        count++

        expect(drawn.get(key(roseAt(angle, COMPASS_RADIUS - 1)))?.colour).toBe(colour)
        expect(drawn.get(key(roseAt(angle, COMPASS_RADIUS - length)))?.colour).toBe(colour)
      }
      expect(count).toBeGreaterThanOrEqual(4)
    })

    it.each(SAMPLE_YAWS)('draws no notch outside the window (yaw %s)', (yaw) => {
      const drawn = keysOf(compassPixels(yaw))
      for (let index = 0; index < NOTCH_COUNT; index++) {
        const angle = wrap(index * NOTCH_STEP - yaw)
        if (Math.abs(angle) < COMPASS_WINDOW + SCROLL_REACH) continue

        expect(drawn.has(key(roseAt(angle, COMPASS_RADIUS - 1)))).toBe(false)
      }
    })
  })

  describe('rose', () => {
    it.each(SAMPLE_YAWS)('draws a dim hub arc across the window (yaw %s)', (yaw) => {
      const hub = arcOf(compassPixels(yaw), HUB_RADIUS, FOREGROUND_DIM)
      const angles = connectedTo(hub, roseAt(0, HUB_RADIUS)).map(angleOf)

      expect(Math.max(...angles)).toBeGreaterThan(COMPASS_WINDOW - 0.1)
      expect(Math.min(...angles)).toBeLessThan(-COMPASS_WINDOW + 0.1)
      expect(Math.max(...angles.map(Math.abs))).toBeLessThan(COMPASS_WINDOW + 0.05)
    })

    it.each(SAMPLE_YAWS)('keeps the rose\'s points and beads inside the window (yaw %s)', (yaw) => {
      for (const p of roseOf(compassPixels(yaw), yaw)) expect(Math.abs(angleOf(p))).toBeLessThan(COMPASS_WINDOW)
    })

    it('draws a point half-way between the letters either side of the top at rest', () => {
      const lines = pointLinesOf(compassPixels(0), 0)
      for (const angle of [-Math.PI / 4, Math.PI / 4]) {
        const line = lines.filter((p) => angleBetween(angleOf(p), angle) < 0.2)

        expect(line.length).toBeGreaterThan(10)
        expect(angleBetween(angleOf(centroid(line)), angle)).toBeLessThan(0.03)
      }
    })

    it.each([0.3, -0.2, Math.PI / 4 - 0.1, 2.5, -2])('turns the points with the rose (yaw %s)', (yaw) => {
      const lines = pointLinesOf(compassPixels(yaw), yaw)
      // Points well inside the window, so none of the line is cut off.
      const inside = pointAnglesAt(yaw).filter((angle) => Math.abs(angle) < COMPASS_WINDOW - 0.15)

      expect(inside.length).toBeGreaterThan(0)
      for (const angle of inside) {
        const line = lines.filter((p) => angleBetween(angleOf(p), angle) < 0.2)
        expect(angleBetween(angleOf(centroid(line)), angle)).toBeLessThan(0.03)
      }
      for (const p of lines) {
        expect(Math.min(...pointAnglesAt(yaw).map((angle) => angleBetween(angleOf(p), angle)))).toBeLessThan(0.05)
      }
    })

    it('draws each point as a worn kite outline round its dim middle line', () => {
      const rose = roseOf(compassPixels(0), 0)
      const angle = Math.PI / 4
      const point = rose.filter((p) => angleBetween(angleOf(p), angle) < 0.3)
      const kite = ofColour(point, FOREGROUND_WORN)
      const line = ofColour(point, FOREGROUND_DIM)
      const across = (p: Point) => {
        // Distance from the point's middle line.
        const dx = p.x - COMPASS_CENTRE.x
        const dy = p.y - COMPASS_CENTRE.y
        return Math.abs(dx * Math.cos(angle) - dy * Math.sin(angle))
      }

      expect(coloursOf(point)).toEqual(new Set([FOREGROUND_WORN, FOREGROUND_DIM]))
      expect(coloursOf(compassPixels(0).filter((p) => keysOf(point).has(key(p))))).not.toContain(FOREGROUND)
      // Out from just past the hub nearly to the bezel, at most 4 pixels wide either side.
      expect(Math.min(...kite.map(distance))).toBeLessThan(25)
      expect(Math.max(...kite.map(distance))).toBeGreaterThan(48)
      expect(Math.max(...kite.map(across))).toBeGreaterThan(3)
      expect(Math.max(...kite.map(across))).toBeLessThan(4.8)
      // The middle line runs inside the kite, not filled round it.
      expect(line.length).toBeGreaterThan(10)
      expect(line.every((p) => across(p) < 1)).toBe(true)
      expect(point.filter((p) => across(p) > 1.2 && across(p) < 2 && distance(p) > 30 && distance(p) < 34)).toHaveLength(0)
    })

    // Line rasterising isn't exactly symmetric, so a few pixels may sit one off.
  it('mirrors the points either side of the top at rest, near enough', () => {
      const rose = roseOf(compassPixels(0), 0).filter((p) => Math.abs(angleOf(p)) > 0.3)
      const left = rose.filter((p) => p.x < COMPASS_CENTRE.x)
      const right = rose.filter((p) => p.x > COMPASS_CENTRE.x)

      expect(right.length).toBeGreaterThan(20)
      const rightKeys = keysOf(right)
      const matched = left.map(mirror).filter((p) => rightKeys.has(key(p)))

      expect(left).toHaveLength(right.length)
      expect(matched.length / left.length).toBeGreaterThan(0.9)
    })

    it.each(LETTERS)('draws a worn diamond bead above %s when facing its way', (letter) => {
      const bead = roseOf(compassPixels(YAW[letter]), YAW[letter]).filter(
        (p) => Math.hypot(p.x - COMPASS_CENTRE.x, p.y - (COMPASS_CENTRE.y - BEAD_RADIUS)) <= 2.6,
      )
      const box = extent(bead)
      const middle = { x: (box.left + box.right) / 2, y: (box.top + box.bottom) / 2 }

      expect(coloursOf(bead)).toEqual(new Set([FOREGROUND_WORN]))
      expect(box.right - box.left).toBe(4)
      expect(box.bottom - box.top).toBe(4)
      expect(middle.x).toBe(COMPASS_CENTRE.x)
      // An outline: corners and middle left empty.
      expect(keysOf(bead).has(key(middle))).toBe(false)
      expect(keysOf(bead).has(key({ x: box.left, y: box.top }))).toBe(false)
      expect(bead.filter((p) => p.y === box.top).map((p) => p.x)).toEqual([COMPASS_CENTRE.x])
    })

    it('moves the beads round with their letters', () => {
      const yaw = 0.4
      const rose = roseOf(compassPixels(yaw), yaw)
      const beadAngle = -yaw
      const bead = rose.filter((p) => {
        const centre = roseAt(beadAngle, BEAD_RADIUS)
        return Math.abs(p.x - centre.x) <= 2 && Math.abs(p.y - centre.y) <= 2
      })

      expect(bead.length).toBeGreaterThanOrEqual(6)
      expect(angleBetween(angleOf(centroid(bead)), beadAngle)).toBeLessThan(0.05)
    })
  })

  describe('marker', () => {
    it('is a bright diamond outline whose bottom point is 2 pixels above the ring\'s top', () => {
      const diamond = diamondOf(compassPixels(0))
      const box = extent(diamond)
      const rowXs = (y: number) => diamond.filter((p) => p.y === y).map((p) => p.x).sort((a, b) => a - b)

      expect(box.bottom).toBe(RING_TOP - 2)
      expect(box.bottom - box.top).toBe(8)
      expect(box.left).toBe(COMPASS_CENTRE.x - 4)
      expect(box.right).toBe(COMPASS_CENTRE.x + 4)
      expect(rowXs(box.top)).toEqual([COMPASS_CENTRE.x])
      expect(rowXs(box.bottom)).toEqual([COMPASS_CENTRE.x])
      // Two pixels a row in between, each a pixel further out towards the middle row.
      for (let y = box.top + 1; y < box.bottom; y++) {
        const half = 4 - Math.abs(y - (box.top + 4))
        expect(rowXs(y)).toEqual([COMPASS_CENTRE.x - half, COMPASS_CENTRE.x + half])
      }
    })

    it('has a worn curl either side of the diamond, each the other\'s mirror image', () => {
      const curls = curlsOf(compassPixels(0))
      const left = curls.filter((p) => p.x < COMPASS_CENTRE.x)
      const right = curls.filter((p) => p.x > COMPASS_CENTRE.x)
      const diamond = extent(diamondOf(compassPixels(0)))

      expect(right.length).toBeGreaterThan(8)
      expect(sortedKeys(left.map(mirror))).toEqual(sortedKeys(right))
      expect(Math.min(...right.map((p) => p.x))).toBeGreaterThan(diamond.right)
    })

    it('curls round: each curl turns back on itself, so a column holds pixels above and below a gap', () => {
      const right = curlsOf(compassPixels(0)).filter((p) => p.x > COMPASS_CENTRE.x)
      const box = extent(right)
      const middle = Math.round((box.left + box.right) / 2)
      const ys = right.filter((p) => p.x === middle).map((p) => p.y).sort((a, b) => a - b)

      expect(ys.length).toBeGreaterThanOrEqual(2)
      expect(ys[ys.length - 1] - ys[0]).toBeGreaterThan(ys.length - 1)
    })

    it('rests each curl on the outer ring', () => {
      const pixels = compassPixels(0)
      const ring = keysOf(arcOf(pixels, COMPASS_RADIUS, FOREGROUND))
      const curls = curlsOf(pixels)
      for (const side of [-1, 1]) {
        const curl = curls.filter((p) => Math.sign(p.x - COMPASS_CENTRE.x) === side)
        const lowest = Math.max(...curl.map((p) => p.y))
        const feet = curl.filter((p) => p.y === lowest)

        expect(feet.some((p) => ring.has(key({ x: p.x, y: p.y + 1 })))).toBe(true)
        expect(curl.some((p) => ring.has(key(p)))).toBe(false)
      }
    })

    it('stays put whichever way the camera faces', () => {
      const marker = markerOf(compassPixels(0))

      for (const yaw of SAMPLE_YAWS) expect(markerOf(compassPixels(yaw))).toEqual(marker)
    })

    it('is drawn after the rest, so nothing covers it', () => {
      const pixels = compassPixels(0)
      const marker = markerOf(pixels)
      const last = pixels.slice(-marker.length)

      expect(sortedKeys(last)).toEqual(sortedKeys(marker))
    })
  })

  describe('letters', () => {
    it.each(SAMPLE_YAWS)('draws each letter in the window whole, centred at its yaw less the camera\'s (yaw %s)', (yaw) => {
      const drawn = shown(compassPixels(yaw))
      const visible = lettersAt(yaw).filter((l) => l.visible)

      expect(visible.length).toBeGreaterThan(0)
      for (const { letter, angle } of visible) {
        const glyph = letterGlyph(letter, angle)
        expect(glyph.every((p) => drawn.has(key(p)))).toBe(true)
        expect(angleBetween(angleOf(centroid(glyph)), angle)).toBeLessThan(0.1)
      }
    })

    it.each(SAMPLE_YAWS)('draws nothing where the letters outside the window would be (yaw %s)', (yaw) => {
      const drawn = keysOf(compassPixels(yaw))
      const hidden = lettersAt(yaw).filter((l) => !l.visible)

      for (const { letter, angle } of hidden) {
        expect(letterGlyph(letter, angle).some((p) => drawn.has(key(p)))).toBe(false)
      }
    })

    it.each(LETTERS)('draws only %s, straight above the centre, when facing its way', (letter) => {
      const yaw = YAW[letter]
      const visible = lettersAt(yaw).filter((l) => l.visible)
      const glyph = letterGlyph(letter, 0)
      const box = extent(glyph)

      expect(visible.map((l) => l.letter)).toEqual([letter])
      expect(Math.abs((box.left + box.right) / 2 - COMPASS_CENTRE.x)).toBeLessThanOrEqual(0.5)
      expect(Math.abs((box.top + box.bottom) / 2 - (COMPASS_CENTRE.y - LETTER_RADIUS))).toBeLessThanOrEqual(0.5)
      expect(glyph.every((p) => shown(compassPixels(yaw)).get(key(p))?.colour === FOREGROUND)).toBe(true)
    })

    it.each([
      ['has dropped the outgoing letter near the end of a turn', Math.PI / 2 - 0.1, ['W']],
      ['has not yet brought in the incoming letter just after a turn starts', -0.1, ['N']],
      ['hides a letter exactly COMPASS_WINDOW from the top', Math.PI / 2 - COMPASS_WINDOW, ['N']],
      ['shows N and W either side of the top half-way through a turn', Math.PI / 4, ['N', 'W']],
    ])('%s', (_, yaw, letters) => {
      const drawn = keysOf(compassPixels(yaw))
      const showing = COMPASS_LETTERS.filter(({ letter, yaw: letterYaw }) =>
        letterGlyph(letter, wrap(letterYaw - yaw)).every((p) => drawn.has(key(p))),
      ).map(({ letter }) => letter)

      expect(showing).toEqual(letters)
    })

    it.each(SAMPLE_YAWS)('draws the faced letter solid bright and any other solid worn (yaw %s)', (yaw) => {
      const drawn = shown(compassPixels(yaw))
      for (const { letter, angle, visible } of lettersAt(yaw)) {
        if (!visible) continue
        const colour = letter === facedLetter(yaw) ? FOREGROUND : FOREGROUND_WORN

        expect(letterGlyph(letter, angle).every((p) => drawn.get(key(p))?.colour === colour)).toBe(true)
      }
    })

    it('swaps the bright letter as a turn passes the half-way point', () => {
      const brightLetter = (yaw: number) => {
        const drawn = shown(compassPixels(yaw))
        return lettersAt(yaw)
          .filter(({ letter, angle, visible }) => visible && letterGlyph(letter, angle).every((p) => drawn.get(key(p))?.colour === FOREGROUND))
          .map(({ letter }) => letter)
      }

      expect(brightLetter(Math.PI / 4 - 0.05)).toEqual(['N'])
      expect(brightLetter(Math.PI / 4 + 0.05)).toEqual(['W'])
    })

    it('keeps the letters upright and full size as the rose turns', () => {
      const drawn = shown(compassPixels(0.6))
      for (const { letter, angle, visible } of lettersAt(0.6)) {
        if (!visible) continue
        const glyph = letterGlyph(letter, angle)
        const box = extent(glyph)

        expect(box.bottom - box.top + 1).toBe(GLYPH_HEIGHT * LETTER_SCALE)
        expect(glyph.every((p) => drawn.has(key(p)))).toBe(true)
      }
    })
  })
})
