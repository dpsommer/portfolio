import { describe, expect, it } from 'vitest'
import { createFakeContext } from '../../test/fakeContext.ts'
import { BACKGROUND, FOREGROUND, FOREGROUND_DIM, FOREGROUND_WORN } from '../core/palette.ts'
import { clearPanel, weather } from './panelCanvas.ts'

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

describe('weather', () => {
  it.each([
    // Dropping: a roll below dropChance.
    ['drops the pixel when the roll is below dropChance', FOREGROUND, 0.03, 0.04, 0.2, null],
    ['drops the pixel for a roll of 0', FOREGROUND, 0, 0.04, 0.2, null],
    ['drops worn pixels alike', FOREGROUND_WORN, 0.01, 0.04, 0.2, null],
    ['drops dim pixels alike', FOREGROUND_DIM, 0.01, 0.04, 0.2, null],
    // Fading: a roll from dropChance up to dropChance + fadeChance.
    ['fades the full foreground to the worn colour', FOREGROUND, 0.1, 0.04, 0.2, FOREGROUND_WORN],
    ['fades the worn colour to the dim colour', FOREGROUND_WORN, 0.1, 0.04, 0.2, FOREGROUND_DIM],
    ['leaves the dim colour dim when it fades', FOREGROUND_DIM, 0.1, 0.04, 0.2, FOREGROUND_DIM],
    ['fades any other colour to the dim colour', '#123456', 0.1, 0.04, 0.2, FOREGROUND_DIM],
    ['fades rather than drops when the roll equals dropChance', FOREGROUND, 0.04, 0.04, 0.2, FOREGROUND_WORN],
    ['fades the pixel just below dropChance + fadeChance', FOREGROUND, 0.239, 0.04, 0.2, FOREGROUND_WORN],
    ['fades rather than drops from a roll of 0 when dropChance is 0', FOREGROUND, 0, 0, 0.2, FOREGROUND_WORN],
    ['never fades when fadeChance is 0', FOREGROUND, 0.05, 0.04, 0, FOREGROUND],
    // Keeping: a roll at or above dropChance + fadeChance.
    ['keeps the colour when the roll equals dropChance + fadeChance', FOREGROUND, 0.25, 0.05, 0.2, FOREGROUND],
    ['keeps the full foreground for a high roll', FOREGROUND, 0.99, 0.04, 0.2, FOREGROUND],
    ['keeps the worn colour for a high roll', FOREGROUND_WORN, 0.99, 0.04, 0.2, FOREGROUND_WORN],
    ['keeps the dim colour for a high roll', FOREGROUND_DIM, 0.99, 0.04, 0.2, FOREGROUND_DIM],
    ['keeps every pixel unchanged when both chances are 0', FOREGROUND, 0, 0, 0, FOREGROUND],
  ])('%s', (_, colour, roll, dropChance, fadeChance, expected) => {
    expect(weather(colour, roll, dropChance, fadeChance)).toBe(expected)
  })

  it('drops, fades and keeps in proportion to the chances over evenly spread rolls', () => {
    const rolls = Array.from({ length: 1000 }, (_, i) => i / 1000)
    const results = rolls.map((roll) => weather(FOREGROUND, roll, 0.1, 0.3))

    expect(results.filter((r) => r === null)).toHaveLength(100)
    expect(results.filter((r) => r === FOREGROUND_WORN)).toHaveLength(300)
    expect(results.filter((r) => r === FOREGROUND)).toHaveLength(600)
  })
})
