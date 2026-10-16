import { describe, expect, it } from 'vitest'
import { CEILING_Y } from './camera.ts'
import { MIRROR_BOUNDS } from './mirror.ts'
import type { MirrorLine } from './mirror.ts'
import { FOREGROUND, FOREGROUND_WORN } from './palette.ts'
import { PULL_BOUNDS, PULL_S, isOnPull, pullLayers } from './pull.ts'

const allPoints = (lines: MirrorLine[]) => lines.flat()
const [CORD, HANDLE] = pullLayers()
// The cord is the layer's one vertical line at PULL_S; the band is horizontal.
const cordOf = (lines: MirrorLine[]) => lines.find(([a, b]) => a.s === PULL_S && b.s === PULL_S)!
const lowest = (lines: MirrorLine[]) => Math.min(...allPoints(lines).map(({ t }) => t))
const highest = (lines: MirrorLine[]) => Math.max(...allPoints(lines).map(({ t }) => t))
// The handle's top at rest, and its height.
const HANDLE_TOP = 0.12
const HANDLE_HEIGHT = 0.14

describe('PULL_S', () => {
  it('hangs the pull at s 0.68', () => {
    expect(PULL_S).toBe(0.68)
  })
})

describe('pullLayers', () => {
  it('has a worn cord layer and a bright handle layer', () => {
    expect(pullLayers().map(({ colour }) => colour)).toEqual([FOREGROUND_WORN, FOREGROUND])
  })

  it('has lines in every layer', () => {
    for (const { lines } of pullLayers()) expect(lines.length).toBeGreaterThan(0)
  })

  it('lies right of the mirror', () => {
    const points = pullLayers().flatMap(({ lines }) => allPoints(lines))
    expect(Math.min(...points.map(({ s }) => s))).toBeGreaterThan(MIRROR_BOUNDS.right)
  })

  it('lies within the wall, below the ceiling', () => {
    const points = pullLayers().flatMap(({ lines }) => allPoints(lines))
    expect(Math.max(...points.map(({ s }) => s))).toBeLessThan(1)
    expect(Math.max(...points.map(({ t }) => t))).toBeLessThanOrEqual(CEILING_Y)
  })

  it('hangs the cord from the ceiling to the handle\'s top', () => {
    const [a, b] = cordOf(CORD.lines)
    expect(Math.max(a.t, b.t)).toBe(CEILING_Y)
    expect(Math.min(a.t, b.t)).toBeCloseTo(HANDLE_TOP)
  })

  it('gives the handle an outline from its top down 0.14', () => {
    expect(highest(HANDLE.lines)).toBeCloseTo(HANDLE_TOP)
    expect(lowest(HANDLE.lines)).toBeCloseTo(HANDLE_TOP - HANDLE_HEIGHT)
  })

  it('keeps the handle within 0.035 either side of the cord', () => {
    for (const { s } of allPoints(HANDLE.lines)) expect(Math.abs(s - PULL_S)).toBeLessThanOrEqual(0.035 + 1e-9)
    const widest = Math.max(...allPoints(HANDLE.lines).map(({ s }) => Math.abs(s - PULL_S)))
    expect(widest).toBeCloseTo(0.035)
  })

  it('closes the handle\'s outline', () => {
    const points = allPoints(HANDLE.lines)
    expect(points[0]).toEqual(points[points.length - 1])
  })

  it('makes the handle symmetric about the cord', () => {
    const key = (s: number, t: number) => `${(s - PULL_S).toFixed(6)},${t.toFixed(6)}`
    const keys = new Set(allPoints(HANDLE.lines).map(({ s, t }) => key(s, t)))
    for (const { s, t } of allPoints(HANDLE.lines)) expect(keys.has(key(2 * PULL_S - s, t))).toBe(true)
  })

  it('defaults to no drop', () => {
    expect(pullLayers()).toEqual(pullLayers(0))
  })

  it('lowers the handle by exactly the drop', () => {
    const dropped = pullLayers(0.1)[1]
    expect(highest(dropped.lines)).toBeCloseTo(HANDLE_TOP - 0.1)
    expect(lowest(dropped.lines)).toBeCloseTo(lowest(HANDLE.lines) - 0.1)
    allPoints(dropped.lines).forEach((p, i) => {
      const rest = allPoints(HANDLE.lines)[i]
      expect(p.s).toBeCloseTo(rest.s)
      expect(p.t).toBeCloseTo(rest.t - 0.1)
    })
  })

  it('stretches the cord down with the handle, keeping its top at the ceiling', () => {
    const [a, b] = cordOf(pullLayers(0.1)[0].lines)
    expect(Math.max(a.t, b.t)).toBe(CEILING_Y)
    expect(Math.min(a.t, b.t)).toBeCloseTo(HANDLE_TOP - 0.1)
  })

  it('lowers the band with the handle', () => {
    const band = (lines: MirrorLine[]) => lines.find(([a, b]) => a.t === b.t)!
    expect(band(pullLayers(0.1)[0].lines)[0].t).toBeCloseTo(band(CORD.lines)[0].t - 0.1)
  })
})

