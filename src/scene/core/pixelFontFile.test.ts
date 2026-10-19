/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { parse } from 'opentype.js'
import type { Glyph, PathCommand } from 'opentype.js'
import { describe, expect, it } from 'vitest'
import { GLYPHS, GLYPH_HEIGHT, GLYPH_WIDTH } from './pixelFont.ts'

// The committed web font (built by scripts/build-pixel-font.mjs) must match the
// glyphs the canvases draw with, so page text looks like scene text.
// Relative to the project root, where Vitest runs (as the build script writes it).
const FONT_FILE = 'src/assets/pixel-font.otf'
const PIXEL = 100

function loadFont() {
  const file = readFileSync(FONT_FILE)
  return parse(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength))
}

const font = loadFont()
const CHARS = Object.keys(GLYPHS)

type Point = { x: number; y: number }

// The outline's contours, as the points each one passes through.
function contoursOf(glyph: Glyph): Point[][] {
  const contours: Point[][] = []
  let current: Point[] = []
  for (const command of glyph.path.commands as PathCommand[]) {
    if (command.type === 'M') {
      if (current.length > 0) contours.push(current)
      current = [{ x: command.x, y: command.y }]
    } else if (command.type === 'Z') {
      contours.push(current)
      current = []
    } else {
      current.push({ x: command.x, y: command.y })
    }
  }
  if (current.length > 0) contours.push(current)
  return contours
}

function boundsOf(points: Point[]) {
  const xs = points.map(({ x }) => x)
  const ys = points.map(({ y }) => y)
  return { left: Math.min(...xs), right: Math.max(...xs), bottom: Math.min(...ys), top: Math.max(...ys) }
}

// A glyph's outline read back as rows of '#' and '.', treating each contour as
// the rectangle it bounds. Font units run upwards, glyph rows downwards.
function rowsOf(glyph: Glyph): string[] {
  const filled = new Set<string>()
  for (const contour of contoursOf(glyph)) {
    const { left, right, bottom, top } = boundsOf(contour)
    for (let x = left / PIXEL; x < right / PIXEL; x++) {
      for (let y = GLYPH_HEIGHT - top / PIXEL; y < GLYPH_HEIGHT - bottom / PIXEL; y++) filled.add(`${x},${y}`)
    }
  }
  return Array.from({ length: GLYPH_HEIGHT }, (_, y) =>
    Array.from({ length: GLYPH_WIDTH }, (_, x) => (filled.has(`${x},${y}`) ? '#' : '.')).join(''),
  )
}

describe('pixel font file', () => {
  it('has 1000 units per em', () => {
    expect(font.unitsPerEm).toBe(1000)
  })

  it("is named 'Pixel'", () => {
    expect(font.getEnglishName('fontFamily')).toBe('Pixel')
  })

  it.each(CHARS)('has a glyph for %j', (char) => {
    const glyph = font.charToGlyph(char)

    expect(glyph.index).not.toBe(0)
    expect(glyph.unicode).toBe(char.codePointAt(0))
  })

  it.each(CHARS)('advances %j by six glyph pixels', (char) => {
    expect(font.charToGlyph(char).advanceWidth).toBe(600)
  })

  it.each(CHARS)('outlines %j with grid-aligned rectangles', (char) => {
    for (const contour of contoursOf(font.charToGlyph(char))) {
      const { left, right, bottom, top } = boundsOf(contour)
      for (const { x, y } of contour) {
        expect([left, right]).toContain(x)
        expect([bottom, top]).toContain(y)
      }
      for (const edge of [left, right, bottom, top]) expect(edge % PIXEL).toBe(0)
    }
  })

  it.each(CHARS)('fills the same pixels as glyph %j', (char) => {
    expect(rowsOf(font.charToGlyph(char))).toEqual(GLYPHS[char])
  })

  it.each(CHARS)('uses one rectangle per run of pixels in %j', (char) => {
    const runs = GLYPHS[char].reduce((count, row) => count + (row.match(/#+/g)?.length ?? 0), 0)

    expect(contoursOf(font.charToGlyph(char))).toHaveLength(runs)
  })
})
