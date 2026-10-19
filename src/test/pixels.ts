import { expect } from 'vitest'
import { FOCAL_RATIO } from '../scene/core/camera.ts'

type Point = { x: number; y: number }

// The view size most scene tests draw at.
export const WIDTH = 320
export const HEIGHT = 240
// Focal length in pixels at 320 wide (128).
export const FOCAL = (FOCAL_RATIO * WIDTH) / 2
// Screen column of a point `across` units right of the view's centre line, `depth` ahead.
export const columnAt = (across: number, depth: number) => Math.round(WIDTH / 2 + (FOCAL * across) / depth)
// Screen row of a point at height `y` (relative to the eye), `depth` ahead.
export const rowAt = (y: number, depth: number) => Math.round(HEIGHT / 2 - (FOCAL * y) / depth)

// The inclusive extent of a set of pixels.
export const extent = (pixels: Point[]) => ({
  left: Math.min(...pixels.map((p) => p.x)),
  top: Math.min(...pixels.map((p) => p.y)),
  right: Math.max(...pixels.map((p) => p.x)),
  bottom: Math.max(...pixels.map((p) => p.y)),
})

// Expects every pixel at integer coordinates within a `width` x `height` canvas.
export function expectOnCanvas(pixels: Point[], width = WIDTH, height = HEIGHT) {
  for (const { x, y } of pixels) {
    expect(Number.isInteger(x)).toBe(true)
    expect(Number.isInteger(y)).toBe(true)
    expect(x).toBeGreaterThanOrEqual(0)
    expect(x).toBeLessThan(width)
    expect(y).toBeGreaterThanOrEqual(0)
    expect(y).toBeLessThan(height)
  }
}

const byPosition = (points: Point[]) => points.map(({ x, y }) => ({ x, y })).sort((a, b) => a.y - b.y || a.x - b.x)

// Expects `drawn` to be `template` (pixels drawn from the origin, such as
// textPixels or iconPixels) moved as a whole, ignoring colour, and returns
// where the template's origin went.
export function expectPlaced(drawn: Point[], template: Point[]) {
  const left = extent(drawn).left - extent(template).left
  const top = extent(drawn).top - extent(template).top
  expect(byPosition(drawn)).toEqual(byPosition(template.map(({ x, y }) => ({ x: x + left, y: y + top }))))
  return { left, top }
}
