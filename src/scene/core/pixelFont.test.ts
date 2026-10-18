import { describe, expect, it } from 'vitest'
import { GLYPH_HEIGHT, GLYPH_WIDTH, textPixels, textWidth } from './pixelFont.ts'

const GLYPHS = ['C', 'E', 'L', 'M', 'N', 'O', 'S', 'W']

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
    expect(() => textPixels('WEX')).toThrow('No pixel font glyph for "X"')
  })
})

describe('compass glyphs', () => {
  // A glyph as rows of '#' and '.', read back from its pixels.
  function rowsOf(char: string): string[] {
    const filled = new Set(textPixels(char).map(({ x, y }) => `${x},${y}`))
    return Array.from({ length: GLYPH_HEIGHT }, (_, y) =>
      Array.from({ length: GLYPH_WIDTH }, (_, x) => (filled.has(`${x},${y}`) ? '#' : '.')).join(''),
    )
  }

  it.each(['N', 'S'])('fits %s in one glyph cell', (char) => {
    expect(textWidth(char)).toBe(GLYPH_WIDTH)
    for (const { x, y } of textPixels(char)) {
      expect(x).toBeLessThan(GLYPH_WIDTH)
      expect(y).toBeLessThan(GLYPH_HEIGHT)
    }
  })

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

  it.each(['N', 'S'])('makes %s different from every other glyph', (char) => {
    for (const other of GLYPHS.filter((c) => c !== char)) {
      expect(rowsOf(char)).not.toEqual(rowsOf(other))
    }
  })
})
