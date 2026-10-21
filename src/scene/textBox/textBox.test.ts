import { describe, expect, it } from 'vitest'
import { createFakeContext, toFills } from '../../test/fakeContext.ts'
import { expectOnCanvas, extent } from '../../test/pixels.ts'
import { BACKGROUND, FOREGROUND } from '../core/palette.ts'
import { GLYPH_HEIGHT, textPixels } from '../core/pixelFont.ts'
import { ABOUT_TEXT } from '../character/aboutText.ts'
import { SIGN_PAGES } from '../sign/signText.ts'
import { LOWER_PANEL_HEIGHT, LOWER_PANEL_WIDTH } from '../../ViewPane/ViewPane.tsx'
import { TEXT_MARGIN, drawTextBox, textBoxLayout, textBoxLines, textBoxPixels, wrapText } from './textBox.ts'

const WIDTH = LOWER_PANEL_WIDTH
const HEIGHT = LOWER_PANEL_HEIGHT
const LAYOUT = textBoxLayout(WIDTH, HEIGHT)

// Font pixels between lines, at any scale.
const LINE_GAP = 3

// The panel filled with as much text as its layout allows.
const FULL_LINES = Array.from({ length: LAYOUT.lines }, () => 'W'.repeat(LAYOUT.charsPerLine))
const fullLength = (lines: string[]) => lines.join('').length

describe('wrapText', () => {
  it.each<[string, string, number, string[]]>([
    ['keeps text that fits on one line', 'hello world', 20, ['hello world']],
    ['fits words that exactly fill a line', 'ab cd', 5, ['ab cd']],
    ['breaks between words', 'hello big world', 9, ['hello big', 'world']],
    ['starts a new line at a newline', 'one\ntwo', 20, ['one', 'two']],
    ['keeps blank lines', 'one\n\ntwo', 20, ['one', '', 'two']],
    ['collapses runs of spaces', 'a   b', 20, ['a b']],
    ['breaks a word longer than a line where it overflows', 'abcdefghij', 4, ['abcd', 'efgh', 'ij']],
    ['starts a long word on a new line before breaking it', 'hi abcdefghij', 4, ['hi', 'abcd', 'efgh', 'ij']],
    ['carries on after a broken word', 'abcdef gh', 4, ['abcd', 'ef', 'gh']],
    ['gives one empty line for empty text', '', 10, ['']],
  ])('%s', (_, text, maxChars, lines) => {
    expect(wrapText(text, maxChars)).toEqual(lines)
  })

  it.each([5, 12, 25])('never makes a line longer than %s characters', (maxChars) => {
    const text = 'The quick brown fox jumps over the extraordinarily lazy dog\nagain and again'
    for (const line of wrapText(text, maxChars)) expect(line.length).toBeLessThanOrEqual(maxChars)
  })
})

// The default scale (the sign's), and the font's own size (the About Me text's).
const SCALES: [string, number | undefined][] = [
  ['at the default scale', undefined],
  ['at scale 1', 1],
]

describe.each(SCALES)('textBoxLayout %s', (_, scale) => {
  const layout = textBoxLayout(WIDTH, HEIGHT, scale)
  const fullLines = Array.from({ length: layout.lines }, () => 'W'.repeat(layout.charsPerLine))
  const pixels = (lines: string[], shown: number, caretOn: boolean) =>
    textBoxPixels(WIDTH, HEIGHT, lines, shown, caretOn, scale)

  it('fits a full line of text across the panel inside the margins', () => {
    expect(extent(pixels(fullLines.slice(0, 1), layout.charsPerLine, false)).right).toBeLessThan(WIDTH - TEXT_MARGIN)
  })

  it('has no room for another character on a line', () => {
    const line = ['W'.repeat(layout.charsPerLine + 1)]

    expect(extent(pixels(line, line[0].length, false)).right).toBeGreaterThanOrEqual(WIDTH - TEXT_MARGIN)
  })

  it('fits every line above the caret', () => {
    const text = pixels(fullLines, fullLength(fullLines), false)

    expect(extent(text).bottom).toBeLessThan(extent(pixels([], 0, true)).top)
  })

  it('has no room for another line above the caret', () => {
    const lines = [...fullLines, 'W']
    const text = pixels(lines, fullLength(lines), false)

    expect(extent(text).bottom).toBeGreaterThanOrEqual(extent(pixels([], 0, true)).top)
  })
})

describe('textBoxLayout at scale 1', () => {
  it('fits more characters and lines than the default', () => {
    const small = textBoxLayout(WIDTH, HEIGHT, 1)

    expect(small.charsPerLine).toBeGreaterThan(LAYOUT.charsPerLine)
    expect(small.lines).toBeGreaterThan(LAYOUT.lines)
  })
})

