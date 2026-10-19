import { describe, expect, it } from 'vitest'
import { createFakeContext, toFills } from '../../test/fakeContext.ts'
import { expectOnCanvas, extent } from '../../test/pixels.ts'
import { BACKGROUND, FOREGROUND, FOREGROUND_DIM, FOREGROUND_WORN } from '../core/palette.ts'
import { textPixels, textWidth } from '../core/pixelFont.ts'
import type { Pixel } from '../core/types.ts'
import { selectionPixels } from '../selection/selection.ts'
import { CARD_NAME } from '../../ViewPane/aboutText.ts'
import { SIDE_PANEL_HEIGHT, SIDE_PANEL_WIDTH } from '../../ViewPane/ViewPane.tsx'
import { AVATAR_CARD_SIZE, CARD_BOUNDS, cardPixels, drawSidePanel } from './card.ts'
import { KEYBOARD_MAP, MOUSE_MAP, iconHeight, iconPixels } from './icons.ts'
import { picturePixels } from './picture.ts'
import type { Picture } from './picture.ts'

const WIDTH = SIDE_PANEL_WIDTH
const HEIGHT = SIDE_PANEL_HEIGHT
const NAME_SCALE = 2

// An avatar filled with the full foreground, so every cell is drawn.
const AVATAR: Picture = {
  width: AVATAR_CARD_SIZE,
  height: AVATAR_CARD_SIZE,
  tones: new Uint8Array(AVATAR_CARD_SIZE * AVATAR_CARD_SIZE).fill(3),
}

const key = ({ x, y }: { x: number; y: number }) => `${x},${y}`
const byPosition = (pixels: Pixel[]) => [...pixels].sort((a, b) => a.y - b.y || a.x - b.x)
// The pixels in `pixels` at a position none of `others` takes.
const without = (pixels: Pixel[], others: Pixel[]) => {
  const taken = new Set(others.map(key))
  return pixels.filter((pixel) => !taken.has(key(pixel)))
}
const inside = (pixels: Pixel[], { left, top, right, bottom }: ReturnType<typeof extent>) =>
  pixels.filter(({ x, y }) => x >= left && x <= right && y >= top && y <= bottom)

// Where the avatar goes: the cells a full avatar adds to the card.
const SQUARE = extent(without(cardPixels(CARD_NAME, AVATAR), cardPixels(CARD_NAME, null)))

// The keyboard and mouse: the pixels right of the avatar, on its rows, inside
// the border and outside the avatar's dim outline. The keyboard is the top
// iconHeight(KEYBOARD_MAP) rows of them.
function icons(pixels: Pixel[]) {
  const all = pixels.filter(
    ({ x, y, colour }) =>
      colour !== FOREGROUND_DIM && x > SQUARE.right && x < CARD_BOUNDS.right && y >= SQUARE.top && y <= SQUARE.bottom,
  )
  const top = extent(all).top
  return {
    keyboard: all.filter(({ y }) => y < top + iconHeight(KEYBOARD_MAP)),
    mouse: all.filter(({ y }) => y >= top + iconHeight(KEYBOARD_MAP)),
  }
}

// The icon drawn from `map` where `pixels` show it.
function iconAt(map: string[], pixels: Pixel[]): Pixel[] {
  const at = extent(pixels)
  const origin = extent(iconPixels(map, 0, 0))
  return iconPixels(map, at.left - origin.left, at.top - origin.top)
}

describe('CARD_BOUNDS', () => {
  it('centres the card across the side panel', () => {
    expect(CARD_BOUNDS.left).toBe(WIDTH - 1 - CARD_BOUNDS.right)
  })

  it('leaves room for the selection carets all round, so none are clipped', () => {
    expect(selectionPixels(CARD_BOUNDS, 0, WIDTH, HEIGHT)).toEqual(
      selectionPixels(CARD_BOUNDS, 0, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY),
    )
  })
})

