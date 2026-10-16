import { FOCAL_RATIO } from '../core/camera.ts'
import { BACKGROUND, FOREGROUND, FOREGROUND_DIM, FOREGROUND_WORN } from '../core/palette.ts'
import { hashRandom } from '../core/random.ts'
import { GLASS_OUTLINE, isOnGlass } from './frame.ts'

// A picture shown on the mirror's glass, as a grid of cells in the scene's four
// tones. From the nook one cell is one canvas pixel, so the grid covers the
// glass's bounding box at that density; cells off the glass aren't drawn.

// Cells per mirror unit: one canvas pixel at the nook's distance of 1 from the
// mirror, on the 320-wide canvas.
export const PIXELS_PER_UNIT = (FOCAL_RATIO * 320) / 2

const GLASS_LEFT = Math.min(...GLASS_OUTLINE.map(({ s }) => s))
const GLASS_RIGHT = Math.max(...GLASS_OUTLINE.map(({ s }) => s))
const GLASS_BOTTOM = Math.min(...GLASS_OUTLINE.map(({ t }) => t))
const GLASS_TOP = Math.max(...GLASS_OUTLINE.map(({ t }) => t))
// The grid is centred on the glass's bounding box.
const GLASS_MIDDLE = { s: (GLASS_LEFT + GLASS_RIGHT) / 2, t: (GLASS_BOTTOM + GLASS_TOP) / 2 }

export const PREVIEW_WIDTH = Math.round((GLASS_RIGHT - GLASS_LEFT) * PIXELS_PER_UNIT)
export const PREVIEW_HEIGHT = Math.round((GLASS_TOP - GLASS_BOTTOM) * PIXELS_PER_UNIT)

// One tone per cell, row by row from the top left: 0 is the background, then
// dim, worn and full foreground.
export type Preview = Uint8Array

export const PREVIEW_COLOURS = [BACKGROUND, FOREGROUND_DIM, FOREGROUND_WORN, FOREGROUND] as const
const TONE_COUNT = PREVIEW_COLOURS.length

// Luminance at or below this counts as the background, so a dark page's
// near-black doesn't dither into specks.
const BLACK_POINT = 0.1

// 4×4 ordered-dither thresholds, in [0, 1).
const BAYER = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
].map((row) => row.map((value) => value / 16))

// Quantises RGBA pixels (as from getImageData) to tones, with ordered dithering
// so mid-greys come out as a mix of the tones either side.
export function quantisePreview(rgba: Uint8ClampedArray, width: number, height: number): Preview {
  const tones = new Uint8Array(width * height)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      const luminance = (0.2126 * rgba[i] + 0.7152 * rgba[i + 1] + 0.0722 * rgba[i + 2]) / 255
      // Rounded, as the weights' sum falls a hair short of 1 and white would
      // otherwise dither a few cells down a tone.
      const scaled = Math.round(((luminance - BLACK_POINT) / (1 - BLACK_POINT)) * 1e9) / 1e9
      const level = Math.max(0, scaled) * (TONE_COUNT - 1)
      tones[y * width + x] = Math.min(TONE_COUNT - 1, Math.floor(level + BAYER[y % 4][x % 4]))
    }
  }
  return tones
}

// A cell's centre in mirror-local units, and its index in a Preview.
export type PreviewCell = { s: number; t: number; index: number }

// Every cell on the glass.
export const GLASS_CELLS: PreviewCell[] = Array.from({ length: PREVIEW_WIDTH * PREVIEW_HEIGHT }, (_, index) => {
  const column = index % PREVIEW_WIDTH
  const row = Math.floor(index / PREVIEW_WIDTH)
  return {
    s: GLASS_MIDDLE.s + (column + 0.5 - PREVIEW_WIDTH / 2) / PIXELS_PER_UNIT,
    t: GLASS_MIDDLE.t + (PREVIEW_HEIGHT / 2 - row - 0.5) / PIXELS_PER_UNIT,
    index,
  }
}).filter(isOnGlass)

// The tone at a mirror-local point, or 0 off the grid.
export function toneAt(preview: Preview, s: number, t: number): number {
  const column = Math.floor((s - GLASS_MIDDLE.s) * PIXELS_PER_UNIT + PREVIEW_WIDTH / 2)
  const row = Math.floor(PREVIEW_HEIGHT / 2 - (t - GLASS_MIDDLE.t) * PIXELS_PER_UNIT)
  if (column < 0 || column >= PREVIEW_WIDTH || row < 0 || row >= PREVIEW_HEIGHT) return 0
  return preview[row * PREVIEW_WIDTH + column]
}

// A change from one preview to another: `progress` runs from 0 (all `from`) to
// 1 (all the new preview). Null previews are empty glass.
export type Shimmer = { from: Preview | null; progress: number }

// When cells switch during a shimmer: spread over this part of the progress,
// in a sweep from the top left with some jitter.
const SHIMMER_START = 0.1
const SHIMMER_SPREAD = 0.8
const SHIMMER_JITTER = 0.4
// How close to its switch a cell flashes a tone brighter.
const SHIMMER_WINDOW = 0.06
// Keeps the shimmer's jitter independent of other random detail.
const SHIMMER_SEED = 4

// The tone a cell shows part-way through a shimmer from `fromTone` to `toTone`.
export function shimmerTone(cell: PreviewCell, fromTone: number, toTone: number, progress: number): number {
  const sweep =
    ((cell.s - GLASS_LEFT) / (GLASS_RIGHT - GLASS_LEFT) + (GLASS_TOP - cell.t) / (GLASS_TOP - GLASS_BOTTOM)) / 2
  const jitter = hashRandom(cell.index, SHIMMER_SEED)
  const switchAt = SHIMMER_START + SHIMMER_SPREAD * ((1 - SHIMMER_JITTER) * sweep + SHIMMER_JITTER * jitter)
  const tone = progress < switchAt ? fromTone : toTone
  return Math.abs(progress - switchAt) < SHIMMER_WINDOW ? Math.min(TONE_COUNT - 1, tone + 1) : tone
}
