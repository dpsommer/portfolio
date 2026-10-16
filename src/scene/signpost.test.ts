import { describe, expect, it } from 'vitest'
import { BACKGROUND, FOREGROUND, FOREGROUND_WORN } from './palette.ts'
import { BOARD_SLOPE, BOARD_WIDTH, signpostBackingPixels, signpostPixels } from './signpost.ts'

const WIDTH = 320
const HEIGHT = 240

describe('signpostPixels', () => {
  it('is deterministic', () => {
    expect(signpostPixels(WIDTH, HEIGHT)).toEqual(signpostPixels(WIDTH, HEIGHT))
  })

  it('draws something', () => {
    expect(signpostPixels(WIDTH, HEIGHT).length).toBeGreaterThan(0)
  })

  it('uses integer coordinates within the canvas', () => {
    for (const { x, y } of signpostPixels(WIDTH, HEIGHT)) {
      expect(Number.isInteger(x)).toBe(true)
      expect(Number.isInteger(y)).toBe(true)
      expect(x).toBeGreaterThanOrEqual(0)
      expect(x).toBeLessThan(WIDTH)
      expect(y).toBeGreaterThanOrEqual(0)
      expect(y).toBeLessThan(HEIGHT)
    }
  })

  it('only uses foreground colours', () => {
    for (const { colour } of signpostPixels(WIDTH, HEIGHT)) {
      expect([FOREGROUND, FOREGROUND_WORN]).toContain(colour)
    }
  })

  it('is worn, with some pixels in the worn colour', () => {
    const colours = signpostPixels(WIDTH, HEIGHT).map((p) => p.colour)
    expect(colours).toContain(FOREGROUND_WORN)
    expect(colours).toContain(FOREGROUND)
  })

  it('is roughly centred horizontally', () => {
    const xs = signpostPixels(WIDTH, HEIGHT).map((p) => p.x)
    const centre = (Math.min(...xs) + Math.max(...xs)) / 2
    expect(Math.abs(centre - WIDTH / 2)).toBeLessThanOrEqual(2)
  })

  it('tilts the board so its right side sits higher than its left', () => {
    const pixels = signpostPixels(WIDTH, HEIGHT)
    const boardLeft = WIDTH / 2 - BOARD_WIDTH / 2
    const boardRight = boardLeft + BOARD_WIDTH - 1
    // Compare a few columns in from each end, away from the chipped corner.
    const topAt = (x: number) => Math.min(...pixels.filter((p) => p.x === x).map((p) => p.y))
    const leftTop = topAt(boardLeft + 10)
    const rightTop = topAt(boardRight - 10)
    const expectedRise = Math.round(-BOARD_SLOPE * (BOARD_WIDTH - 21))
    expect(BOARD_SLOPE).toBeLessThan(0)
    expect(leftTop - rightTop).toBeGreaterThanOrEqual(expectedRise - 1)
    expect(leftTop - rightTop).toBeLessThanOrEqual(expectedRise + 1)
  })

  it('scales its position with the canvas size', () => {
    const xs = signpostPixels(640, 480).map((p) => p.x)
    const centre = (Math.min(...xs) + Math.max(...xs)) / 2
    expect(Math.abs(centre - 320)).toBeLessThanOrEqual(2)
  })
})

describe('signpostBackingPixels', () => {
  it('is deterministic', () => {
    expect(signpostBackingPixels(WIDTH, HEIGHT)).toEqual(signpostBackingPixels(WIDTH, HEIGHT))
  })

  it('only uses the background colour', () => {
    const pixels = signpostBackingPixels(WIDTH, HEIGHT)
    expect(pixels.length).toBeGreaterThan(0)
    for (const { colour } of pixels) expect(colour).toBe(BACKGROUND)
  })

  it('uses integer coordinates within the canvas', () => {
    for (const { x, y } of signpostBackingPixels(WIDTH, HEIGHT)) {
      expect(Number.isInteger(x)).toBe(true)
      expect(Number.isInteger(y)).toBe(true)
      expect(x).toBeGreaterThanOrEqual(0)
      expect(x).toBeLessThan(WIDTH)
      expect(y).toBeGreaterThanOrEqual(0)
      expect(y).toBeLessThan(HEIGHT)
    }
  })

  it.each([
    [320, 240],
    [640, 480],
  ])('covers every board and post pixel of the signpost on a %ix%i canvas', (width, height) => {
    const backing = new Set(signpostBackingPixels(width, height).map((p) => `${p.x},${p.y}`))
    const sign = signpostPixels(width, height)
    const groundY = Math.max(...sign.map((p) => p.y))
    const boardAndPost = sign.filter((p) => p.y !== groundY)
    expect(boardAndPost.length).toBeGreaterThan(0)
    for (const p of boardAndPost) expect(backing.has(`${p.x},${p.y}`)).toBe(true)
  })

  it('leaves the chipped top-right corner uncovered', () => {
    const pixels = signpostBackingPixels(WIDTH, HEIGHT)
    const backing = new Set(pixels.map((p) => `${p.x},${p.y}`))
    const right = Math.max(...pixels.map((p) => p.x))
    const topAt = (x: number) => Math.min(...pixels.filter((p) => p.x === x).map((p) => p.y))
    // Away from the chip, the board's top edge is a column or so higher than at the corner.
    const topNearRight = topAt(right - 10)
    expect(topAt(right)).toBeGreaterThan(topNearRight)
    expect(backing.has(`${right},${topNearRight}`)).toBe(false)
  })
})
