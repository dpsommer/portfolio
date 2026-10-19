import { describe, expect, it } from 'vitest'
import { HEIGHT, WIDTH, expectOnCanvas, extent } from '../../test/pixels.ts'
import { FOCAL_RATIO, NOOK_FRONT_Z, ORIGIN, ROOM_HALF_WIDTH } from '../core/camera.ts'
import type { FloorPoint } from '../core/camera.ts'
import { FOREGROUND, FOREGROUND_WORN } from '../core/palette.ts'
import { textPixels, textWidth } from '../core/pixelFont.ts'
import type { Pixel } from '../core/types.ts'
import { PLACES } from '../navigation/places.ts'
import { SIGN_TEXT } from './board.ts'
import { signPixels } from './pixels.ts'

const NOOK_EYE: FloorPoint = { x: PLACES.nook.x, z: PLACES.nook.z }
const SIGN_EYE: FloorPoint = { x: PLACES.sign.x, z: PLACES.sign.z }
const FOCAL = (FOCAL_RATIO * WIDTH) / 2
const WEST = Math.PI / 2
const SOUTH = Math.PI
const TEXT_CELLS = textPixels(SIGN_TEXT, 3).length

const key = (p: { x: number; y: number }) => `${p.x},${p.y}`
const foreground = (pixels: Pixel[]) => pixels.filter((p) => p.colour === FOREGROUND)
// The text is drawn last, one block per cell.
const textOf = (pixels: Pixel[]) => pixels.slice(-TEXT_CELLS)

describe('signPixels', () => {
  const fromStart = signPixels(WIDTH, HEIGHT)
  // From in front of the sign, facing north, where it's used.
  const fromSign = signPixels(WIDTH, HEIGHT, 0, SIGN_EYE)

  it('defaults to the start facing north', () => {
    expect(fromStart).toEqual(signPixels(WIDTH, HEIGHT, 0, ORIGIN))
  })

  it.each([
    ['the start', fromStart],
    ['in front of the sign', fromSign],
  ])('draws at integer coordinates within the canvas from %s facing north', (_, pixels) => {
    expect(pixels.length).toBeGreaterThan(0)
    expectOnCanvas(pixels)
  })

  it('uses the worn and full foreground colours', () => {
    expect(new Set(fromSign.map((p) => p.colour))).toEqual(new Set([FOREGROUND_WORN, FOREGROUND]))
  })

  it('draws the board and text centred on the far wall from in front of the sign', () => {
    expect(extent(foreground(fromSign))).toEqual({ left: 83, top: 90, right: 237, bottom: 150 })
  })

  it('hangs the nail and cords above the board', () => {
    expect(extent(fromSign).top).toBe(69)
  })

  it('draws the sign smaller from the start, further back', () => {
    const near = extent(foreground(fromSign))
    const far = extent(foreground(fromStart))
    expect(far.right - far.left).toBeLessThan((near.right - near.left) / 2)
  })

  it('draws each text cell as its own canvas pixel from in front of the sign', () => {
    const text = textOf(fromSign)
    expect(text.every((p) => p.colour === FOREGROUND)).toBe(true)
    expect(new Set(text.map(key)).size).toBe(TEXT_CELLS)
  })

  it('draws the text one column per text pixel, inside the board', () => {
    const text = extent(textOf(fromSign))
    const board = extent(foreground(fromSign))
    expect(text.right - text.left + 1).toBe(textWidth(SIGN_TEXT, 3))
    expect(text.left).toBeGreaterThan(board.left)
    expect(text.right).toBeLessThan(board.right)
    expect(text.top).toBeGreaterThan(board.top)
    expect(text.bottom).toBeLessThan(board.bottom)
  })

  it('tilts the board so its right side is higher', () => {
    const board = foreground(fromSign)
    const { left, right } = extent(board)
    const topAt = (x: number) => Math.min(...board.filter((p) => p.x === x).map((p) => p.y))
    expect(topAt(right)).toBeLessThan(topAt(left))
  })

  it.each([
    ['west', WEST],
    ['south', SOUTH],
  ])('draws nothing from the start facing %s', (_, yaw) => {
    expect(signPixels(WIDTH, HEIGHT, yaw)).toEqual([])
  })

  it('is the same after a full turn', () => {
    expect(signPixels(WIDTH, HEIGHT, 2 * Math.PI)).toEqual(fromStart)
  })

  describe('from the nook facing north', () => {
    const fromNook = signPixels(WIDTH, HEIGHT, 0, NOOK_EYE)

    it('is visible, within the canvas', () => {
      expect(fromNook.length).toBeGreaterThan(0)
      expectOnCanvas(fromNook)
    })

    it('appears right of centre, since the nook is left of the sign', () => {
      const { left } = extent(fromNook)
      expect(left).toBeGreaterThan(WIDTH / 2)
    })

    it('hides the part behind the nook\'s side wall, left of its front corner', () => {
      // The corner (-1, 1) is 1/3 right of the eye and 1 ahead: 160 + 128 / 3.
      const corner = Math.round(WIDTH / 2 + (FOCAL * (-ROOM_HALF_WIDTH - NOOK_EYE.x)) / (NOOK_FRONT_Z - NOOK_EYE.z))
      expect(extent(fromNook).left).toBeGreaterThanOrEqual(corner - 1)
      expect(extent(fromNook).right).toBeGreaterThan(corner + 10)
    })
  })

  it('scales with the canvas size', () => {
    const small = extent(foreground(signPixels(WIDTH / 2, HEIGHT / 2)))
    const full = extent(foreground(fromStart))
    expect(small.right - small.left).toBeCloseTo((full.right - full.left) / 2, -1)
  })
})
