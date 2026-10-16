import { describe, expect, it } from 'vitest'
import { GLYPH_HEIGHT, textPixels, textWidth } from './pixelFont.ts'

describe('textWidth', () => {
  it('is 0 for an empty string', () => {
    expect(textWidth('')).toBe(0)
  })

  it('is the glyph width for a single character', () => {
    expect(textWidth('W')).toBe(5)
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

  it.each(['C', 'E', 'L', 'M', 'O', 'W'])('draws pixels for glyph %s', (char) => {
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
