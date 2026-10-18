import { describe, expect, it } from 'vitest'
import { createFakeContext, toFills } from '../../test/fakeContext.ts'
import { BACKGROUND } from '../core/palette.ts'
import { compassPixels } from './compass.ts'
import { navButtonPixels } from './navButtons.ts'
import type { KeyPress, NavButton } from './navButtons.ts'
import { drawNavigationPanel } from './navigationPanel.ts'

const ALL_ENABLED: Record<NavButton, boolean> = { forward: true, back: true, left: true, right: true }
const SOME_DISABLED: Record<NavButton, boolean> = { forward: false, back: true, left: true, right: false }

describe('drawNavigationPanel', () => {
  it.each<[string, number, Record<NavButton, boolean>, KeyPress | undefined, number, number]>([
    ['facing north, all enabled', 0, ALL_ENABLED, undefined, 320, 155],
    ['turned to yaw π/2', Math.PI / 2, ALL_ENABLED, undefined, 320, 155],
    ['part way through a turn', 0.4, ALL_ENABLED, undefined, 320, 155],
    ['turned to yaw -π/2', -Math.PI / 2, ALL_ENABLED, undefined, 320, 155],
    ['with some buttons disabled', 1, SOME_DISABLED, undefined, 320, 155],
    ['with the left key fully pressed', 1, ALL_ENABLED, { button: 'left', depth: 1 }, 320, 155],
    ['with the forward key half pressed', 1, ALL_ENABLED, { button: 'forward', depth: 0.5 }, 320, 155],
    ['with the back key at depth 0', 1, ALL_ENABLED, { button: 'back', depth: 0 }, 320, 155],
    ['on a smaller canvas', 0, ALL_ENABLED, undefined, 100, 40],
  ])('draws the background, then the compass, then the buttons, %s', (_, yaw, enabled, press, width, height) => {
    const { ctx, fills } = createFakeContext(width, height)

    drawNavigationPanel(ctx, yaw, enabled, press)

    expect(fills).toEqual([
      { args: [0, 0, width, height], fillStyle: BACKGROUND },
      ...toFills(compassPixels(yaw)),
      ...toFills(navButtonPixels(enabled, press)),
    ])
  })
})
