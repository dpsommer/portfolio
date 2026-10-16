// Small seeded PRNG (mulberry32), so wear patterns are the same on every render.
export function createRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Combines integers into a seed, so things placed in the world (a brick, a floor
// edge) get their own random stream that doesn't depend on drawing order.
export function hashSeed(...values: number[]): number {
  let hash = 0x811c9dc5
  for (const value of values) {
    hash = Math.imul(hash ^ (value | 0), 0x01000193)
    hash ^= hash >>> 15
  }
  return hash >>> 0
}

// A single random number in [0, 1) for the given integers.
export function hashRandom(...values: number[]): number {
  return createRandom(hashSeed(...values))()
}
