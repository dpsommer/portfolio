// 5×7 bitmap glyphs. Canvas text is anti-aliased, which looks wrong when scaled up
// with `image-rendering: pixelated`, so text is drawn pixel by pixel instead.
// Add glyphs here as new text is needed.
export const GLYPH_WIDTH = 5
export const GLYPH_HEIGHT = 7
export const GLYPH_SPACING = 1

const GLYPHS: Record<string, string[]> = {
  C: ['.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  M: ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
  N: ['#...#', '#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  S: ['.###.', '#...#', '#....', '.###.', '....#', '#...#', '.###.'],
  W: ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '##.##', '#...#'],
}

export function textWidth(text: string, scale = 1): number {
  if (text.length === 0) return 0
  return (text.length * (GLYPH_WIDTH + GLYPH_SPACING) - GLYPH_SPACING) * scale
}

// Returns the filled pixel positions of `text`, with its top-left corner at (0, 0).
export function textPixels(text: string, scale = 1): { x: number; y: number }[] {
  const pixels: { x: number; y: number }[] = []
  text.split('').forEach((char, index) => {
    const glyph = GLYPHS[char]
    if (!glyph) throw new Error(`No pixel font glyph for "${char}"`)
    const originX = index * (GLYPH_WIDTH + GLYPH_SPACING) * scale
    glyph.forEach((row, gy) => {
      row.split('').forEach((cell, gx) => {
        if (cell !== '#') return
        for (let sy = 0; sy < scale; sy++) {
          for (let sx = 0; sx < scale; sx++) {
            pixels.push({ x: originX + gx * scale + sx, y: gy * scale + sy })
          }
        }
      })
    })
  })
  return pixels
}