describe('PULL_BOUNDS', () => {
  it('contains the pull at rest', () => {
    for (const { s, t } of pullLayers().flatMap(({ lines }) => allPoints(lines))) {
      expect(s).toBeGreaterThanOrEqual(PULL_BOUNDS.left - 1e-9)
      expect(s).toBeLessThanOrEqual(PULL_BOUNDS.right + 1e-9)
      expect(t).toBeGreaterThanOrEqual(PULL_BOUNDS.bottom - 1e-9)
      expect(t).toBeLessThanOrEqual(PULL_BOUNDS.top + 1e-9)
    }
  })

  it('runs from the handle\'s bottom up to the ceiling', () => {
    expect(PULL_BOUNDS.top).toBe(CEILING_Y)
    expect(PULL_BOUNDS.bottom).toBeCloseTo(HANDLE_TOP - HANDLE_HEIGHT)
  })

  it('stays clear of the mirror', () => {
    expect(PULL_BOUNDS.left).toBeGreaterThan(MIRROR_BOUNDS.right)
  })
})

describe('isOnPull', () => {
  it.each([
    ['the handle\'s centre', PULL_S, HANDLE_TOP - HANDLE_HEIGHT / 2],
    ['the cord just above the handle', PULL_S, HANDLE_TOP + 0.05],
    ['the handle\'s widest point', PULL_S + 0.035, HANDLE_TOP - 0.07],
    ['just below the handle\'s tip', PULL_S, HANDLE_TOP - HANDLE_HEIGHT - 0.01],
    ['beside the cord, within the padding', PULL_S + 0.045, HANDLE_TOP + 0.1],
  ])('is true on %s', (_, s, t) => {
    expect(isOnPull({ s, t })).toBe(true)
  })

  it.each([
    ['between the pull and the mirror', (MIRROR_BOUNDS.right + PULL_S - 0.035) / 2, HANDLE_TOP - 0.07],
    ['far up the cord', PULL_S, CEILING_Y - 0.05],
    ['well below the handle', PULL_S, HANDLE_TOP - HANDLE_HEIGHT - 0.1],
    ['right of the handle', PULL_S + 0.1, HANDLE_TOP - 0.07],
    ['the mirror\'s centre', 0, 0],
  ])('is false on %s', (_, s, t) => {
    expect(isOnPull({ s, t })).toBe(false)
  })

  it('covers the cord up to 0.25 above the handle', () => {
    expect(isOnPull({ s: PULL_S, t: HANDLE_TOP + 0.25 })).toBe(true)
    expect(isOnPull({ s: PULL_S, t: HANDLE_TOP + 0.26 })).toBe(false)
  })
})
