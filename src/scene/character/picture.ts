import { PREVIEW_COLOURS, quantisePreview } from '../mirror/preview.ts'
import type { Pixel } from '../core/types.ts'

// A photo reduced to the scene's four tones, like the mirror's previews, for
// the character card and profile view.

// One tone per cell, row by row from the top left, as in a mirror Preview.
export type Picture = { width: number; height: number; tones: Uint8Array }

// The share of pixels at either end of the luminance range that clip, so a
// few stray highlights or shadows don't flatten the rest.
const LEVELS_CLIP = 0.02

const luminanceAt = (rgba: Uint8ClampedArray, i: number) =>
  0.2126 * rgba[i] + 0.7152 * rgba[i + 1] + 0.0722 * rgba[i + 2]

// Stretches RGBA pixels' levels so their luminance spans the full range,
// clipping LEVELS_CLIP at each end. A dim photo would otherwise come out
// mostly as background once quantised. Alpha is left as it is.
export function stretchLevels(rgba: Uint8ClampedArray): Uint8ClampedArray {
  const count = rgba.length / 4
  if (count === 0) return new Uint8ClampedArray(rgba)
  const sorted = Array.from({ length: count }, (_, n) => luminanceAt(rgba, n * 4)).sort((a, b) => a - b)
  const low = sorted[Math.floor((count - 1) * LEVELS_CLIP)]
  const high = sorted[Math.ceil((count - 1) * (1 - LEVELS_CLIP))]
  const out = new Uint8ClampedArray(rgba)
  if (high <= low) return out
  for (let i = 0; i < rgba.length; i += 4) {
    for (let c = 0; c < 3; c++) out[i + c] = ((rgba[i + c] - low) / (high - low)) * 255
  }
  return out
}

// Quantises RGBA pixels (as from getImageData) to a Picture, stretching their
// levels first.
export function quantisePicture(rgba: Uint8ClampedArray, width: number, height: number): Picture {
  return { width, height, tones: quantisePreview(stretchLevels(rgba), width, height) }
}

// Pixels for a picture with its top-left corner at (left, top). Background
// cells aren't drawn.
export function picturePixels(picture: Picture, left: number, top: number): Pixel[] {
  const pixels: Pixel[] = []
  picture.tones.forEach((tone, index) => {
    if (tone === 0) return
    pixels.push({
      x: left + (index % picture.width),
      y: top + Math.floor(index / picture.width),
      colour: PREVIEW_COLOURS[tone],
    })
  })
  return pixels
}
