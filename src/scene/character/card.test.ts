import { describe, expect, it } from 'vitest'
import { createFakeContext, toFills } from '../../test/fakeContext.ts'
import { expectOnCanvas, extent } from '../../test/pixels.ts'
import { BACKGROUND, FOREGROUND, FOREGROUND_DIM, FOREGROUND_WORN } from '../core/palette.ts'
import { GLYPH_HEIGHT, textPixels, textWidth } from '../core/pixelFont.ts'
import type { Pixel } from '../core/types.ts'
import { selectionPixels } from '../selection/selection.ts'
import { CARD_HEALTH, CARD_NAME } from '../../ViewPane/aboutText.ts'
import { SIDE_PANEL_HEIGHT, SIDE_PANEL_WIDTH } from '../../ViewPane/ViewPane.tsx'
import { AVATAR_CARD_SIZE, CARD_BOUNDS, cardPixels, drawSidePanel, healthPixels } from './card.ts'
import type { Health } from './card.ts'
import { KEYBOARD_MAP, MOUSE_MAP, iconPixels } from './icons.ts'
import { picturePixels } from './picture.ts'
import type { Picture } from './picture.ts'

const WIDTH = SIDE_PANEL_WIDTH
const HEIGHT = SIDE_PANEL_HEIGHT
const NAME_SCALE = 2
// Space above and below each rule in the icon column, and between its ends and the column's edges.
const RULE_GAP = 3
const RULE_INSET = 2
// The health readout: its numbers' scale, their inset from the column's edges,
// and where the slash's glyph and the total start.
const HEALTH_SCALE = 1
const HEALTH_INSET = 3
const HEALTH_GAP = 2 * RULE_GAP
const NUMBER_HEIGHT = GLYPH_HEIGHT * HEALTH_SCALE
const SLASH_TOP = NUMBER_HEIGHT + 1 - 1
const TOTAL_TOP = NUMBER_HEIGHT + 2 * 1 + 5
// The avatar's dim outline sits this far outside its square.
const OUTLINE_GAP = 2

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
// `text` in bold at `scale`: each glyph pixel also drawn one to the right, listed once.
function bold(text: string, scale = 1) {
  const keys = new Set(textPixels(text, scale).flatMap(({ x, y }) => [key({ x, y }), key({ x: x + 1, y })]))
  return [...keys].map((k) => {
    const [x, y] = k.split(',').map(Number)
    return { x, y }
  })
}
const boldWidth = (text: string, scale = 1) => textWidth(text, scale) + 1
// `points` moved by (left, top) in `colour`.
const placed = (points: { x: number; y: number }[], left: number, top: number, colour: string): Pixel[] =>
  points.map(({ x, y }) => ({ x: left + x, y: top + y, colour }))

const inside = (pixels: Pixel[], { left, top, right, bottom }: ReturnType<typeof extent>) =>
  pixels.filter(({ x, y }) => x >= left && x <= right && y >= top && y <= bottom)

// The card showing CARD_NAME, `health` and `avatar`.
const card = (avatar: Picture | null = null, health: Health = CARD_HEALTH) => cardPixels(CARD_NAME, health, avatar)

// Where the avatar goes: the cells a full avatar adds to the card.
const SQUARE = extent(without(card(AVATAR), card()))

// The column right of the avatar: from just right of the avatar's dim outline
// (the dim pixel right of the avatar on its top row) to just inside the border.
const COLUMN = {
  left: Math.max(...card().filter(({ x, y, colour }) => colour === FOREGROUND_DIM && y === SQUARE.top && x > SQUARE.right).map(({ x }) => x)) + 1,
  right: CARD_BOUNDS.right - 1,
}

