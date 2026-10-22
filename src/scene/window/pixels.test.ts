import { describe, expect, it } from 'vitest'
import { HEIGHT, WIDTH, columnAt, expectOnCanvas, extent, rowAt } from '../../test/pixels.ts'
import { BAY_Z, CEILING_Y, HALL_END_Z } from '../core/camera.ts'
import type { FloorPoint } from '../core/camera.ts'
import { FOREGROUND, FOREGROUND_DIM, FOREGROUND_WORN } from '../core/palette.ts'
import type { Pixel } from '../core/types.ts'
import { PLACES } from '../navigation/places.ts'
import type { PlaceName } from '../navigation/places.ts'
import { ARCH_OUTLINE, OPEN_PANE, PANES, WINDOW_BOUNDS } from './tracery.ts'
import { windowPixels } from './pixels.ts'

const NORTH = 0
const WEST = Math.PI / 2
const SOUTH = Math.PI
const EAST = (3 * Math.PI) / 2

const eyeAt = (place: PlaceName): FloorPoint => ({ x: PLACES[place].x, z: PLACES[place].z })
// How far the window's wall is ahead of a place in the hall, facing south.
const depthFrom = (place: PlaceName) => PLACES[place].z - HALL_END_Z
const width = (pixels: Pixel[]) => extent(pixels).right - extent(pixels).left
const ofColour = (pixels: Pixel[], colour: string) => pixels.filter((p) => p.colour === colour)
// The outer arch's foot, where the sill lies. The sill's ends are the
// window's sides, WINDOW_BOUNDS.left and right.
const SILL_T = Math.min(...ARCH_OUTLINE.map(({ t }) => t))
// The open pane's extent in window-local units.
const OPEN = {
  left: Math.min(...PANES[OPEN_PANE].map(({ s }) => s)),
  right: Math.max(...PANES[OPEN_PANE].map(({ s }) => s)),
  bottom: Math.min(...PANES[OPEN_PANE].map(({ t }) => t)),
}

