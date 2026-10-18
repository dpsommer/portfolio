import { describe, expect, it } from 'vitest'
import { linePoints } from '../core/line.ts'
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

const PALETTE = [FOREGROUND, FOREGROUND_WORN, FOREGROUND_DIM]
// How far a keycap's top face is inset from its base.
const FACE_INSET = { side: 3, top: 2, bottom: 6 }

const buttonPixels = (pixels: Pixel[], button: NavButton) => pixels.filter(inBounds(NAV_BUTTON_BOUNDS[button]))
const faceOf = (button: NavButton): Bounds => {
  const base = NAV_BUTTON_BOUNDS[button]
  return {
    left: base.left + FACE_INSET.side,
    top: base.top + FACE_INSET.top,
    right: base.right - FACE_INSET.side,
    bottom: base.bottom - FACE_INSET.bottom,
  }
}
// Inside the face's outline there's only the arrow and its shadow.
const insideFace = (pixels: Pixel[], button: NavButton) => pixels.filter(inBounds(shrink(faceOf(button), 1)))
// The arrow: what's inside the face and not the dim shadow.
const arrowPixels = (pixels: Pixel[], button: NavButton) =>
  insideFace(pixels, button).filter((p) => p.colour !== FOREGROUND_DIM)

// Points on a rectangle's outline, without its corners if `cutCorners`.
function outline({ left, top, right, bottom }: Bounds, cutCorners = false): { x: number; y: number }[] {
  const points: { x: number; y: number }[] = []
  const inset = cutCorners ? 1 : 0
  for (let x = left + inset; x <= right - inset; x++) points.push({ x, y: top }, { x, y: bottom })
  for (let y = top + 1; y < bottom; y++) points.push({ x: left, y }, { x: right, y })
  return points
}

// ARROW_MAP's cells turned to face `button`'s way.
function arrowCells(button: NavButton): { x: number; y: number }[] {
  const n = ARROW_MAP.length
  const up = ARROW_MAP.flatMap((row, y) => row.split('').flatMap((cell, x) => (cell === '#' ? [{ x, y }] : [])))
  const turn = {
    forward: ({ x, y }: { x: number; y: number }) => ({ x, y }),
    back: ({ x, y }: { x: number; y: number }) => ({ x, y: n - 1 - y }),
    left: ({ x, y }: { x: number; y: number }) => ({ x: y, y: x }),
    right: ({ x, y }: { x: number; y: number }) => ({ x: n - 1 - y, y: x }),
  }[button]
  return up.map(turn)
}

type Part = 'base' | 'face' | 'corners' | 'shade' | 'arrow' | 'shadow'
// Where each part of `button`'s keycap belongs, from the description of a
// keycap: a base with cut corners, a top face inset from it, lines from the
// face's corners to the base's (inset by 1), a dotted shade half-way between
// the face's bottom and the base's, and the arrow centred on the face with a
// shadow down and to the right.
function partsOf(button: NavButton): Record<Part, Set<string>> {
  const base = NAV_BUTTON_BOUNDS[button]
  const face = faceOf(button)
  const corners = [
    linePoints(face.left, face.top, base.left + 1, base.top + 1),
    linePoints(face.right, face.top, base.right - 1, base.top + 1),
    linePoints(face.left, face.bottom, base.left + 1, base.bottom - 1),
    linePoints(face.right, face.bottom, base.right - 1, base.bottom - 1),
  ].flat()
  const shadeY = Math.round((face.bottom + base.bottom) / 2)
  const shade: { x: number; y: number }[] = []
  for (let x = face.left + 1; x < face.right; x += 2) shade.push({ x, y: shadeY })
  const n = ARROW_MAP.length
  const arrowLeft = face.left + Math.floor((face.right - face.left + 1 - n) / 2)
  const arrowTop = face.top + Math.floor((face.bottom - face.top + 1 - n) / 2)
  const arrow = new Set(arrowCells(button).map((p) => key({ x: arrowLeft + p.x, y: arrowTop + p.y })))
  const shadow = new Set(
    arrowCells(button)
      .map((p) => key({ x: arrowLeft + p.x + 1, y: arrowTop + p.y + 1 }))
      .filter((k) => !arrow.has(k)),
  )
  const faceKeys = new Set(outline(face).map(key))
  return {
    base: new Set(outline(base, true).map(key)),
    face: faceKeys,
    // A corner line starts on the face's corner, which belongs to the face.
    corners: new Set(corners.map(key).filter((k) => !faceKeys.has(k))),
    shade: new Set(shade.map(key)),
    arrow,
    shadow,
  }
}

