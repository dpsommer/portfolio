import { describe, expect, it } from 'vitest'
import { PREVIEW_COLOURS } from '../mirror/preview.ts'
import { picturePixels, quantisePicture, stretchLevels } from './picture.ts'
import type { Picture } from './picture.ts'

// RGBA pixels, one grey level (and alpha) per pixel.
const greys = (levels: number[], alpha = 255) => new Uint8ClampedArray(levels.flatMap((level) => [level, level, level, alpha]))
// The red channel of each pixel, which equals the others for greys.
const reds = (rgba: Uint8ClampedArray) => Array.from({ length: rgba.length / 4 }, (_, n) => rgba[n * 4])

describe('stretchLevels', () => {
  it('stretches the darkest pixel to black and the lightest to white', () => {
    expect(reds(stretchLevels(greys([100, 125, 150])))).toEqual([0, 128, 255])
  })

  it('clips a few stray highlights and shadows rather than stretching to them', () => {
    // 2% of 100 pixels clip at each end: one black and one white outlier.
    const levels = [0, ...Array<number>(49).fill(100), ...Array<number>(49).fill(150), 255]

    const out = reds(stretchLevels(greys(levels)))

    expect(out.slice(1, 50).every((level) => level === 0)).toBe(true)
    expect(out.slice(50, 99).every((level) => level === 255)).toBe(true)
    expect([out[0], out[99]]).toEqual([0, 255])
  })

  it('leaves alpha alone', () => {
    const out = stretchLevels(greys([100, 150], 77))

    expect([out[3], out[7]]).toEqual([77, 77])
  })

  it('leaves a picture of one level unchanged', () => {
    const rgba = greys([90, 90, 90])

    expect(stretchLevels(rgba)).toEqual(rgba)
  })

  it.each([
    ['a picture', greys([100, 150])],
    ['an empty picture', greys([])],
  ])('returns a copy of %s, leaving the input alone', (_, rgba) => {
    const before = new Uint8ClampedArray(rgba)

    const out = stretchLevels(rgba)

    expect(out).not.toBe(rgba)
    expect(rgba).toEqual(before)
  })
})

describe('quantisePicture', () => {
  // A dim left-to-right gradient, 8 wide and 4 tall, all well below mid-grey.
  const WIDTH = 8
  const HEIGHT = 4
  const DIM = greys(Array.from({ length: WIDTH * HEIGHT }, (_, n) => 10 + 6 * (n % WIDTH)))

  it('keeps the picture\'s size, with a tone per cell', () => {
    const picture = quantisePicture(DIM, WIDTH, HEIGHT)

    expect(picture.width).toBe(WIDTH)
    expect(picture.height).toBe(HEIGHT)
    expect(picture.tones).toHaveLength(WIDTH * HEIGHT)
  })

  it('spreads a dim photo over every tone, from the background to the full foreground', () => {
    const tones = new Set(quantisePicture(DIM, WIDTH, HEIGHT).tones)

    expect([...tones].sort((a, b) => a - b)).toEqual([0, 1, 2, 3])
  })
})

describe('picturePixels', () => {
  // 3 wide and 2 tall, one cell of each tone plus two background cells.
  const PICTURE: Picture = { width: 3, height: 2, tones: Uint8Array.from([0, 1, 2, 3, 0, 1]) }

  it('draws each cell but the background in its tone, row by row, offset to (left, top)', () => {
    expect(picturePixels(PICTURE, 10, 20)).toEqual([
      { x: 11, y: 20, colour: PREVIEW_COLOURS[1] },
      { x: 12, y: 20, colour: PREVIEW_COLOURS[2] },
      { x: 10, y: 21, colour: PREVIEW_COLOURS[3] },
      { x: 12, y: 21, colour: PREVIEW_COLOURS[1] },
    ])
  })

  it('draws nothing for an all-background picture', () => {
    expect(picturePixels({ width: 2, height: 2, tones: new Uint8Array(4) }, 0, 0)).toEqual([])
  })
})
