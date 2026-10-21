import { describe, expect, it } from 'vitest'
import { extent } from '../../test/pixels.ts'
import { BACKGROUND, FOREGROUND } from '../core/palette.ts'
import { GLYPH_HEIGHT, textPixels, textWidth } from '../core/pixelFont.ts'
import type { Pixel } from '../core/types.ts'
import { BUBBLE_HEIGHT, BUBBLE_TAIL, bubblePixels, bubbleWidth } from './bubble.ts'

// The text is drawn at twice the font's size, this far in from the box's left and top.
const SCALE = 2
const PADDING_X = 7
const PADDING_Y = 6
// How far each of the box's top rows is cut in from each side, top first; the
// bottom rows mirror them.
const CORNER_INSETS = [5, 3, 2, 1, 1]

const key = ({ x, y }: { x: number; y: number }) => `${x},${y}`
const byPosition = <T extends { x: number; y: number }>(pixels: T[]) => [...pixels].sort((a, b) => a.y - b.y || a.x - b.x)
const positions = (pixels: { x: number; y: number }[]) => byPosition(pixels.map(({ x, y }) => ({ x, y })))
const box = (pixels: Pixel[]) => pixels.filter(({ x }) => x >= 0)
const tail = (pixels: Pixel[]) => pixels.filter(({ x }) => x < 0)
const text = (pixels: Pixel[]) => pixels.filter(({ colour }) => colour === BACKGROUND)
const fill = (pixels: Pixel[]) => box(pixels).filter(({ colour }) => colour === FOREGROUND)

// `typed` drawn as the bubble's text, in from the box's top left.
const textAt = (typed: string) =>
  textPixels(typed, SCALE).map(({ x, y }) => ({ x: x + PADDING_X, y: y + PADDING_Y, colour: BACKGROUND }))

// The box's rounded shape for a box `width` wide.
function roundedBox(width: number) {
  const cells: { x: number; y: number }[] = []
  for (let y = 0; y < BUBBLE_HEIGHT; y++) {
    const inset = CORNER_INSETS[Math.min(y, BUBBLE_HEIGHT - 1 - y)] ?? 0
    for (let x = inset; x < width - inset; x++) cells.push({ x, y })
  }
  return cells
}

const MESSAGES = ['Ouch!', 'A', 'That tickles.']

describe('bubblePixels', () => {
  describe.each(MESSAGES)('for %j', (message) => {
    const full = bubblePixels({ text: message, shown: message.length })
    const right = bubbleWidth(message) - 1
    const bottom = BUBBLE_HEIGHT - 1

    it('spans (0, 0) to (bubbleWidth - 1, BUBBLE_HEIGHT - 1) with its box', () => {
      expect(extent(box(full))).toEqual({ left: 0, top: 0, right, bottom })
    })

    it.each([0, 1, message.length])('covers the rounded box shape with its box and text together, with %i characters shown', (shown) => {
      expect(positions(box(bubblePixels({ text: message, shown })))).toEqual(positions(roundedBox(right + 1)))
    })

    it('rounds each corner by cutting in its outer rows 5, 3, 2, 1 and 1 pixels', () => {
      const rowEnds = (y: number) => {
        const row = box(full).filter((pixel) => pixel.y === y)
        return [extent(row).left, extent(row).right]
      }

      CORNER_INSETS.forEach((inset, row) => {
        expect(rowEnds(row)).toEqual([inset, right - inset])
        expect(rowEnds(bottom - row)).toEqual([inset, right - inset])
      })
      for (let y = CORNER_INSETS.length; y <= bottom - CORNER_INSETS.length; y++) expect(rowEnds(y)).toEqual([0, right])
    })

    it('draws the whole message in dark text at twice the font\'s size, 7 in from the box\'s left and 6 from its top', () => {
      expect(byPosition(text(full))).toEqual(byPosition(textAt(message)))
    })

    it('pads the text as far from the box\'s right and bottom as from its left and top', () => {
      // Measured from the text's cells, which glyphs needn't fill.
      expect(right - (PADDING_X + textWidth(message, SCALE) - 1)).toBe(PADDING_X)
      expect(bottom - (PADDING_Y + GLYPH_HEIGHT * SCALE - 1)).toBe(PADDING_Y)
    })

    it('fills the box in the bright foreground everywhere but under the text', () => {
      const inText = new Set(textAt(message).map(key))

      expect(positions(fill(full))).toEqual(positions(roundedBox(right + 1).filter((cell) => !inText.has(key(cell)))))
    })

    it('draws each pixel once', () => {
      expect(new Set(full.map(key)).size).toBe(full.length)
    })

    it('draws a solid bright tail BUBBLE_TAIL left of the box, narrowing from 8 rows to 2 around its middle', () => {
      const expected: Pixel[] = []
      for (const [x, top, tailBottom] of [[-1, 9, 16], [-2, 10, 15], [-3, 11, 14], [-4, 12, 13]]) {
        for (let y = top; y <= tailBottom; y++) expected.push({ x, y, colour: FOREGROUND })
      }

      expect(byPosition(tail(full))).toEqual(byPosition(expected))
      expect(extent(tail(full)).left).toBe(-BUBBLE_TAIL)
    })

    it.each([0, 1])('draws the same tail with %i characters shown', (shown) => {
      expect(byPosition(tail(bubblePixels({ text: message, shown })))).toEqual(byPosition(tail(full)))
    })
  })

  it.each([
    [0, ''],
    [1, 'O'],
    [3, 'Ouc'],
  ])('draws only the first %i characters as they type out', (shown, typed) => {
    expect(byPosition(text(bubblePixels({ text: 'Ouch!', shown })))).toEqual(byPosition(textAt(typed)))
  })
})

describe('bubbleWidth', () => {
  it('grows by a glyph and its spacing, at twice the font\'s size, per character', () => {
    expect(bubbleWidth('Ouch')).toBe(bubbleWidth('Ouc') + 12)
  })
})
