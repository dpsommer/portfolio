import { describe, expect, it, vi } from 'vitest'
import { drawPixels, drawScene } from './draw.ts'
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

    const toCalls = (pixels: Pixel[]) =>
      pixels.map(({ x, y, colour }) => ({ args: [x, y, 1, 1], fillStyle: colour }))
    expect(calls).toEqual([
      { args: [0, 0, 320, 240], fillStyle: BACKGROUND },
      ...toCalls(roomPixels(320, 240)),
      ...toCalls(signpostBackingPixels(320, 240)),
      ...toCalls(signpostPixels(320, 240)),
    ])
  })
})
