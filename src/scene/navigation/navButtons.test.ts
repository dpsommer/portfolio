import { describe, expect, it, vi } from 'vitest'
import { linePoints } from '../core/line.ts'
import { FOREGROUND, FOREGROUND_DIM, FOREGROUND_WORN } from '../core/palette.ts'
import type { Bounds, Pixel } from '../core/types.ts'
import { extent } from '../../test/pixels.ts'
import { COMPASS_CENTRE, COMPASS_RADIUS } from './compass.ts'
import {
  ARROW_OUTLINE,
  ARROW_SIZE,
  BUTTON_SIZE,
  NAV_BUTTON_BOUNDS,
  PRESS_DEPTH,
  navButtonAt,
  navButtonPixels,
} from './navButtons.ts'
import type { KeyPress, NavButton } from './navButtons.ts'

type Point = { x: number; y: number }

// The lower panel's drawing size, which the buttons must fit in.
const PANEL_WIDTH = 320
const PANEL_HEIGHT = 132
const BUTTONS: NavButton[] = ['forward', 'back', 'left', 'right']
const ALL_ENABLED: Record<NavButton, boolean> = { forward: true, back: true, left: true, right: true }
const PALETTE = [FOREGROUND, FOREGROUND_WORN, FOREGROUND_DIM]
// How far a keycap's top face is inset from its base.
const FACE_INSET = { side: 3, top: 2, bottom: 6 }

const key = ({ x, y }: Point) => `${x},${y}`
const keysOf = (points: Point[]) => new Set(points.map(key))
const sortedKeys = (points: Point[]) => [...keysOf(points)].sort()
const inBounds = ({ left, top, right, bottom }: Bounds) => (p: Point) =>
  p.x >= left && p.x <= right && p.y >= top && p.y <= bottom
const centreOf = ({ left, top, right, bottom }: Bounds) => ({ x: (left + right) / 2, y: (top + bottom) / 2 })
const shrink = ({ left, top, right, bottom }: Bounds, by: number): Bounds => ({
  left: left + by,
  top: top + by,
  right: right - by,
  bottom: bottom - by,
})
const coloursOf = (pixels: Pixel[]) => new Set(pixels.map((p) => p.colour))
const press = (button: NavButton, depth = 1): KeyPress => ({ button, depth })

// What shows on the canvas: where a pixel is drawn more than once, the last one.
function shown(pixels: Pixel[]): Pixel[] {
  const last = new Map<string, Pixel>()
  for (const p of pixels) last.set(key(p), p)
  return [...last.values()]
}
const buttonPixels = (pixels: Pixel[], button: NavButton) => shown(pixels).filter(inBounds(NAV_BUTTON_BOUNDS[button]))
// The face of `button`'s keycap, sunk `sink` pixels down when pressed.
const faceOf = (button: NavButton, sink = 0): Bounds => {
  const base = NAV_BUTTON_BOUNDS[button]
  return {
    left: base.left + FACE_INSET.side,
    top: base.top + FACE_INSET.top + sink,
    right: base.right - FACE_INSET.side,
    bottom: base.bottom - FACE_INSET.bottom + sink,
  }
}
// Points on a rectangle's outline.
function outline({ left, top, right, bottom }: Bounds): Point[] {
  const points: Point[] = []
  for (let x = left; x <= right; x++) points.push({ x, y: top }, { x, y: bottom })
  for (let y = top + 1; y < bottom; y++) points.push({ x: left, y }, { x: right, y })
  return points
}
const cornersOf = ({ left, top, right, bottom }: Bounds): Point[] => [
  { x: left, y: top },
  { x: right, y: top },
  { x: left, y: bottom },
  { x: right, y: bottom },
]
// Inside the face's outline there's only the arrow.
const arrowOf = (pixels: Pixel[], button: NavButton, sink = 0) =>
  buttonPixels(pixels, button).filter(inBounds(shrink(faceOf(button, sink), 1)))
