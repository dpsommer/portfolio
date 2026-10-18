import { describe, expect, it } from 'vitest'
import { HEADINGS, TURN_YAW, opposite, turn } from './heading.ts'

describe('HEADINGS', () => {
  it('lists the four directions in left-turn order', () => {
    expect(HEADINGS).toEqual(['north', 'west', 'south', 'east'])
  })
})

describe('turn', () => {
  it.each([
    ['north', 'west'],
    ['west', 'south'],
    ['south', 'east'],
    ['east', 'north'],
  ] as const)('turns left from %s to %s', (from, to) => {
    expect(turn(from, 'left')).toBe(to)
  })

  it.each([
    ['north', 'east'],
    ['east', 'south'],
    ['south', 'west'],
    ['west', 'north'],
  ] as const)('turns right from %s to %s', (from, to) => {
    expect(turn(from, 'right')).toBe(to)
  })
})

describe('TURN_YAW', () => {
  it.each([
    ['left', Math.PI / 2],
    ['right', -Math.PI / 2],
  ] as const)('is a quarter turn to the %s', (direction, yaw) => {
    expect(TURN_YAW[direction]).toBeCloseTo(yaw)
  })
})

describe('opposite', () => {
  it.each([
    ['north', 'south'],
    ['west', 'east'],
    ['south', 'north'],
    ['east', 'west'],
  ] as const)('gives %s the opposite heading %s', (heading, expected) => {
    expect(opposite(heading)).toBe(expected)
  })
})