// What the column shows on the rows of the avatar and its outline: the dim
// rules, one row each, and the keyboard, mouse and health, split by them.
function column(pixels: Pixel[]) {
  const all = pixels.filter(
    ({ x, y }) =>
      x > SQUARE.right && x < CARD_BOUNDS.right && y >= SQUARE.top - OUTLINE_GAP && y <= SQUARE.bottom + OUTLINE_GAP,
  )
  const rulePixels = all.filter(({ x, colour }) => colour === FOREGROUND_DIM && x >= COLUMN.left)
  const ruleRows = [...new Set(rulePixels.map(({ y }) => y))].sort((a, b) => a - b)
  const items = all.filter(({ colour }) => colour !== FOREGROUND_DIM)
  const [first, second] = ruleRows
  return {
    rules: ruleRows.map((row) => rulePixels.filter(({ y }) => y === row)),
    keyboard: items.filter(({ y }) => y < first),
    mouse: items.filter(({ y }) => y > first && y < second),
    health: items.filter(({ y }) => y > second),
  }
}

// Where the readout of `health`, laid out `width` wide, starts when drawn as `pixels`.
function healthOrigin(health: Health, width: number, pixels: Pixel[]) {
  const drawn = extent(pixels)
  const own = extent(healthPixels(health, width))
  return { left: drawn.left - own.left, top: drawn.top - own.top }
}

