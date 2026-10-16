import { describe, expect, it } from 'vitest'
import { createRandom } from './random.ts'

function take(random: () => number, count: number): number[] {
  return Array.from({ length: count }, () => random())
}

describe('createRandom', () => {
  it('produces the same sequence for the same seed', () => {
    expect(take(createRandom(42), 20)).toEqual(take(createRandom(42), 20))
  })

  it('produces different sequences for different seeds', () => {
    expect(take(createRandom(1), 20)).not.toEqual(take(createRandom(2), 20))
  })

  it('produces values in [0, 1)', () => {
    for (const value of take(createRandom(7), 1000)) {
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThan(1)
    }
  })

  it('does not return a constant value', () => {
    expect(new Set(take(createRandom(7), 20)).size).toBeGreaterThan(1)
  })
})
