import { describe, expect, it, vi } from 'vitest'
import { ORIGIN, projectPoint, toCamera } from './camera.ts'
import type { FloorPoint, ScreenPoint } from './camera.ts'
import { drawPixels, drawScene, placeSprite, signPlacement } from './draw.ts'
import { BACKGROUND, FOREGROUND, FOREGROUND_WORN } from './palette.ts'
import { PLACES } from './places.ts'
import { mirrorPixels, ripplePixels, roomPixels } from './room.ts'
import type { RippleState } from './room.ts'
import { SIGN_POSITION, signpostBackingPixels, signpostPixels } from './signpost.ts'
import type { Pixel } from './types.ts'

const WIDTH = 320
const HEIGHT = 240
// The nook's place.
const NOOK_EYE: FloorPoint = { x: PLACES.nook.x, z: PLACES.nook.z }
// Where the sign's anchor is drawn from the start facing north.
const HOME = projectPoint(toCamera(SIGN_POSITION, 0), WIDTH, HEIGHT)
const inCanvas = (p: Pixel) => p.x >= 0 && p.x < WIDTH && p.y >= 0 && p.y < HEIGHT

type Call = { args: number[]; fillStyle: string }

function createFakeContext() {
  const calls: Call[] = []
  const fillRect = vi.fn((...args: number[]) => {
    calls.push({ args, fillStyle: ctx.fillStyle })
  })
  const ctx = { fillStyle: '', canvas: { width: 320, height: 240 }, fillRect }
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls, fillRect }
}

describe('drawPixels', () => {
  it('fills a 1x1 rect per pixel with that pixel\'s colour', () => {
    const { ctx, calls } = createFakeContext()
    const pixels: Pixel[] = [
      { x: 1, y: 2, colour: FOREGROUND },
      { x: 3, y: 4, colour: FOREGROUND_WORN },
    ]

    drawPixels(ctx, pixels)

    expect(calls).toEqual([
      { args: [1, 2, 1, 1], fillStyle: FOREGROUND },
      { args: [3, 4, 1, 1], fillStyle: FOREGROUND_WORN },
    ])
  })

  it('draws nothing for no pixels', () => {
    const { ctx, fillRect } = createFakeContext()

    drawPixels(ctx, [])

    expect(fillRect).not.toHaveBeenCalled()
  })
})