const centre = ({ left, right }: { left: number; right: number }) => (left + right) / 2

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
    expectOnCanvas(card(avatar), WIDTH, HEIGHT)
  })

  it('draws everything within the border', () => {
    expect(extent(card(AVATAR))).toEqual(CARD_BOUNDS)
  })

  it('draws the border worn, leaving out its corner pixels', () => {
    const { left, top, right, bottom } = CARD_BOUNDS
    const pixels = card()
    const border = pixels.filter(({ x, y }) => x === left || x === right || y === top || y === bottom)
    const corners = [key({ x: left, y: top }), key({ x: right, y: top }), key({ x: left, y: bottom }), key({ x: right, y: bottom })]

    expect(border.every(({ colour }) => colour === FOREGROUND_WORN)).toBe(true)
    expect(border).toHaveLength(2 * (right - left - 1) + 2 * (bottom - top - 1))
    expect(border.some((pixel) => corners.includes(key(pixel)))).toBe(false)
  })

  describe.each(['Duncan', 'Al'])('with the name %j', (name) => {
    // The name is the full-foreground text above the avatar.
    const namePixels = () =>
      cardPixels(name, CARD_HEALTH, null).filter(({ y, colour }) => colour === FOREGROUND && y < SQUARE.top - OUTLINE_GAP)
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
    const pixels = card()
    const nameBottom = extent(pixels.filter(({ y, colour }) => colour === FOREGROUND && y < SQUARE.top - OUTLINE_GAP)).bottom
    const rows = new Map<number, number>()
    for (const { y, colour } of pixels) {
      if (colour === FOREGROUND_DIM && y > nameBottom && y < SQUARE.top - OUTLINE_GAP) rows.set(y, (rows.get(y) ?? 0) + 1)
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
      const drawn = inside(card(avatar), SQUARE)

      expect(byPosition(drawn)).toEqual(byPosition(picturePixels(avatar, SQUARE.left, SQUARE.top)))
    })

    it('is left out until it is given, leaving its square empty', () => {
      expect(inside(card(), SQUARE)).toEqual([])
    })

    it('has a dim outline around its square either way', () => {
      const ring = (pixels: Pixel[]) =>
        inside(pixels, {
          left: SQUARE.left - OUTLINE_GAP,
          top: SQUARE.top - OUTLINE_GAP,
          right: SQUARE.right + OUTLINE_GAP,
          bottom: SQUARE.bottom + OUTLINE_GAP,
        })
          .filter((pixel) => inside([pixel], SQUARE).length === 0)

      for (const avatar of [null, AVATAR]) {
        const outline = ring(card(avatar))
        expect(outline.length).toBeGreaterThan(4 * AVATAR_CARD_SIZE)
        expect(outline.every(({ colour }) => colour === FOREGROUND_DIM)).toBe(true)
      }
    })
  })

  describe('icon column', () => {
    const { keyboard, mouse, health, rules } = column(card(AVATAR))

    it.each([
      ['keyboard', KEYBOARD_MAP, keyboard],
      ['mouse', MOUSE_MAP, mouse],
    ])('draws the %s from its map', (_, map, pixels) => {
      expect(byPosition(pixels)).toEqual(byPosition(iconAt(map, pixels)))
    })

    it.each([
      ['keyboard', keyboard],
      ['mouse', mouse],
    ])('centres the %s in the column', (_, pixels) => {
      expect(Math.abs(centre(extent(pixels)) - centre(COLUMN))).toBeLessThanOrEqual(0.5)
    })

    it('draws two dim rules, each a single row', () => {
      expect(rules).toHaveLength(2)
      for (const rule of rules) expect(rule.every(({ colour }) => colour === FOREGROUND_DIM)).toBe(true)
    })

    it.each([0, 1])('runs rule %i across the column, RULE_INSET short of each edge', (index) => {
      expect(rules[index].map(({ x }) => x).sort((a, b) => a - b)).toEqual(
        Array.from({ length: COLUMN.right - COLUMN.left + 1 - 2 * RULE_INSET }, (_, i) => COLUMN.left + RULE_INSET + i),
      )
    })

    it('puts the first rule RULE_GAP clear of the keyboard above and the mouse below', () => {
      const y = rules[0][0].y

      expect(y - extent(keyboard).bottom - 1).toBe(RULE_GAP)
      expect(extent(mouse).top - y - 1).toBe(RULE_GAP)
    })

    it('puts the second rule RULE_GAP clear of the mouse above and HEALTH_GAP clear of the health readout below', () => {
      const y = rules[1][0].y

      expect(y - extent(mouse).bottom - 1).toBe(RULE_GAP)
      expect(extent(health).top - y - 1).toBe(HEALTH_GAP)
    })

    it('centres the stack, keyboard to health readout, on the avatar\'s height', () => {
      const topGap = extent(keyboard).top - SQUARE.top
      const bottomGap = SQUARE.bottom - extent(health).bottom

      expect(Math.abs(topGap - bottomGap)).toBeLessThanOrEqual(1)
    })

    describe.each<Health>([
      { current: 19, total: 92 },
      { current: 7, total: 9 },
    ])('with the health $current/$total', (health) => {
      const width = COLUMN.right - COLUMN.left + 1 - 2 * HEALTH_INSET
      const pixels = () => column(card(AVATAR, health)).health

      it('draws the readout from healthPixels, laid out the column\'s width less its insets', () => {
        const { left, top } = healthOrigin(health, width, pixels())

        expect(byPosition(pixels())).toEqual(
          byPosition(healthPixels(health, width).map((pixel) => ({ ...pixel, x: left + pixel.x, y: top + pixel.y }))),
        )
      })

      it('insets the readout HEALTH_INSET from each of the column\'s edges', () => {
        const top = extent(pixels()).top
        const current = pixels().filter(({ y }) => y < top + NUMBER_HEIGHT)
        const total = pixels().filter(({ y }) => y >= top + TOTAL_TOP)
        const currentLeft = extent(current).left - extent(bold(String(health.current), HEALTH_SCALE)).left
        const totalText = String(health.total)
        const totalRight =
          extent(total).right + (boldWidth(totalText, HEALTH_SCALE) - 1 - extent(bold(totalText, HEALTH_SCALE)).right)

        expect(currentLeft - COLUMN.left).toBe(HEALTH_INSET)
        expect(COLUMN.right - totalRight).toBe(HEALTH_INSET)
      })

      it('keeps the keyboard, mouse and health readout in the same place below the second rule', () => {
        const { keyboard: k, mouse: m, health: h, rules: r } = column(card(AVATAR, health))

        expect([k, m, r]).toEqual([keyboard, mouse, rules])
        expect(extent(h).top).toBe(r[1][0].y + HEALTH_GAP + 1)
      })

      it('keeps everything in the column inside it, clear of the outline and the border', () => {
        const drawn = card(AVATAR, health)
        const { keyboard: k, mouse: m, health: h, rules: r } = column(drawn)
        const onBorderSide = drawn.filter(({ x, y }) => x >= CARD_BOUNDS.right && y >= SQUARE.top && y <= SQUARE.bottom)

        for (const item of [k, m, h, ...r]) {
          expect(extent(item).left).toBeGreaterThanOrEqual(COLUMN.left)
          expect(extent(item).right).toBeLessThanOrEqual(COLUMN.right)
        }
        expect(onBorderSide.every(({ x, colour }) => x === CARD_BOUNDS.right && colour === FOREGROUND_WORN)).toBe(true)
        expect(onBorderSide).toHaveLength(AVATAR_CARD_SIZE)
      })
    })
  })
})

