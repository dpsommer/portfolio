import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import App from './App.tsx'

describe('App', () => {
  it('renders the dungeon view canvas', () => {
    render(<App />)

    const view = screen.getByRole('img', { name: 'Dungeon view' })
    expect(view.tagName).toBe('CANVAS')
  })
})
