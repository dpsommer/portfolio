import { FOREGROUND } from '../core/palette.ts'
import type { Bounds, Pixel } from '../core/types.ts'

// Marks the object selected with the keyboard: a caret at each corner,
// pointing in at it, that bounces slightly every so often.

// The top-left caret; the others are its reflections.
const CARET_MAP = ['#####', '####.', '###..', '##...', '#....']
const CARET_SIZE = CARET_MAP.length
// How far outside the object's bounds the carets sit.
export const SELECTION_GAP = 3

// Every BOUNCE_PERIOD_MS the carets dip BOUNCE_DEPTH pixels in towards the
// object and back out over BOUNCE_MS.
export const BOUNCE_PERIOD_MS = 2000
export const BOUNCE_MS = 300
export const BOUNCE_DEPTH = 2

// The inclusive extent of a set of pixels.
export function pixelBounds(pixels: { x: number; y: number }[]): Bounds {
  return {
    left: Math.min(...pixels.map((p) => p.x)),
    top: Math.min(...pixels.map((p) => p.y)),
    right: Math.max(...pixels.map((p) => p.x)),
    bottom: Math.max(...pixels.map((p) => p.y)),
  }
}

// How far in (whole pixels) the carets are `elapsed` ms after the object was
// selected. They rest for the first period, so a new selection starts still.
export function caretInset(elapsed: number): number {
  const phase = elapsed % BOUNCE_PERIOD_MS
  if (elapsed < BOUNCE_PERIOD_MS || phase >= BOUNCE_MS) return 0
  return Math.round(BOUNCE_DEPTH * Math.sin((Math.PI * phase) / BOUNCE_MS))
}

// Pixels for the four carets around `bounds`, moved `inset` pixels diagonally
// in towards it, on a `width` × `height` canvas.
export function selectionPixels(bounds: Bounds, inset: number, width: number, height: number): Pixel[] {
  const offset = SELECTION_GAP - inset
  const corners = [
    { x: bounds.left - offset - CARET_SIZE, y: bounds.top - offset - CARET_SIZE, flipX: false, flipY: false },
    { x: bounds.right + offset + 1, y: bounds.top - offset - CARET_SIZE, flipX: true, flipY: false },
    { x: bounds.left - offset - CARET_SIZE, y: bounds.bottom + offset + 1, flipX: false, flipY: true },
    { x: bounds.right + offset + 1, y: bounds.bottom + offset + 1, flipX: true, flipY: true },
  ]
  const pixels: Pixel[] = []
  for (const { x, y, flipX, flipY } of corners) {
    CARET_MAP.forEach((row, cy) => {
      row.split('').forEach((cell, cx) => {
        if (cell !== '#') return
        const px = x + (flipX ? CARET_SIZE - 1 - cx : cx)
        const py = y + (flipY ? CARET_SIZE - 1 - cy : cy)
        if (px >= 0 && px < width && py >= 0 && py < height) pixels.push({ x: px, y: py, colour: FOREGROUND })
      })
    })
  }
  return pixels
}
