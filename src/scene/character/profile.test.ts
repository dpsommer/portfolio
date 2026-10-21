import { describe, expect, it } from 'vitest'
import { createFakeContext, toFills } from '../../test/fakeContext.ts'
import { HEIGHT, WIDTH, expectOnCanvas, expectPlaced, extent } from '../../test/pixels.ts'
import { BACKGROUND, FOREGROUND, FOREGROUND_DIM, FOREGROUND_WORN } from '../core/palette.ts'
import { GLYPHS, GLYPH_HEIGHT, textPixels } from '../core/pixelFont.ts'
import type { Pixel } from '../core/types.ts'
import { AVATAR_MESSAGES, FULL_NAME, PROFILE } from './aboutText.ts'
import { BUBBLE_HEIGHT, bubblePixels } from './bubble.ts'
import type { Bubble } from './bubble.ts'
import { equipmentPixels } from './equipment.ts'
import { POTION_HEIGHT, POTION_WIDTH, potionPixels } from './potion.ts'
import { AVATAR_PROFILE_BOUNDS, AVATAR_PROFILE_SIZE, drawProfile, profilePixels } from './profile.ts'
import type { Profile } from './profile.ts'
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
const taken = new Set(profilePixels(PROFILE, null).map(key))
const SQUARE = extent(profilePixels(PROFILE, AVATAR).filter((pixel) => !taken.has(key(pixel))))

// The rules: across, RULE_GAP (6) under the avatar's outline (2 px out from
// its square), from the outline's left to its mirror on the right; then down
// the middle to the bottom of the area under it, 8 px above the canvas's.
const RULE_Y = SQUARE.bottom + 2 + 6
const RULE_LEFT = SQUARE.left - 2
const RULE_RIGHT = WIDTH - 1 - RULE_LEFT
const DIVIDER_X = Math.floor((RULE_LEFT + RULE_RIGHT) / 2)
const LOWER_BOTTOM = HEIGHT - 1 - 8
// The equipment table's space from the rules and the area's edges.
const PADDING = 6

const withName = (fullName: string): Profile => ({ ...PROFILE, fullName })
const above = (pixels: Pixel[]) => pixels.filter(({ y }) => y < RULE_Y)
const below = (pixels: Pixel[]) => pixels.filter(({ y }) => y > RULE_Y)

// The name's pixels split into lines at the empty rows between them.
function nameLines(name: string): Pixel[][] {
  const pixels = byPosition(above(profilePixels(withName(name), null)).filter(({ colour }) => colour === FOREGROUND))
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

      expect(byPosition(inside(profilePixels(PROFILE, avatar), SQUARE))).toEqual(
        byPosition(picturePixels(avatar, SQUARE.left, SQUARE.top)),
      )
    })

    it('is left out until it is given, leaving its square empty', () => {
      expect(inside(profilePixels(PROFILE, null), SQUARE)).toEqual([])
    })

    it('has a dim outline around its square, leaving out the corner pixels', () => {
      const ring = { left: SQUARE.left - 2, top: SQUARE.top - 2, right: SQUARE.right + 2, bottom: SQUARE.bottom + 2 }
      const outline = inside(profilePixels(PROFILE, null), ring)
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

    it('puts the title under the name in worn text at the font\'s size, lined up with it on the left', () => {
      const lines = nameLines(name)
      const title = above(profilePixels(withName(name), null)).filter(({ colour }) => colour === FOREGROUND_WORN)

      const { left, top } = expectPlaced(title, textPixels(PROFILE.title))

      expect(left).toBe(origin(words[0], lines[0]).left)
      expect(top).toBeGreaterThan(extent(lines[lines.length - 1]).bottom)
      expect(top + GLYPH_HEIGHT).toBeLessThan(RULE_Y)
    })
  })

  // The profile's own, the widest health readout, and an empty potion.
  describe.each([
    ['the profile', PROFILE],
    ['the widest health', { ...PROFILE, health: { current: 9999, total: 9999 } }],
    ['no health', { ...PROFILE, health: { current: 0, total: 0 } }],
  ])('under the avatar, for %s', (_, profile) => {
    const pixels = profilePixels(profile, AVATAR)

    it('draws a dim rule across, 6 px under the avatar\'s outline, from its left to the mirror of that', () => {
      const rule = byPosition(pixels.filter(({ y }) => y === RULE_Y))

      expect(rule).toEqual(Array.from({ length: RULE_RIGHT - RULE_LEFT + 1 }, (_, i) => ({ x: RULE_LEFT + i, y: RULE_Y, colour: FOREGROUND_DIM })))
    })

    it('draws a dim rule down the middle, from under the rule across to the bottom of the area, that nothing crosses', () => {
      const rule = byPosition(below(pixels).filter(({ x }) => x === DIVIDER_X))

      expect(rule).toEqual(Array.from({ length: LOWER_BOTTOM - RULE_Y }, (_, i) => ({ x: DIVIDER_X, y: RULE_Y + 1 + i, colour: FOREGROUND_DIM })))
    })

    it('draws the potion, and nothing else, centred in the left section', () => {
      const left = below(pixels).filter(({ x }) => x < DIVIDER_X)
      const potion = potionPixels(profile.health)

      const place = expectPlaced(left, potion)

      expect(byPosition(left)).toEqual(byPosition(potion.map(({ x, y, colour }) => ({ x: x + place.left, y: y + place.top, colour }))))
      expect(Math.abs(place.left - RULE_LEFT - 1 - (DIVIDER_X - 1 - (place.left + POTION_WIDTH - 1)))).toBeLessThanOrEqual(1)
      expect(Math.abs(place.top - RULE_Y - 1 - (LOWER_BOTTOM - (place.top + POTION_HEIGHT - 1)))).toBeLessThanOrEqual(1)
    })

    it('draws the equipment table, and nothing else, in the right section inside its padding', () => {
      const tableLeft = DIVIDER_X + 1 + PADDING
      const tableTop = RULE_Y + 1 + PADDING
      const table = equipmentPixels(profile.equipment, RULE_RIGHT - PADDING - tableLeft + 1, LOWER_BOTTOM - tableTop + 1)

      expect(byPosition(below(pixels).filter(({ x }) => x > DIVIDER_X))).toEqual(
        byPosition(table.map(({ x, y, colour }) => ({ x: x + tableLeft, y: y + tableTop, colour }))),
      )
    })

    it.each([
      ['without the avatar', null],
      ['with the avatar', AVATAR],
    ])('keeps the view on the room canvas %s', (_, avatar) => {
      expectOnCanvas(profilePixels(profile, avatar), WIDTH, HEIGHT)
    })
  })
})