describe('windowPixels', () => {
  // From the hall's dead end facing south, where the window is 1 away.
  const fromEnd = windowPixels(WIDTH, HEIGHT, SOUTH, eyeAt('hall-end'))
  // From the middle of the hall facing south, 7/3 away, where it's all in view.
  const fromMiddle = windowPixels(WIDTH, HEIGHT, SOUTH, eyeAt('hall-middle'))

  it('draws at integer coordinates within the canvas from the hall\'s dead end facing south', () => {
    expect(fromEnd.length).toBeGreaterThan(0)
    expectOnCanvas(fromEnd)
  })

  it('uses the dim, worn and full foreground colours', () => {
    expect(new Set(fromEnd.map((p) => p.colour))).toEqual(new Set([FOREGROUND_DIM, FOREGROUND_WORN, FOREGROUND]))
  })

  it('draws the sill\'s ends and its line where they project on the wall 1 away', () => {
    expect(depthFrom('hall-end')).toBeCloseTo(1)
    const { left, right, bottom } = extent(ofColour(fromEnd, FOREGROUND_WORN))
    expect(Math.abs(left - columnAt(WINDOW_BOUNDS.left, 1))).toBeLessThanOrEqual(1)
    expect(Math.abs(right - columnAt(WINDOW_BOUNDS.right, 1))).toBeLessThanOrEqual(1)
    expect(Math.abs(bottom - rowAt(SILL_T, 1))).toBeLessThanOrEqual(1)
  })

  it('runs off the top of the canvas from the hall\'s dead end, the window being taller than the view there', () => {
    expect(rowAt(WINDOW_BOUNDS.top, 1)).toBeLessThan(0)
    expect(extent(ofColour(fromEnd, FOREGROUND_WORN)).top).toBe(0)
    expect(extent(ofColour(fromEnd, FOREGROUND)).top).toBe(0)
  })

  it('is centred across the view', () => {
    const { left, right } = extent(ofColour(fromEnd, FOREGROUND_WORN))
    expect(Math.abs(left + right - (WIDTH - 1))).toBeLessThanOrEqual(2)
  })

  it('spans most of the view\'s height, reaching nearly to the floor', () => {
    const { top, bottom } = extent(fromEnd)
    expect(bottom - top).toBeGreaterThan(HEIGHT * 0.8)
    expect(bottom).toBeGreaterThan(rowAt(-0.6, 1))
  })

  describe('from the middle of the hall facing south', () => {
    const depth = depthFrom('hall-middle')

    it('has the whole window in view, its apex inside the canvas', () => {
      expect(depth).toBeCloseTo(7 / 3)
      expect(fromMiddle.length).toBeGreaterThan(0)
      expectOnCanvas(fromMiddle)
      const { top } = extent(fromMiddle)
      expect(rowAt(WINDOW_BOUNDS.top, depth)).toBeGreaterThan(0)
      expect(Math.abs(top - rowAt(WINDOW_BOUNDS.top, depth))).toBeLessThanOrEqual(1)
    })

    it('draws the stone where it projects, centred across the view', () => {
      const { left, right, bottom } = extent(ofColour(fromMiddle, FOREGROUND_WORN))
      expect(Math.abs(left - columnAt(WINDOW_BOUNDS.left, depth))).toBeLessThanOrEqual(1)
      expect(Math.abs(right - columnAt(WINDOW_BOUNDS.right, depth))).toBeLessThanOrEqual(1)
      expect(Math.abs(bottom - rowAt(SILL_T, depth))).toBeLessThanOrEqual(1)
      expect(Math.abs(left + right - (WIDTH - 1))).toBeLessThanOrEqual(2)
    })

    it('draws the openings inside the worn stone arch', () => {
      const stone = extent(ofColour(fromMiddle, FOREGROUND_WORN))
      const openings = extent(ofColour(fromMiddle, FOREGROUND))
      expect(openings.left).toBeGreaterThan(stone.left)
      expect(openings.right).toBeLessThan(stone.right)
      expect(openings.top).toBeGreaterThan(stone.top)
    })
  })

  describe('from the hall\'s first place facing south', () => {
    const fromHall = windowPixels(WIDTH, HEIGHT, SOUTH, eyeAt('hall'))
    // The main ceiling ends across the hall at BAY_Z, 2 ahead.
    const CEILING_EDGE_ROW = rowAt(CEILING_Y, PLACES.hall.z - BAY_Z)

    it('cuts the window off at the main ceiling\'s edge, below where its top would project', () => {
      expect(CEILING_EDGE_ROW).toBe(72)
      expect(rowAt(WINDOW_BOUNDS.top, depthFrom('hall'))).toBeLessThan(CEILING_EDGE_ROW - 10)
      expect(fromHall.length).toBeGreaterThan(0)
      expect(Math.abs(extent(fromHall).top - CEILING_EDGE_ROW)).toBeLessThanOrEqual(1)
    })

    it('still draws the window below the ceiling\'s edge, down to its sill', () => {
      const { bottom } = extent(ofColour(fromHall, FOREGROUND_WORN))
      expect(Math.abs(bottom - rowAt(SILL_T, depthFrom('hall')))).toBeLessThanOrEqual(1)
    })
  })

  describe('the open casement from the hall\'s dead end facing south', () => {
    // The open pane's outline in the wall, 1 away.
    const PANE = {
      left: columnAt(OPEN.left, 1),
      right: columnAt(OPEN.right, 1),
      bottom: rowAt(OPEN.bottom, 1),
    }
    const SILL_ROW = rowAt(SILL_T, 1)
    // Only the casement, swung out nearer the eye, reaches below the sill.
    const belowSill = ofColour(fromEnd, FOREGROUND).filter((p) => p.y > SILL_ROW)

    it('draws its frame nearer than the wall, so lower than the sill', () => {
      expect(PANE.bottom).toBeLessThan(SILL_ROW)
      expect(belowSill.length).toBeGreaterThan(0)
    })

    it('stands it out from its hinge on the pane\'s right edge, so it shows left of that edge', () => {
      for (const p of belowSill) {
        expect(p.x).toBeLessThanOrEqual(PANE.right)
        expect(p.x).toBeGreaterThanOrEqual(PANE.left)
      }
      // Swung 60°, its free edge stands out w √3/2 and in w/2 from the hinge.
      const w = OPEN.right - OPEN.left
      const freeEdge = columnAt(OPEN.right - w / 2, 1 - (w * Math.sqrt(3)) / 2)
      expect(freeEdge).toBeLessThan(PANE.right - 5)
      expect(Math.abs(Math.min(...belowSill.map((p) => p.x)) - freeEdge)).toBeLessThanOrEqual(1)
    })

    it('draws its leading dim below the sill too', () => {
      expect(ofColour(fromEnd, FOREGROUND_DIM).filter((p) => p.y > SILL_ROW).length).toBeGreaterThan(0)
    })
  })

  it.each([
    ['the start', 'start', NORTH],
    ['the start', 'start', EAST],
    ['the start', 'start', SOUTH],
    ['the start', 'start', WEST],
    ['the middle of the hall', 'hall-middle', WEST],
    ['the middle of the hall', 'hall-middle', EAST],
    ['the hall\'s dead end', 'hall-end', NORTH],
  ] as const)('draws nothing from %s facing yaw %f', (_, place, yaw) => {
    expect(windowPixels(WIDTH, HEIGHT, yaw, eyeAt(place))).toEqual([])
  })

  it('defaults to the start facing north, where it is out of view', () => {
    expect(windowPixels(WIDTH, HEIGHT)).toEqual([])
  })

  it.each(['hall', 'hall-middle'] as const)('draws the stone smaller in proportion to distance from %s facing south', (place) => {
    const stone = ofColour(windowPixels(WIDTH, HEIGHT, SOUTH, eyeAt(place)), FOREGROUND_WORN)
    const near = ofColour(fromEnd, FOREGROUND_WORN)
    expect(stone.length).toBeGreaterThan(0)
    expectOnCanvas(stone)
    expect(width(stone)).toBeLessThan(width(near))
    expect(Math.abs(width(stone) - width(near) / depthFrom(place))).toBeLessThanOrEqual(2)
  })

  it('is the same after a full turn', () => {
    expect(windowPixels(WIDTH, HEIGHT, SOUTH + 2 * Math.PI, eyeAt('hall-end'))).toEqual(fromEnd)
  })

  it('scales with the canvas size', () => {
    const small = windowPixels(WIDTH / 2, HEIGHT / 2, SOUTH, eyeAt('hall-end'))
    expectOnCanvas(small, WIDTH / 2, HEIGHT / 2)
    expect(width(small)).toBeCloseTo(width(fromEnd) / 2, -1)
  })
})
