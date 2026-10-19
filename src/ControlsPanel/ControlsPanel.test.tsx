import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { textPixels } from '../scene/core/pixelFont.ts'
import ControlsPanel from './ControlsPanel.tsx'
import { CONTROLS } from './controls.ts'

const KEYS = CONTROLS.flatMap(({ keys }) => keys)

// The text of `element` as seen, leaving out text only screen readers get.
function shownText(element: Element): string {
  const copy = element.cloneNode(true) as Element
  copy.querySelectorAll('.controls-panel-hidden').forEach((hidden) => hidden.remove())
  return copy.textContent ?? ''
}

// The text of `element` as read by a screen reader, leaving out what's hidden from it.
function readText(element: Element): string {
  const copy = element.cloneNode(true) as Element
  copy.querySelectorAll('[aria-hidden="true"]').forEach((hidden) => hidden.remove())
  return copy.textContent ?? ''
}

function renderPanel() {
  render(<ControlsPanel />)
  return screen.getByRole('complementary', { name: 'Controls' })
}

describe('ControlsPanel', () => {
  it('is a complementary landmark named by its "Controls" heading', () => {
    const panel = renderPanel()

    expect(within(panel).getByRole('heading', { level: 2 })).toHaveTextContent('Controls')
  })

  it('lists each control in order as its keys, joined by "/", then its action', () => {
    const panel = renderPanel()

    const terms = within(panel).getAllByRole('term')
    const definitions = within(panel).getAllByRole('definition')
    expect(terms.map(shownText)).toEqual(CONTROLS.map(({ keys }) => keys.map(({ label }) => label).join('/')))
    expect(definitions.map((definition) => definition.textContent)).toEqual(CONTROLS.map(({ action }) => action))
  })

  it('groups each term with its description in its own div of the list', () => {
    const panel = renderPanel()

    for (const term of within(panel).getAllByRole('term')) {
      const group = term.parentElement
      expect(group?.tagName).toBe('DIV')
      expect(group?.parentElement?.tagName).toBe('DL')
      expect(Array.from(group?.children ?? [], (child) => child.tagName)).toEqual(['DT', 'DD'])
    }
  })

  it('shows each key as a kbd element', () => {
    const panel = renderPanel()

    const kbds = Array.from(panel.querySelectorAll('kbd'), shownText)
    expect(kbds).toEqual(KEYS.map(({ label }) => label))
  })

  it('reads each key by its name if it has one, otherwise by its label', () => {
    const panel = renderPanel()

    const kbds = Array.from(panel.querySelectorAll('kbd'), readText)
    expect(kbds).toEqual(KEYS.map(({ label, name }) => name ?? label))
  })

  // A <kbd> has no role, so an aria-label on it isn't reliably read.
  it('names keys with hidden text rather than aria-label', () => {
    const panel = renderPanel()

    expect(panel.querySelectorAll('[aria-label]')).toHaveLength(0)
  })

  // The page font is built from the canvas glyphs, so any other character
  // would fall back to another font.
  it('has a pixel font glyph for every character the panel shows', () => {
    const panel = renderPanel()

    expect(() => textPixels(panel.textContent ?? '')).not.toThrow()
  })
})
