import { describe, expect, it } from 'vitest'
import { FOREGROUND } from '../core/palette.ts'
import type { Bounds, Pixel } from '../core/types.ts'
import { HEIGHT, WIDTH, expectOnCanvas, extent } from '../../test/pixels.ts'
import {
  BOUNCE_DEPTH,
  BOUNCE_MS,
  BOUNCE_PERIOD_MS,
  SELECTION_GAP,
  caretInset,
  pixelBounds,
  selectionPixels,
} from './selection.ts'

// Well clear of the canvas edges, so no caret is clipped.
const BOUNDS: Bounds = { left: 100, top: 80, right: 180, bottom: 140 }
// Big enough that nothing near BOUNDS is clipped.
const UNCLIPPED = 10_000
const CARET = 5
// Pixels in one 5x5 right-angle triangle: 5 + 4 + 3 + 2 + 1.
const CARET_AREA = 15

const key = ({ x, y }: { x: number; y: number }) => `${x},${y}`
const keys = (pixels: { x: number; y: number }[]) => pixels.map(key).sort()

type Corner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
const CORNERS: Corner[] = ['top-left', 'top-right', 'bottom-left', 'bottom-right']

// The pixels of the caret at `corner`, telling them apart by which side of
// the bounds' middle they're on.
function caretAt(pixels: Pixel[], corner: Corner, bounds = BOUNDS): Pixel[] {
  const midX = (bounds.left + bounds.right) / 2
  const midY = (bounds.top + bounds.bottom) / 2
  return pixels.filter(
    ({ x, y }) => (x < midX) === corner.endsWith('left') && (y < midY) === corner.startsWith('top'),
  )
}

// A caret as rows of '#' and '.', read off its 5x5 box.
function caretRows(caret: Pixel[]): string[] {
  const { left, top } = extent(caret)
  const lit = new Set(keys(caret))
  return Array.from({ length: CARET }, (_, row) =>
    Array.from({ length: CARET }, (_, col) => (lit.has(key({ x: left + col, y: top + row })) ? '#' : '.')).join(''),
  )
}

const flipRows = (rows: string[]) => rows.map((row) => row.split('').reverse().join(''))

describe('pixelBounds', () => {
  it('gives the inclusive extent of the pixels', () => {
    const pixels = [
      { x: 5, y: 9 },
      { x: 2, y: 14 },
      { x: 11, y: 3 },
    ]

    expect(pixelBounds(pixels)).toEqual({ left: 2, top: 3, right: 11, bottom: 14 })
  })

  it('gives a single pixel as bounds with no width or height to spare', () => {
    expect(pixelBounds([{ x: 7, y: 4 }])).toEqual({ left: 7, top: 4, right: 7, bottom: 4 })
  })

  it('ignores the pixels\' colours', () => {
    const pixels: Pixel[] = [
      { x: 1, y: 2, colour: FOREGROUND },
      { x: 3, y: 0, colour: 'red' },
    ]

    expect(pixelBounds(pixels)).toEqual({ left: 1, top: 0, right: 3, bottom: 2 })
  })
})

describe('caretInset', () => {
  const PEAK = BOUNCE_PERIOD_MS + BOUNCE_MS / 2

  it.each([0, BOUNCE_MS / 2, BOUNCE_MS, BOUNCE_PERIOD_MS - 1])('rests at 0 through the first period, at %s ms', (elapsed) => {
    expect(caretInset(elapsed)).toBe(0)
  })

  it('dips to the full depth half-way through a bounce', () => {
    expect(caretInset(PEAK)).toBe(BOUNCE_DEPTH)
  })

  it.each([
    ['as a bounce starts', BOUNCE_PERIOD_MS],
    ['once a bounce is over', BOUNCE_PERIOD_MS + BOUNCE_MS],
    ['between bounces', BOUNCE_PERIOD_MS + (BOUNCE_PERIOD_MS + BOUNCE_MS) / 2],
    ['just before the next bounce', 2 * BOUNCE_PERIOD_MS - 1],
  ])('is 0 %s', (_, elapsed) => {
    expect(caretInset(elapsed)).toBe(0)
  })

  it('is a whole number of pixels between 0 and the depth', () => {
    for (let elapsed = 0; elapsed < 3 * BOUNCE_PERIOD_MS; elapsed += 7) {
      const inset = caretInset(elapsed)
      expect(Number.isInteger(inset)).toBe(true)
      expect(inset).toBeGreaterThanOrEqual(0)
      expect(inset).toBeLessThanOrEqual(BOUNCE_DEPTH)
    }
  })

  it('goes in and comes back out symmetrically over a bounce', () => {
    const insets = Array.from({ length: BOUNCE_MS + 1 }, (_, ms) => caretInset(BOUNCE_PERIOD_MS + ms))
    const peak = BOUNCE_MS / 2

    for (let ms = 1; ms <= peak; ms++) expect(insets[ms]).toBeGreaterThanOrEqual(insets[ms - 1])
    for (let ms = peak + 1; ms < BOUNCE_MS; ms++) expect(insets[ms]).toBeLessThanOrEqual(insets[ms - 1])
    // Away from the exact ends, where rounding could tip either way.
    for (let ms = 1; ms < peak; ms++) expect(insets[BOUNCE_MS - ms]).toBe(insets[ms])
  })

  it('repeats every period after the first', () => {
    for (let elapsed = BOUNCE_PERIOD_MS; elapsed < 2 * BOUNCE_PERIOD_MS; elapsed += 13) {
      expect(caretInset(elapsed + BOUNCE_PERIOD_MS)).toBe(caretInset(elapsed))
      expect(caretInset(elapsed + 5 * BOUNCE_PERIOD_MS)).toBe(caretInset(elapsed))
    }
  })
})

