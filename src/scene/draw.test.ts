import { describe, expect, it, vi } from 'vitest'
import { drawPixels, drawScene, signOffset } from './draw.ts'
import { BACKGROUND, FOREGROUND, FOREGROUND_WORN } from './palette.ts'
import { roomPixels } from './room.ts'
import { signpostBackingPixels, signpostPixels } from './signpost.ts'
import type { Pixel } from './types.ts'

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

  it('draws only the background and the room when the sign is out of view facing west', () => {
    const { ctx, calls } = createFakeContext()

    drawScene(ctx, Math.PI / 2)

    expect(calls).toEqual([
      { args: [0, 0, 320, 240], fillStyle: BACKGROUND },
      ...toCalls(roomPixels(320, 240, Math.PI / 2)),
    ])
    // Only the signpost uses the full foreground colour.
    expect(calls.some((c) => c.fillStyle === FOREGROUND)).toBe(false)
  })

  it('does not draw the sign when facing away from it', () => {
    const { ctx, calls } = createFakeContext()

    drawScene(ctx, Math.PI)

    expect(calls.some((c) => c.fillStyle === FOREGROUND)).toBe(false)
  })

  it('draws the sign shifted by signOffset after a small turn', () => {
    const { ctx, calls } = createFakeContext()
    const yaw = 0.2
    const offset = signOffset(yaw, 320, 240)!
    const shifted = signpostPixels(320, 240).map((p) => ({ ...p, x: p.x + offset }))

    drawScene(ctx, yaw)

    expect(offset).toBeGreaterThan(0)
    expect(calls.slice(-shifted.length)).toEqual(toCalls(shifted))
  })

  it('skips sign pixels shifted off the canvas', () => {
    const { ctx, calls } = createFakeContext()
    const yaw = 0.8
    const offset = signOffset(yaw, 320, 240)!
    const sign = signpostPixels(320, 240)
    const visible = sign.map((p) => ({ ...p, x: p.x + offset })).filter((p) => p.x < 320)

    drawScene(ctx, yaw)

    // Part of the sign has slid past the right edge.
    expect(visible.length).toBeGreaterThan(0)
    expect(visible.length).toBeLessThan(sign.length)
    expect(calls.slice(-visible.length)).toEqual(toCalls(visible))
    for (const { args } of calls.slice(1)) {
      expect(args[0]).toBeGreaterThanOrEqual(0)
      expect(args[0]).toBeLessThan(320)
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

describe('signOffset', () => {
  it('is 0 facing north', () => {
    expect(signOffset(0, 320, 240)).toBe(0)
  })

  it('is a positive integer for a small left turn, sliding the sign right', () => {
    const offset = signOffset(0.1, 320, 240)
    expect(offset).toBeGreaterThan(0)
    expect(Number.isInteger(offset)).toBe(true)
  })

  it('is negative for a small right turn, sliding the sign left', () => {
    expect(signOffset(-0.1, 320, 240)).toBeLessThan(0)
  })

  it('mirrors left and right turns', () => {
    expect(signOffset(-0.3, 320, 240)).toBe(-signOffset(0.3, 320, 240)!)
  })

  it('grows as the turn grows', () => {
    expect(signOffset(0.4, 320, 240)!).toBeGreaterThan(signOffset(0.2, 320, 240)!)
  })

  it('scales with the canvas width', () => {
    const small = signOffset(0.2, 320, 240)!
    const large = signOffset(0.2, 640, 480)!
    expect(Math.abs(large - 2 * small)).toBeLessThanOrEqual(1)
  })

  it('is null facing south, with the sign behind the camera', () => {
    expect(signOffset(Math.PI, 320, 240)).toBeNull()
  })

  it.each([Math.PI / 2, -Math.PI / 2])('is null at yaw %f, with the sign level with the camera', (yaw) => {
    expect(signOffset(yaw, 320, 240)).toBeNull()
  })
})
