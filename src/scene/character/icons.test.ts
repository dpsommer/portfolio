import { describe, expect, it } from 'vitest'
import { FOREGROUND, FOREGROUND_DIM, FOREGROUND_WORN } from '../core/palette.ts'
import { KEYBOARD_MAP, MOUSE_MAP, iconHeight, iconPixels, iconWidth } from './icons.ts'
import type { IconMap } from './icons.ts'

describe.each([
  ['keyboard', KEYBOARD_MAP],
  ['mouse', MOUSE_MAP],
])('the %s map', (_, map) => {
  it('is rectangular', () => {
    expect(map.every((row) => row.length === map[0].length)).toBe(true)
  })

  it('uses only known characters', () => {
    expect(() => iconPixels(map, 0, 0)).not.toThrow()
  })

  it('draws within its width and height', () => {
    for (const { x, y } of iconPixels(map, 0, 0)) {
      expect(x).toBeGreaterThanOrEqual(0)
      expect(x).toBeLessThan(iconWidth(map))
      expect(y).toBeGreaterThanOrEqual(0)
      expect(y).toBeLessThan(iconHeight(map))
    }
  })
})

describe('iconWidth and iconHeight', () => {
  it('give a map\'s columns and rows', () => {
    const map = ['#..', '...']

    expect([iconWidth(map), iconHeight(map)]).toEqual([3, 2])
  })
})

describe('iconPixels', () => {
  it.each([
    ['#', FOREGROUND],
    ['+', FOREGROUND_WORN],
    ['-', FOREGROUND_DIM],
  ])('draws %j in %s', (char, colour) => {
    expect(iconPixels([char], 0, 0)).toEqual([{ x: 0, y: 0, colour }])
  })

  it('leaves "." empty', () => {
    expect(iconPixels(['...', '...'], 0, 0)).toEqual([])
  })

  it('puts each cell at its column and row, offset to (left, top)', () => {
    const map: IconMap = ['.#', '#.']

    expect(iconPixels(map, 5, 7).map(({ x, y }) => [x, y])).toEqual([
      [6, 7],
      [5, 8],
    ])
  })

  it.each(['x', ' ', '*'])('throws on the unknown character %j', (char) => {
    expect(() => iconPixels([`.${char}.`], 0, 0)).toThrow(`'${char}'`)
  })
})
