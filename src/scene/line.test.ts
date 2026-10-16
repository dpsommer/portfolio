import { describe, expect, it } from 'vitest'
import { brokenLinePoints, linePoints } from './line.ts'
import { createRandom } from './random.ts'

type Point = { x: number; y: number }

const key = ({ x, y }: Point) => `${x},${y}`
const sortedKeys = (points: Point[]) => points.map(key).sort()

// Lengths of the runs of consecutive indices in `kept` and of the gaps between them.
function runsAndGaps(indices: number[]) {
  const runs: number[] = []
  const gaps: number[] = []
  let runLength = 1
  for (let i = 1; i < indices.length; i++) {
    const step = indices[i] - indices[i - 1]
    if (step === 1) {
      runLength++
    } else {
      runs.push(runLength)
      gaps.push(step - 1)
      runLength = 1
    }
  }
  if (indices.length > 0) runs.push(runLength)
  return { runs, gaps }
}

describe('linePoints', () => {
  it('includes both endpoints', () => {
    const points = linePoints(2, 3, 9, 7)
    expect(points[0]).toEqual({ x: 2, y: 3 })
    expect(points[points.length - 1]).toEqual({ x: 9, y: 7 })
  })

  it('returns a single point when both ends are the same', () => {
    expect(linePoints(4, 4, 4, 4)).toEqual([{ x: 4, y: 4 }])
  })

  it('draws a horizontal line one pixel per column', () => {
    expect(linePoints(0, 0, 5, 0)).toEqual([0, 1, 2, 3, 4, 5].map((x) => ({ x, y: 0 })))
  })

  it('draws a vertical line one pixel per row', () => {
    expect(linePoints(0, 0, 0, 4)).toEqual([0, 1, 2, 3, 4].map((y) => ({ x: 0, y })))
  })

  it('draws a 45-degree diagonal one pixel per step', () => {
    expect(linePoints(0, 0, 3, 3)).toEqual([0, 1, 2, 3].map((n) => ({ x: n, y: n })))
  })

  it('has one point per step along the major axis', () => {
    expect(linePoints(0, 0, 10, 3)).toHaveLength(11)
    expect(linePoints(0, 0, -3, -10)).toHaveLength(11)
  })

  it('covers the same points when drawn in reverse', () => {
    expect(sortedKeys(linePoints(9, 7, 2, 3))).toEqual(sortedKeys(linePoints(2, 3, 9, 7)))
  })

  it('produces 8-connected points', () => {
    const points = linePoints(-5, 12, 17, -4)
    for (let i = 1; i < points.length; i++) {
      expect(Math.abs(points[i].x - points[i - 1].x)).toBeLessThanOrEqual(1)
      expect(Math.abs(points[i].y - points[i - 1].y)).toBeLessThanOrEqual(1)
    }
  })

  it('rounds fractional inputs', () => {
    expect(linePoints(0.4, 1.6, 2.6, 1.6)).toEqual(linePoints(0, 2, 3, 2))
  })
})

describe('brokenLinePoints', () => {
  it('returns a subset of the full line', () => {
    const full = new Set(linePoints(0, 0, 200, 50).map(key))
    for (const p of brokenLinePoints(0, 0, 200, 50, createRandom(1))) {
      expect(full.has(key(p))).toBe(true)
    }
  })

  it('is deterministic for a seeded random', () => {
    expect(brokenLinePoints(0, 0, 200, 50, createRandom(3))).toEqual(
      brokenLinePoints(0, 0, 200, 50, createRandom(3)),
    )
  })

  it('drops some points on a long line but keeps some', () => {
    const kept = brokenLinePoints(0, 0, 300, 0, createRandom(5))
    expect(kept.length).toBeGreaterThan(0)
    expect(kept.length).toBeLessThan(301)
  })

  it('keeps runs within the run bounds and gaps of 2-6 pixels', () => {
    for (const [seed, minRun, maxRun] of [[1, 4, 16], [2, 6, 24], [9, 3, 5]]) {
      const full = linePoints(0, 0, 400, 100)
      const index = new Map(full.map((p, i) => [key(p), i]))
      const kept = brokenLinePoints(0, 0, 400, 100, createRandom(seed), minRun, maxRun)
      const indices = kept.map((p) => index.get(key(p)) as number)
      const { runs, gaps } = runsAndGaps(indices)

      for (const gap of gaps) {
        expect(gap).toBeGreaterThanOrEqual(2)
        expect(gap).toBeLessThanOrEqual(6)
      }
      for (const run of runs) expect(run).toBeLessThanOrEqual(maxRun)
      // The first and last runs may be cut short by the ends of the line.
      for (const run of runs.slice(1, -1)) expect(run).toBeGreaterThanOrEqual(minRun)
    }
  })

  it('keeps points in line order', () => {
    const full = linePoints(0, 0, 200, 50)
    const index = new Map(full.map((p, i) => [key(p), i]))
    const indices = brokenLinePoints(0, 0, 200, 50, createRandom(4)).map((p) => index.get(key(p)) as number)
    expect(indices).toEqual([...indices].sort((a, b) => a - b))
  })
})
