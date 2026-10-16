import { describe, expect, it } from 'vitest'
import { BACKGROUND, FOREGROUND, FOREGROUND_DIM, FOREGROUND_WORN } from '../core/palette.ts'
import { isOnGlass } from './frame.ts'
import {
  GLASS_CELLS,
  PIXELS_PER_UNIT,
  PREVIEW_COLOURS,
  PREVIEW_HEIGHT,
  PREVIEW_WIDTH,
  quantisePreview,
  shimmerTone,
  toneAt,
} from './preview.ts'
import type { PreviewCell } from './preview.ts'

// RGBA pixels of one grey level (0-255), as from getImageData.
function uniform(width: number, height: number, level: number): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < data.length; i += 4) {
    data[i] = level
    data[i + 1] = level
    data[i + 2] = level
    data[i + 3] = 255
  }
  return data
}

// A preview whose tone varies cell by cell.
function patterned(): Uint8Array {
  return Uint8Array.from({ length: PREVIEW_WIDTH * PREVIEW_HEIGHT }, (_, i) => i % 4)
}

describe('preview constants', () => {
  it('uses 128 cells per mirror unit', () => {
    expect(PIXELS_PER_UNIT).toBe(128)
  })

  it('covers the glass at about 84x123 cells', () => {
    expect(PREVIEW_WIDTH).toBeGreaterThanOrEqual(83)
    expect(PREVIEW_WIDTH).toBeLessThanOrEqual(85)
    expect(PREVIEW_HEIGHT).toBeGreaterThanOrEqual(122)
    expect(PREVIEW_HEIGHT).toBeLessThanOrEqual(124)
  })

  it('maps tones 0-3 to the background, dim, worn and full foreground', () => {
    expect(PREVIEW_COLOURS).toEqual([BACKGROUND, FOREGROUND_DIM, FOREGROUND_WORN, FOREGROUND])
  })
})

describe('quantisePreview', () => {
  it('returns one tone per pixel', () => {
    expect(quantisePreview(uniform(5, 3, 128), 5, 3)).toHaveLength(15)
  })

  it('turns black into tone 0', () => {
    expect([...quantisePreview(uniform(8, 8, 0), 8, 8)].every((tone) => tone === 0)).toBe(true)
  })

  it('turns white into tone 3 wherever the dither threshold is above 0', () => {
    const tones = quantisePreview(uniform(8, 8, 255), 8, 8)
    const offZero = [...tones].filter((_, i) => i % 4 !== 0 || Math.floor(i / 8) % 4 !== 0)
    expect(offZero.every((tone) => tone === 3)).toBe(true)
  })

  it('turns white into tone 3 everywhere', () => {
    expect([...quantisePreview(uniform(8, 8, 255), 8, 8)].every((tone) => tone === 3)).toBe(true)
  })

  it.each([10, 20, Math.floor(0.1 * 255)])('turns near-black grey %i, at or below the black point, into tone 0', (level) => {
    expect([...quantisePreview(uniform(8, 8, level), 8, 8)].every((tone) => tone === 0)).toBe(true)
  })

  it('dithers a mid-grey into a mix of two adjacent tones', () => {
    // Half-way between tones 1 and 2 after the black point.
    const level = Math.round((0.1 + 0.9 * 0.5) * 255)
    const tones = new Set(quantisePreview(uniform(8, 8, level), 8, 8))
    expect(tones).toEqual(new Set([1, 2]))
  })

  it('dithers a grey just above the black point into a mix of tones 0 and 1', () => {
    const level = Math.round((0.1 + 0.9 * 0.15) * 255)
    expect(new Set(quantisePreview(uniform(8, 8, level), 8, 8))).toEqual(new Set([0, 1]))
  })

  it('weights the green channel most', () => {
    const red = new Uint8ClampedArray([255, 0, 0, 255])
    const green = new Uint8ClampedArray([0, 255, 0, 255])
    expect(quantisePreview(green, 1, 1)[0]).toBeGreaterThan(quantisePreview(red, 1, 1)[0])
  })

  it('is deterministic', () => {
    const data = uniform(16, 16, 150)
    expect(quantisePreview(data, 16, 16)).toEqual(quantisePreview(data, 16, 16))
  })

  it('only gives tones 0 to 3', () => {
    const data = new Uint8ClampedArray(64 * 4).map((_, i) => (i * 37) % 256)
    for (const tone of quantisePreview(data, 8, 8)) {
      expect(tone).toBeGreaterThanOrEqual(0)
      expect(tone).toBeLessThanOrEqual(3)
    }
  })
})

describe('GLASS_CELLS', () => {
  it('has cells', () => {
    expect(GLASS_CELLS.length).toBeGreaterThan(0)
  })

  it('only has cells whose centres are on the glass', () => {
    expect(GLASS_CELLS.every(isOnGlass)).toBe(true)
  })

  it('has unique indices within the preview', () => {
    const indices = GLASS_CELLS.map(({ index }) => index)
    expect(new Set(indices).size).toBe(indices.length)
    for (const index of indices) {
      expect(Number.isInteger(index)).toBe(true)
      expect(index).toBeGreaterThanOrEqual(0)
      expect(index).toBeLessThan(PREVIEW_WIDTH * PREVIEW_HEIGHT)
    }
  })

  it('leaves out cells off the glass, such as the grid\'s top corners', () => {
    expect(GLASS_CELLS.length).toBeLessThan(PREVIEW_WIDTH * PREVIEW_HEIGHT)
    const indices = new Set(GLASS_CELLS.map(({ index }) => index))
    expect(indices.has(0)).toBe(false)
    expect(indices.has(PREVIEW_WIDTH - 1)).toBe(false)
  })
})

