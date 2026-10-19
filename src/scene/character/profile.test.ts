import { describe, expect, it } from 'vitest'
import { createFakeContext, toFills } from '../../test/fakeContext.ts'
import { HEIGHT, WIDTH, expectOnCanvas, extent } from '../../test/pixels.ts'
import { BACKGROUND, FOREGROUND, FOREGROUND_DIM } from '../core/palette.ts'
import { textPixels } from '../core/pixelFont.ts'
import type { Pixel } from '../core/types.ts'
import { FULL_NAME } from '../../ViewPane/aboutText.ts'
import { AVATAR_PROFILE_SIZE, drawProfile, profilePixels } from './profile.ts'
import { picturePixels } from './picture.ts'
import type { Picture } from './picture.ts'

const NAME_SCALE = 2

// An avatar filled with the full foreground, so every cell is drawn.
const AVATAR: Picture = {
  width: AVATAR_PROFILE_SIZE,
  height: AVATAR_PROFILE_SIZE,
  tones: new Uint8Array(AVATAR_PROFILE_SIZE * AVATAR_PROFILE_SIZE).fill(3),
}

const key = ({ x, y }: { x: number; y: number }) => `${x},${y}`
const byPosition = (pixels: Pixel[]) => [...pixels].sort((a, b) => a.y - b.y || a.x - b.x)
const inside = (pixels: Pixel[], { left, top, right, bottom }: ReturnType<typeof extent>) =>
  pixels.filter(({ x, y }) => x >= left && x <= right && y >= top && y <= bottom)

// Where the avatar goes: the cells a full avatar adds to the view.
const taken = new Set(profilePixels(FULL_NAME, null).map(key))
const SQUARE = extent(profilePixels(FULL_NAME, AVATAR).filter((pixel) => !taken.has(key(pixel))))

// The name's pixels split into lines at the empty rows between them.
function nameLines(name: string): Pixel[][] {
  const pixels = byPosition(profilePixels(name, null).filter(({ colour }) => colour === FOREGROUND))
  const lines: Pixel[][] = []
  let lastRow = Number.NEGATIVE_INFINITY
  for (const pixel of pixels) {
    if (pixel.y > lastRow + 1) lines.push([])
    lines[lines.length - 1].push(pixel)
    lastRow = pixel.y
  }
  return lines
}

// Where `word`'s text box starts, given its drawn pixels: glyphs needn't fill their cells.
function origin(word: string, pixels: Pixel[]) {
  const drawn = extent(pixels)
  const text = extent(textPixels(word, NAME_SCALE))
  return { left: drawn.left - text.left, top: drawn.top - text.top }
}

describe('profilePixels', () => {
  it.each([
    ['without the avatar', null],
    ['with the avatar', AVATAR],
  ])('keeps the view on the room canvas %s', (_, avatar) => {
    expectOnCanvas(profilePixels(FULL_NAME, avatar), WIDTH, HEIGHT)
  })

  describe('avatar', () => {
    it('is a square AVATAR_PROFILE_SIZE wide in the upper left, as far from the top as the left', () => {
      expect(SQUARE.right - SQUARE.left + 1).toBe(AVATAR_PROFILE_SIZE)
      expect(SQUARE.bottom - SQUARE.top + 1).toBe(AVATAR_PROFILE_SIZE)
      expect(SQUARE.left).toBe(SQUARE.top)
      expect(SQUARE.left).toBeGreaterThan(0)
      expect(SQUARE.right).toBeLessThan(WIDTH / 2)
      expect(SQUARE.bottom).toBeLessThan(HEIGHT / 2)
    })

    it('is drawn from the picture given, at its square', () => {
      const avatar: Picture = { ...AVATAR, tones: AVATAR.tones.map((_, index) => index % 4) }

      expect(byPosition(inside(profilePixels(FULL_NAME, avatar), SQUARE))).toEqual(
        byPosition(picturePixels(avatar, SQUARE.left, SQUARE.top)),
      )
    })

    it('is left out until it is given, leaving its square empty', () => {
      expect(inside(profilePixels(FULL_NAME, null), SQUARE)).toEqual([])
    })

    it('has a dim outline around its square, leaving out the corner pixels', () => {
      const ring = { left: SQUARE.left - 2, top: SQUARE.top - 2, right: SQUARE.right + 2, bottom: SQUARE.bottom + 2 }
      const outline = inside(profilePixels(FULL_NAME, null), ring)
      const corners = [
        key({ x: ring.left, y: ring.top }),
        key({ x: ring.right, y: ring.top }),
        key({ x: ring.left, y: ring.bottom }),
        key({ x: ring.right, y: ring.bottom }),
      ]

      expect(outline.every(({ colour }) => colour === FOREGROUND_DIM)).toBe(true)
      expect(outline.every(({ x, y }) => x === ring.left || x === ring.right || y === ring.top || y === ring.bottom)).toBe(true)
      expect(outline).toHaveLength(4 * (ring.right - ring.left - 1))
      expect(outline.some((pixel) => corners.includes(key(pixel)))).toBe(false)
    })
  })

  describe.each([FULL_NAME, 'Ada King Lovelace', 'Prince'])('with the name %j', (name) => {
    const words = name.split(' ')

    it('puts each word on its own line, at twice the font\'s size', () => {
      const lines = nameLines(name)

      expect(lines).toHaveLength(words.length)
      lines.forEach((line, index) => {
        const { left, top } = origin(words[index], line)
        expect(line.map(key)).toEqual(
          byPosition(textPixels(words[index], NAME_SCALE).map(({ x, y }) => ({ x: left + x, y: top + y, colour: '' }))).map(key),
        )
      })
    })

    it('starts the lines level with the avatar\'s top, lined up on the left, to its right', () => {
      const origins = nameLines(name).map((line, index) => origin(words[index], line))

      expect(origins[0].top).toBe(SQUARE.top)
      for (const { left } of origins) {
        expect(left).toBe(origins[0].left)
        expect(left).toBeGreaterThan(SQUARE.right + 2)
      }
    })
  })
})

describe('drawProfile', () => {
  it.each([
    ['without the avatar', null],
    ['with the avatar', AVATAR],
  ])('draws the background, then the profile view, %s', (_, avatar) => {
    const { ctx, fills } = createFakeContext(WIDTH, HEIGHT)

    drawProfile(ctx, FULL_NAME, avatar)

    expect(fills).toEqual([
      { args: [0, 0, WIDTH, HEIGHT], fillStyle: BACKGROUND },
      ...toFills(profilePixels(FULL_NAME, avatar)),
    ])
  })
})