describe('cardPixels', () => {
  it.each([
    ['without the avatar', null],
    ['with the avatar', AVATAR],
  ])('keeps the card on the side panel %s', (_, avatar) => {
    expectOnCanvas(cardPixels(CARD_NAME, avatar), WIDTH, HEIGHT)
  })

  it('draws everything within the border', () => {
    expect(extent(cardPixels(CARD_NAME, AVATAR))).toEqual(CARD_BOUNDS)
  })

  it('draws the border worn, leaving out its corner pixels', () => {
    const { left, top, right, bottom } = CARD_BOUNDS
    const pixels = cardPixels(CARD_NAME, null)
    const border = pixels.filter(({ x, y }) => x === left || x === right || y === top || y === bottom)
    const corners = [key({ x: left, y: top }), key({ x: right, y: top }), key({ x: left, y: bottom }), key({ x: right, y: bottom })]

    expect(border.every(({ colour }) => colour === FOREGROUND_WORN)).toBe(true)
    expect(border).toHaveLength(2 * (right - left - 1) + 2 * (bottom - top - 1))
    expect(border.some((pixel) => corners.includes(key(pixel)))).toBe(false)
  })

  describe.each(['Duncan', 'Al'])('with the name %j', (name) => {
    // The name is the full-foreground text above the avatar.
    const namePixels = () =>
      cardPixels(name, null).filter(({ y, colour }) => colour === FOREGROUND && y < SQUARE.top)
    // Where the name's text box starts: glyphs needn't fill their cells.
    const nameOrigin = () => {
      const drawn = extent(namePixels())
      const text = extent(textPixels(name, NAME_SCALE))
      return { left: drawn.left - text.left, top: drawn.top - text.top }
    }

    it('draws the name at twice the font\'s size', () => {
      const { left, top } = nameOrigin()

      expect(byPosition(namePixels()).map(key)).toEqual(
        byPosition(textPixels(name, NAME_SCALE).map(({ x, y }) => ({ x: left + x, y: top + y, colour: '' }))).map(key),
      )
    })

    it('centres the name across the card', () => {
      const { left } = nameOrigin()
      const leftGap = left - CARD_BOUNDS.left
      const rightGap = CARD_BOUNDS.right - (left + textWidth(name, NAME_SCALE) - 1)

      expect(Math.abs(leftGap - rightGap)).toBeLessThanOrEqual(1)
    })
  })

  it('draws a dim rule between the name and the avatar', () => {
    const pixels = cardPixels(CARD_NAME, null)
    const nameBottom = extent(pixels.filter(({ y, colour }) => colour === FOREGROUND && y < SQUARE.top)).bottom
    const rows = new Map<number, number>()
    for (const { y, colour } of pixels) {
      if (colour === FOREGROUND_DIM && y > nameBottom && y < SQUARE.top - 2) rows.set(y, (rows.get(y) ?? 0) + 1)
    }

    expect([...rows.values()]).toHaveLength(1)
    expect([...rows.values()][0]).toBeGreaterThan(SQUARE.right - SQUARE.left)
  })

  describe('avatar', () => {
    it('is a square AVATAR_CARD_SIZE wide, below the name, at the left inside the border', () => {
      expect(SQUARE.right - SQUARE.left + 1).toBe(AVATAR_CARD_SIZE)
      expect(SQUARE.bottom - SQUARE.top + 1).toBe(AVATAR_CARD_SIZE)
      expect(SQUARE.left).toBeGreaterThan(CARD_BOUNDS.left)
      expect(SQUARE.left - CARD_BOUNDS.left).toBeLessThan(CARD_BOUNDS.right - SQUARE.right)
      expect(SQUARE.bottom).toBeLessThan(CARD_BOUNDS.bottom)
    })

    it('is drawn from the picture given, at its square', () => {
      const avatar: Picture = { ...AVATAR, tones: AVATAR.tones.map((_, index) => index % 4) }
      const drawn = inside(cardPixels(CARD_NAME, avatar), SQUARE)

      expect(byPosition(drawn)).toEqual(byPosition(picturePixels(avatar, SQUARE.left, SQUARE.top)))
    })

    it('is left out until it is given, leaving its square empty', () => {
      expect(inside(cardPixels(CARD_NAME, null), SQUARE)).toEqual([])
    })

    it('has a dim outline around its square either way', () => {
      const ring = (pixels: Pixel[]) =>
        inside(pixels, { left: SQUARE.left - 2, top: SQUARE.top - 2, right: SQUARE.right + 2, bottom: SQUARE.bottom + 2 })
          .filter((pixel) => inside([pixel], SQUARE).length === 0)

      for (const avatar of [null, AVATAR]) {
        const outline = ring(cardPixels(CARD_NAME, avatar))
        expect(outline.length).toBeGreaterThan(4 * AVATAR_CARD_SIZE)
        expect(outline.every(({ colour }) => colour === FOREGROUND_DIM)).toBe(true)
      }
    })
  })

  describe('icons', () => {
    const { keyboard, mouse } = icons(cardPixels(CARD_NAME, AVATAR))

    it.each([
      ['keyboard', KEYBOARD_MAP, keyboard],
      ['mouse', MOUSE_MAP, mouse],
    ])('draws the %s from its map', (_, map, pixels) => {
      expect(byPosition(pixels)).toEqual(byPosition(iconAt(map, pixels)))
    })

    it('puts the keyboard above the mouse', () => {
      expect(extent(keyboard).bottom).toBeLessThan(extent(mouse).top)
    })

    it('puts both right of the avatar and inside the border', () => {
      for (const icon of [keyboard, mouse]) {
        const { left, right } = extent(icon)
        expect(left).toBeGreaterThan(SQUARE.right + 2)
        expect(right).toBeLessThan(CARD_BOUNDS.right)
      }
    })

    it('centres both in the same column', () => {
      const centre = (pixels: Pixel[]) => (extent(pixels).left + extent(pixels).right) / 2

      expect(Math.abs(centre(keyboard) - centre(mouse))).toBeLessThanOrEqual(1)
    })

    it('centres the stack on the avatar\'s height', () => {
      const topGap = extent(keyboard).top - SQUARE.top
      const bottomGap = SQUARE.bottom - extent(mouse).bottom

      expect(Math.abs(topGap - bottomGap)).toBeLessThanOrEqual(1)
    })
  })
})

describe('drawSidePanel', () => {
  it.each<[string, Picture | null, number | null]>([
    ['without the avatar or carets', null, null],
    ['with the avatar', AVATAR, null],
    ['with carets at rest while selected', null, 0],
    ['with carets dipped in mid-bounce', AVATAR, 2],
  ])('draws the background, then the card, %s', (_, avatar, inset) => {
    const { ctx, fills } = createFakeContext(WIDTH, HEIGHT)

    drawSidePanel(ctx, CARD_NAME, avatar, inset)

    expect(fills).toEqual([
      { args: [0, 0, WIDTH, HEIGHT], fillStyle: BACKGROUND },
      ...toFills(cardPixels(CARD_NAME, avatar)),
      ...(inset === null ? [] : toFills(selectionPixels(CARD_BOUNDS, inset, WIDTH, HEIGHT))),
    ])
  })
})