// The face's outline as drawn, sunk `sink` pixels.
const faceOutlineOf = (pixels: Pixel[], button: NavButton, sink = 0) => {
  const face = keysOf(outline(faceOf(button, sink)))
  return buttonPixels(pixels, button).filter((p) => face.has(key(p)))
}
// The base's outline: the button's edge, less its corners.
const baseOf = (pixels: Pixel[], button: NavButton) => {
  const base = keysOf(outline(NAV_BUTTON_BOUNDS[button]))
  return buttonPixels(pixels, button).filter((p) => base.has(key(p)))
}
// Between the base and the face: the corner lines.
const cornerLinesOf = (pixels: Pixel[], button: NavButton, sink = 0) => {
  const face = faceOf(button, sink)
  return buttonPixels(pixels, button).filter(
    (p) => !inBounds(face)(p) && inBounds(shrink(NAV_BUTTON_BOUNDS[button], 1))(p),
  )
}
// Pixels relative to `origin`, as keys with colours, for comparing two drawings.
const pattern = (pixels: Pixel[], origin: Bounds) =>
  pixels.map((p) => `${p.x - origin.left},${p.y - origin.top}:${p.colour}`).sort()

// ARROW_OUTLINE drawn as lines on its grid, pointing up.
const UP_ARROW = ARROW_OUTLINE.slice(1).flatMap((p, i) => linePoints(ARROW_OUTLINE[i].x, ARROW_OUTLINE[i].y, p.x, p.y))
// An arrow's pixels relative to the top left of its own bounding box.
const arrowShape = (arrow: Point[]) => {
  const box = extent(arrow)
  return sortedKeys(arrow.map((p) => ({ x: p.x - box.left, y: p.y - box.top })))
}
// Grid points turned on the ARROW_SIZE grid.
const n = ARROW_SIZE - 1
const TURNS: Record<NavButton, (p: Point) => Point> = {
  forward: (p) => p,
  back: ({ x, y }) => ({ x, y: n - y }),
  left: ({ x, y }) => ({ x: y, y: n - x }),
  right: ({ x, y }) => ({ x: n - y, y: x }),
}

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

  it('centres the two rows on the panel\'s height', () => {
    // Pixel n covers n to n + 1, so the pad spans top to bottom + 1.
    const { forward, back } = NAV_BUTTON_BOUNDS

    expect((forward.top + back.bottom + 1) / 2).toBe(PANEL_HEIGHT / 2)
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

describe('ARROW_OUTLINE', () => {
  it('is a closed outline', () => {
    expect(ARROW_OUTLINE[ARROW_OUTLINE.length - 1]).toEqual(ARROW_OUTLINE[0])
  })

  it('lies on the ARROW_SIZE grid, reaching each edge', () => {
    const box = extent(ARROW_OUTLINE)

    expect(box).toEqual({ left: 0, top: 0, right: ARROW_SIZE - 1, bottom: ARROW_SIZE - 1 })
    for (const { x, y } of ARROW_OUTLINE) expect(Number.isInteger(x) && Number.isInteger(y)).toBe(true)
  })

  it('fits inside a button\'s face', () => {
    expect(ARROW_SIZE).toBeLessThan(BUTTON_SIZE - FACE_INSET.top - FACE_INSET.bottom - 2)
  })

  it('is left-right symmetric', () => {
    const mirrored = ARROW_OUTLINE.map(({ x, y }) => ({ x: ARROW_SIZE - 1 - x, y }))

    expect(sortedKeys(mirrored)).toEqual(sortedKeys(ARROW_OUTLINE))
  })

  it('points up: a single point on top, and a stem narrower than the head', () => {
    const top = ARROW_OUTLINE.filter((p) => p.y === 0)
    const bottom = ARROW_OUTLINE.filter((p) => p.y === ARROW_SIZE - 1)
    const bottomWidth = Math.max(...bottom.map((p) => p.x)) - Math.min(...bottom.map((p) => p.x))

    expect(new Set(top.map(key)).size).toBe(1)
    expect(top[0].x).toBe((ARROW_SIZE - 1) / 2)
    expect(bottomWidth).toBeGreaterThan(0)
    expect(bottomWidth).toBeLessThan(ARROW_SIZE - 1)
  })
})

describe('navButtonPixels', () => {
  it('draws nothing outside the four buttons', () => {
    const pixels = navButtonPixels(ALL_ENABLED)
    const inAny = (p: Pixel) => BUTTONS.some((button) => inBounds(NAV_BUTTON_BOUNDS[button])(p))

    expect(pixels.every(inAny)).toBe(true)
  })

  it('uses only the full, worn and dim foreground colours', () => {
    for (const colour of coloursOf(navButtonPixels(ALL_ENABLED))) expect(PALETTE).toContain(colour)
  })

  it('draws the same pixels each time', () => {
    expect(navButtonPixels(ALL_ENABLED, press('left', 0.5))).toEqual(navButtonPixels(ALL_ENABLED, press('left', 0.5)))
  })

  it('uses no randomness', () => {
    const random = vi.spyOn(Math, 'random')

    navButtonPixels(ALL_ENABLED, press('back'))

    expect(random).not.toHaveBeenCalled()
    random.mockRestore()
  })

  it.each(BUTTONS.filter((b) => b !== 'forward'))('draws the %s key like forward but for its arrow', (button) => {
    const pixels = navButtonPixels(ALL_ENABLED)
    const withoutArrow = (b: NavButton) => {
      const arrow = keysOf(arrowOf(pixels, b))
      return pattern(buttonPixels(pixels, b).filter((p) => !arrow.has(key(p))), NAV_BUTTON_BOUNDS[b])
    }

    expect(withoutArrow(button)).toEqual(withoutArrow('forward'))
  })

  describe('an enabled keycap', () => {
    describe('base', () => {
      it.each(BUTTONS)('draws the %s key\'s base outline whole, along the button\'s edge, its corners cut', (button) => {
        const bounds = NAV_BUTTON_BOUNDS[button]
        const corners = keysOf(cornersOf(bounds))
        const expected = outline(bounds).filter((p) => !corners.has(key(p)))

        expect(sortedKeys(baseOf(navButtonPixels(ALL_ENABLED), button))).toEqual(sortedKeys(expected))
      })

      it.each(BUTTONS)('draws the %s key\'s base dim', (button) => {
        expect(coloursOf(baseOf(navButtonPixels(ALL_ENABLED), button))).toEqual(new Set([FOREGROUND_DIM]))
      })
    })

    describe('face', () => {
      it.each(BUTTONS)('draws the %s key\'s face outline whole and bright', (button) => {
        const face = faceOutlineOf(navButtonPixels(ALL_ENABLED), button)

        expect(face).toHaveLength(outline(faceOf(button)).length)
        expect(coloursOf(face)).toEqual(new Set([FOREGROUND]))
      })

      it.each(BUTTONS)('insets the %s key\'s face further from the bottom than the sides and top', (button) => {
        const bright = buttonPixels(navButtonPixels(ALL_ENABLED), button).filter((p) => p.colour === FOREGROUND)
        const base = NAV_BUTTON_BOUNDS[button]
        const box = extent(bright)

        expect(box.left - base.left).toBe(FACE_INSET.side)
        expect(base.right - box.right).toBe(FACE_INSET.side)
        expect(box.top - base.top).toBe(FACE_INSET.top)
        expect(base.bottom - box.bottom).toBe(FACE_INSET.bottom)
      })

      it.each(BUTTONS)('leaves the %s key\'s face unfilled but for its arrow', (button) => {
        const pixels = navButtonPixels(ALL_ENABLED)
        const face = faceOf(button)
        const arrowBox = extent(arrowOf(pixels, button))
        const inside = buttonPixels(pixels, button).filter(inBounds(shrink(face, 1)))

        expect(inside.every(inBounds(arrowBox))).toBe(true)
      })
    })

    describe('corner lines', () => {
      it.each(BUTTONS)('joins each of the %s key\'s face corners to just inside its base corners', (button) => {
        const base = NAV_BUTTON_BOUNDS[button]
        const lines = keysOf(cornerLinesOf(navButtonPixels(ALL_ENABLED), button))

        for (const corner of cornersOf(shrink(base, 1))) expect(lines.has(key(corner))).toBe(true)
        // Unbroken: each pixel touches another, and one touches the face's corner.
        for (const [inner, face] of cornersOf(shrink(base, 1)).map((c, i) => [c, cornersOf(faceOf(button))[i]])) {
          const line = linePoints(face.x, face.y, inner.x, inner.y).slice(1)
          expect(line.every((p) => lines.has(key(p)))).toBe(true)
        }
      })

      it.each(BUTTONS)('draws nothing else between the %s key\'s base and face', (button) => {
        const base = NAV_BUTTON_BOUNDS[button]
        const face = faceOf(button)
        const expected = cornersOf(shrink(base, 1)).flatMap((inner, i) => {
          const corner = cornersOf(face)[i]
          return linePoints(corner.x, corner.y, inner.x, inner.y).slice(1)
        })

        expect(sortedKeys(cornerLinesOf(navButtonPixels(ALL_ENABLED), button))).toEqual(sortedKeys(expected))
      })

      it.each(BUTTONS)('draws the %s key\'s corner lines dim', (button) => {
        expect(coloursOf(cornerLinesOf(navButtonPixels(ALL_ENABLED), button))).toEqual(new Set([FOREGROUND_DIM]))
      })
    })

    describe('arrow', () => {
      it('draws the forward arrow as ARROW_OUTLINE\'s lines, pointing up', () => {
        expect(arrowShape(arrowOf(navButtonPixels(ALL_ENABLED), 'forward'))).toEqual(sortedKeys(UP_ARROW))
      })

      it.each(BUTTONS)('draws the %s arrow as ARROW_OUTLINE turned its way', (button) => {
        const turned = UP_ARROW.map(TURNS[button])

        expect(arrowShape(arrowOf(navButtonPixels(ALL_ENABLED), button))).toEqual(sortedKeys(turned))
      })

      it.each(BUTTONS)('draws the %s arrow as an outline, not filled', (button) => {
        const arrow = keysOf(arrowOf(navButtonPixels(ALL_ENABLED), button))
        const box = extent(arrowOf(navButtonPixels(ALL_ENABLED), button))
        // The middle of the arrow's head, inside its outline.
        const middle = { x: (box.left + box.right) / 2, y: (box.top + box.bottom) / 2 }

        expect(arrow.size).toBe(keysOf(UP_ARROW).size)
        expect(arrow.has(key(middle))).toBe(false)
      })

      it.each(BUTTONS)('draws the %s arrow bright', (button) => {
        expect(coloursOf(arrowOf(navButtonPixels(ALL_ENABLED), button))).toEqual(new Set([FOREGROUND]))
      })

      it.each(BUTTONS)('centres the %s arrow on its face', (button) => {
        const box = extent(arrowOf(navButtonPixels(ALL_ENABLED), button))
        const centre = centreOf(faceOf(button))

        expect(box.right - box.left + 1).toBe(ARROW_SIZE)
        expect(box.bottom - box.top + 1).toBe(ARROW_SIZE)
        expect(Math.abs(centreOf(box).x - centre.x)).toBeLessThanOrEqual(1)
        expect(Math.abs(centreOf(box).y - centre.y)).toBeLessThanOrEqual(1)
      })

      it.each([
        ['forward', 0, -1],
        ['back', 0, 1],
        ['left', -1, 0],
        ['right', 1, 0],
      ] as const)('points the %s arrow its way: a single pixel at the tip', (button, dx, dy) => {
        const arrow = arrowOf(navButtonPixels(ALL_ENABLED), button)
        const box = extent(arrow)
        const centre = centreOf(box)
        const tip = {
          x: dx === 0 ? centre.x : dx < 0 ? box.left : box.right,
          y: dy === 0 ? centre.y : dy < 0 ? box.top : box.bottom,
        }
        const onTipEdge = arrow.filter((p) => (dx === 0 ? p.y === tip.y : p.x === tip.x))

        expect(onTipEdge.map(key)).toEqual([key(tip)])
      })
    })
  })

  describe('a disabled keycap', () => {
    it.each(BUTTONS)('draws the disabled %s key entirely in the dim colour', (button) => {
      const pixels = buttonPixels(navButtonPixels({ ...ALL_ENABLED, [button]: false }), button)

      expect(pixels.length).toBeGreaterThan(0)
      expect(coloursOf(pixels)).toEqual(new Set([FOREGROUND_DIM]))
    })

    it.each(BUTTONS)('draws the disabled %s key where the enabled one is', (button) => {
      const enabled = buttonPixels(navButtonPixels(ALL_ENABLED), button)
      const disabled = buttonPixels(navButtonPixels({ ...ALL_ENABLED, [button]: false }), button)

      expect(sortedKeys(disabled)).toEqual(sortedKeys(enabled))
    })

    it.each(BUTTONS)('leaves the other keys as they are when %s is disabled', (button) => {
      const enabled = navButtonPixels(ALL_ENABLED)
      const disabled = navButtonPixels({ ...ALL_ENABLED, [button]: false })

      for (const other of BUTTONS.filter((b) => b !== button)) {
        expect(buttonPixels(disabled, other)).toEqual(buttonPixels(enabled, other))
      }
    })
  })

  describe('a pressed keycap', () => {
    it.each(BUTTONS)('sinks the pressed %s key\'s face PRESS_DEPTH pixels, keeping its sides', (button) => {
      const pixels = navButtonPixels(ALL_ENABLED, press(button))
      const face = faceOutlineOf(pixels, button, PRESS_DEPTH)

      expect(face).toHaveLength(outline(faceOf(button, PRESS_DEPTH)).length)
      expect(coloursOf(face)).toEqual(new Set([FOREGROUND]))
      expect(extent(buttonPixels(pixels, button).filter((p) => p.colour === FOREGROUND))).toEqual(
        faceOf(button, PRESS_DEPTH),
      )
    })

    it.each(BUTTONS)('leaves the pressed %s key\'s base as it is', (button) => {
      const base = NAV_BUTTON_BOUNDS[button]

      expect(pattern(baseOf(navButtonPixels(ALL_ENABLED, press(button)), button), base)).toEqual(
        pattern(baseOf(navButtonPixels(ALL_ENABLED), button), base),
      )
    })

    it.each(BUTTONS)('moves the pressed %s key\'s arrow down with its face', (button) => {
      const up = arrowOf(navButtonPixels(ALL_ENABLED), button)
      const down = arrowOf(navButtonPixels(ALL_ENABLED, press(button)), button, PRESS_DEPTH)

      expect(pattern(down, faceOf(button, PRESS_DEPTH))).toEqual(pattern(up, faceOf(button)))
    })

    it.each(BUTTONS)('joins the pressed %s key\'s sunk face corners to its unmoved base corners', (button) => {
      const base = NAV_BUTTON_BOUNDS[button]
      const lines = cornerLinesOf(navButtonPixels(ALL_ENABLED, press(button)), button, PRESS_DEPTH)
      const expected = cornersOf(shrink(base, 1)).flatMap((inner, i) => {
        const corner = cornersOf(faceOf(button, PRESS_DEPTH))[i]
        return linePoints(corner.x, corner.y, inner.x, inner.y).slice(1)
      })

      expect(sortedKeys(lines)).toEqual(sortedKeys(expected))
      expect(coloursOf(lines)).toEqual(new Set([FOREGROUND_DIM]))
    })

    it.each(BUTTONS)('leaves the other keys as they are when %s is pressed', (button) => {
      const up = navButtonPixels(ALL_ENABLED)
      const pressed = navButtonPixels(ALL_ENABLED, press(button))

      for (const other of BUTTONS.filter((b) => b !== button)) {
        expect(buttonPixels(pressed, other)).toEqual(buttonPixels(up, other))
      }
    })

    it('draws a pressed disabled key all dim, sunk like an enabled one', () => {
      const disabled = { ...ALL_ENABLED, back: false }
      const pixels = buttonPixels(navButtonPixels(disabled, press('back')), 'back')

      expect(coloursOf(pixels)).toEqual(new Set([FOREGROUND_DIM]))
      expect(sortedKeys(pixels)).toEqual(sortedKeys(buttonPixels(navButtonPixels(ALL_ENABLED, press('back')), 'back')))
    })

    it.each(BUTTONS)('draws the %s key as unpressed at depth 0', (button) => {
      expect(navButtonPixels(ALL_ENABLED, press(button, 0))).toEqual(navButtonPixels(ALL_ENABLED))
    })

    it.each([
      [0.1, 0],
      [0.17, 1],
      [0.5, 2],
      [0.8, 2],
      [0.84, 3],
      [1, 3],
    ])('sinks the face at depth %s by %s whole pixels', (depth, sink) => {
      const bright = buttonPixels(navButtonPixels(ALL_ENABLED, press('forward', depth)), 'forward').filter(
        (p) => p.colour === FOREGROUND,
      )

      expect(extent(bright)).toEqual(faceOf('forward', sink))
    })

    it.each([1.5, 10])('sinks no further than PRESS_DEPTH at depth %s', (depth) => {
      expect(navButtonPixels(ALL_ENABLED, press('right', depth))).toEqual(navButtonPixels(ALL_ENABLED, press('right', 1)))
    })

    // 0.1 is too shallow to sink a whole pixel.
    it.each([0.1, -0.5, -10])('draws the key as unpressed at depth %s', (depth) => {
      expect(navButtonPixels(ALL_ENABLED, press('right', depth))).toEqual(navButtonPixels(ALL_ENABLED))
    })
  })
})