describe('drawScene', () => {
  it('first fills the whole canvas with the background colour', () => {
    const { ctx, calls } = createFakeContext()

    drawScene(ctx)

    expect(calls[0]).toEqual({ args: [0, 0, 320, 240], fillStyle: BACKGROUND })
  })

  it('then draws the room, the signpost backing and the signpost, in that order', () => {
    const { ctx, calls } = createFakeContext()

    drawScene(ctx)

    expect(calls).toEqual([
      { args: [0, 0, 320, 240], fillStyle: BACKGROUND },
      ...toCalls(roomPixels(320, 240)),
      ...toCalls(signpostBackingPixels(320, 240)),
      ...toCalls(signpostPixels(320, 240)),
    ])
  })

  it('defaults to facing north', () => {
    const byDefault = createFakeContext()
    const north = createFakeContext()

    drawScene(byDefault.ctx)
    drawScene(north.ctx, 0)

    expect(byDefault.calls).toEqual(north.calls)
  })

  it('draws the room at the given yaw', () => {
    const { ctx, calls } = createFakeContext()
    const yaw = Math.PI / 2

    drawScene(ctx, yaw)

    expect(calls.slice(1, 1 + roomPixels(320, 240, yaw).length)).toEqual(toCalls(roomPixels(320, 240, yaw)))
  })

  it('draws only the background, the room and the mirror when the sign is out of view facing west', () => {
    const { ctx, calls } = createFakeContext()

    drawScene(ctx, Math.PI / 2)

    expect(calls).toEqual([
      { args: [0, 0, 320, 240], fillStyle: BACKGROUND },
      ...toCalls(roomPixels(320, 240, Math.PI / 2)),
      ...toCalls(mirrorPixels(320, 240, Math.PI / 2)),
    ])
  })

  it('draws the mirror after the room', () => {
    const { ctx, calls } = createFakeContext()
    const room = roomPixels(WIDTH, HEIGHT, Math.PI / 2, NOOK_EYE)
    const mirror = mirrorPixels(WIDTH, HEIGHT, Math.PI / 2, NOOK_EYE)

    drawScene(ctx, Math.PI / 2, NOOK_EYE)

    expect(mirror.length).toBeGreaterThan(0)
    expect(calls.slice(1 + room.length, 1 + room.length + mirror.length)).toEqual(toCalls(mirror))
  })

  it('draws the mirror before the sign', () => {
    const { ctx, calls } = createFakeContext()
    const yaw = 0.8
    const room = roomPixels(WIDTH, HEIGHT, yaw)
    const mirror = mirrorPixels(WIDTH, HEIGHT, yaw)
    const placement = signPlacement(yaw, WIDTH, HEIGHT)!
    const backing = placeSprite(signpostBackingPixels(WIDTH, HEIGHT), HOME, placement, WIDTH, HEIGHT)
    const sign = placeSprite(signpostPixels(WIDTH, HEIGHT), HOME, placement, WIDTH, HEIGHT)

    drawScene(ctx, yaw)

    expect(calls).toEqual([
      { args: [0, 0, WIDTH, HEIGHT], fillStyle: BACKGROUND },
      ...toCalls(room),
      ...toCalls(mirror),
      ...toCalls(backing),
      ...toCalls(sign),
    ])
  })

  it('does not draw the sign when facing away from it', () => {
    const { ctx, calls } = createFakeContext()

    drawScene(ctx, Math.PI)

    expect(calls.some((c) => c.fillStyle === FOREGROUND)).toBe(false)
  })

  it('draws the sign moved by signPlacement after a small turn', () => {
    const { ctx, calls } = createFakeContext()
    const yaw = 0.2
    const placement = signPlacement(yaw, WIDTH, HEIGHT)!
    const placed = placeSprite(signpostPixels(WIDTH, HEIGHT), HOME, placement, WIDTH, HEIGHT).filter(inCanvas)

    drawScene(ctx, yaw)

    expect(placement.anchor.x).toBeGreaterThan(WIDTH / 2)
    expect(calls.slice(-placed.length)).toEqual(toCalls(placed))
  })

  it('skips sign pixels moved off the canvas', () => {
    const { ctx, calls } = createFakeContext()
    const yaw = 0.8
    const placement = signPlacement(yaw, WIDTH, HEIGHT)!
    const sign = signpostPixels(WIDTH, HEIGHT)
    const placed = placeSprite(sign, HOME, placement, WIDTH, HEIGHT)
    const blockSize = Math.max(1, Math.ceil(placement.scale))

    drawScene(ctx, yaw)

    // Part of the sign has slid past the right edge, and only the rest is drawn.
    expect(placed.length).toBeGreaterThan(0)
    expect(placed.length).toBeLessThan(sign.length * blockSize ** 2)
    expect(placed.every(inCanvas)).toBe(true)
    expect(calls.slice(-placed.length)).toEqual(toCalls(placed))
  })

  it('defaults the eye to the start', () => {
    const byDefault = createFakeContext()
    const atOrigin = createFakeContext()

    drawScene(byDefault.ctx, 0.3)
    drawScene(atOrigin.ctx, 0.3, ORIGIN)

    expect(byDefault.calls).toEqual(atOrigin.calls)
  })

  it('draws the room from the given eye', () => {
    const { ctx, calls } = createFakeContext()
    const room = roomPixels(WIDTH, HEIGHT, Math.PI / 2, NOOK_EYE)

    drawScene(ctx, Math.PI / 2, NOOK_EYE)

    expect(calls.slice(1, 1 + room.length)).toEqual(toCalls(room))
  })

  it('draws the sign from the nook facing north', () => {
    const { ctx, calls } = createFakeContext()
    const placed = placeSprite(signpostPixels(WIDTH, HEIGHT), HOME, signPlacement(0, WIDTH, HEIGHT, NOOK_EYE)!, WIDTH, HEIGHT).filter(inCanvas)

    drawScene(ctx, 0, NOOK_EYE)

    expect(placed.length).toBeGreaterThan(0)
    expect(calls.slice(-placed.length)).toEqual(toCalls(placed))
  })

  it('draws only the background, the room and the mirror from the nook facing west', () => {
    const { ctx, calls } = createFakeContext()

    drawScene(ctx, Math.PI / 2, NOOK_EYE)

    expect(calls).toEqual([
      { args: [0, 0, WIDTH, HEIGHT], fillStyle: BACKGROUND },
      ...toCalls(roomPixels(WIDTH, HEIGHT, Math.PI / 2, NOOK_EYE)),
      ...toCalls(mirrorPixels(WIDTH, HEIGHT, Math.PI / 2, NOOK_EYE)),
    ])
  })

  describe('with a ripple', () => {
    const WEST = Math.PI / 2
    const RIPPLE: RippleState = { origin: { s: 0, t: 0 }, elapsedMs: 900 }

    it('draws more than without one, from the nook facing west', () => {
      const plain = createFakeContext()
      const rippling = createFakeContext()

      drawScene(plain.ctx, WEST, NOOK_EYE)
      drawScene(rippling.ctx, WEST, NOOK_EYE, RIPPLE)

      expect(rippling.calls.length).toBeGreaterThan(plain.calls.length)
    })

    it('draws the ripple after the room and before the mirror', () => {
      const { ctx, calls } = createFakeContext()
      const ripple = ripplePixels(WIDTH, HEIGHT, RIPPLE, WEST, NOOK_EYE)
      expect(ripple.length).toBeGreaterThan(0)

      drawScene(ctx, WEST, NOOK_EYE, RIPPLE)

      expect(calls).toEqual([
        { args: [0, 0, WIDTH, HEIGHT], fillStyle: BACKGROUND },
        ...toCalls(roomPixels(WIDTH, HEIGHT, WEST, NOOK_EYE)),
        ...toCalls(ripple),
        ...toCalls(mirrorPixels(WIDTH, HEIGHT, WEST, NOOK_EYE)),
      ])
    })

    it('draws the same as without one once it has finished', () => {
      const plain = createFakeContext()
      const finished = createFakeContext()

      drawScene(plain.ctx, WEST, NOOK_EYE)
      drawScene(finished.ctx, WEST, NOOK_EYE, { origin: { s: 0, t: 0 }, elapsedMs: 10_000 })

      expect(finished.calls).toEqual(plain.calls)
    })

    it('draws the same as without one with the mirror out of view', () => {
      const EAST = (3 * Math.PI) / 2
      const plain = createFakeContext()
      const rippling = createFakeContext()

      drawScene(plain.ctx, EAST, NOOK_EYE)
      drawScene(rippling.ctx, EAST, NOOK_EYE, RIPPLE)

      expect(rippling.calls).toEqual(plain.calls)
    })
  })

  it('never fills outside the canvas along the path to the nook', () => {
    for (const x of [0, 0.25, 0.5, 0.75, 1].map((t) => t * NOOK_EYE.x)) {
      for (const yaw of [0, 0.6, Math.PI / 2, Math.PI, (3 * Math.PI) / 2]) {
        const { ctx, calls } = createFakeContext()
        drawScene(ctx, yaw, { x, z: 0 })
        for (const { args } of calls.slice(1)) {
          expect(args[0]).toBeGreaterThanOrEqual(0)
          expect(args[0]).toBeLessThan(WIDTH)
          expect(args[1]).toBeGreaterThanOrEqual(0)
          expect(args[1]).toBeLessThan(HEIGHT)
        }
      }
    }
  })

  it('never fills outside the canvas while panning', () => {
    for (const yaw of [-1.2, -0.8, -0.4, 0.4, 0.8, 1.2]) {
      const { ctx, calls } = createFakeContext()
      drawScene(ctx, yaw)
      for (const { args } of calls.slice(1)) {
        expect(args[0]).toBeGreaterThanOrEqual(0)
        expect(args[0]).toBeLessThan(320)
      }
    }
  })
})

