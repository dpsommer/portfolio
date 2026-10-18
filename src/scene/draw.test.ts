import { describe, expect, it } from 'vitest'
import { createFakeContext, toFills } from '../test/fakeContext.ts'
import { ORIGIN, projectPoint, toCamera } from './core/camera.ts'
import type { FloorPoint, ScreenPoint } from './core/camera.ts'
import { BACKGROUND, FOREGROUND, FOREGROUND_WORN } from './core/palette.ts'
import type { Pixel } from './core/types.ts'
import { drawPixels, drawScene, placeSprite, signPlacement } from './draw.ts'
import type { MirrorExtras } from './draw.ts'
import { mirrorPixels, plaquePixels, previewPixels, pullPixels, ripplePixels } from './mirror/pixels.ts'
import type { RippleState } from './mirror/pixels.ts'
import type { Plaque } from './mirror/plaque.ts'
import { PREVIEW_HEIGHT, PREVIEW_WIDTH } from './mirror/preview.ts'
import { PLACES } from './navigation/places.ts'
import { roomPixels } from './room/room.ts'
import { SIGN_POSITION, signpostBackingPixels, signpostPixels } from './signpost/signpost.ts'

const WIDTH = 320
const HEIGHT = 240
// The nook's place.
const NOOK_EYE: FloorPoint = { x: PLACES.nook.x, z: PLACES.nook.z }
// Where the sign's anchor is drawn from the start facing north.
const HOME = projectPoint(toCamera(SIGN_POSITION, 0), WIDTH, HEIGHT)
const inCanvas = (p: Pixel) => p.x >= 0 && p.x < WIDTH && p.y >= 0 && p.y < HEIGHT

const WEST = Math.PI / 2
const EAST = (3 * Math.PI) / 2

