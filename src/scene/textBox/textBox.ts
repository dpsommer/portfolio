import { drawPixels } from '../draw.ts'
import { FOREGROUND } from '../core/palette.ts'
import { GLYPH_HEIGHT, GLYPH_SPACING, GLYPH_WIDTH, textPixels } from '../core/pixelFont.ts'
import type { Pixel } from '../core/types.ts'
import { clearPanel } from '../panels/panelCanvas.ts'

// The lower panel doubles as a text box: text typed out from the top left,
// with a caret in the bottom right once a page is done.

// Text is drawn at this multiple of the font's size by default, inset by
// TEXT_MARGIN from the panel's edges, with LINE_GAP font pixels between lines.
// Longer text, like the About Me text, can be drawn at a smaller scale.
export const TEXT_SCALE = 2
export const TEXT_MARGIN = 18
const LINE_GAP = 3
const charAdvance = (scale: number) => (GLYPH_WIDTH + GLYPH_SPACING) * scale
const lineAdvance = (scale: number) => (GLYPH_HEIGHT + LINE_GAP) * scale

// A small down-pointing caret, drawn at TEXT_SCALE.
const CARET_MAP = ['#####', '.###.', '..#..']
const CARET_WIDTH = CARET_MAP[0].length * TEXT_SCALE
const CARET_HEIGHT = CARET_MAP.length * TEXT_SCALE

// How many characters fit on a line and how many lines fit above the caret,
// in a panel `width` by `height` pixels, with text at `scale`.
export function textBoxLayout(
  width: number,
  height: number,
  scale = TEXT_SCALE,
): { charsPerLine: number; lines: number } {
  return {
    charsPerLine: Math.floor((width - 2 * TEXT_MARGIN + GLYPH_SPACING * scale) / charAdvance(scale)),
    lines: Math.floor((height - 2 * TEXT_MARGIN - CARET_HEIGHT) / lineAdvance(scale)),
  }
}

// Splits `text` into lines of at most `maxChars`, breaking between words and
// at newlines. A word longer than a line is broken where it overflows.
export function wrapText(text: string, maxChars: number): string[] {
  // At least one character a line, or a long word would never get shorter.
  maxChars = Math.max(1, maxChars)
  const lines: string[] = []
  for (const paragraph of text.split('\n')) {
    let line = ''
    for (const word of paragraph.split(' ').filter((w) => w.length > 0)) {
      let rest = word
      if (line.length > 0 && line.length + 1 + rest.length <= maxChars) {
        line += ' ' + rest
        continue
      }
      if (line.length > 0) lines.push(line)
      while (rest.length > maxChars) {
        lines.push(rest.slice(0, maxChars))
        rest = rest.slice(maxChars)
      }
      line = rest
    }
    lines.push(line)
  }
  return lines
}

// The lines `page` is typed in, in a panel `width` pixels wide, at `scale`.
export function textBoxLines(width: number, page: string, scale = TEXT_SCALE): string[] {
  return wrapText(page, textBoxLayout(width, 0, scale).charsPerLine)
}

// Pixels for the first `shown` characters of `lines`, read left to right and
// top to bottom, at `scale`, plus the caret in the bottom right if `caretOn`.
export function textBoxPixels(
  width: number,
  height: number,
  lines: string[],
  shown: number,
  caretOn: boolean,
  scale = TEXT_SCALE,
): Pixel[] {
  const pixels: Pixel[] = []
  let remaining = shown
  lines.forEach((line, row) => {
    const typed = line.slice(0, Math.max(0, remaining))
    remaining -= line.length
    const top = TEXT_MARGIN + row * lineAdvance(scale)
    for (const { x, y } of textPixels(typed, scale)) {
      pixels.push({ x: TEXT_MARGIN + x, y: top + y, colour: FOREGROUND })
    }
  })
  if (caretOn) {
    const left = width - TEXT_MARGIN - CARET_WIDTH
    const top = height - TEXT_MARGIN - CARET_HEIGHT
    CARET_MAP.forEach((row, cy) => {
      row.split('').forEach((cell, cx) => {
        if (cell !== '#') return
        for (let sy = 0; sy < TEXT_SCALE; sy++) {
          for (let sx = 0; sx < TEXT_SCALE; sx++) {
            pixels.push({ x: left + cx * TEXT_SCALE + sx, y: top + cy * TEXT_SCALE + sy, colour: FOREGROUND })
          }
        }
      })
    })
  }
  return pixels
}

// Draws the text box over the whole panel: the background, then the first
// `shown` characters of `lines` at `scale` and, if `caretOn`, the caret.
export function drawTextBox(
  ctx: CanvasRenderingContext2D,
  lines: string[],
  shown: number,
  caretOn: boolean,
  scale = TEXT_SCALE,
) {
  const { width, height } = ctx.canvas
  clearPanel(ctx)
  drawPixels(ctx, textBoxPixels(width, height, lines, shown, caretOn, scale))
}
