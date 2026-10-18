import { vi } from 'vitest'
import type { Pixel } from '../scene/core/types.ts'

// One fillRect call: its arguments and the fill style at the time.
export type Fill = { args: number[]; fillStyle: string }

// A stand-in for a 2D context: just the canvas size, fill style and fillRect,
// recording each fill in `fills`.
export function createFakeContext(width = 320, height = 240) {
  const fills: Fill[] = []
  const fillRect = vi.fn((...args: number[]) => {
    fills.push({ args, fillStyle: raw.fillStyle })
  })
  const raw = { fillStyle: '', canvas: { width, height }, fillRect }
  return { ctx: raw as unknown as CanvasRenderingContext2D, raw, fills, fillRect }
}

// The 1x1 fills that drawing `pixels` makes.
export const toFills = (pixels: Pixel[]): Fill[] =>
  pixels.map(({ x, y, colour }) => ({ args: [x, y, 1, 1], fillStyle: colour }))