function toCalls(pixels: Pixel[]): Call[] {
  return pixels.map(({ x, y, colour }) => ({ args: [x, y, 1, 1], fillStyle: colour }))
}

describe('signPlacement', () => {
  it('puts the anchor at its projected position at full size from the start facing north', () => {
    expect(signPlacement(0, WIDTH, HEIGHT)).toEqual({ anchor: HOME, scale: 1 })
  })

  it('defaults the eye to the start', () => {
    expect(signPlacement(0.3, WIDTH, HEIGHT)).toEqual(signPlacement(0.3, WIDTH, HEIGHT, ORIGIN))
  })

  it('moves the anchor right for a small left turn', () => {
    expect(signPlacement(0.1, WIDTH, HEIGHT)!.anchor.x).toBeGreaterThan(WIDTH / 2)
  })

  it('moves the anchor left for a small right turn', () => {
    expect(signPlacement(-0.1, WIDTH, HEIGHT)!.anchor.x).toBeLessThan(WIDTH / 2)
  })

  it('mirrors left and right turns', () => {
    const left = signPlacement(0.3, WIDTH, HEIGHT)!
    const right = signPlacement(-0.3, WIDTH, HEIGHT)!
    expect(left.anchor.x - WIDTH / 2).toBeCloseTo(WIDTH / 2 - right.anchor.x)
    expect(left.scale).toBeCloseTo(right.scale)
  })

  it('moves the anchor further as the turn grows', () => {
    expect(signPlacement(0.4, WIDTH, HEIGHT)!.anchor.x).toBeGreaterThan(signPlacement(0.2, WIDTH, HEIGHT)!.anchor.x)
  })

  it('scales the anchor position with the canvas size', () => {
    const small = signPlacement(0.2, WIDTH, HEIGHT)!
    const large = signPlacement(0.2, WIDTH * 2, HEIGHT * 2)!
    expect(large.anchor.x).toBeCloseTo(small.anchor.x * 2)
    expect(large.anchor.y).toBeCloseTo(small.anchor.y * 2)
    expect(large.scale).toBeCloseTo(small.scale)
  })

  it('is null facing south, with the sign behind the camera', () => {
    expect(signPlacement(Math.PI, WIDTH, HEIGHT)).toBeNull()
  })

  it.each([Math.PI / 2, -Math.PI / 2])('is null at yaw %f, with the sign level with the camera', (yaw) => {
    expect(signPlacement(yaw, WIDTH, HEIGHT)).toBeNull()
  })

  it('doubles the scale from half the distance', () => {
    const placement = signPlacement(0, WIDTH, HEIGHT, { x: 0, z: SIGN_POSITION.z / 2 })!
    expect(placement.scale).toBeCloseTo(2)
    expect(placement.anchor.x).toBeCloseTo(WIDTH / 2)
  })

  it('shrinks the sign from further away', () => {
    expect(signPlacement(0, WIDTH, HEIGHT, { x: 0, z: -0.5 })!.scale).toBeLessThan(1)
  })

  it('shows the sign right of centre at full size from the nook facing north', () => {
    const placement = signPlacement(0, WIDTH, HEIGHT, NOOK_EYE)
    expect(placement).not.toBeNull()
    expect(placement!.anchor.x).toBeGreaterThan(WIDTH / 2)
    expect(placement!.anchor.x).toBeLessThan(WIDTH)
    expect(placement!.scale).toBeCloseTo(1)
  })

  it('shows the sign left of centre from the nook facing east', () => {
    const placement = signPlacement((3 * Math.PI) / 2, WIDTH, HEIGHT, NOOK_EYE)
    expect(placement).not.toBeNull()
    expect(placement!.anchor.x).toBeLessThan(WIDTH / 2)
    expect(placement!.anchor.x).toBeGreaterThan(0)
  })

  it('is null from the nook facing west, with the sign behind the camera', () => {
    expect(signPlacement(Math.PI / 2, WIDTH, HEIGHT, NOOK_EYE)).toBeNull()
  })

  it('is null when a wall hides the sign, even though it is in front of the camera', () => {
    // From the nook's front-left corner the nook's side wall is between the eye and the sign.
    const eye = { x: -1.9, z: 0.9 }
    expect(toCamera(SIGN_POSITION, 0, eye).z).toBeGreaterThan(0.1)
    expect(signPlacement(0, WIDTH, HEIGHT, eye)).toBeNull()
  })
})

