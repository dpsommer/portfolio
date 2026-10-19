import { describe, expect, it } from 'vitest'
import { createFakeContext } from '../../test/fakeContext.ts'
import { BACKGROUND } from '../core/palette.ts'
import { clearPanel } from './panelCanvas.ts'

describe('clearPanel', () => {
  it.each([
    [320, 132],
    [17, 5],
  ])('fills the whole %ix%i canvas with the background colour', (width, height) => {
    const { ctx, fills } = createFakeContext(width, height)

    clearPanel(ctx)

    expect(fills).toEqual([{ args: [0, 0, width, height], fillStyle: BACKGROUND }])
  })
})
