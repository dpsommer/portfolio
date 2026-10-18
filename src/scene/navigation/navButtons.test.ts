import { describe, expect, it } from 'vitest'
import { FOREGROUND, FOREGROUND_DIM, FOREGROUND_WORN } from '../core/palette.ts'
import type { Pixel } from '../core/types.ts'
import type { Bounds } from '../signpost/signpost.ts'
import { COMPASS_CENTRE, COMPASS_RADIUS } from './compass.ts'
import { ARROW_MAP, BUTTON_SIZE, NAV_BUTTON_BOUNDS, navButtonAt, navButtonPixels } from './navButtons.ts'
import type { NavButton } from './navButtons.ts'

// The lower panel's drawing size, which the buttons must fit in.
const PANEL_WIDTH = 320
const PANEL_HEIGHT = 132
const BUTTONS: NavButton[] = ['forward', 'back', 'left', 'right']
const ALL_ENABLED: Record<NavButton, boolean> = { forward: true, back: true, left: true, right: true }
const ARROW_CELLS = ARROW_MAP.join('').split('').filter((cell) => cell === '#').length

const key = ({ x, y }: { x: number; y: number }) => `${x},${y}`
const inBounds = ({ left, top, right, bottom }: Bounds) => (p: { x: number; y: number }) =>
  p.x >= left && p.x <= right && p.y >= top && p.y <= bottom
const centreOf = ({ left, top, right, bottom }: Bounds) => ({ x: (left + right) / 2, y: (top + bottom) / 2 })
const onEdge = ({ left, top, right, bottom }: Bounds) => (p: { x: number; y: number }) =>
  inBounds({ left, top, right, bottom })(p) && (p.x === left || p.x === right || p.y === top || p.y === bottom)
const shrink = ({ left, top, right, bottom }: Bounds, by: number): Bounds => ({
  left: left + by,
  top: top + by,
  right: right - by,
  bottom: bottom - by,
})

const buttonPixels = (pixels: Pixel[], button: NavButton) => pixels.filter(inBounds(NAV_BUTTON_BOUNDS[button]))
// The arrow sits well inside the button's two outlines.
const arrowPixels = (pixels: Pixel[], button: NavButton) =>
  pixels.filter(inBounds(shrink(NAV_BUTTON_BOUNDS[button], 4)))

describe('BUTTON_SIZE', () => {
  it('is 30 pixels', () => {
    expect(BUTTON_SIZE).toBe(30)
  })
})

describe('NAV_BUTTON_BOUNDS', () => {
  it('has the four buttons', () => {
    expect(Object.keys(NAV_BUTTON_BOUNDS).sort()).toEqual([...BUTTONS].sort())
  })

  it.each(BUTTONS)('makes the %s button BUTTON_SIZE square, inclusive', (button) => {
    const { left, top, right, bottom } = NAV_BUTTON_BOUNDS[button]

    expect(right - left + 1).toBe(BUTTON_SIZE)
    expect(bottom - top + 1).toBe(BUTTON_SIZE)
  })

  it.each(BUTTONS)('fits the %s button in the panel, right of the compass', (button) => {
    const { left, top, right, bottom } = NAV_BUTTON_BOUNDS[button]

    expect(left).toBeGreaterThan(COMPASS_CENTRE.x + COMPASS_RADIUS)
    expect(right).toBeLessThan(PANEL_WIDTH)
    expect(top).toBeGreaterThanOrEqual(0)
    expect(bottom).toBeLessThan(PANEL_HEIGHT)
  })

  it('puts forward directly above back', () => {
    const { forward, back } = NAV_BUTTON_BOUNDS

    expect(forward.left).toBe(back.left)
    expect(forward.right).toBe(back.right)
    expect(forward.bottom).toBeLessThan(back.top)
  })

  it('puts left, back and right flush in one row', () => {
    const { back, left, right } = NAV_BUTTON_BOUNDS

    for (const button of [left, right]) {
      expect(button.top).toBe(back.top)
      expect(button.bottom).toBe(back.bottom)
    }
    expect(left.right).toBeLessThan(back.left)
    expect(back.right).toBeLessThan(right.left)
  })

  it('lays them out like arrow keys: forward alone on the top row', () => {
    const { forward, back, left, right } = NAV_BUTTON_BOUNDS

    expect(forward.bottom).toBeLessThan(left.top)
    expect(forward.bottom).toBeLessThan(right.top)
    expect(left.right).toBeLessThan(forward.left)
    expect(right.left).toBeGreaterThan(forward.right)
    expect(centreOf(back).x).toBe((centreOf(left).x + centreOf(right).x) / 2)
  })

  it('leaves a 2-pixel gap between neighbouring buttons', () => {
    const { forward, back, left, right } = NAV_BUTTON_BOUNDS

    expect(back.top - forward.bottom - 1).toBe(2)
    expect(back.left - left.right - 1).toBe(2)
    expect(right.left - back.right - 1).toBe(2)
  })

  it('puts the top row at y 35 to 64 and the bottom row at 67 to 96', () => {
    const { forward, back, left, right } = NAV_BUTTON_BOUNDS

    expect([forward.top, forward.bottom]).toEqual([35, 64])
    for (const button of [back, left, right]) expect([button.top, button.bottom]).toEqual([67, 96])
  })

  it('centres the two rows on y 66 and the columns on x 230', () => {
    const { forward, back, left, right } = NAV_BUTTON_BOUNDS

    // Pixel n covers n to n + 1, so the pad spans top to bottom + 1.
    expect((forward.top + back.bottom + 1) / 2).toBe(66)
    expect((left.left + right.right + 1) / 2).toBe(230)
  })
})

