import { describe, expect, it } from 'vitest'
import { HEADINGS, TURN_YAW, opposite, turn } from './heading.ts'
import type { Heading } from './heading.ts'

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

  it.each(HEADINGS)('returns to %s after a left then a right turn', (heading) => {
    expect(turn(turn(heading, 'left'), 'right')).toBe(heading)
  })

  it.each(['left', 'right'] as const)('returns to the start after four %s turns', (direction) => {
    let heading: Heading = 'north'
    for (let i = 0; i < 4; i++) heading = turn(heading, direction)
    expect(heading).toBe('north')
  })
})

describe('TURN_YAW', () => {
  it('is a positive quarter turn to the left', () => {
    expect(TURN_YAW.left).toBeCloseTo(Math.PI / 2)
  })

  it('is a negative quarter turn to the right', () => {
    expect(TURN_YAW.right).toBeCloseTo(-Math.PI / 2)
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

  it.each(HEADINGS)('is two left turns from %s', (heading) => {
    expect(opposite(heading)).toBe(turn(turn(heading, 'left'), 'left'))
  })

  it.each(HEADINGS)('comes back to %s when applied twice', (heading) => {
    expect(opposite(opposite(heading))).toBe(heading)
  })

  it.each(HEADINGS)('never gives back %s itself', (heading) => {
    expect(opposite(heading)).not.toBe(heading)
  })
})
