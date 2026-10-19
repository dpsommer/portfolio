import { describe, expect, it } from 'vitest'
import { expectOnCanvas, expectPlaced } from '../../test/pixels.ts'
import { FOREGROUND, FOREGROUND_WORN } from '../core/palette.ts'
import { GLYPH_HEIGHT, textPixels, textWidth } from '../core/pixelFont.ts'
import type { Pixel } from '../core/types.ts'
import type { Health } from './card.ts'
import { POTION_HEIGHT, POTION_WIDTH, potionPixels } from './potion.ts'

// The readout is twice the font's size, along the potion's bottom.
const READOUT_TOP = POTION_HEIGHT - 2 * GLYPH_HEIGHT
const EMPTY: Health = { current: 0, total: 92 }
const FULL: Health = { current: 92, total: 92 }

const key = (x: number, y: number) => `${x},${y}`
const rowOf = (position: string) => Number(position.split(',')[1])

// What the flask (everything above the readout) paints at each position, the last pixel winning.
function flask(health: Health): Map<string, string> {
  const painted = new Map<string, string>()
  for (const { x, y, colour } of potionPixels(health)) if (y < READOUT_TOP) painted.set(key(x, y), colour)
  return painted
}

// Inside the glass: where a full potion paints differently from an empty one
// (the liquid), plus the empty potion's glint, in the same rows.
const LIQUID = [...flask(FULL)].filter(([position, colour]) => flask(EMPTY).get(position) !== colour).map(([position]) => position)
const INSIDE_ROWS = [...new Set(LIQUID.map(rowOf))].sort((a, b) => a - b)
const INSIDE = new Set([
  ...LIQUID,
  ...[...flask(EMPTY)].filter(([position, colour]) => colour === FOREGROUND_WORN && INSIDE_ROWS.includes(rowOf(position))).map(([p]) => p),
])
const INSIDE_BY_ROW = new Map(INSIDE_ROWS.map((row) => [row, [...INSIDE].filter((position) => rowOf(position) === row)]))
const insideRow = (row: number) => INSIDE_BY_ROW.get(row) ?? []

// The inside rows the liquid fills, top to bottom: those with every position painted.
function liquidRows(health: Health): number[] {
  const painted = flask(health)
  return INSIDE_ROWS.filter((row) => insideRow(row).every((position) => painted.has(position)))
}
// The glint: painted inside the glass, above the liquid.
function glint(health: Health): string[] {
  const painted = flask(health)
  const filled = liquidRows(health)
  return [...INSIDE].filter((position) => painted.has(position) && !filled.includes(rowOf(position)))
}

const HEALTHS: Health[] = [EMPTY, FULL, { current: 19, total: 92 }, { current: 1, total: 1 }, { current: 9999, total: 9999 }, { current: 0, total: 0 }]

describe('potionPixels', () => {
  it.each(HEALTHS)('stays on a POTION_WIDTH x POTION_HEIGHT canvas at $current/$total', (health) => {
    expectOnCanvas(potionPixels(health), POTION_WIDTH, POTION_HEIGHT)
  })

  it.each(HEALTHS)('is symmetric about its middle column apart from the glint and readout at $current/$total', (health) => {
    const painted = flask(health)
    for (const position of glint(health)) painted.delete(position)

    for (const [position, colour] of painted) {
      const [x, y] = position.split(',').map(Number)
      expect(painted.get(key(POTION_WIDTH - 1 - x, y))).toBe(colour)
    }
  })

  describe('liquid', () => {
    it('fills a full potion from the glass\'s bottom to the top of its neck, under the lip', () => {
      const top = INSIDE_ROWS[0]
      const bottom = INSIDE_ROWS[INSIDE_ROWS.length - 1]
      const widest = Math.max(...INSIDE_ROWS.map((row) => insideRow(row).length))

      expect(liquidRows(FULL)).toEqual(INSIDE_ROWS)
      // The top row is in the neck, narrower than the body, with the bright lip right above it.
      expect(insideRow(top).length).toBeLessThan(widest)
      for (const position of [...insideRow(top), ...insideRow(bottom)]) {
        const [x, y] = position.split(',').map(Number)
        const outside = y === top ? key(x, y - 1) : key(x, y + 1)
        expect(flask(EMPTY).get(outside)).toBe(FOREGROUND)
      }
    })

    it('leaves an empty potion\'s glass empty apart from the worn glint', () => {
      const painted = [...INSIDE].filter((position) => flask(EMPTY).has(position))

      expect(liquidRows(EMPTY)).toEqual([])
      expect(painted.length).toBeGreaterThan(0)
      expect(painted.every((position) => flask(EMPTY).get(position) === FOREGROUND_WORN)).toBe(true)
    })

    it.each([
      ['half', 46, 92, 0.5],
      ['the card\'s', 19, 92, 19 / 92],
      ['a sliver of', 1, 92, 1 / 92],
      ['more than full', 150, 92, 1],
      ['below empty', -5, 92, 0],
      ['no total for', 5, 0, 0],
      ['zero of zero for', 0, 0, 0],
    ])('fills the bottom rows of the inside to %s health', (_, current, total, share) => {
      const rows = Math.round(share * INSIDE_ROWS.length)

      expect(liquidRows({ current, total })).toEqual(INSIDE_ROWS.slice(INSIDE_ROWS.length - rows))
    })

    it.each([
      [46, 92],
      [19, 92],
      [91, 92],
      [92, 92],
    ])('has a bright surface over worn rows at %i/%i', (current, total) => {
      const [surface, ...below] = liquidRows({ current, total })
      const painted = flask({ current, total })
      const colours = (row: number) => insideRow(row).map((position) => painted.get(position))

      expect(new Set(colours(surface))).toEqual(new Set([FOREGROUND]))
      expect(new Set(below.flatMap(colours))).toEqual(new Set([FOREGROUND_WORN]))
    })
  })

  describe('glint', () => {
    const levels = Array.from({ length: 93 }, (_, current) => ({ current, total: 92 }))

    it('never draws over the liquid, at any level', () => {
      for (const health of levels) {
        const insideDrawn = potionPixels(health).filter(({ x, y }) => y < READOUT_TOP && INSIDE.has(key(x, y)))
        expect(new Set(insideDrawn.map(({ x, y }) => key(x, y))).size).toBe(insideDrawn.length)
      }
    })

    it('shows the empty potion\'s glint wherever it is above the liquid', () => {
      for (const health of levels) {
        const surface = liquidRows(health)[0] ?? Number.POSITIVE_INFINITY
        expect(glint(health).sort()).toEqual(glint(EMPTY).filter((position) => rowOf(position) < surface).sort())
      }
    })
  })

  it.each([
    [19, 92],
    [1, 1],
    [9999, 9999],
    [0, 0],
  ])('centres the readout %i/%i under the flask at twice the font\'s size', (current, total) => {
    const text = `${current}/${total}`
    const readout = potionPixels({ current, total }).filter(({ y }) => y >= READOUT_TOP)

    const { left, top } = expectPlaced(readout, textPixels(text, 2))

    expect(top).toBe(READOUT_TOP)
    expect(Math.abs(left - (POTION_WIDTH - left - textWidth(text, 2)))).toBeLessThanOrEqual(1)
    expect(readout.every(({ colour }: Pixel) => colour === FOREGROUND)).toBe(true)
  })
})