describe('navButtonAt', () => {
  it.each(BUTTONS)('finds the %s button at its centre', (button) => {
    const { x, y } = centreOf(NAV_BUTTON_BOUNDS[button])

    expect(navButtonAt(x, y)).toBe(button)
  })

  it.each(BUTTONS)('includes the corners of the %s button', (button) => {
    const { left, top, right, bottom } = NAV_BUTTON_BOUNDS[button]

    expect(navButtonAt(left, top)).toBe(button)
    expect(navButtonAt(right, top)).toBe(button)
    expect(navButtonAt(left, bottom)).toBe(button)
    expect(navButtonAt(right, bottom)).toBe(button)
  })

  it.each(BUTTONS)('covers the whole last pixel of the %s button for fractional points', (button) => {
    const { right, bottom } = NAV_BUTTON_BOUNDS[button]

    expect(navButtonAt(right + 0.9, bottom + 0.9)).toBe(button)
  })

  it.each(BUTTONS)('finds nothing just outside the %s button', (button) => {
    const { left, top, right, bottom } = NAV_BUTTON_BOUNDS[button]
    const { x, y } = centreOf(NAV_BUTTON_BOUNDS[button])

    expect(navButtonAt(left - 0.5, y)).toBeNull()
    expect(navButtonAt(right + 1, y)).toBeNull()
    expect(navButtonAt(x, top - 0.5)).toBeNull()
    expect(navButtonAt(x, bottom + 1)).toBeNull()
  })

  it('finds nothing above the left and right buttons, either side of forward', () => {
    const { forward, left, right } = NAV_BUTTON_BOUNDS

    expect(navButtonAt(centreOf(left).x, centreOf(forward).y)).toBeNull()
    expect(navButtonAt(centreOf(right).x, centreOf(forward).y)).toBeNull()
  })

  it('finds nothing over the compass', () => {
    expect(navButtonAt(COMPASS_CENTRE.x, COMPASS_CENTRE.y)).toBeNull()
  })

  it('finds nothing in the gaps between the buttons', () => {
    const { forward, back, left } = NAV_BUTTON_BOUNDS

    expect(navButtonAt(centreOf(forward).x, forward.bottom + 1.5)).toBeNull()
    expect(navButtonAt(left.right + 1.5, centreOf(back).y)).toBeNull()
    expect(navButtonAt(back.right + 1.5, centreOf(back).y)).toBeNull()
  })

  it.each([
    [0, 0],
    [PANEL_WIDTH - 1, PANEL_HEIGHT - 1],
    [-10, -10],
  ])('finds nothing at (%s, %s)', (x, y) => {
    expect(navButtonAt(x, y)).toBeNull()
  })
})

