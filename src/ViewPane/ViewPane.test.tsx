import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import ViewPane, { VIEW_HEIGHT, VIEW_WIDTH } from './ViewPane.tsx'

describe('ViewPane', () => {
  it('renders an image with the accessible name "Dungeon view"', () => {
    render(<ViewPane />)

    expect(screen.getByRole('img', { name: 'Dungeon view' })).toBeInTheDocument()
  })

  it('renders a canvas element', () => {
    render(<ViewPane />)

    expect(screen.getByRole('img').tagName).toBe('CANVAS')
  })

  it('sets the canvas drawing resolution from the exported constants', () => {
    render(<ViewPane />)

    const canvas = screen.getByRole('img')
    expect(canvas).toHaveAttribute('width', String(VIEW_WIDTH))
    expect(canvas).toHaveAttribute('height', String(VIEW_HEIGHT))
  })

  it('uses a 320x240 drawing resolution', () => {
    expect(VIEW_WIDTH).toBe(320)
    expect(VIEW_HEIGHT).toBe(240)
  })

  it('has the view-pane class', () => {
    render(<ViewPane />)

    expect(screen.getByRole('img')).toHaveClass('view-pane')
  })
})
