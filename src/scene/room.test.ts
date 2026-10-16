import { describe, expect, it } from 'vitest'
import { FOREGROUND_DIM, FOREGROUND_WORN } from './palette.ts'
import { FAR_WALL_SCALE, farWallRect, roomPixels } from './room.ts'

const WIDTH = 320
const HEIGHT = 240

describe('farWallRect', () => {
  it('is centred on the canvas', () => {
    const { left, top, right, bottom } = farWallRect(WIDTH, HEIGHT)
    expect((left + right) / 2).toBe(WIDTH / 2)
    expect((top + bottom) / 2).toBe(HEIGHT / 2)
  })

  it('is scaled by FAR_WALL_SCALE', () => {
    const { left, top, right, bottom } = farWallRect(WIDTH, HEIGHT)
    expect(Math.abs(right - left - WIDTH * FAR_WALL_SCALE)).toBeLessThanOrEqual(1)
    expect(Math.abs(bottom - top - HEIGHT * FAR_WALL_SCALE)).toBeLessThanOrEqual(1)
  })

  it('scales with the canvas size', () => {
    const { left, top, right, bottom } = farWallRect(640, 480)
    expect(Math.abs(right - left - 640 * FAR_WALL_SCALE)).toBeLessThanOrEqual(1)
    expect(Math.abs(bottom - top - 480 * FAR_WALL_SCALE)).toBeLessThanOrEqual(1)
  })
})

describe('roomPixels', () => {
  it('is deterministic', () => {
    expect(roomPixels(WIDTH, HEIGHT)).toEqual(roomPixels(WIDTH, HEIGHT))
  })

  it('draws something', () => {
    expect(roomPixels(WIDTH, HEIGHT).length).toBeGreaterThan(0)
  })

  it('uses integer coordinates within the canvas', () => {
    for (const { x, y } of roomPixels(WIDTH, HEIGHT)) {
      expect(Number.isInteger(x)).toBe(true)
      expect(Number.isInteger(y)).toBe(true)
      expect(x).toBeGreaterThanOrEqual(0)
      expect(x).toBeLessThan(WIDTH)
      expect(y).toBeGreaterThanOrEqual(0)
      expect(y).toBeLessThan(HEIGHT)
    }
  })

  it('only uses the dim and worn colours', () => {
    for (const { colour } of roomPixels(WIDTH, HEIGHT)) {
      expect([FOREGROUND_DIM, FOREGROUND_WORN]).toContain(colour)
    }
  })

  it('draws diagonals into each corner region outside the far wall', () => {
    const { left, top, right, bottom } = farWallRect(WIDTH, HEIGHT)
    const pixels = roomPixels(WIDTH, HEIGHT)
    const quadrants = [
      (x: number, y: number) => x < left && y < top,
      (x: number, y: number) => x > right && y < top,
      (x: number, y: number) => x < left && y > bottom,
      (x: number, y: number) => x > right && y > bottom,
    ]
    for (const inQuadrant of quadrants) {
      expect(pixels.some((p) => inQuadrant(p.x, p.y))).toBe(true)
    }
  })

  it('draws some floor below the far wall', () => {
    const { bottom } = farWallRect(WIDTH, HEIGHT)
    const floor = roomPixels(WIDTH, HEIGHT).filter((p) => p.colour === FOREGROUND_DIM && p.y > bottom)
    expect(floor.length).toBeGreaterThan(0)
  })

  it('keeps floor pixels inside the floor trapezoid', () => {
    const wall = farWallRect(WIDTH, HEIGHT)
    const centreX = WIDTH / 2
    const centreY = HEIGHT / 2
    const floorDrop = wall.bottom - centreY
    const floor = roomPixels(WIDTH, HEIGHT).filter((p) => p.colour === FOREGROUND_DIM && p.y > wall.bottom)
    for (const p of floor) {
      const halfWidth = ((wall.right - wall.left) / 2) * ((p.y - centreY) / floorDrop)
      expect(Math.abs(p.x - centreX)).toBeLessThan(halfWidth)
    }
  })

  it('keeps dim pixels above the floor strictly within the far wall (bricks)', () => {
    const { left, top, right, bottom } = farWallRect(WIDTH, HEIGHT)
    const bricks = roomPixels(WIDTH, HEIGHT).filter((p) => p.colour === FOREGROUND_DIM && p.y <= bottom)
    expect(bricks.length).toBeGreaterThan(0)
    for (const { x, y } of bricks) {
      expect(x).toBeGreaterThan(left)
      expect(x).toBeLessThan(right)
      expect(y).toBeGreaterThan(top)
      expect(y).toBeLessThan(bottom)
    }
  })

  it.each([
    [320, 240],
    [640, 480],
    [100, 75],
  ])('completes quickly for a %ix%i canvas', (width, height) => {
    const start = performance.now()
    const pixels = roomPixels(width, height)
    expect(performance.now() - start).toBeLessThan(500)
    expect(pixels.length).toBeGreaterThan(0)
  }, 2000)
})
