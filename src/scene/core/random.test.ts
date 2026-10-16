import { describe, expect, it } from 'vitest'
import { createRandom, hashRandom, hashSeed } from './random.ts'

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

describe('hashSeed', () => {
  it('is deterministic', () => {
    expect(hashSeed(21, 2, 0, 3, 4)).toBe(hashSeed(21, 2, 0, 3, 4))
  })

  it.each([[[]], [[0]], [[1, 2, 3]], [[-5, 7]], [[2 ** 31, 99]]])('returns an unsigned 32-bit integer for %j', (values) => {
    const seed = hashSeed(...values)
    expect(Number.isInteger(seed)).toBe(true)
    expect(seed).toBeGreaterThanOrEqual(0)
    expect(seed).toBeLessThan(2 ** 32)
  })

  it('depends on the order of its inputs', () => {
    expect(hashSeed(1, 2)).not.toBe(hashSeed(2, 1))
  })

  it('differs for different inputs', () => {
    const seeds = new Set<number>()
    for (let a = 0; a < 10; a++) {
      for (let b = 0; b < 10; b++) seeds.add(hashSeed(21, a, b))
    }
    expect(seeds.size).toBe(100)
  })

  it('differs when an extra value is appended', () => {
    expect(hashSeed(1, 2)).not.toBe(hashSeed(1, 2, 0))
  })
})

describe('hashRandom', () => {
  it('is deterministic', () => {
    expect(hashRandom(3, 1, 4)).toBe(hashRandom(3, 1, 4))
  })

  it('produces values in [0, 1)', () => {
    for (let a = 0; a < 20; a++) {
      for (let b = -10; b < 10; b++) {
        const value = hashRandom(a, b)
        expect(value).toBeGreaterThanOrEqual(0)
        expect(value).toBeLessThan(1)
      }
    }
  })

  it('is the first value of the stream seeded by hashSeed', () => {
    expect(hashRandom(5, 6, 7)).toBe(createRandom(hashSeed(5, 6, 7))())
  })

  it('varies with its inputs', () => {
    const values = new Set(Array.from({ length: 50 }, (_, i) => hashRandom(21, 2, i)))
    expect(values.size).toBeGreaterThan(45)
  })
})
