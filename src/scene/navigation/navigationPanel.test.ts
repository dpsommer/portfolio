import { describe, expect, it, vi } from 'vitest'
import { BACKGROUND } from '../core/palette.ts'
import type { Pixel } from '../core/types.ts'
import { compassPixels } from './compass.ts'
import { navButtonPixels } from './navButtons.ts'
import type { NavButton } from './navButtons.ts'
import { drawNavigationPanel } from './navigationPanel.ts'

type Call = { args: number[]; fillStyle: string }

const ALL_ENABLED: Record<NavButton, boolean> = { forward: true, back: true, left: true, right: true }
const SOME_DISABLED: Record<NavButton, boolean> = { forward: false, back: true, left: true, right: false }

function createFakeContext(width = 320, height = 155) {
  const calls: Call[] = []
  const fillRect = vi.fn((...args: number[]) => {
    calls.push({ args, fillStyle: ctx.fillStyle })
  })
  const ctx = { fillStyle: '', canvas: { width, height }, fillRect }
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls }
}

// The 1x1 fills that drawing `pixels` makes.
const fillsFor = (pixels: Pixel[]): Call[] => pixels.map(({ x, y, colour }) => ({ args: [x, y, 1, 1], fillStyle: colour }))

describe('drawNavigationPanel', () => {
  it('first fills the whole canvas with the background', () => {
    const { ctx, calls } = createFakeContext()

    drawNavigationPanel(ctx, 0, ALL_ENABLED)

    expect(calls[0]).toEqual({ args: [0, 0, 320, 155], fillStyle: BACKGROUND })
  })

  it('fills the background at the canvas\'s own size', () => {
    const { ctx, calls } = createFakeContext(100, 40)

    drawNavigationPanel(ctx, 0, ALL_ENABLED)

    expect(calls[0]).toEqual({ args: [0, 0, 100, 40], fillStyle: BACKGROUND })
  })

  it('draws the background only once', () => {
    const { ctx, calls } = createFakeContext()

    drawNavigationPanel(ctx, 0, ALL_ENABLED)

    expect(calls.filter((call) => call.args[2] !== 1 || call.args[3] !== 1)).toHaveLength(1)
  })

  it.each([0, Math.PI / 2, 0.4, -Math.PI / 2])('draws the compass turned to yaw %s after the background', (yaw) => {
    const { ctx, calls } = createFakeContext()
    const compass = fillsFor(compassPixels(yaw))

    drawNavigationPanel(ctx, yaw, ALL_ENABLED)

    expect(calls.slice(1, 1 + compass.length)).toEqual(compass)
  })

  it.each([ALL_ENABLED, SOME_DISABLED])('draws the buttons last, as enabled (%j)', (enabled) => {
    const { ctx, calls } = createFakeContext()
    const buttons = fillsFor(navButtonPixels(enabled))

    drawNavigationPanel(ctx, 0, enabled)

    expect(calls.slice(-buttons.length)).toEqual(buttons)
  })

  it('draws exactly the background, compass and buttons', () => {
    const { ctx, calls } = createFakeContext()

    drawNavigationPanel(ctx, 1, SOME_DISABLED)

    expect(calls).toEqual([
      { args: [0, 0, 320, 155], fillStyle: BACKGROUND },
      ...fillsFor(compassPixels(1)),
      ...fillsFor(navButtonPixels(SOME_DISABLED)),
    ])
  })
})