describe('healthPixels', () => {
  describe.each<[Health, number]>([
    [{ current: 19, total: 92 }, 31],
    [{ current: 7, total: 9 }, 31],
    [{ current: 19, total: 92 }, 40],
  ])('with the health %o at width %i', (health, width) => {
    const pixels = healthPixels(health, width)
    const currentText = String(health.current)
    const totalText = String(health.total)
    const rows = (from: number, to: number) => pixels.filter(({ y }) => y >= from && y < to)

    it('draws the current bold at HEALTH_SCALE in the full foreground, from the top left', () => {
      expect(byPosition(rows(0, NUMBER_HEIGHT))).toEqual(
        byPosition(placed(bold(currentText, HEALTH_SCALE), 0, 0, FOREGROUND)),
      )
    })

    it('draws the total bold at HEALTH_SCALE in the full foreground, right-aligned to the width at the bottom', () => {
      const left = width - boldWidth(totalText, HEALTH_SCALE)

      expect(byPosition(rows(TOTAL_TOP, Number.POSITIVE_INFINITY))).toEqual(
        byPosition(placed(bold(totalText, HEALTH_SCALE), left, TOTAL_TOP, FOREGROUND)),
      )
      expect(extent(rows(TOTAL_TOP, Number.POSITIVE_INFINITY)).right).toBe(width - 1)
    })

    it('draws a worn bold slash between them, centred across the width', () => {
      const slash = rows(NUMBER_HEIGHT, TOTAL_TOP)
      const left = extent(slash).left - extent(bold('/')).left

      expect(byPosition(slash)).toEqual(byPosition(placed(bold('/'), left, SLASH_TOP, FOREGROUND_WORN)))
      expect(Math.abs(left + boldWidth('/') / 2 - width / 2)).toBeLessThanOrEqual(0.5)
    })

    it('leaves an empty row between the slash and each number', () => {
      const slash = extent(rows(NUMBER_HEIGHT, TOTAL_TOP))

      expect(extent(rows(0, NUMBER_HEIGHT)).bottom).toBe(NUMBER_HEIGHT - 1)
      expect([slash.top, slash.bottom]).toEqual([NUMBER_HEIGHT + 1, TOTAL_TOP - 2])
      expect(extent(rows(TOTAL_TOP, Number.POSITIVE_INFINITY)).top).toBe(TOTAL_TOP)
    })

    it('lists each pixel only once', () => {
      expect(new Set(pixels.map(key)).size).toBe(pixels.length)
    })
  })
})

describe('drawSidePanel', () => {
  it.each<[string, Picture | null, number | null, Health]>([
    ['without the avatar or carets', null, null, CARD_HEALTH],
    ['with the avatar', AVATAR, null, CARD_HEALTH],
    ['with carets at rest while selected', null, 0, CARD_HEALTH],
    ['with carets dipped in mid-bounce', AVATAR, 2, CARD_HEALTH],
    ['with another health', null, null, { current: 7, total: 9 }],
  ])('draws the background, then the card, %s', (_, avatar, inset, health) => {
    const { ctx, fills } = createFakeContext(WIDTH, HEIGHT)

    drawSidePanel(ctx, CARD_NAME, health, avatar, inset)

    expect(fills).toEqual([
      { args: [0, 0, WIDTH, HEIGHT], fillStyle: BACKGROUND },
      ...toFills(cardPixels(CARD_NAME, health, avatar)),
      ...(inset === null ? [] : toFills(selectionPixels(CARD_BOUNDS, inset, WIDTH, HEIGHT))),
    ])
  })
})