describe('selectionPixels', () => {
  const pixels = selectionPixels(BOUNDS, 0, WIDTH, HEIGHT)

  it('draws four solid carets in the foreground colour', () => {
    expect(pixels).toHaveLength(4 * CARET_AREA)
    expect(new Set(keys(pixels)).size).toBe(pixels.length)
    for (const { colour } of pixels) expect(colour).toBe(FOREGROUND)
  })

  it('puts one caret at each corner', () => {
    for (const corner of CORNERS) expect(caretAt(pixels, corner)).toHaveLength(CARET_AREA)
  })

  it('draws the top-left caret as a right-angle triangle with the right angle at the outer corner', () => {
    expect(caretRows(caretAt(pixels, 'top-left'))).toEqual(['#####', '####.', '###..', '##...', '#....'])
  })

  it.each<[Corner, (rows: string[]) => string[]]>([
    ['top-right', flipRows],
    ['bottom-left', (rows) => [...rows].reverse()],
    ['bottom-right', (rows) => flipRows([...rows].reverse())],
  ])('mirrors the top-left caret at the %s', (corner, mirror) => {
    expect(caretRows(caretAt(pixels, corner))).toEqual(mirror(caretRows(caretAt(pixels, 'top-left'))))
  })

  it('leaves SELECTION_GAP clear pixels between the carets and the bounds on every side', () => {
    expect(extent(pixels)).toEqual({
      left: BOUNDS.left - SELECTION_GAP - CARET,
      top: BOUNDS.top - SELECTION_GAP - CARET,
      right: BOUNDS.right + SELECTION_GAP + CARET,
      bottom: BOUNDS.bottom + SELECTION_GAP + CARET,
    })
    expect(extent(caretAt(pixels, 'top-left'))).toMatchObject({
      right: BOUNDS.left - SELECTION_GAP - 1,
      bottom: BOUNDS.top - SELECTION_GAP - 1,
    })
    expect(extent(caretAt(pixels, 'bottom-right'))).toMatchObject({
      left: BOUNDS.right + SELECTION_GAP + 1,
      top: BOUNDS.bottom + SELECTION_GAP + 1,
    })
  })

  it('surrounds a single-pixel object the same way', () => {
    const dot: Bounds = { left: 50, top: 60, right: 50, bottom: 60 }

    const around = selectionPixels(dot, 0, WIDTH, HEIGHT)

    expect(around).toHaveLength(4 * CARET_AREA)
    expect(extent(around)).toEqual({
      left: 50 - SELECTION_GAP - CARET,
      top: 60 - SELECTION_GAP - CARET,
      right: 50 + SELECTION_GAP + CARET,
      bottom: 60 + SELECTION_GAP + CARET,
    })
  })

  it.each<[Corner, number, number]>([
    ['top-left', 1, 1],
    ['top-right', -1, 1],
    ['bottom-left', 1, -1],
    ['bottom-right', -1, -1],
  ])('moves the %s caret diagonally in by the inset', (corner, dx, dy) => {
    const inset = 2

    const moved = caretAt(selectionPixels(BOUNDS, inset, WIDTH, HEIGHT), corner)

    expect(keys(moved)).toEqual(keys(caretAt(pixels, corner).map(({ x, y }) => ({ x: x + dx * inset, y: y + dy * inset }))))
  })

  it.each<[string, Bounds]>([
    ['the top-left', { left: 2, top: 3, right: 40, bottom: 30 }],
    ['the bottom-right', { left: 280, top: 210, right: WIDTH - 2, bottom: HEIGHT - 1 }],
    ['every', { left: 0, top: 0, right: WIDTH - 1, bottom: HEIGHT - 1 }],
  ])('clips carets past %s edge of the canvas, keeping the rest', (_, bounds) => {
    const clipped = selectionPixels(bounds, 0, WIDTH, HEIGHT)

    expectOnCanvas(clipped)
    expect(clipped.length).toBeLessThan(4 * CARET_AREA)
    const onCanvas = ({ x, y }: { x: number; y: number }) => x >= 0 && x < WIDTH && y >= 0 && y < HEIGHT
    expect(keys(clipped)).toEqual(keys(selectionPixels(bounds, 0, UNCLIPPED, UNCLIPPED).filter(onCanvas)))
  })
})
