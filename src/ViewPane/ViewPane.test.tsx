import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { CURSORS } from './cursors.ts'
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

  describe('drawing', () => {
    it('draws the scene background on mount', () => {
      const fakeCtx = {
        fillStyle: '',
        canvas: { width: VIEW_WIDTH, height: VIEW_HEIGHT },
        fillRect: vi.fn(),
      }
      // spyOn returns the existing setup.ts spy; mockReturnValueOnce leaves its
      // null default in place for other tests (mockRestore would remove it).
      const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext')
      getContext.mockReturnValueOnce(fakeCtx as unknown as CanvasRenderingContext2D)

      render(<ViewPane />)

      expect(getContext).toHaveBeenLastCalledWith('2d')
      expect(fakeCtx.fillRect).toHaveBeenCalledWith(0, 0, VIEW_WIDTH, VIEW_HEIGHT)
    })

    it('renders without throwing when no canvas context is available', () => {
      expect(() => render(<ViewPane />)).not.toThrow()
      expect(screen.getByRole('img')).toBeInTheDocument()
    })
  })

  describe('cursor', () => {
    function renderWithRect(left: number, width: number) {
      render(<ViewPane />)
      const canvas = screen.getByRole('img')
      vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue(
        new DOMRect(left, 0, width, 300),
      )
      return canvas
    }

    it('defaults to the forward cursor', () => {
      render(<ViewPane />)

      expect(screen.getByRole('img').style.cursor).toBe(CURSORS.forward)
    })

    it.each([
      [110, 'turn-left'],
      [300, 'forward'],
      [490, 'turn-right'],
    ] as const)('at clientX %s uses the %s cursor', (clientX, zone) => {
      const canvas = renderWithRect(100, 400)

      fireEvent.mouseMove(canvas, { clientX })

      expect(canvas.style.cursor).toBe(CURSORS[zone])
    })

    it('returns to the forward cursor after leaving an edge zone', () => {
      const canvas = renderWithRect(100, 400)

      fireEvent.mouseMove(canvas, { clientX: 110 })
      fireEvent.mouseMove(canvas, { clientX: 300 })

      expect(canvas.style.cursor).toBe(CURSORS.forward)
    })

    it('ignores mouse moves when the canvas has zero width', () => {
      // Without the guard, (600 - 100) / 0 is Infinity and would select turn-right.
      const canvas = renderWithRect(100, 0)

      fireEvent.mouseMove(canvas, { clientX: 600 })

      expect(canvas.style.cursor).toBe(CURSORS.forward)
    })
  })
})