describe('ARROW_MAP', () => {
  it('is a square of # and . cells', () => {
    for (const row of ARROW_MAP) {
      expect(row).toHaveLength(ARROW_MAP.length)
      expect(row).toMatch(/^[#.]+$/)
    }
  })

  it('fits inside a button\'s inner outline', () => {
    expect(ARROW_MAP.length).toBeLessThan(BUTTON_SIZE - 8)
  })

  it('is left-right symmetric', () => {
    for (const row of ARROW_MAP) expect(row.split('').reverse().join('')).toBe(row)
  })

  it('points up: narrowest at the top, widest across the head', () => {
    const widths = ARROW_MAP.map((row) => row.split('').filter((cell) => cell === '#').length)
    const widest = Math.max(...widths)

    expect(widths[0]).toBe(Math.min(...widths))
    expect(widths.indexOf(widest)).toBeLessThan(ARROW_MAP.length / 2)
    expect(widths[ARROW_MAP.length - 1]).toBeLessThan(widest)
  })
})

describe('navButtonPixels', () => {
  it('draws nothing outside the four buttons', () => {
    const pixels = navButtonPixels(ALL_ENABLED)
    const inAny = (p: Pixel) => BUTTONS.some((button) => inBounds(NAV_BUTTON_BOUNDS[button])(p))

    expect(pixels.every(inAny)).toBe(true)
  })

  it('does not repeat pixels', () => {
    const pixels = navButtonPixels(ALL_ENABLED)

    expect(new Set(pixels.map(key)).size).toBe(pixels.length)
  })

  describe('an enabled button', () => {
    it.each(BUTTONS)('outlines the %s button\'s edge in the full foreground colour', (button) => {
      const bounds = NAV_BUTTON_BOUNDS[button]
      const edge = buttonPixels(navButtonPixels(ALL_ENABLED), button).filter(onEdge(bounds))

      expect(edge).toHaveLength(4 * (BUTTON_SIZE - 1))
      expect(edge.every((p) => p.colour === FOREGROUND)).toBe(true)
    })

    it.each(BUTTONS)('draws a worn inner outline inside the %s button\'s edge', (button) => {
      const pixels = buttonPixels(navButtonPixels(ALL_ENABLED), button)
      const worn = pixels.filter((p) => p.colour === FOREGROUND_WORN)
      const left = Math.min(...worn.map((p) => p.x))
      const top = Math.min(...worn.map((p) => p.y))
      const right = Math.max(...worn.map((p) => p.x))
      const bottom = Math.max(...worn.map((p) => p.y))
      const bounds = NAV_BUTTON_BOUNDS[button]

      expect(worn.length).toBeGreaterThan(0)
      expect(worn.every(onEdge({ left, top, right, bottom }))).toBe(true)
      expect(worn).toHaveLength(2 * (right - left + 1) + 2 * (bottom - top - 1))
      // Inset the same distance from every side, with a gap to the outer edge.
      expect(left - bounds.left).toBeGreaterThan(1)
      expect(bounds.right - right).toBe(left - bounds.left)
      expect(top - bounds.top).toBe(left - bounds.left)
      expect(bounds.bottom - bottom).toBe(left - bounds.left)
    })

    it.each(BUTTONS)('draws the %s button\'s arrow in the full foreground colour', (button) => {
      const arrow = arrowPixels(navButtonPixels(ALL_ENABLED), button)

      expect(arrow).toHaveLength(ARROW_CELLS)
      expect(arrow.every((p) => p.colour === FOREGROUND)).toBe(true)
    })

    it.each(BUTTONS)('centres the %s button\'s arrow', (button) => {
      const arrow = arrowPixels(navButtonPixels(ALL_ENABLED), button)
      const centre = centreOf(NAV_BUTTON_BOUNDS[button])
      const box = {
        left: Math.min(...arrow.map((p) => p.x)),
        top: Math.min(...arrow.map((p) => p.y)),
        right: Math.max(...arrow.map((p) => p.x)),
        bottom: Math.max(...arrow.map((p) => p.y)),
      }

      expect(box.right - box.left + 1).toBe(ARROW_MAP.length)
      expect(box.bottom - box.top + 1).toBe(ARROW_MAP.length)
      expect(Math.abs(centreOf(box).x - centre.x)).toBeLessThanOrEqual(1)
      expect(Math.abs(centreOf(box).y - centre.y)).toBeLessThanOrEqual(1)
    })

    // The arrow's head holds most of its pixels, so their middle is off
    // centre towards the tip.
    it.each([
      ['forward', 0, -1],
      ['back', 0, 1],
      ['left', -1, 0],
      ['right', 1, 0],
    ] as const)('points the %s arrow its way', (button, dx, dy) => {
      const arrow = arrowPixels(navButtonPixels(ALL_ENABLED), button)
      const xs = arrow.map((p) => p.x)
      const ys = arrow.map((p) => p.y)
      const boxCentre = { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 }
      const mass = { x: xs.reduce((a, b) => a + b, 0) / xs.length, y: ys.reduce((a, b) => a + b, 0) / ys.length }

      expect(Math.sign(Math.round((mass.x - boxCentre.x) * 100))).toBe(dx)
      expect(Math.sign(Math.round((mass.y - boxCentre.y) * 100))).toBe(dy)
    })

    it('draws the forward arrow as ARROW_MAP', () => {
      const arrow = arrowPixels(navButtonPixels(ALL_ENABLED), 'forward')
      const left = Math.min(...arrow.map((p) => p.x))
      const top = Math.min(...arrow.map((p) => p.y))
      const drawn = new Set(arrow.map((p) => key({ x: p.x - left, y: p.y - top })))

      ARROW_MAP.forEach((row, y) =>
        row.split('').forEach((cell, x) => {
          expect(drawn.has(key({ x, y }))).toBe(cell === '#')
        }),
      )
    })

    it('mirrors the left and right arrows, and forward and back', () => {
      const pixels = navButtonPixels(ALL_ENABLED)
      const relative = (button: NavButton) => {
        const arrow = arrowPixels(pixels, button)
        const left = Math.min(...arrow.map((p) => p.x))
        const top = Math.min(...arrow.map((p) => p.y))
        return arrow.map((p) => ({ x: p.x - left, y: p.y - top }))
      }
      const n = ARROW_MAP.length
      const flipX = (points: { x: number; y: number }[]) => points.map(({ x, y }) => key({ x: n - 1 - x, y })).sort()
      const flipY = (points: { x: number; y: number }[]) => points.map(({ x, y }) => key({ x, y: n - 1 - y })).sort()

      expect(flipX(relative('left'))).toEqual(relative('right').map(key).sort())
      expect(flipY(relative('forward'))).toEqual(relative('back').map(key).sort())
    })
  })

  describe('a disabled button', () => {
    it.each(BUTTONS)('draws the disabled %s button entirely in the dim colour', (button) => {
      const pixels = buttonPixels(navButtonPixels({ ...ALL_ENABLED, [button]: false }), button)

      expect(pixels.length).toBeGreaterThan(0)
      expect(pixels.every((p) => p.colour === FOREGROUND_DIM)).toBe(true)
    })

    it.each(BUTTONS)('draws the disabled %s button in the same places as when enabled', (button) => {
      const enabled = buttonPixels(navButtonPixels(ALL_ENABLED), button).map(key).sort()
      const disabled = buttonPixels(navButtonPixels({ ...ALL_ENABLED, [button]: false }), button).map(key).sort()

      expect(disabled).toEqual(enabled)
    })

    it.each(BUTTONS)('leaves the other buttons as they are when %s is disabled', (button) => {
      const enabled = navButtonPixels(ALL_ENABLED)
      const disabled = navButtonPixels({ ...ALL_ENABLED, [button]: false })

      for (const other of BUTTONS.filter((b) => b !== button)) {
        expect(buttonPixels(disabled, other)).toEqual(buttonPixels(enabled, other))
      }
    })

    it('uses no dim pixels when every button is enabled', () => {
      expect(navButtonPixels(ALL_ENABLED).some((p) => p.colour === FOREGROUND_DIM)).toBe(false)
    })
  })
})
