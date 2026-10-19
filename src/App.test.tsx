import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import App from './App.tsx'

describe('App', () => {
  it('renders the dungeon view canvas', () => {
    render(<App />)

    const view = screen.getByRole('img', { name: 'Dungeon view' })
    expect(view.tagName).toBe('CANVAS')
  })

  it('puts the view pane then the controls panel inside the main landmark', () => {
    render(<App />)

    const main = screen.getByRole('main')
    const view = within(main).getByRole('img', { name: 'Dungeon view' })
    const controls = within(main).getByRole('complementary', { name: 'Controls' })
    expect(view.compareDocumentPosition(controls) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})