// The pixels `bubble` adds to the profile view: those not in the view without it.
function bubbleAdds(bubble: Bubble): Pixel[] {
  const plain = new Set(profilePixels(PROFILE, AVATAR).map((pixel) => `${key(pixel)},${pixel.colour}`))
  return profilePixels(PROFILE, AVATAR, bubble).filter((pixel) => !plain.has(`${key(pixel)},${pixel.colour}`))
}
const fullBubble = (text: string): Bubble => ({ text, shown: text.length })
// Where the title's text box starts.
const TITLE = expectPlaced(
  above(profilePixels(PROFILE, null)).filter(({ colour }) => colour === FOREGROUND_WORN),
  textPixels(PROFILE.title),
)

describe('AVATAR_PROFILE_BOUNDS', () => {
  it('covers the avatar\'s square, inclusive', () => {
    expect(AVATAR_PROFILE_BOUNDS).toEqual(SQUARE)
  })
})

describe('profilePixels with a speech bubble', () => {
  const BUBBLE = fullBubble(AVATAR_MESSAGES[0])

  it('draws no bubble without one, by default', () => {
    expect(profilePixels(PROFILE, AVATAR)).toEqual(profilePixels(PROFILE, AVATAR, null))
  })

  it.each([0, 2, BUBBLE.text.length])('adds only the bubble, its box\'s left lined up with the title and its bottom row level with the avatar\'s, with %i characters shown', (shown) => {
    const bubble = { ...BUBBLE, shown }
    const top = SQUARE.bottom + 1 - BUBBLE_HEIGHT

    expect(byPosition(bubbleAdds(bubble))).toEqual(
      byPosition(bubblePixels(bubble).map(({ x, y, colour }) => ({ x: x + TITLE.left, y: y + top, colour }))),
    )
    expect(profilePixels(PROFILE, AVATAR, bubble)).toHaveLength(profilePixels(PROFILE, AVATAR).length + bubblePixels(bubble).length)
  })

  it('reaches past the rules\' right end with a message of more than 13 characters', () => {
    expect(extent(bubbleAdds(fullBubble('M'.repeat(14)))).right).toBeGreaterThan(RULE_RIGHT)
  })

  // The longest a message can be, by the docs, and each one the avatar says.
  describe.each(['M'.repeat(13), ...AVATAR_MESSAGES])('for %j', (message) => {
    const pixels = bubbleAdds(fullBubble(message))

    it('has a glyph for each character', () => {
      for (const char of message) expect(GLYPHS).toHaveProperty([char])
    })

    it('stays right of the avatar\'s outline, below the title, above the rule across and within its right end, on empty space', () => {
      const { left, top, right, bottom } = extent(pixels)

      expect(left).toBeGreaterThan(SQUARE.right + 2)
      expect(top).toBeGreaterThan(TITLE.top + GLYPH_HEIGHT - 1)
      expect(right).toBeLessThanOrEqual(RULE_RIGHT)
      expect(bottom).toBeLessThan(RULE_Y)
      const where = new Set(pixels.map(key))
      expect(pixels).toHaveLength(bubblePixels(fullBubble(message)).length)
      expect(profilePixels(PROFILE, AVATAR).filter((pixel) => where.has(key(pixel)))).toEqual([])
    })
  })
})

describe('drawProfile', () => {
  it('draws the background, then the profile view with the speech bubble given', () => {
    const { ctx, fills } = createFakeContext(WIDTH, HEIGHT)
    const bubble = { text: AVATAR_MESSAGES[0], shown: 2 }

    drawProfile(ctx, PROFILE, AVATAR, bubble)

    expect(fills).toEqual([
      { args: [0, 0, WIDTH, HEIGHT], fillStyle: BACKGROUND },
      ...toFills(profilePixels(PROFILE, AVATAR, bubble)),
    ])
  })

  it.each([
    ['without the avatar', null],
    ['with the avatar', AVATAR],
  ])('draws the background, then the profile view, %s', (_, avatar) => {
    const { ctx, fills } = createFakeContext(WIDTH, HEIGHT)

    drawProfile(ctx, PROFILE, avatar)

    expect(fills).toEqual([
      { args: [0, 0, WIDTH, HEIGHT], fillStyle: BACKGROUND },
      ...toFills(profilePixels(PROFILE, avatar)),
    ])
  })
})
