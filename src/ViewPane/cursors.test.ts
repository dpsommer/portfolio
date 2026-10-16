import { describe, expect, it } from 'vitest'
import {
  CURSOR_MAPS,
  CURSORS,
  EDGE_ZONE_FRACTION,
  getCursorZone,
  mirror,
  pixelMapToCursor,
  projectArrow,
} from './cursors.ts'
import type { CursorZone } from './cursors.ts'
import { BACKGROUND, FOREGROUND, FOREGROUND_WORN } from '../scene/palette.ts'

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

function topFaceWidths(map: string[]): number[] {
  return map.map((row) => countMatches(row, '#'))
}

function topFaceRows(map: string[]): number[] {
  return topFaceWidths(map).flatMap((width, y) => (width > 0 ? [y] : []))
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

  it.each(zones)('%s map only contains "#", "+" and "."', (zone) => {
    for (const row of CURSOR_MAPS[zone]) expect(row).toMatch(/^[#+.]+$/)
  })

  it.each(zones)('%s map has both top face and side face cells', (zone) => {
    const text = CURSOR_MAPS[zone].join('')
    expect(text).toContain('#')
    expect(text).toContain('+')
  })

  it.each(zones)('%s map has a "#" within 2 rows above every "+"', (zone) => {
    const map = CURSOR_MAPS[zone]
    for (let y = 0; y < map.length; y++) {
      for (let x = 0; x < map[y].length; x++) {
        if (map[y][x] !== '+') continue
        expect(map[y - 1]?.[x] === '#' || map[y - 2]?.[x] === '#').toBe(true)
      }
    }
  })

  it.each(zones)('%s map shows the side face below the top face in every column', (zone) => {
    const map = CURSOR_MAPS[zone]
    for (let x = 0; x < 16; x++) {
      const column = map.map((row) => row[x]).join('')
      const lowest = column.replace(/\.+$/, '').at(-1)
      if (lowest !== undefined) expect(lowest).toBe('+')
    }
  })

  it('forward shaft is no narrower near the viewer than further away', () => {
    const widths = topFaceWidths(CURSOR_MAPS.forward)
    const widest = widths.indexOf(Math.max(...widths))
    const shaft = widths.slice(widest + 1).filter((width) => width > 0)
    expect(shaft.length).toBeGreaterThan(1)
    for (let i = 1; i < shaft.length; i++) expect(shaft[i]).toBeGreaterThanOrEqual(shaft[i - 1])
  })

  it('forward arrowhead is wider than its shaft', () => {
    const widths = topFaceWidths(CURSOR_MAPS.forward)
    const widest = widths.indexOf(Math.max(...widths))
    const shaft = widths.slice(widest + 1).filter((width) => width > 0)
    expect(widths[widest]).toBeGreaterThan(Math.max(...shaft))
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

describe('projectArrow', () => {
  const fullFloor: [number, number][][] = [
    [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ],
  ]

  it.each([
    ['an empty shape list', []],
    ['the full floor', fullFloor],
  ])('produces 16 rows of 16 characters for %s', (_, shape) => {
    const map = projectArrow(shape as [number, number][][])
    expect(map).toHaveLength(16)
    for (const row of map) expect(row).toHaveLength(16)
  })

  it('produces a transparent map for an empty shape list', () => {
    for (const row of projectArrow([])) expect(row).toBe('.'.repeat(16))
  })

  it('does not widen the full floor going further away', () => {
    const widths = topFaceWidths(projectArrow(fullFloor)).filter((width) => width > 0)
    for (let i = 1; i < widths.length; i++) expect(widths[i]).toBeGreaterThanOrEqual(widths[i - 1])
  })

  it('makes the far edge of the full floor narrower than the near edge', () => {
    const widths = topFaceWidths(projectArrow(fullFloor)).filter((width) => width > 0)
    expect(widths[0]).toBeLessThan(widths[widths.length - 1])
  })

  it('draws the near half of the floor lower on screen than the far half', () => {
    const near = topFaceRows(projectArrow([[[0, 0], [1, 0], [1, 0.5], [0, 0.5]]]))
    const far = topFaceRows(projectArrow([[[0, 0.5], [1, 0.5], [1, 1], [0, 1]]]))
    expect(near.length).toBeGreaterThan(0)
    expect(far.length).toBeGreaterThan(0)
    expect(Math.min(...near)).toBeGreaterThan(Math.max(...far))
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
    expect(countMatches(svg, `fill="${FOREGROUND}"`)).toBe(1)
    expect(countMatches(svg, `fill="${BACKGROUND}"`)).toBe(8)
  })

  it('places the fill rect at the filled pixel position', () => {
    const svg = decodeSvg(pixelMapToCursor(singlePixelMap(), 'pointer'))
    expect(svg).toContain(`<rect x="8" y="8" width="1" height="1" fill="${FOREGROUND}"/>`)
  })

  it('colours top face, side face and outline pixels from the palette', () => {
    const map = blankMap()
    map[7] = '.'.repeat(8) + '#' + '.'.repeat(7)
    map[8] = '.'.repeat(8) + '+' + '.'.repeat(7)
    const svg = decodeSvg(pixelMapToCursor(map, 'pointer'))
    expect(countMatches(svg, `fill="${FOREGROUND}"`)).toBe(1)
    expect(countMatches(svg, `fill="${FOREGROUND_WORN}"`)).toBe(1)
    expect(countMatches(svg, `fill="${BACKGROUND}"`)).toBe(10)
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
