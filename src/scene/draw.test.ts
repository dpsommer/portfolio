import { describe, expect, it } from 'vitest'
import { createFakeContext, toFills } from '../test/fakeContext.ts'
import { ORIGIN } from './core/camera.ts'
import type { FloorPoint } from './core/camera.ts'
import { BACKGROUND, FOREGROUND, FOREGROUND_WORN } from './core/palette.ts'
import type { Pixel } from './core/types.ts'
import { drawPixels, drawScene } from './draw.ts'
import type { MirrorExtras } from './draw.ts'
import { mirrorPixels, plaquePixels, previewPixels, pullPixels, ripplePixels } from './mirror/pixels.ts'
import type { RippleState } from './mirror/pixels.ts'
import type { Plaque } from './mirror/plaque.ts'
import { PREVIEW_HEIGHT, PREVIEW_WIDTH } from './mirror/preview.ts'
import { PLACES } from './navigation/places.ts'
import { roomPixels } from './room/room.ts'
import { signPixels } from './sign/pixels.ts'

const WIDTH = 320
const HEIGHT = 240
// The nook's place.
const NOOK_EYE: FloorPoint = { x: PLACES.nook.x, z: PLACES.nook.z }

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
  it('fills the background, then draws the room and the sign, in that order', () => {
    const { ctx, fills } = createFakeContext()

    drawScene(ctx)

    expect(fills).toEqual([
      { args: [0, 0, 320, 240], fillStyle: BACKGROUND },
      ...toFills(roomPixels(320, 240)),
      ...toFills(signPixels(320, 240)),
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

  it('draws the sign after the room and before the mirror and the pull', () => {
    const { ctx, fills } = createFakeContext()
    const yaw = 0.8
    const sign = signPixels(WIDTH, HEIGHT, yaw)
    expect(sign.length).toBeGreaterThan(0)

    drawScene(ctx, yaw)

    expect(fills).toEqual([
      { args: [0, 0, WIDTH, HEIGHT], fillStyle: BACKGROUND },
      ...toFills(roomPixels(WIDTH, HEIGHT, yaw)),
      ...toFills(sign),
      ...toFills(mirrorPixels(WIDTH, HEIGHT, yaw)),
      ...toFills(pullPixels(WIDTH, HEIGHT, 0, yaw)),
    ])
  })

  it('does not draw the sign when facing away from it', () => {
    const { ctx, fills } = createFakeContext()

    drawScene(ctx, Math.PI)

    expect(fills.some((c) => c.fillStyle === FOREGROUND)).toBe(false)
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
    const room = roomPixels(WIDTH, HEIGHT, 0, NOOK_EYE)
    const sign = signPixels(WIDTH, HEIGHT, 0, NOOK_EYE)

    drawScene(ctx, 0, NOOK_EYE)

    expect(sign.length).toBeGreaterThan(0)
    expect(fills.slice(1 + room.length, 1 + room.length + sign.length)).toEqual(toFills(sign))
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

    it('draws the plaque last, after the sign and the pull', () => {
      const { ctx, fills } = createFakeContext()
      const yaw = 0.8
      const plaque = plaquePixels(WIDTH, HEIGHT, PLAQUE, yaw)
      expect(plaque.length).toBeGreaterThan(0)

      drawScene(ctx, yaw, ORIGIN, { plaque: PLAQUE })

      expect(fills).toEqual([
        { args: [0, 0, WIDTH, HEIGHT], fillStyle: BACKGROUND },
        ...toFills(roomPixels(WIDTH, HEIGHT, yaw)),
        ...toFills(signPixels(WIDTH, HEIGHT, yaw)),
        ...toFills(mirrorPixels(WIDTH, HEIGHT, yaw)),
        ...toFills(pullPixels(WIDTH, HEIGHT, 0, yaw)),
        ...toFills(plaque),
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
