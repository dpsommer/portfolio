import { describe, expect, it } from 'vitest'
import { HEIGHT, WIDTH, columnAt, expectOnCanvas, extent, rowAt } from '../../test/pixels.ts'
import { HALL_END_Z } from '../core/camera.ts'
import type { FloorPoint } from '../core/camera.ts'
import { FOREGROUND } from '../core/palette.ts'
import type { Pixel } from '../core/types.ts'
import { PLACES } from '../navigation/places.ts'
import type { PlaceName } from '../navigation/places.ts'
import { windowPixels } from '../window/pixels.ts'
import { ARCH_OUTLINE, OPEN_PANE, PANES } from '../window/tracery.ts'
import { REST_POSE } from './owl.ts'
import { OWL_PERCH, owlPixels } from './pixels.ts'

const NORTH = 0
const WEST = Math.PI / 2
const SOUTH = Math.PI
const EAST = (3 * Math.PI) / 2

const eyeAt = (place: PlaceName): FloorPoint => ({ x: PLACES[place].x, z: PLACES[place].z })
const size = (pixels: Pixel[]) => {
  const { left, top, right, bottom } = extent(pixels)
  return { width: right - left, height: bottom - top }
}
// The open pane's left edge and bottom in window-local units, and the sill below it.
const OPEN = {
  left: Math.min(...PANES[OPEN_PANE].map(({ s }) => s)),
  bottom: Math.min(...PANES[OPEN_PANE].map(({ t }) => t)),
}
const SILL_T = Math.min(...ARCH_OUTLINE.map(({ t }) => t))

describe('owlPixels', () => {
  const fromEnd = owlPixels(WIDTH, HEIGHT, REST_POSE, SOUTH, eyeAt('hall-end'))
  const fromMiddle = owlPixels(WIDTH, HEIGHT, REST_POSE, SOUTH, eyeAt('hall-middle'))
  const fromHall = owlPixels(WIDTH, HEIGHT, REST_POSE, SOUTH, eyeAt('hall'))

  it.each([
    ['the hall\'s dead end', fromEnd],
    ['the middle of the hall', fromMiddle],
    ['the hall\'s first place', fromHall],
  ])('draws at integer coordinates within the canvas from %s facing south', (_, pixels) => {
    expect(pixels.length).toBeGreaterThan(0)
    expectOnCanvas(pixels)
  })

  describe('from the hall\'s dead end facing south, 1 from the window\'s wall', () => {
    const depth = PLACES['hall-end'].z - HALL_END_Z

    it('perches on the open pane\'s bottom', () => {
      expect(depth).toBeCloseTo(1)
      expect(OWL_PERCH.t).toBe(OPEN.bottom)
      // Its feet stand 0.03 out from the wall, so a touch lower than the
      // opening's bottom in the wall, but above the sill.
      const { bottom } = extent(fromEnd)
      expect(bottom).toBeGreaterThan(rowAt(OPEN.bottom, depth))
      expect(Math.abs(bottom - rowAt(OPEN.bottom, depth - 0.03))).toBeLessThanOrEqual(1)
      expect(bottom).toBeLessThan(rowAt(SILL_T, depth))
    })

    it('sits right of the opening\'s left edge', () => {
      expect(extent(fromEnd).left).toBeGreaterThan(columnAt(OPEN.left, depth))
    })

    it('sits left of the open casement, which reaches below the sill', () => {
      const sillRow = rowAt(SILL_T, depth)
      const casement = windowPixels(WIDTH, HEIGHT, SOUTH, eyeAt('hall-end')).filter(
        (p) => p.colour === FOREGROUND && p.y > sillRow,
      )
      expect(casement.length).toBeGreaterThan(0)
      expect(extent(fromEnd).right).toBeLessThan(extent(casement).left)
    })

    it('is right of the view\'s centre, in the window\'s lower right pane', () => {
      expect(extent(fromEnd).left).toBeGreaterThan(WIDTH / 2)
      expect(extent(fromEnd).top).toBeGreaterThan(HEIGHT / 2)
    })
  })

  it('is smaller from the middle of the hall, further off', () => {
    const near = size(fromEnd)
    const far = size(fromMiddle)
    expect(far.width).toBeLessThan(near.width)
    expect(far.height).toBeLessThan(near.height)
  })

  it.each([
    ['blinking', { ...REST_POSE, blink: 1 }],
    ['facing the visitor', { ...REST_POSE, turn: 0 }],
    ['tilting its head', { ...REST_POSE, tilt: 0.18 }],
  ])('draws differently %s', (_, pose) => {
    const posed = owlPixels(WIDTH, HEIGHT, pose, SOUTH, eyeAt('hall-end'))
    expect(posed.length).toBeGreaterThan(0)
    expect(posed).not.toEqual(fromEnd)
  })

  it.each([
    ['the start', 'start', NORTH],
    ['the start', 'start', EAST],
    ['the start', 'start', SOUTH],
    ['the start', 'start', WEST],
    ['the nook', 'nook', WEST],
    ['the sign', 'sign', NORTH],
    ['the hall\'s first place', 'hall', NORTH],
    ['the middle of the hall', 'hall-middle', WEST],
    ['the middle of the hall', 'hall-middle', EAST],
    ['the hall\'s dead end', 'hall-end', NORTH],
    ['the hall\'s dead end', 'hall-end', EAST],
    ['the hall\'s dead end', 'hall-end', WEST],
  ] as const)('draws nothing from %s facing yaw %f', (_, place, yaw) => {
    expect(owlPixels(WIDTH, HEIGHT, REST_POSE, yaw, eyeAt(place))).toEqual([])
  })

  it('defaults to resting at the start facing north, where it is out of view', () => {
    expect(owlPixels(WIDTH, HEIGHT)).toEqual([])
  })

  it('defaults to the resting pose', () => {
    expect(owlPixels(WIDTH, HEIGHT, undefined, SOUTH, eyeAt('hall-end'))).toEqual(fromEnd)
  })
})
