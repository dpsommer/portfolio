// Builds the pixel font used for page text (src/assets/pixel-font.otf) from
// the 5×7 glyphs the canvases draw with, so HTML text matches the scene.
// Run with `npm run build:font` after changing a glyph in pixelFont.ts.
import { writeFileSync } from 'node:fs'
import opentype from 'opentype.js'
import { GLYPHS, GLYPH_HEIGHT, GLYPH_SPACING, GLYPH_WIDTH } from '../src/scene/core/pixelFont.ts'

const OUTPUT = 'src/assets/pixel-font.otf'
// Each glyph pixel is a PIXEL-unit square, so a glyph pixel is 0.1 em.
const PIXEL = 100
const UNITS_PER_EM = 1000
const ADVANCE = (GLYPH_WIDTH + GLYPH_SPACING) * PIXEL

// A glyph's outline: one rectangle per run of filled pixels in each row, so
// neighbouring pixels don't leave hairline seams.
function glyphPath(rows) {
  const path = new opentype.Path()
  rows.forEach((row, y) => {
    const top = (GLYPH_HEIGHT - y) * PIXEL
    const bottom = top - PIXEL
    for (const match of row.matchAll(/#+/g)) {
      const left = match.index * PIXEL
      const right = left + match[0].length * PIXEL
      // Clockwise, as CFF outlines expect for filled shapes.
      path.moveTo(left, bottom)
      path.lineTo(left, top)
      path.lineTo(right, top)
      path.lineTo(right, bottom)
      path.close()
    }
  })
  return path
}

const notdef = new opentype.Glyph({ name: '.notdef', unicode: 0, advanceWidth: ADVANCE, path: new opentype.Path() })
const glyphs = Object.entries(GLYPHS).map(
  ([char, rows]) =>
    new opentype.Glyph({
      name: `uni${char.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}`,
      unicode: char.codePointAt(0),
      advanceWidth: ADVANCE,
      path: glyphPath(rows),
    }),
)

// opentype.js stamps the font with the current time; pin it so rebuilding
// unchanged glyphs gives an identical file.
const BUILT_AT = Date.UTC(2026, 0, 1)
globalThis.Date = class extends Date {
  constructor(...args) {
    super(...(args.length > 0 ? args : [BUILT_AT]))
  }
}

const font = new opentype.Font({
  familyName: 'Pixel',
  styleName: 'Regular',
  unitsPerEm: UNITS_PER_EM,
  ascender: GLYPH_HEIGHT * PIXEL,
  descender: -PIXEL,
  glyphs: [notdef, ...glyphs],
  createdTimestamp: BUILT_AT / 1000,
})
writeFileSync(OUTPUT, Buffer.from(font.toArrayBuffer()))
console.log(`Wrote ${glyphs.length} glyphs to ${OUTPUT}`)