describe('drawPixels', () => {
  it('fills a 1x1 rect per pixel with that pixel\'s colour', () => {
    const { ctx, fills } = createFakeContext()
    const pixels: Pixel[] = [
      { x: 1, y: 2, colour: FOREGROUND },
      { x: 3, y: 4, colour: FOREGROUND_WORN },
    ]

    drawPixels(ctx, pixels)

    expect(fills).toEqual([
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
  it('fills the background, then draws the room, the signpost backing and the signpost, in that order', () => {
    const { ctx, fills } = createFakeContext()

    drawScene(ctx)

    expect(fills).toEqual([
      { args: [0, 0, 320, 240], fillStyle: BACKGROUND },
      ...toFills(roomPixels(320, 240)),
      ...toFills(signpostBackingPixels(320, 240)),
      ...toFills(signpostPixels(320, 240)),
    ])
  })

  it('defaults to facing north', () => {
    const byDefault = createFakeContext()
    const north = createFakeContext()

    drawScene(byDefault.ctx)
    drawScene(north.ctx, 0)

    expect(byDefault.fills).toEqual(north.fills)
  })

  it('draws only the background, the room, the mirror and the pull when the sign is out of view facing west', () => {
    const { ctx, fills } = createFakeContext()

    drawScene(ctx, Math.PI / 2)

    expect(fills).toEqual([
      { args: [0, 0, 320, 240], fillStyle: BACKGROUND },
      ...toFills(roomPixels(320, 240, Math.PI / 2)),
      ...toFills(mirrorPixels(320, 240, Math.PI / 2)),
      ...toFills(pullPixels(320, 240, 0, Math.PI / 2)),
    ])
  })

  it('draws the mirror before the sign', () => {
    const { ctx, fills } = createFakeContext()
    const yaw = 0.8
    const room = roomPixels(WIDTH, HEIGHT, yaw)
    const mirror = mirrorPixels(WIDTH, HEIGHT, yaw)
    const placement = signPlacement(yaw, WIDTH, HEIGHT)!
    const backing = placeSprite(signpostBackingPixels(WIDTH, HEIGHT), HOME, placement, WIDTH, HEIGHT)
    const sign = placeSprite(signpostPixels(WIDTH, HEIGHT), HOME, placement, WIDTH, HEIGHT)

    drawScene(ctx, yaw)

    expect(fills).toEqual([
      { args: [0, 0, WIDTH, HEIGHT], fillStyle: BACKGROUND },
      ...toFills(room),
      ...toFills(mirror),
      ...toFills(pullPixels(WIDTH, HEIGHT, 0, yaw)),
      ...toFills(backing),
      ...toFills(sign),
    ])
  })

  it('does not draw the sign when facing away from it', () => {
    const { ctx, fills } = createFakeContext()

    drawScene(ctx, Math.PI)

    expect(fills.some((c) => c.fillStyle === FOREGROUND)).toBe(false)
  })

  it('draws the sign moved by signPlacement after a small turn', () => {
    const { ctx, fills } = createFakeContext()
    const yaw = 0.2
    const placement = signPlacement(yaw, WIDTH, HEIGHT)!
    const placed = placeSprite(signpostPixels(WIDTH, HEIGHT), HOME, placement, WIDTH, HEIGHT).filter(inCanvas)

    drawScene(ctx, yaw)

    expect(placement.anchor.x).toBeGreaterThan(WIDTH / 2)
    expect(fills.slice(-placed.length)).toEqual(toFills(placed))
  })

  it('skips sign pixels moved off the canvas', () => {
    const { ctx, fills } = createFakeContext()
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
    expect(fills.slice(-placed.length)).toEqual(toFills(placed))
  })

  it('defaults the eye to the start', () => {
    const byDefault = createFakeContext()
    const atOrigin = createFakeContext()

    drawScene(byDefault.ctx, 0.3)
    drawScene(atOrigin.ctx, 0.3, ORIGIN)

    expect(byDefault.fills).toEqual(atOrigin.fills)
  })

  it('draws the sign from the nook facing north', () => {
    const { ctx, fills } = createFakeContext()
    const placed = placeSprite(signpostPixels(WIDTH, HEIGHT), HOME, signPlacement(0, WIDTH, HEIGHT, NOOK_EYE)!, WIDTH, HEIGHT).filter(inCanvas)

    drawScene(ctx, 0, NOOK_EYE)

    expect(placed.length).toBeGreaterThan(0)
    expect(fills.slice(-placed.length)).toEqual(toFills(placed))
  })

  it('draws only the background, the room, the mirror and the pull from the nook facing west', () => {
    const { ctx, fills } = createFakeContext()
    expect(mirrorPixels(WIDTH, HEIGHT, Math.PI / 2, NOOK_EYE).length).toBeGreaterThan(0)

    drawScene(ctx, Math.PI / 2, NOOK_EYE)

    expect(fills).toEqual([
      { args: [0, 0, WIDTH, HEIGHT], fillStyle: BACKGROUND },
      ...toFills(roomPixels(WIDTH, HEIGHT, Math.PI / 2, NOOK_EYE)),
      ...toFills(mirrorPixels(WIDTH, HEIGHT, Math.PI / 2, NOOK_EYE)),
      ...toFills(pullPixels(WIDTH, HEIGHT, 0, Math.PI / 2, NOOK_EYE)),
    ])
  })

  describe('with a ripple', () => {
    const RIPPLE: RippleState = { origin: { s: 0, t: 0 }, elapsedMs: 900 }

    it('draws more than without one, from the nook facing west', () => {
      const plain = createFakeContext()
      const rippling = createFakeContext()

      drawScene(plain.ctx, WEST, NOOK_EYE)
      drawScene(rippling.ctx, WEST, NOOK_EYE, { ripple: RIPPLE })

      expect(rippling.fills.length).toBeGreaterThan(plain.fills.length)
    })

    it('draws the ripple after the room and before the mirror', () => {
      const { ctx, fills } = createFakeContext()
      const ripple = ripplePixels(WIDTH, HEIGHT, RIPPLE, WEST, NOOK_EYE)
      expect(ripple.length).toBeGreaterThan(0)

      drawScene(ctx, WEST, NOOK_EYE, { ripple: RIPPLE })

      expect(fills).toEqual([
        { args: [0, 0, WIDTH, HEIGHT], fillStyle: BACKGROUND },
        ...toFills(roomPixels(WIDTH, HEIGHT, WEST, NOOK_EYE)),
        ...toFills(ripple),
        ...toFills(mirrorPixels(WIDTH, HEIGHT, WEST, NOOK_EYE)),
        ...toFills(pullPixels(WIDTH, HEIGHT, 0, WEST, NOOK_EYE)),
      ])
    })

    it('draws the same as without one once it has finished', () => {
      const plain = createFakeContext()
      const finished = createFakeContext()

      drawScene(plain.ctx, WEST, NOOK_EYE)
      drawScene(finished.ctx, WEST, NOOK_EYE, { ripple: { origin: { s: 0, t: 0 }, elapsedMs: 10_000 } })

      expect(finished.fills).toEqual(plain.fills)
    })
  })

  describe('with a preview', () => {
    const PREVIEW = new Uint8Array(PREVIEW_WIDTH * PREVIEW_HEIGHT).fill(3)
    const RIPPLE: RippleState = { origin: { s: 0, t: 0 }, elapsedMs: 900 }

    it('draws the preview after the room and before the mirror', () => {
      const { ctx, fills } = createFakeContext()
      const preview = previewPixels(WIDTH, HEIGHT, PREVIEW, WEST, NOOK_EYE)
      expect(preview.length).toBeGreaterThan(0)

      drawScene(ctx, WEST, NOOK_EYE, { preview: PREVIEW })

      expect(fills).toEqual([
        { args: [0, 0, WIDTH, HEIGHT], fillStyle: BACKGROUND },
        ...toFills(roomPixels(WIDTH, HEIGHT, WEST, NOOK_EYE)),
        ...toFills(preview),
        ...toFills(mirrorPixels(WIDTH, HEIGHT, WEST, NOOK_EYE)),
        ...toFills(pullPixels(WIDTH, HEIGHT, 0, WEST, NOOK_EYE)),
      ])
    })

    it('draws the rippled preview after the room and before the ripple rings and the mirror', () => {
      const { ctx, fills } = createFakeContext()

      drawScene(ctx, WEST, NOOK_EYE, { ripple: RIPPLE, preview: PREVIEW })

      expect(fills).toEqual([
        { args: [0, 0, WIDTH, HEIGHT], fillStyle: BACKGROUND },
        ...toFills(roomPixels(WIDTH, HEIGHT, WEST, NOOK_EYE)),
        ...toFills(previewPixels(WIDTH, HEIGHT, PREVIEW, WEST, NOOK_EYE, RIPPLE)),
        ...toFills(ripplePixels(WIDTH, HEIGHT, RIPPLE, WEST, NOOK_EYE)),
        ...toFills(mirrorPixels(WIDTH, HEIGHT, WEST, NOOK_EYE)),
        ...toFills(pullPixels(WIDTH, HEIGHT, 0, WEST, NOOK_EYE)),
      ])
    })
  })

  describe('with the pull tugged', () => {

    it('draws the pull lowered by pullDrop after the mirror', () => {
      const { ctx, fills } = createFakeContext()
      const dropped = pullPixels(WIDTH, HEIGHT, 0.1, WEST, NOOK_EYE)
      expect(dropped).not.toEqual(pullPixels(WIDTH, HEIGHT, 0, WEST, NOOK_EYE))

      drawScene(ctx, WEST, NOOK_EYE, { pullDrop: 0.1 })

      expect(fills).toEqual([
        { args: [0, 0, WIDTH, HEIGHT], fillStyle: BACKGROUND },
        ...toFills(roomPixels(WIDTH, HEIGHT, WEST, NOOK_EYE)),
        ...toFills(mirrorPixels(WIDTH, HEIGHT, WEST, NOOK_EYE)),
        ...toFills(dropped),
      ])
    })

    it('draws the pull at rest for a zero drop', () => {
      const plain = createFakeContext()
      const zero = createFakeContext()

      drawScene(plain.ctx, WEST, NOOK_EYE)
      drawScene(zero.ctx, WEST, NOOK_EYE, { pullDrop: 0 })

      expect(zero.fills).toEqual(plain.fills)
    })
  })

  describe('with a shimmer', () => {
    const OLD = new Uint8Array(PREVIEW_WIDTH * PREVIEW_HEIGHT).fill(1)
    const NEW = new Uint8Array(PREVIEW_WIDTH * PREVIEW_HEIGHT).fill(3)
    const SHIMMER = { from: OLD, progress: 0.5 }

    it('draws the shimmering preview after the room and before the mirror and the pull', () => {
      const { ctx, fills } = createFakeContext()
      const shimmering = previewPixels(WIDTH, HEIGHT, NEW, WEST, NOOK_EYE, undefined, SHIMMER)
      expect(shimmering).not.toEqual(previewPixels(WIDTH, HEIGHT, NEW, WEST, NOOK_EYE))

      drawScene(ctx, WEST, NOOK_EYE, { preview: NEW, shimmer: SHIMMER, pullDrop: 0.05 })

      expect(fills).toEqual([
        { args: [0, 0, WIDTH, HEIGHT], fillStyle: BACKGROUND },
        ...toFills(roomPixels(WIDTH, HEIGHT, WEST, NOOK_EYE)),
        ...toFills(shimmering),
        ...toFills(mirrorPixels(WIDTH, HEIGHT, WEST, NOOK_EYE)),
        ...toFills(pullPixels(WIDTH, HEIGHT, 0.05, WEST, NOOK_EYE)),
      ])
    })

    it.each([
      ['null', null],
      ['absent', undefined],
    ])('draws the old preview shimmering away with the new preview %s', (_, preview) => {
      const { ctx, fills } = createFakeContext()
      const fading = previewPixels(WIDTH, HEIGHT, null, WEST, NOOK_EYE, undefined, SHIMMER)
      expect(fading.length).toBeGreaterThan(0)

      drawScene(ctx, WEST, NOOK_EYE, { preview, shimmer: SHIMMER })

      expect(fills).toEqual([
        { args: [0, 0, WIDTH, HEIGHT], fillStyle: BACKGROUND },
        ...toFills(roomPixels(WIDTH, HEIGHT, WEST, NOOK_EYE)),
        ...toFills(fading),
        ...toFills(mirrorPixels(WIDTH, HEIGHT, WEST, NOOK_EYE)),
        ...toFills(pullPixels(WIDTH, HEIGHT, 0, WEST, NOOK_EYE)),
      ])
    })
  })

  describe('with a plaque', () => {
    const LOGO = Array.from({ length: 16 }, () => '#'.repeat(16))
    const PLAQUE: Plaque = { logo: LOGO }

    it('draws the plaque after the pull from the nook facing west', () => {
      const { ctx, fills } = createFakeContext()
      const plaque = plaquePixels(WIDTH, HEIGHT, PLAQUE, WEST, NOOK_EYE)
      expect(plaque.length).toBeGreaterThan(0)

      drawScene(ctx, WEST, NOOK_EYE, { plaque: PLAQUE })

      expect(fills).toEqual([
        { args: [0, 0, WIDTH, HEIGHT], fillStyle: BACKGROUND },
        ...toFills(roomPixels(WIDTH, HEIGHT, WEST, NOOK_EYE)),
        ...toFills(mirrorPixels(WIDTH, HEIGHT, WEST, NOOK_EYE)),
        ...toFills(pullPixels(WIDTH, HEIGHT, 0, WEST, NOOK_EYE)),
        ...toFills(plaque),
      ])
    })

    it('draws the plaque after the tugged pull, sunk and turned as given', () => {
      const { ctx, fills } = createFakeContext()
      const turning: Plaque = { logo: LOGO, depth: 1, turn: 0.3 }
      const plaque = plaquePixels(WIDTH, HEIGHT, turning, WEST, NOOK_EYE)
      expect(plaque).not.toEqual(plaquePixels(WIDTH, HEIGHT, PLAQUE, WEST, NOOK_EYE))

      drawScene(ctx, WEST, NOOK_EYE, { plaque: turning, pullDrop: 0.1 })

      const pull = pullPixels(WIDTH, HEIGHT, 0.1, WEST, NOOK_EYE)
      expect(fills.slice(-(pull.length + plaque.length))).toEqual([...toFills(pull), ...toFills(plaque)])
    })

    it('draws the plaque after the pull and before the sign', () => {
      const { ctx, fills } = createFakeContext()
      const yaw = 0.8
      const plaque = plaquePixels(WIDTH, HEIGHT, PLAQUE, yaw)
      const placement = signPlacement(yaw, WIDTH, HEIGHT)!
      const backing = placeSprite(signpostBackingPixels(WIDTH, HEIGHT), HOME, placement, WIDTH, HEIGHT)
      const sign = placeSprite(signpostPixels(WIDTH, HEIGHT), HOME, placement, WIDTH, HEIGHT)
      expect(plaque.length).toBeGreaterThan(0)

      drawScene(ctx, yaw, ORIGIN, { plaque: PLAQUE })

      expect(fills).toEqual([
        { args: [0, 0, WIDTH, HEIGHT], fillStyle: BACKGROUND },
        ...toFills(roomPixels(WIDTH, HEIGHT, yaw)),
        ...toFills(mirrorPixels(WIDTH, HEIGHT, yaw)),
        ...toFills(pullPixels(WIDTH, HEIGHT, 0, yaw)),
        ...toFills(plaque),
        ...toFills(backing),
        ...toFills(sign),
      ])
    })

    it('draws nothing for the plaque without one', () => {
      const plain = createFakeContext()
      const withPlaque = createFakeContext()
      const plaque = plaquePixels(WIDTH, HEIGHT, PLAQUE, WEST, NOOK_EYE)

      drawScene(plain.ctx, WEST, NOOK_EYE, {})
      drawScene(withPlaque.ctx, WEST, NOOK_EYE, { plaque: PLAQUE })

      expect(withPlaque.fills).toEqual([...plain.fills, ...toFills(plaque)])
    })
  })

  it.each<[string, MirrorExtras]>([
    ['a ripple', { ripple: { origin: { s: 0, t: 0 }, elapsedMs: 900 } }],
    ['a preview', { preview: new Uint8Array(PREVIEW_WIDTH * PREVIEW_HEIGHT).fill(3) }],
    [
      'a shimmer and a tugged pull',
      {
        preview: new Uint8Array(PREVIEW_WIDTH * PREVIEW_HEIGHT).fill(3),
        shimmer: { from: new Uint8Array(PREVIEW_WIDTH * PREVIEW_HEIGHT).fill(1), progress: 0.5 },
        pullDrop: 0.1,
      },
    ],
    ['a plaque', { plaque: { logo: Array.from({ length: 16 }, () => '#'.repeat(16)) } }],
  ])('draws the same with %s as without, with the mirror out of view', (_, extras) => {
    const plain = createFakeContext()
    const withExtras = createFakeContext()

    drawScene(plain.ctx, EAST, NOOK_EYE)
    drawScene(withExtras.ctx, EAST, NOOK_EYE, extras)

    expect(withExtras.fills).toEqual(plain.fills)
  })

  it('never fills outside the canvas while panning or along the path to the nook', () => {
    const views = [
      ...[-1.2, -0.8, -0.4, 0.4, 0.8, 1.2].map((yaw) => ({ yaw, eye: ORIGIN })),
      ...[0, 0.25, 0.5, 0.75, 1].flatMap((t) =>
        [0, 0.6, WEST, Math.PI, EAST].map((yaw) => ({ yaw, eye: { x: t * NOOK_EYE.x, z: 0 } })),
      ),
    ]
    for (const { yaw, eye } of views) {
      const { ctx, fills } = createFakeContext()
      drawScene(ctx, yaw, eye)
      for (const { args } of fills.slice(1)) {
        expect(args[0]).toBeGreaterThanOrEqual(0)
        expect(args[0]).toBeLessThan(WIDTH)
        expect(args[1]).toBeGreaterThanOrEqual(0)
        expect(args[1]).toBeLessThan(HEIGHT)
      }
    }
  })
})

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

  it.each([
    ['facing south, with the sign behind the camera', Math.PI, ORIGIN],
    ['facing west, with the sign level with the camera', Math.PI / 2, ORIGIN],
    ['facing east, with the sign level with the camera', -Math.PI / 2, ORIGIN],
    ['from the nook facing west, with the sign behind the camera', Math.PI / 2, NOOK_EYE],
  ])('is null %s', (_, yaw, eye) => {
    expect(signPlacement(yaw, WIDTH, HEIGHT, eye)).toBeNull()
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
