import { describe, expect, it } from 'vitest'
import { expectOnCanvas, expectPlaced, extent } from '../../test/pixels.ts'
import { FOREGROUND, FOREGROUND_DIM, FOREGROUND_WORN } from '../core/palette.ts'
import { GLYPH_HEIGHT, textPixels, textWidth } from '../core/pixelFont.ts'
import type { Pixel } from '../core/types.ts'
import { EQUIPMENT } from './aboutText.ts'
import { equipmentPixels } from './equipment.ts'
import type { EquipmentSlot } from './equipment.ts'
import { iconHeight, iconPixels, iconWidth } from './icons.ts'
import type { IconMap } from './icons.ts'

// Icons of only full-foreground cells, each a different size and with an
// uneven pattern, so an icon's pixels are told apart from the worn names and
// dim boxes, and must be drawn the right way round.
const patterned = (width: number, height: number): IconMap =>
  Array.from({ length: height }, (_, y) =>
    Array.from({ length: width }, (_, x) => (x === 0 || y === 0 || (x * 3 + y) % 4 === 0 ? '#' : '.')).join(''),
  )
const SLOTS: EquipmentSlot[] = [
  { slot: 'Weapon', item: 'Sword', icon: patterned(9, 4) },
  { slot: 'Off-Hand', item: 'Shield', icon: patterned(7, 11) },
  { slot: 'Head', item: 'Helm', icon: patterned(13, 6) },
  { slot: 'Chest', item: 'Mail', icon: patterned(5, 9) },
]
const SIZES = [
  [134, 106],
  [120, 100],
  [161, 140],
]

type Box = ReturnType<typeof extent>

// The dim boxes, in reading order: groups of dim pixels touching (corners included).
function boxes(pixels: Pixel[]): Box[] {
  const dim = new Set(pixels.filter(({ colour }) => colour === FOREGROUND_DIM).map(({ x, y }) => `${x},${y}`))
  const found: Box[] = []
  for (const start of dim) {
    const group: { x: number; y: number }[] = []
    const queue = [start]
    dim.delete(start)
    while (queue.length > 0) {
      const [x, y] = queue.pop()!.split(',').map(Number)
      group.push({ x, y })
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const next = `${x + dx},${y + dy}`
          if (dim.delete(next)) queue.push(next)
        }
      }
    }
    found.push(extent(group))
  }
  return found.sort((a, b) => a.top - b.top || a.left - b.left)
}

const within = (pixels: Pixel[], { left, top, right, bottom }: Box) =>
  pixels.filter(({ x, y }) => x > left && x < right && y > top && y < bottom)
// Whether `start` and `size` sit in the middle of the box, to a pixel.
const centred = (start: number, size: number, box: Box) =>
  Math.abs(start - box.left - (box.right - (start + size - 1))) <= 1

describe.each(SIZES)('equipmentPixels at %i x %i', (width, height) => {
  const pixels = equipmentPixels(SLOTS, width, height)
  const grid = boxes(pixels)
  const icon = (index: number) =>
    expectPlaced(within(pixels, grid[index]).filter(({ colour }) => colour === FOREGROUND), iconPixels(SLOTS[index].icon, 0, 0))
  const name = (index: number) =>
    expectPlaced(within(pixels, grid[index]).filter(({ colour }) => colour === FOREGROUND_WORN), textPixels(SLOTS[index].slot))

  it('centres a worn "Equipment" heading at the top', () => {
    const heading = pixels.filter(({ y }) => y < grid[0].top)

    const { left, top } = expectPlaced(heading, textPixels('Equipment'))

    expect(top).toBe(0)
    expect(Math.abs(left - (width - left - textWidth('Equipment')))).toBeLessThanOrEqual(1)
    expect(heading.every(({ colour }) => colour === FOREGROUND_WORN)).toBe(true)
  })

  it('draws four same-sized dim boxes without corners in a 2x2 grid, 3 px apart, under the heading', () => {
    const [topLeft, topRight, bottomLeft, bottomRight] = grid
    const outlines = within(pixels, { left: -1, top: grid[0].top - 1, right: width, bottom: height }).filter(
      ({ colour }) => colour === FOREGROUND_DIM,
    )

    expect(grid).toHaveLength(4)
    for (const box of grid) {
      expect([box.right - box.left, box.bottom - box.top]).toEqual([topLeft.right - topLeft.left, topLeft.bottom - topLeft.top])
    }
    expect([topLeft.left, bottomLeft.left, topRight.top]).toEqual([0, 0, topLeft.top])
    expect([bottomRight.left, bottomRight.top]).toEqual([topRight.left, bottomLeft.top])
    expect(topRight.left - topLeft.right - 1).toBe(3)
    expect(bottomLeft.top - topLeft.bottom - 1).toBe(3)
    expect(topLeft.top).toBeGreaterThan(GLYPH_HEIGHT)
    // Each box is a one-pixel outline: its edges less the four corners.
    const edges = grid.reduce((sum, box) => sum + 2 * (box.right - box.left - 1) + 2 * (box.bottom - box.top - 1), 0)
    expect(outlines).toHaveLength(edges)
  })

  it.each(SLOTS.map((slot, index) => [slot.slot, index] as const))('draws the %s icon from its map, centred across its box', (_, index) => {
    const { left } = icon(index)

    expect(centred(left, iconWidth(SLOTS[index].icon), grid[index])).toBe(true)
  })

  it.each(SLOTS.map((slot, index) => [slot.slot, index] as const))('centres the worn name %j across its box, under its icon', (_, index) => {
    const { left, top } = name(index)

    expect(centred(left, textWidth(SLOTS[index].slot), grid[index])).toBe(true)
    expect(top).toBeGreaterThan(icon(index).top + iconHeight(SLOTS[index].icon) - 1)
  })

  it('lines up the names in each row, though the icons over them differ in height', () => {
    expect(name(0).top).toBe(name(1).top)
    expect(name(2).top).toBe(name(3).top)
  })
})

describe('equipmentPixels bounds', () => {
  it.each(SIZES.flatMap(([width, height]) => [
    ['the test slots', SLOTS, width, height] as const,
    ['the profile\'s slots', EQUIPMENT, width, height] as const,
  ]))('keeps %s within %i x %i', (_, slots, width, height) => {
    expectOnCanvas(equipmentPixels(slots, width, height), width, height)
  })
})
