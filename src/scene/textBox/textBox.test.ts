import { describe, expect, it } from 'vitest'
import { createFakeContext, toFills } from '../../test/fakeContext.ts'
import { expectOnCanvas, extent } from '../../test/pixels.ts'
import { BACKGROUND, FOREGROUND } from '../core/palette.ts'
import { SIGN_PAGES } from '../../ViewPane/signText.ts'
import { LOWER_PANEL_HEIGHT, LOWER_PANEL_WIDTH } from '../../ViewPane/ViewPane.tsx'
import { TEXT_MARGIN, drawTextBox, textBoxLayout, textBoxLines, textBoxPixels, wrapText } from './textBox.ts'

const WIDTH = LOWER_PANEL_WIDTH
const HEIGHT = LOWER_PANEL_HEIGHT
const LAYOUT = textBoxLayout(WIDTH, HEIGHT)

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

describe('textBoxLayout', () => {
  it('fits a full line of text across the panel inside the margins', () => {
    const pixels = textBoxPixels(WIDTH, HEIGHT, FULL_LINES.slice(0, 1), LAYOUT.charsPerLine, false)

    expect(extent(pixels).right).toBeLessThan(WIDTH - TEXT_MARGIN)
  })

  it('has no room for another character on a line', () => {
    const line = ['W'.repeat(LAYOUT.charsPerLine + 1)]
    const pixels = textBoxPixels(WIDTH, HEIGHT, line, line[0].length, false)

    expect(extent(pixels).right).toBeGreaterThanOrEqual(WIDTH - TEXT_MARGIN)
  })

  it('fits every line above the caret', () => {
    const text = textBoxPixels(WIDTH, HEIGHT, FULL_LINES, fullLength(FULL_LINES), false)
    const caret = textBoxPixels(WIDTH, HEIGHT, [], 0, true)

    expect(extent(text).bottom).toBeLessThan(extent(caret).top)
  })

  it('has no room for another line above the caret', () => {
    const lines = [...FULL_LINES, 'W']
    const text = textBoxPixels(WIDTH, HEIGHT, lines, fullLength(lines), false)
    const caret = textBoxPixels(WIDTH, HEIGHT, [], 0, true)

    expect(extent(text).bottom).toBeGreaterThanOrEqual(extent(caret).top)
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

  it('puts each line below the one before, starting at the left margin', () => {
    const first = textBoxPixels(WIDTH, HEIGHT, ['W'], 1, false)
    const firstKeys = new Set(first.map(({ x, y }) => `${x},${y}`))
    const second = textBoxPixels(WIDTH, HEIGHT, ['W', 'W'], 2, false).filter(({ x, y }) => !firstKeys.has(`${x},${y}`))

    expect(extent(second).left).toBe(TEXT_MARGIN)
    expect(extent(second).top).toBeGreaterThan(extent(first).bottom)
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
})
