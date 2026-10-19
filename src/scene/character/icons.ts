import { PREVIEW_COLOURS } from '../mirror/preview.ts'
import type { Pixel } from '../core/types.ts'

// Small keyboard and mouse icons for the character card, hinting at the two
// ways to play. Maps are grids of strings like the site logos: '#' is the
// full foreground, '+' worn, '-' dim and '.' empty, one cell per canvas pixel.
export type IconMap = string[]

const ICON_TONES: Record<string, number> = { '.': 0, '-': 1, '+': 2, '#': 3 }

export const KEYBOARD_MAP: IconMap = [
  '.######################.',
  '#......................#',
  '#.++.++.++.++.++.++.++.#',
  '#......................#',
  '#..++.++.++.++.++.++...#',
  '#......................#',
  '#.++.++.++.++.++.++.++.#',
  '#......................#',
  '#.....++++++++++++.....#',
  '#......................#',
  '.######################.',
]

export const MOUSE_MAP: IconMap = [
  '.....+.....',
  '.....+.....',
  '...##+##...',
  '.##..+..##.',
  '#....+....#',
  '#....+....#',
  '#....+....#',
  '#+++++++++#',
  '#.........#',
  '#.........#',
  '#.........#',
  '#.........#',
  '.#.......#.',
  '..##...##..',
  '....###....',
]

export const iconWidth = (map: IconMap) => map[0].length
export const iconHeight = (map: IconMap) => map.length

// Pixels for an icon with its top-left corner at (left, top).
export function iconPixels(map: IconMap, left: number, top: number): Pixel[] {
  return map.flatMap((row, y) =>
    row.split('').flatMap((char, x) => {
      const tone = ICON_TONES[char]
      if (tone === undefined) throw new Error(`Unknown icon map character '${char}'`)
      return tone === 0 ? [] : [{ x: left + x, y: top + y, colour: PREVIEW_COLOURS[tone] }]
    }),
  )
}