describe('placeSprite', () => {
  const home: ScreenPoint = { x: 100, y: 100 }
  const sprite: Pixel[] = [
    { x: 100, y: 100, colour: FOREGROUND },
    { x: 104, y: 98, colour: FOREGROUND_WORN },
    { x: 96, y: 106, colour: FOREGROUND },
  ]

  it('leaves the pixels unchanged at scale 1 with the anchor at home', () => {
    expect(placeSprite(sprite, home, { anchor: home, scale: 1 }, WIDTH, HEIGHT)).toEqual(sprite)
  })

  it('translates the pixels by the anchor\'s offset from home at scale 1', () => {
    const placed = placeSprite(sprite, home, { anchor: { x: 130, y: 90 }, scale: 1 }, WIDTH, HEIGHT)
    expect(placed).toEqual(sprite.map((p) => ({ ...p, x: p.x + 30, y: p.y - 10 })))
  })

  it('rounds a fractional anchor to whole pixels', () => {
    const placed = placeSprite(sprite, home, { anchor: { x: 100.4, y: 99.6 }, scale: 1 }, WIDTH, HEIGHT)
    expect(placed).toEqual(sprite)
  })

  it('doubles distances from home at scale 2, drawing each pixel as a 2x2 block', () => {
    const placed = placeSprite([sprite[1]], home, { anchor: home, scale: 2 }, WIDTH, HEIGHT)
    expect(placed).toEqual([
      { x: 108, y: 96, colour: FOREGROUND_WORN },
      { x: 109, y: 96, colour: FOREGROUND_WORN },
      { x: 108, y: 97, colour: FOREGROUND_WORN },
      { x: 109, y: 97, colour: FOREGROUND_WORN },
    ])
  })

  it('draws four pixels per sprite pixel at scale 2', () => {
    expect(placeSprite(sprite, home, { anchor: home, scale: 2 }, WIDTH, HEIGHT)).toHaveLength(sprite.length * 4)
  })

  it('rounds the block size up for fractional enlargements', () => {
    expect(placeSprite([sprite[0]], home, { anchor: home, scale: 1.5 }, WIDTH, HEIGHT)).toHaveLength(4)
  })

  it('halves distances from home at scale 0.5, one pixel each', () => {
    const placed = placeSprite(sprite, home, { anchor: { x: 200, y: 50 }, scale: 0.5 }, WIDTH, HEIGHT)
    expect(placed).toEqual([
      { x: 200, y: 50, colour: FOREGROUND },
      { x: 202, y: 49, colour: FOREGROUND_WORN },
      { x: 198, y: 53, colour: FOREGROUND },
    ])
  })

  it('drops pixels that land off the canvas', () => {
    const placed = placeSprite(sprite, home, { anchor: { x: WIDTH - 2, y: 100 }, scale: 1 }, WIDTH, HEIGHT)
    // Only the pixels at or left of home stay on: x 318 and 314.
    expect(placed.map((p) => p.x).sort((a, b) => a - b)).toEqual([314, 318])
  })

  it.each([
    ['left', { x: -50, y: 100 }],
    ['right', { x: WIDTH + 50, y: 100 }],
    ['top', { x: 100, y: -50 }],
    ['bottom', { x: 100, y: HEIGHT + 50 }],
  ])('drops a sprite moved entirely off the %s', (_, anchor) => {
    expect(placeSprite(sprite, home, { anchor, scale: 2 }, WIDTH, HEIGHT)).toEqual([])
  })

  it('keeps the on-canvas part of a block straddling the edge', () => {
    const placed = placeSprite([sprite[0]], home, { anchor: { x: -1, y: 100 }, scale: 2 }, WIDTH, HEIGHT)
    expect(placed.filter(inCanvas).map((p) => p.x)).toEqual([0, 0])
  })

  it('keeps each pixel\'s colour', () => {
    const placed = placeSprite(sprite, home, { anchor: home, scale: 0.5 }, WIDTH, HEIGHT)
    expect(placed.map((p) => p.colour)).toEqual(sprite.map((p) => p.colour))
  })

  it('returns nothing for an empty sprite', () => {
    expect(placeSprite([], home, { anchor: home, scale: 3 }, WIDTH, HEIGHT)).toEqual([])
  })
})