describe('toneAt', () => {
  it('returns each glass cell\'s tone at its centre', () => {
    const preview = patterned()
    for (const { s, t, index } of GLASS_CELLS) expect(toneAt(preview, s, t)).toBe(preview[index])
  })

  it('returns 0 off the grid', () => {
    const preview = new Uint8Array(PREVIEW_WIDTH * PREVIEW_HEIGHT).fill(3)
    expect(toneAt(preview, 10, 0)).toBe(0)
    expect(toneAt(preview, -10, 0)).toBe(0)
    expect(toneAt(preview, 0, 10)).toBe(0)
    expect(toneAt(preview, 0, -10)).toBe(0)
  })

  it('returns a cell\'s tone anywhere inside that cell', () => {
    const preview = patterned()
    const { s, t, index } = GLASS_CELLS[Math.floor(GLASS_CELLS.length / 2)]
    const nudge = 0.4 / PIXELS_PER_UNIT
    expect(toneAt(preview, s + nudge, t - nudge)).toBe(preview[index])
    expect(toneAt(preview, s - nudge, t + nudge)).toBe(preview[index])
  })
})

describe('shimmerTone', () => {
  // When a cell switches from 0 to 2: before its switch it shows 0 (or 1 while
  // flashing), after it 2 (or 3 while flashing), so the switch is the first
  // progress showing 2 or more.
  function switchAt(cell: PreviewCell): number {
    let low = 0
    let high = 1
    for (let i = 0; i < 30; i++) {
      const middle = (low + high) / 2
      if (shimmerTone(cell, 0, 2, middle) >= 2) high = middle
      else low = middle
    }
    return high
  }
  const CELLS = GLASS_CELLS.filter((_, i) => i % 37 === 0)
  const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length

  it('shows the old tone at progress 0', () => {
    for (const cell of CELLS) expect(shimmerTone(cell, 1, 2, 0)).toBe(1)
  })

  it('shows the new tone at progress 1', () => {
    for (const cell of CELLS) expect(shimmerTone(cell, 1, 2, 1)).toBe(2)
  })

  it('switches every cell between progress 0.1 and 0.9', () => {
    for (const cell of CELLS) {
      const at = switchAt(cell)
      expect(at).toBeGreaterThanOrEqual(0.1 - 1e-6)
      expect(at).toBeLessThan(0.9)
    }
  })

  it('shows the old tone well before a cell\'s switch and the new one well after', () => {
    for (const cell of CELLS) {
      const at = switchAt(cell)
      expect(shimmerTone(cell, 1, 2, at - 0.07)).toBe(1)
      expect(shimmerTone(cell, 1, 2, at + 0.07)).toBe(2)
    }
  })

  it('flashes a tone brighter just either side of the switch', () => {
    for (const cell of CELLS) {
      const at = switchAt(cell)
      expect(shimmerTone(cell, 1, 2, at - 0.05)).toBe(2)
      expect(shimmerTone(cell, 1, 2, at + 0.05)).toBe(3)
    }
  })

  it('flashes even where the tone doesn\'t change', () => {
    const cell = CELLS[0]
    const at = switchAt(cell)
    expect(shimmerTone(cell, 1, 1, at)).toBe(2)
    expect(shimmerTone(cell, 1, 1, at - 0.07)).toBe(1)
  })

  it('caps the flash at the full foreground', () => {
    for (const cell of CELLS) {
      const at = switchAt(cell)
      expect(shimmerTone(cell, 3, 3, at - 0.03)).toBe(3)
      expect(shimmerTone(cell, 3, 3, at + 0.03)).toBe(3)
    }
  })

  it('flashes background cells to dim', () => {
    const cell = CELLS[0]
    expect(shimmerTone(cell, 0, 0, switchAt(cell))).toBe(1)
  })

  it('switches cells at different moments', () => {
    expect(new Set(CELLS.map((cell) => switchAt(cell).toFixed(3))).size).toBeGreaterThan(CELLS.length / 2)
  })

  it('switches top-left cells earlier on average than bottom-right ones', () => {
    const middle = { s: mean(GLASS_CELLS.map(({ s }) => s)), t: mean(GLASS_CELLS.map(({ t }) => t)) }
    const topLeft = GLASS_CELLS.filter(({ s, t }) => s < middle.s && t > middle.t)
    const bottomRight = GLASS_CELLS.filter(({ s, t }) => s > middle.s && t < middle.t)
    expect(mean(topLeft.map(switchAt)) + 0.1).toBeLessThan(mean(bottomRight.map(switchAt)))
  })

  it('is deterministic', () => {
    for (const cell of CELLS) expect(shimmerTone(cell, 0, 3, 0.5)).toBe(shimmerTone(cell, 0, 3, 0.5))
  })
})
