import { describe, expect, it } from 'vitest'
import {
  CURSOR_MAPS,
  CURSORS,
  EDGE_ZONE_FRACTION,
  getCursorZone,
  mirror,
  pixelMapToCursor,
} from './cursors.ts'
import type { CursorZone } from './cursors.ts'

const FILL = '#f2efe6'
const OUTLINE = '#0d0d0d'
const PREFIX = 'url("data:image/svg+xml,'

function decodeSvg(cursor: string): string {
  const start = PREFIX.length
  const end = cursor.indexOf('")')
  return decodeURIComponent(cursor.slice(start, end))
}

function countMatches(text: string, needle: string): number {
  return text.split(needle).length - 1
}

function blankMap(): string[] {
  return Array.from({ length: 16 }, () => '.'.repeat(16))
}

function singlePixelMap(): string[] {
  const map = blankMap()
  map[8] = '.'.repeat(8) + '#' + '.'.repeat(7)
  return map
}

describe('getCursorZone', () => {
  it('uses a 0.25 edge zone', () => {
    expect(EDGE_ZONE_FRACTION).toBe(0.25)
  })

  it.each([
    [0, 'turn-left'],
    [0.24, 'turn-left'],
    [0.25, 'forward'],
    [0.5, 'forward'],
    [0.75, 'forward'],
    [0.76, 'turn-right'],
    [1, 'turn-right'],
  ])('maps %s to %s', (fraction, zone) => {
    expect(getCursorZone(fraction)).toBe(zone)
  })
})

describe('mirror', () => {
  it('reverses each row', () => {
    expect(mirror(['#..', '.##'])).toEqual(['..#', '##.'])
  })

  it('returns the original map when applied twice', () => {
    const map = CURSOR_MAPS['turn-left']
    expect(mirror(mirror(map))).toEqual(map)
  })

  it('does not modify the input', () => {
    const map = ['#..']
    mirror(map)
    expect(map).toEqual(['#..'])
  })
})

describe('CURSOR_MAPS', () => {
  const zones = Object.keys(CURSOR_MAPS) as CursorZone[]

  it.each(zones)('%s map is 16 rows of 16 characters', (zone) => {
    const map = CURSOR_MAPS[zone]
    expect(map).toHaveLength(16)
    for (const row of map) expect(row).toHaveLength(16)
  })

  it.each(zones)('%s map only contains "#" and "."', (zone) => {
    for (const row of CURSOR_MAPS[zone]) expect(row).toMatch(/^[#.]+$/)
  })

  it.each(zones)('%s map leaves a transparent 1-pixel border', (zone) => {
    const map = CURSOR_MAPS[zone]
    expect(map[0]).not.toContain('#')
    expect(map[15]).not.toContain('#')
    for (const row of map) {
      expect(row[0]).toBe('.')
      expect(row[15]).toBe('.')
    }
  })

  it('turn-right map is the mirror of turn-left', () => {
    expect(CURSOR_MAPS['turn-right']).toEqual(mirror(CURSOR_MAPS['turn-left']))
  })
})

describe('pixelMapToCursor', () => {
  it('starts with an SVG data URL', () => {
    expect(pixelMapToCursor(singlePixelMap(), 'pointer').startsWith(PREFIX)).toBe(true)
  })

  it('ends with a centred hotspot and the fallback', () => {
    expect(pixelMapToCursor(singlePixelMap(), 'pointer').endsWith('") 16 16, pointer')).toBe(true)
  })

  it('produces a 32x32 SVG with a 16x16 viewBox', () => {
    const svg = decodeSvg(pixelMapToCursor(singlePixelMap(), 'pointer'))
    expect(svg).toContain('width="32"')
    expect(svg).toContain('height="32"')
    expect(svg).toContain('viewBox="0 0 16 16"')
  })

  it('surrounds a single filled pixel with 8 outline pixels', () => {
    const svg = decodeSvg(pixelMapToCursor(singlePixelMap(), 'pointer'))
    expect(countMatches(svg, `fill="${FILL}"`)).toBe(1)
    expect(countMatches(svg, `fill="${OUTLINE}"`)).toBe(8)
  })

  it('places the fill rect at the filled pixel position', () => {
    const svg = decodeSvg(pixelMapToCursor(singlePixelMap(), 'pointer'))
    expect(svg).toContain(`<rect x="8" y="8" width="1" height="1" fill="${FILL}"/>`)
  })

  it('produces no rects for an empty map', () => {
    const svg = decodeSvg(pixelMapToCursor(blankMap(), 'pointer'))
    expect(svg).not.toContain('<rect')
  })
})

describe('CURSORS', () => {
  it.each([
    ['turn-left', 'w-resize'],
    ['forward', 'n-resize'],
    ['turn-right', 'e-resize'],
  ] as const)('%s cursor falls back to %s', (zone, fallback) => {
    expect(CURSORS[zone].endsWith(`, ${fallback}`)).toBe(true)
  })

  it('builds each cursor from its pixel map', () => {
    expect(CURSORS.forward).toBe(pixelMapToCursor(CURSOR_MAPS.forward, 'n-resize'))
  })
})
