import { describe, expect, it } from 'vitest'
import { GLYPH_HEIGHT, GLYPH_WIDTH, textPixels, textWidth } from './pixelFont.ts'

// Every glyph the font has, and those that draw something (all but space).
const ALL_GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 .,!?'-:/+↑↓←→".split('')
const GLYPHS = ALL_GLYPHS.filter((char) => char !== ' ')

// A glyph as rows of '#' and '.', read back from its pixels.
function rowsOf(char: string): string[] {
  const filled = new Set(textPixels(char).map(({ x, y }) => `${x},${y}`))
  return Array.from({ length: GLYPH_HEIGHT }, (_, y) =>
    Array.from({ length: GLYPH_WIDTH }, (_, x) => (filled.has(`${x},${y}`) ? '#' : '.')).join(''),
  )
}

const mirrored = (rows: string[]) => rows.map((row) => row.split('').reverse().join(''))
const flipped = (rows: string[]) => [...rows].reverse()
const filledCount = (row: string) => row.split('').filter((cell) => cell === '#').length

describe('textWidth', () => {
  it('is 0 for an empty string', () => {
    expect(textWidth('')).toBe(0)
  })

  it('is the glyph width for a single character', () => {
    expect(textWidth('W')).toBe(GLYPH_WIDTH)
  })

  it('includes spacing between glyphs and applies the scale', () => {
    expect(textWidth('WELCOME', 2)).toBe(82)
  })
})

describe('textPixels', () => {
  it('returns no pixels for an empty string', () => {
    expect(textPixels('')).toEqual([])
  })

  it.each([2, 3])('scales the pixel count by scale squared (scale %s)', (scale) => {
    expect(textPixels('WELCOME', scale)).toHaveLength(textPixels('WELCOME').length * scale * scale)
  })

  it.each(GLYPHS)('draws pixels for glyph %s', (char) => {
    expect(textPixels(char).length).toBeGreaterThan(0)
  })

  it('draws nothing for a space, but still takes up a glyph', () => {
    expect(textPixels(' ')).toEqual([])
    expect(textWidth('W W')).toBe(textWidth('WWW'))
  })

  it.each(ALL_GLYPHS)('draws glyph %j within one 5x7 cell', (char) => {
    for (const { x, y } of textPixels(char)) {
      expect(x).toBeGreaterThanOrEqual(0)
      expect(x).toBeLessThan(GLYPH_WIDTH)
      expect(y).toBeGreaterThanOrEqual(0)
      expect(y).toBeLessThan(GLYPH_HEIGHT)
    }
  })

  it('draws every glyph differently', () => {
    const shapes = new Set(ALL_GLYPHS.map((char) => rowsOf(char).join('/')))

    expect(shapes.size).toBe(ALL_GLYPHS.length)
  })

  it('keeps all pixels within the text bounds', () => {
    const scale = 2
    const width = textWidth('WELCOME', scale)
    for (const { x, y } of textPixels('WELCOME', scale)) {
      expect(x).toBeGreaterThanOrEqual(0)
      expect(x).toBeLessThan(width)
      expect(y).toBeGreaterThanOrEqual(0)
      expect(y).toBeLessThan(GLYPH_HEIGHT * scale)
    }
  })

  it('does not repeat pixels', () => {
    const pixels = textPixels('WELCOME', 2)
    expect(new Set(pixels.map(({ x, y }) => `${x},${y}`)).size).toBe(pixels.length)
  })

  it('throws for an unknown glyph', () => {
    expect(() => textPixels('WE~')).toThrow('No pixel font glyph for "~"')
  })
})

describe('arrow glyphs', () => {
  // Lines across the arrow, from its tip back to its tail: the head widens to
  // its widest line, then a one-pixel shaft runs straight back from it.
  function expectPointsAlong(lines: string[]) {
    const spans = lines.map((line) => line.lastIndexOf('#') - line.indexOf('#') + 1)
    const widest = spans.indexOf(Math.max(...spans))

    expect(widest).toBeGreaterThan(0)
    expect(widest).toBeLessThan(lines.length - 1)
    for (let i = 1; i <= widest; i++) expect(spans[i]).toBeGreaterThan(spans[i - 1])
    expect(lines.slice(widest + 1).every((line) => filledCount(line) === 1 && line === lines[lines.length - 1])).toBe(true)
  }

  it('draws ↑ with its head at the top', () => {
    expectPointsAlong(rowsOf('↑'))
  })

  it('draws → with its head at the right', () => {
    const rows = rowsOf('→')
    const columns = Array.from({ length: GLYPH_WIDTH }, (_, x) => rows.map((row) => row[x]).join(''))

    expectPointsAlong(columns.reverse())
  })

  it.each([
    ['↑', mirrored],
    ['→', flipped],
  ])('draws %s symmetric about its shaft', (char, reflect) => {
    expect(reflect(rowsOf(char))).toEqual(rowsOf(char))
  })

  it.each([
    ['↓', '↑', 'upside down', flipped],
    ['←', '→', 'mirrored', mirrored],
  ])('draws %s as %s %s', (char, other, _how, reflect) => {
    expect(rowsOf(char)).toEqual(reflect(rowsOf(other)))
  })
})

describe('compass glyphs', () => {

  it('draws N with solid sides joined by a diagonal from top left to bottom right', () => {
    const rows = rowsOf('N')
    const inner = rows.map((row) => row.slice(1, -1).indexOf('#'))

    expect(rows.every((row) => row[0] === '#' && row[GLYPH_WIDTH - 1] === '#')).toBe(true)
    // The diagonal's column never moves left going down.
    const diagonal = inner.filter((column) => column >= 0)
    expect(diagonal.length).toBeGreaterThan(0)
    for (let i = 1; i < diagonal.length; i++) expect(diagonal[i]).toBeGreaterThanOrEqual(diagonal[i - 1])
    expect(diagonal[diagonal.length - 1]).toBeGreaterThan(diagonal[0])
  })

  it('draws S the same turned half way round', () => {
    const rows = rowsOf('S')
    const turned = [...rows].reverse().map((row) => row.split('').reverse().join(''))

    expect(turned).toEqual(rows)
  })

  it('draws S with open sides where it curves', () => {
    const rows = rowsOf('S')

    expect(rows[2][GLYPH_WIDTH - 1]).toBe('.')
    expect(rows[4][0]).toBe('.')
    expect(rows[2][0]).toBe('#')
    expect(rows[4][GLYPH_WIDTH - 1]).toBe('#')
  })
})