describe('textBoxLines', () => {
  it('wraps a page to the panel width', () => {
    const page = 'word '.repeat(20).trim()

    expect(textBoxLines(WIDTH, page)).toEqual(wrapText(page, LAYOUT.charsPerLine))
  })

  it.each(SIGN_PAGES)('fits the sign page %j in the lower panel', (page) => {
    expect(textBoxLines(WIDTH, page).length).toBeLessThanOrEqual(LAYOUT.lines)
  })

  it('wraps a page to the panel width at scale 1', () => {
    const page = 'word '.repeat(40).trim()

    expect(textBoxLines(WIDTH, page, 1)).toEqual(wrapText(page, textBoxLayout(WIDTH, 0, 1).charsPerLine))
  })

  it('fits the About Me text in the lower panel at scale 1', () => {
    expect(textBoxLines(WIDTH, ABOUT_TEXT, 1).length).toBeLessThanOrEqual(textBoxLayout(WIDTH, HEIGHT, 1).lines)
  })
})

describe('textBoxPixels', () => {
  it('draws nothing with nothing shown and the caret off', () => {
    expect(textBoxPixels(WIDTH, HEIGHT, ['Hello'], 0, false)).toEqual([])
  })

  it('draws in the foreground colour', () => {
    const pixels = textBoxPixels(WIDTH, HEIGHT, ['Hello'], 5, true)

    expect(pixels.every(({ colour }) => colour === FOREGROUND)).toBe(true)
  })

  it.each<[string, number, boolean]>([
    ['part of the text', 3, false],
    ['all the text', 1000, false],
    ['the full panel of text and the caret', fullLength(FULL_LINES), true],
  ])('keeps %s on the canvas', (_, shown, caretOn) => {
    expectOnCanvas(textBoxPixels(WIDTH, HEIGHT, FULL_LINES, shown, caretOn), WIDTH, HEIGHT)
  })

  it('starts the text at the top left margin', () => {
    const { left, top } = extent(textBoxPixels(WIDTH, HEIGHT, ['W'], 1, false))

    expect({ left, top }).toEqual({ left: TEXT_MARGIN, top: TEXT_MARGIN })
  })

  it.each<[string, string[], number, string[]]>([
    ['the first characters of a line', ['Hello'], 2, ['He']],
    ['on into the next line', ['Hello', 'there'], 7, ['Hello', 'th']],
    ['every line when shown is past the end', ['Hello', 'there'], 99, ['Hello', 'there']],
    ['nothing when shown is negative', ['Hello'], -1, ['']],
  ])('shows %s', (_, lines, shown, typed) => {
    expect(textBoxPixels(WIDTH, HEIGHT, lines, shown, false)).toEqual(
      textBoxPixels(WIDTH, HEIGHT, typed, fullLength(typed), false),
    )
  })

  it('draws the caret in the bottom right, inside the margins', () => {
    const { right, bottom } = extent(textBoxPixels(WIDTH, HEIGHT, [], 0, true))

    expect({ right, bottom }).toEqual({ right: WIDTH - TEXT_MARGIN - 1, bottom: HEIGHT - TEXT_MARGIN - 1 })
  })

  it('adds the caret to the text only when it is on', () => {
    const text = textBoxPixels(WIDTH, HEIGHT, ['Hello'], 5, false)
    const caret = textBoxPixels(WIDTH, HEIGHT, [], 0, true)

    expect(textBoxPixels(WIDTH, HEIGHT, ['Hello'], 5, true)).toEqual([...text, ...caret])
  })

  it.each([2, 1])('puts the second line a glyph\'s height plus a gap below the first at scale %s', (scale) => {
    const top = TEXT_MARGIN + (GLYPH_HEIGHT + LINE_GAP) * scale
    const expected = textPixels('Hi', scale).map(({ x, y }) => ({ x: TEXT_MARGIN + x, y: top + y, colour: FOREGROUND }))

    expect(textBoxPixels(WIDTH, HEIGHT, ['', 'Hi'], 2, false, scale)).toEqual(expected)
  })

  it('draws the same caret at scale 1 as by default', () => {
    expect(textBoxPixels(WIDTH, HEIGHT, [], 0, true, 1)).toEqual(textBoxPixels(WIDTH, HEIGHT, [], 0, true))
  })
})

describe('drawTextBox', () => {
  it.each<[string, string[], number, boolean, number, number]>([
    ['part way through typing', ['Hello', 'there'], 3, false, WIDTH, HEIGHT],
    ['with the page typed and the caret on', ['Hello', 'there'], 10, true, WIDTH, HEIGHT],
    ['with nothing typed', ['Hello'], 0, false, WIDTH, HEIGHT],
    ['on a smaller canvas', ['Hi'], 2, true, 100, 40],
  ])('draws the background, then the text box pixels, %s', (_, lines, shown, caretOn, width, height) => {
    const { ctx, fills } = createFakeContext(width, height)

    drawTextBox(ctx, lines, shown, caretOn)

    expect(fills).toEqual([
      { args: [0, 0, width, height], fillStyle: BACKGROUND },
      ...toFills(textBoxPixels(width, height, lines, shown, caretOn)),
    ])
  })

  it('draws the text at the scale given', () => {
    const { ctx, fills } = createFakeContext(WIDTH, HEIGHT)

    drawTextBox(ctx, ['Hello', 'there'], 10, false, 1)

    expect(fills).toEqual([
      { args: [0, 0, WIDTH, HEIGHT], fillStyle: BACKGROUND },
      ...toFills(textBoxPixels(WIDTH, HEIGHT, ['Hello', 'there'], 10, false, 1)),
    ])
  })
})
