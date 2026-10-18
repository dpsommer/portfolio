import { describe, expect, it, vi } from 'vitest'
import { BACKGROUND, FOREGROUND, FOREGROUND_DIM, FOREGROUND_WORN } from '../core/palette.ts'
import { clearPanel, weather } from './panelCanvas.ts'

// A stand-in for a 2D context: just the canvas size, fill style and fillRect.
function fakeContext(width: number, height: number) {
  const ctx = { canvas: { width, height }, fillStyle: '', fillRect: vi.fn() }
  return ctx as unknown as CanvasRenderingContext2D & { fillRect: ReturnType<typeof vi.fn> }
}

describe('clearPanel', () => {
  it('fills the whole canvas', () => {
    const ctx = fakeContext(320, 132)

    clearPanel(ctx)

    expect(ctx.fillRect).toHaveBeenCalledExactlyOnceWith(0, 0, 320, 132)
  })

  it('fills with the background colour', () => {
    const ctx = fakeContext(320, 132)

    clearPanel(ctx)

    expect(ctx.fillStyle).toBe(BACKGROUND)
  })

  it('uses the canvas\'s own size', () => {
    const ctx = fakeContext(17, 5)

    clearPanel(ctx)

    expect(ctx.fillRect).toHaveBeenCalledExactlyOnceWith(0, 0, 17, 5)
  })
})

describe('weather', () => {
  describe('dropping', () => {
    it('drops the pixel when the roll is below dropChance', () => {
      expect(weather(FOREGROUND, 0.03, 0.04, 0.2)).toBeNull()
    })

    it('drops the pixel for a roll of 0', () => {
      expect(weather(FOREGROUND, 0, 0.04, 0.2)).toBeNull()
    })

    it('keeps the pixel when the roll equals dropChance', () => {
      expect(weather(FOREGROUND, 0.04, 0.04, 0.2)).not.toBeNull()
    })

    it('never drops a pixel when dropChance is 0', () => {
      expect(weather(FOREGROUND, 0, 0, 0.2)).not.toBeNull()
    })

    it.each([FOREGROUND, FOREGROUND_WORN, FOREGROUND_DIM])('drops %s pixels alike', (colour) => {
      expect(weather(colour, 0.01, 0.04, 0.2)).toBeNull()
    })
  })

  describe('fading', () => {
    it('fades the full foreground to the worn colour', () => {
      expect(weather(FOREGROUND, 0.1, 0.04, 0.2)).toBe(FOREGROUND_WORN)
    })

    it('fades the worn colour to the dim colour', () => {
      expect(weather(FOREGROUND_WORN, 0.1, 0.04, 0.2)).toBe(FOREGROUND_DIM)
    })

    it('leaves the dim colour dim when it fades', () => {
      expect(weather(FOREGROUND_DIM, 0.1, 0.04, 0.2)).toBe(FOREGROUND_DIM)
    })

    it('fades any other colour to the dim colour', () => {
      expect(weather('#123456', 0.1, 0.04, 0.2)).toBe(FOREGROUND_DIM)
    })

    it('fades the pixel when the roll equals dropChance', () => {
      expect(weather(FOREGROUND, 0.04, 0.04, 0.2)).toBe(FOREGROUND_WORN)
    })

    it('fades the pixel just below dropChance + fadeChance', () => {
      expect(weather(FOREGROUND, 0.239, 0.04, 0.2)).toBe(FOREGROUND_WORN)
    })

    it('fades from a roll of 0 when dropChance is 0', () => {
      expect(weather(FOREGROUND, 0, 0, 0.2)).toBe(FOREGROUND_WORN)
    })

    it('never fades when fadeChance is 0', () => {
      expect(weather(FOREGROUND, 0.05, 0.04, 0)).toBe(FOREGROUND)
    })
  })

  describe('keeping', () => {
    it('keeps the colour when the roll equals dropChance + fadeChance', () => {
      expect(weather(FOREGROUND, 0.25, 0.05, 0.2)).toBe(FOREGROUND)
    })

    it.each([FOREGROUND, FOREGROUND_WORN, FOREGROUND_DIM])('keeps %s for a high roll', (colour) => {
      expect(weather(colour, 0.99, 0.04, 0.2)).toBe(colour)
    })

    it('keeps every pixel unchanged when both chances are 0', () => {
      expect(weather(FOREGROUND, 0, 0, 0)).toBe(FOREGROUND)
    })
  })

  it('drops, fades and keeps in proportion to the chances over evenly spread rolls', () => {
    const rolls = Array.from({ length: 1000 }, (_, i) => i / 1000)
    const results = rolls.map((roll) => weather(FOREGROUND, roll, 0.1, 0.3))

    expect(results.filter((r) => r === null)).toHaveLength(100)
    expect(results.filter((r) => r === FOREGROUND_WORN)).toHaveLength(300)
    expect(results.filter((r) => r === FOREGROUND)).toHaveLength(600)
  })
})