// What shows on the canvas: where a pixel is drawn more than once, the last
// one drawn.
function shown(pixels: Pixel[]): Pixel[] {
  const last = new Map<string, Pixel>()
  for (const p of pixels) last.set(key(p), p)
  return [...last.values()]
}
// The shown pixels whose keys are in `keys`.
const drawnIn = (pixels: Pixel[], keys: Set<string>) => shown(pixels).filter((p) => keys.has(key(p)))
const coloursOf = (pixels: Pixel[]) => new Set(pixels.map((p) => p.colour))
const share = (pixels: Pixel[], colour: string) => pixels.filter((p) => p.colour === colour).length / pixels.length
// A part's drawn pixels, as keys with colours, relative to the button's top left.
function partPattern(pixels: Pixel[], button: NavButton, part: Part): string[] {
  const { left, top } = NAV_BUTTON_BOUNDS[button]
  return drawnIn(pixels, partsOf(button)[part])
    .map((p) => `${p.x - left},${p.y - top}:${p.colour}`)
    .sort()
}

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

  it('uses only the full, worn and dim foreground colours', () => {
    for (const colour of coloursOf(navButtonPixels(ALL_ENABLED))) expect(PALETTE).toContain(colour)
  })

  it('gives the same pixels every time', () => {
    expect(navButtonPixels(ALL_ENABLED)).toEqual(navButtonPixels(ALL_ENABLED))
  })

  it('wears each key differently', () => {
    const pixels = navButtonPixels(ALL_ENABLED)
    const patterns = BUTTONS.map((button) => partPattern(pixels, button, 'base').join(' '))

    expect(new Set(patterns).size).toBe(BUTTONS.length)
  })

  describe('an enabled keycap', () => {
    it.each(BUTTONS)('draws nothing on the %s key but its base, face, corner lines, shade, arrow and shadow', (button) => {
      const parts = partsOf(button)
      const allowed = new Set(Object.values(parts).flatMap((keys) => [...keys]))

      for (const p of buttonPixels(navButtonPixels(ALL_ENABLED), button)) expect(allowed.has(key(p))).toBe(true)
    })

    it.each(BUTTONS)('drops only a few of the %s key\'s pixels', (button) => {
      const parts = partsOf(button)
      const expected = new Set(Object.values(parts).flatMap((keys) => [...keys]))
      const drawn = new Set(buttonPixels(navButtonPixels(ALL_ENABLED), button).map(key))

      expect(drawn.size).toBeLessThanOrEqual(expected.size)
      expect(drawn.size).toBeGreaterThan(0.9 * expected.size)
    })

    it.each(BUTTONS)('fades only some of the %s key\'s pixels a tone', (button) => {
      const pixels = navButtonPixels(ALL_ENABLED)
      const nominal: [Part, string][] = [
        ['base', FOREGROUND_WORN],
        ['face', FOREGROUND],
        ['arrow', FOREGROUND],
      ]
      let faded = 0
      let total = 0
      for (const [part, colour] of nominal) {
        const drawn = drawnIn(pixels, partsOf(button)[part])
        total += drawn.length
        faded += drawn.filter((p) => p.colour !== colour).length
      }

      expect(faded).toBeGreaterThan(0)
      expect(faded / total).toBeLessThan(0.35)
    })

    describe('base', () => {
      it.each(BUTTONS)('draws most of the %s key\'s base outline', (button) => {
        const { base } = partsOf(button)

        expect(drawnIn(navButtonPixels(ALL_ENABLED), base).length).toBeGreaterThan(0.85 * base.size)
      })

      it.each(BUTTONS)('runs the %s key\'s base along the button\'s edge', (button) => {
        const bounds = NAV_BUTTON_BOUNDS[button]
        const edge = buttonPixels(navButtonPixels(ALL_ENABLED), button).filter(onEdge(bounds))
        const sides = [
          edge.filter((p) => p.x === bounds.left),
          edge.filter((p) => p.x === bounds.right),
          edge.filter((p) => p.y === bounds.top),
          edge.filter((p) => p.y === bounds.bottom),
        ]

        for (const side of sides) expect(side.length).toBeGreaterThan(0.8 * (BUTTON_SIZE - 2))
      })

      it.each(BUTTONS)('cuts the %s key\'s base corners', (button) => {
        const { left, top, right, bottom } = NAV_BUTTON_BOUNDS[button]
        const drawn = new Set(navButtonPixels(ALL_ENABLED).map(key))

        for (const corner of [
          { x: left, y: top },
          { x: right, y: top },
          { x: left, y: bottom },
          { x: right, y: bottom },
        ]) {
          expect(drawn.has(key(corner))).toBe(false)
        }
      })

      it.each(BUTTONS)('draws the %s key\'s base worn, a few pixels faded to dim', (button) => {
        const base = drawnIn(navButtonPixels(ALL_ENABLED), partsOf(button).base)

        expect([...coloursOf(base)].sort()).toEqual([FOREGROUND_WORN, FOREGROUND_DIM].sort())
        expect(share(base, FOREGROUND_WORN)).toBeGreaterThan(0.65)
      })
    })

    describe('face', () => {
      it.each(BUTTONS)('draws most of the %s key\'s face outline', (button) => {
        const { face } = partsOf(button)

        expect(drawnIn(navButtonPixels(ALL_ENABLED), face).length).toBeGreaterThan(0.85 * face.size)
      })

      it.each(BUTTONS)('insets the %s key\'s face further from the bottom than the sides and top', (button) => {
        const face = drawnIn(navButtonPixels(ALL_ENABLED), partsOf(button).face)
        const base = NAV_BUTTON_BOUNDS[button]
        const xs = face.map((p) => p.x)
        const ys = face.map((p) => p.y)

        expect(Math.min(...xs) - base.left).toBe(3)
        expect(base.right - Math.max(...xs)).toBe(3)
        expect(Math.min(...ys) - base.top).toBe(2)
        expect(base.bottom - Math.max(...ys)).toBe(6)
      })

      it.each(BUTTONS)('draws the %s key\'s face bright, a few pixels faded to worn', (button) => {
        // The corner lines start on the face's corners, so those may show
        // dim where the face's own pixel has worn away.
        const { left, top, right, bottom } = faceOf(button)
        const corners = new Set([key({ x: left, y: top }), key({ x: right, y: top }), key({ x: left, y: bottom }), key({ x: right, y: bottom })])
        const face = drawnIn(navButtonPixels(ALL_ENABLED), partsOf(button).face).filter((p) => !corners.has(key(p)))

        expect([...coloursOf(face)].sort()).toEqual([FOREGROUND, FOREGROUND_WORN].sort())
        expect(share(face, FOREGROUND)).toBeGreaterThan(0.65)
      })
    })

    describe('corner lines', () => {
      it.each(BUTTONS)('joins each of the %s key\'s face corners towards its base corners', (button) => {
        const base = NAV_BUTTON_BOUNDS[button]
        const face = faceOf(button)
        const corners = drawnIn(navButtonPixels(ALL_ENABLED), partsOf(button).corners)
        const between = (p: { x: number; y: number }, x0: number, y0: number, x1: number, y1: number) =>
          p.x >= Math.min(x0, x1) && p.x <= Math.max(x0, x1) && p.y >= Math.min(y0, y1) && p.y <= Math.max(y0, y1)
        const quadrants = [
          corners.filter((p) => between(p, base.left + 1, base.top + 1, face.left, face.top)),
          corners.filter((p) => between(p, face.right, base.top + 1, base.right - 1, face.top)),
          corners.filter((p) => between(p, base.left + 1, face.bottom, face.left, base.bottom - 1)),
          corners.filter((p) => between(p, face.right, face.bottom, base.right - 1, base.bottom - 1)),
        ]

        for (const quadrant of quadrants) expect(quadrant.length).toBeGreaterThan(0)
        expect(quadrants.flat()).toHaveLength(corners.length)
      })

      it.each(BUTTONS)('draws the %s key\'s corner lines dim', (button) => {
        const corners = drawnIn(navButtonPixels(ALL_ENABLED), partsOf(button).corners)

        expect(corners.every((p) => p.colour === FOREGROUND_DIM)).toBe(true)
      })
    })

    describe('front shade', () => {
      it.each(BUTTONS)('dots the %s key\'s shade half-way between its face\'s bottom and its base\'s', (button) => {
        const base = NAV_BUTTON_BOUNDS[button]
        const face = faceOf(button)
        const shadeY = Math.round((face.bottom + base.bottom) / 2)
        const row = buttonPixels(navButtonPixels(ALL_ENABLED), button).filter(
          (p) => p.y === shadeY && p.x > face.left && p.x < face.right,
        )
        const xs = row.map((p) => p.x).sort((a, b) => a - b)

        expect(row.length).toBeGreaterThanOrEqual(0.5 * partsOf(button).shade.size)
        for (let i = 1; i < xs.length; i++) expect(xs[i] - xs[i - 1]).toBeGreaterThanOrEqual(2)
      })

      it.each(BUTTONS)('draws nothing else between the %s key\'s face and base bottom', (button) => {
        const base = NAV_BUTTON_BOUNDS[button]
        const face = faceOf(button)
        const shadeY = Math.round((face.bottom + base.bottom) / 2)
        const below = buttonPixels(navButtonPixels(ALL_ENABLED), button).filter(
          (p) => p.y > face.bottom && p.y < base.bottom && p.x > face.left && p.x < face.right,
        )

        expect(below.every((p) => p.y === shadeY)).toBe(true)
      })

      it.each(BUTTONS)('draws the %s key\'s shade dim', (button) => {
        const shade = drawnIn(navButtonPixels(ALL_ENABLED), partsOf(button).shade)

        expect(shade.every((p) => p.colour === FOREGROUND_DIM)).toBe(true)
      })
    })

    describe('arrow', () => {
      it.each(BUTTONS)('draws the %s key\'s arrow in place of ARROW_MAP turned its way, nearly whole', (button) => {
        const arrow = arrowPixels(navButtonPixels(ALL_ENABLED), button)
        const expected = partsOf(button).arrow

        expect(arrow.every((p) => expected.has(key(p)))).toBe(true)
        expect(arrow.length).toBeGreaterThan(0.95 * ARROW_CELLS)
      })

      it.each(BUTTONS)('draws the %s key\'s arrow bright, a few pixels faded to worn', (button) => {
        const arrow = arrowPixels(navButtonPixels(ALL_ENABLED), button)

        expect([...coloursOf(arrow)].sort()).toEqual([FOREGROUND, FOREGROUND_WORN].sort())
        expect(share(arrow, FOREGROUND)).toBeGreaterThan(0.65)
      })

      it.each(BUTTONS)('centres the %s key\'s arrow on its face', (button) => {
        const arrow = arrowPixels(navButtonPixels(ALL_ENABLED), button)
        const centre = centreOf(faceOf(button))
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

        // Off centre towards the tip, and not much off to either side.
        const offset = { x: mass.x - boxCentre.x, y: mass.y - boxCentre.y }
        const along = offset.x * dx + offset.y * dy
        const across = Math.abs(offset.x * dy - offset.y * dx)
        expect(along).toBeGreaterThan(0.2)
        expect(across).toBeLessThan(along / 2)
      })

      it('draws the forward arrow as ARROW_MAP', () => {
        const arrow = arrowPixels(navButtonPixels(ALL_ENABLED), 'forward')
        const left = Math.min(...arrow.map((p) => p.x))
        const top = Math.min(...arrow.map((p) => p.y))
        const cells = new Set(arrowCells('forward').map(key))

        for (const p of arrow) expect(cells.has(key({ x: p.x - left, y: p.y - top }))).toBe(true)
      })
    })

    describe('shadow', () => {
      it.each(BUTTONS)('casts the %s key\'s arrow shadow one pixel down and right', (button) => {
        const { shadow } = partsOf(button)
        const drawn = insideFace(navButtonPixels(ALL_ENABLED), button).filter((p) => p.colour === FOREGROUND_DIM)

        expect(drawn.every((p) => shadow.has(key(p)))).toBe(true)
        expect(drawn.length).toBeGreaterThan(0.9 * shadow.size)
      })

      it.each(BUTTONS)('keeps the %s key\'s shadow off its arrow', (button) => {
        const { arrow } = partsOf(button)
        const drawn = insideFace(navButtonPixels(ALL_ENABLED), button).filter((p) => p.colour === FOREGROUND_DIM)

        expect(drawn.some((p) => arrow.has(key(p)))).toBe(false)
      })

      it.each(BUTTONS)('draws each pixel inside the %s key\'s face once', (button) => {
        const inside = insideFace(navButtonPixels(ALL_ENABLED), button)

        expect(new Set(inside.map(key)).size).toBe(inside.length)
      })
    })
  })

  describe('a disabled keycap', () => {
    it.each(BUTTONS)('draws the disabled %s key entirely in the dim colour', (button) => {
      const pixels = buttonPixels(navButtonPixels({ ...ALL_ENABLED, [button]: false }), button)

      expect(pixels.length).toBeGreaterThan(0)
      expect(pixels.every((p) => p.colour === FOREGROUND_DIM)).toBe(true)
    })

    it.each(BUTTONS)('draws no shadow on the disabled %s key', (button) => {
      const pixels = navButtonPixels({ ...ALL_ENABLED, [button]: false })

      expect(drawnIn(pixels, partsOf(button).shadow)).toHaveLength(0)
    })

    it.each(BUTTONS)('draws the disabled %s key where the enabled one is, less its shadow', (button) => {
      const enabled = buttonPixels(navButtonPixels(ALL_ENABLED), button)
      const { shadow } = partsOf(button)
      const expected = [...new Set(enabled.map(key))].filter((k) => !shadow.has(k)).sort()
      const disabled = [...new Set(buttonPixels(navButtonPixels({ ...ALL_ENABLED, [button]: false }), button).map(key))]

      expect(disabled.sort()).toEqual(expected)
    })

    it.each(BUTTONS)('leaves the other keys as they are when %s is disabled', (button) => {
      const enabled = navButtonPixels(ALL_ENABLED)
      const disabled = navButtonPixels({ ...ALL_ENABLED, [button]: false })

      for (const other of BUTTONS.filter((b) => b !== button)) {
        expect(buttonPixels(disabled, other)).toEqual(buttonPixels(enabled, other))
      }
    })
  })
})
