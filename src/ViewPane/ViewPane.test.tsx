import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MockInstance } from 'vitest'
import { drawScene } from '../scene/draw.ts'
import { FOREGROUND } from '../scene/palette.ts'
import { PLACES } from '../scene/places.ts'
import { BLOCKED_CURSOR, CURSORS, HAND_CURSOR } from './cursors.ts'
import ViewPane, { MOVE_DURATION_MS, TURN_DURATION_MS, VIEW_HEIGHT, VIEW_WIDTH } from './ViewPane.tsx'

// Client positions in the left, centre and right zones of a 320x240 pane at (0, 0).
const LEFT_X = 10
const CENTRE_X = 160
const RIGHT_X = 310
const MIDDLE_Y = 120
// Over the sign's board, away from the post.
const SIGN_X = 130
const SIGN_Y = 120

// Renders the pane with its on-screen rect at (0, 0), the same size as the canvas.
function renderPane() {
  const result = render(<ViewPane />)
  const canvas = screen.getByRole('img')
  const getRect = vi.spyOn(canvas, 'getBoundingClientRect')
  getRect.mockReturnValue(new DOMRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT))
  return { ...result, canvas, getRect }
}

function clickAt(canvas: HTMLElement, clientX: number, clientY = MIDDLE_Y) {
  fireEvent.click(canvas, { clientX, clientY })
}

function createFakeContext() {
  const ctx = {
    fillStyle: '',
    canvas: { width: VIEW_WIDTH, height: VIEW_HEIGHT },
    fillRect: vi.fn(),
  }
  return ctx
}

// Makes getContext return `ctx` until the afterEach below puts back the setup's null.
function provideContext(ctx: ReturnType<typeof createFakeContext>) {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    ctx as unknown as CanvasRenderingContext2D,
  )
}

// A manual requestAnimationFrame: callbacks queue up until flushed with a timestamp.
function stubAnimationFrames() {
  let nextId = 1
  const queue = new Map<number, FrameRequestCallback>()
  const requestAnimationFrame = vi.fn((callback: FrameRequestCallback) => {
    const id = nextId++
    queue.set(id, callback)
    return id
  })
  const cancelAnimationFrame = vi.fn((id: number) => {
    queue.delete(id)
  })
  vi.stubGlobal('requestAnimationFrame', requestAnimationFrame)
  vi.stubGlobal('cancelAnimationFrame', cancelAnimationFrame)
  // Runs the frames queued so far at time `now`.
  const flush = (now: number) => {
    const callbacks = [...queue.values()]
    queue.clear()
    act(() => {
      for (const callback of callbacks) callback(now)
    })
  }
  return { requestAnimationFrame, cancelAnimationFrame, flush, pending: () => queue.size }
}

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

    it('defaults to the blocked cursor, since there\'s no way forward from the start facing north', () => {
      render(<ViewPane />)

      expect(screen.getByRole('img').style.cursor).toBe(BLOCKED_CURSOR)
    })

    it.each([
      [110, 'turn-left', CURSORS['turn-left']],
      [300, 'blocked', BLOCKED_CURSOR],
      [490, 'turn-right', CURSORS['turn-right']],
    ] as const)('at clientX %s facing north uses the %s cursor', (clientX, _, cursor) => {
      const canvas = renderWithRect(100, 400)

      fireEvent.mouseMove(canvas, { clientX })

      expect(canvas.style.cursor).toBe(cursor)
    })

    it('uses the forward cursor in the centre facing west, towards the nook', () => {
      const canvas = renderWithRect(100, 400)
      fireEvent.click(canvas, { clientX: 110, clientY: 100 })

      fireEvent.mouseMove(canvas, { clientX: 300 })

      expect(canvas.style.cursor).toBe(CURSORS.forward)
    })

    it('returns to the blocked cursor after leaving an edge zone facing north', () => {
      const canvas = renderWithRect(100, 400)

      fireEvent.mouseMove(canvas, { clientX: 110 })
      fireEvent.mouseMove(canvas, { clientX: 300 })

      expect(canvas.style.cursor).toBe(BLOCKED_CURSOR)
    })

    it('returns to the forward cursor after leaving an edge zone facing west', () => {
      const canvas = renderWithRect(100, 400)
      fireEvent.click(canvas, { clientX: 110, clientY: 100 })

      fireEvent.mouseMove(canvas, { clientX: 110 })
      fireEvent.mouseMove(canvas, { clientX: 300 })

      expect(canvas.style.cursor).toBe(CURSORS.forward)
    })

    it('ignores mouse moves when the canvas has zero width', () => {
      // Without the guard, (600 - 100) / 0 is Infinity and would select turn-right.
      const canvas = renderWithRect(100, 0)

      fireEvent.mouseMove(canvas, { clientX: 600 })

      expect(canvas.style.cursor).toBe(BLOCKED_CURSOR)
    })
  })

  describe('sign cursor', () => {
    // Renders the pane with its on-screen rect at the given position and size.
    function renderAt(left: number, top: number, width: number, height: number) {
      render(<ViewPane />)
      const canvas = screen.getByRole('img')
      const getRect = vi.spyOn(canvas, 'getBoundingClientRect')
      getRect.mockReturnValue(new DOMRect(left, top, width, height))
      return { canvas, getRect }
    }

    it('shows the hand over the centre of the sign', () => {
      const { canvas } = renderAt(0, 0, 320, 240)

      fireEvent.mouseMove(canvas, { clientX: 160, clientY: 120 })

      expect(canvas.style.cursor).toBe(HAND_CURSOR)
    })

    it('shows the hand over the sign when the pane is scaled and offset', () => {
      const { canvas } = renderAt(50, 30, 640, 480)

      fireEvent.mouseMove(canvas, { clientX: 50 + 160 * 2, clientY: 30 + 120 * 2 })

      expect(canvas.style.cursor).toBe(HAND_CURSOR)
    })

    it('does not show the hand at the unscaled sign position when the pane is scaled', () => {
      // (110, 100) is over the sign at 320x240 but maps to canvas (55, 50) at 640x480,
      // which is left of the sign in the forward zone.
      const { canvas } = renderAt(0, 0, 640, 480)

      fireEvent.mouseMove(canvas, { clientX: 110, clientY: 100 })

      expect(canvas.style.cursor).toBe(BLOCKED_CURSOR)
    })

    it.each([
      ['above', 160, 50, BLOCKED_CURSOR],
      ['below', 160, 200, BLOCKED_CURSOR],
      ['left of', 40, 120, CURSORS['turn-left']],
      ['right of', 300, 120, CURSORS['turn-right']],
    ] as const)('returns to the zone cursor when moving %s the sign', (_, clientX, clientY, cursor) => {
      const { canvas } = renderAt(0, 0, 320, 240)

      fireEvent.mouseMove(canvas, { clientX: 160, clientY: 120 })
      fireEvent.mouseMove(canvas, { clientX, clientY })

      expect(canvas.style.cursor).toBe(cursor)
    })

    // At 640x480 each canvas pixel is 2 client pixels, so odd client
    // coordinates land half-way through a canvas pixel. Bounds are
    // left 100, top 95, right 219, bottom 144 (inclusive).
    it.each([
      ['left', 200, 240],
      ['right', 439, 240],
      ['top', 320, 190],
      ['bottom', 320, 289],
    ])('shows the hand just inside the %s edge', (_, clientX, clientY) => {
      const { canvas } = renderAt(0, 0, 640, 480)

      fireEvent.mouseMove(canvas, { clientX, clientY })

      expect(canvas.style.cursor).toBe(HAND_CURSOR)
    })

    it.each([
      ['left', 199, 240],
      ['right', 440, 240],
      ['top', 320, 189],
      ['bottom', 320, 290],
    ])('does not show the hand just outside the %s edge', (_, clientX, clientY) => {
      const { canvas } = renderAt(0, 0, 640, 480)

      fireEvent.mouseMove(canvas, { clientX, clientY })

      expect(canvas.style.cursor).not.toBe(HAND_CURSOR)
    })

    it('ignores mouse moves when the canvas has zero height', () => {
      const { canvas, getRect } = renderAt(0, 0, 320, 240)
      fireEvent.mouseMove(canvas, { clientX: 160, clientY: 120 })

      // Without the guard, clientX 10 would select the turn-left cursor.
      getRect.mockReturnValue(new DOMRect(0, 0, 320, 0))
      fireEvent.mouseMove(canvas, { clientX: 10, clientY: 120 })

      expect(canvas.style.cursor).toBe(HAND_CURSOR)
    })

    it('ignores mouse moves when the canvas has zero width', () => {
      const { canvas, getRect } = renderAt(0, 0, 320, 240)
      fireEvent.mouseMove(canvas, { clientX: 160, clientY: 120 })

      getRect.mockReturnValue(new DOMRect(0, 0, 0, 240))
      fireEvent.mouseMove(canvas, { clientX: 10, clientY: 120 })

      expect(canvas.style.cursor).toBe(HAND_CURSOR)
    })
  })

  describe('turning', () => {
    afterEach(() => {
      vi.unstubAllGlobals()
    })

    it('starts facing north', () => {
      renderPane()

      expect(screen.getByRole('img')).toHaveAttribute('data-heading', 'north')
    })

    it('turns left to face west when the left zone is clicked', () => {
      const { canvas } = renderPane()

      clickAt(canvas, LEFT_X)

      expect(canvas).toHaveAttribute('data-heading', 'west')
    })

    it('keeps turning left with each click', () => {
      const { canvas } = renderPane()

      clickAt(canvas, LEFT_X)
      clickAt(canvas, LEFT_X)

      expect(canvas).toHaveAttribute('data-heading', 'south')
    })

    it('turns right to face east when the right zone is clicked', () => {
      const { canvas } = renderPane()

      clickAt(canvas, RIGHT_X)

      expect(canvas).toHaveAttribute('data-heading', 'east')
    })

    it('comes back to north after turning left then right', () => {
      const { canvas } = renderPane()

      clickAt(canvas, LEFT_X)
      clickAt(canvas, RIGHT_X)

      expect(canvas).toHaveAttribute('data-heading', 'north')
    })

    it('does not turn when the centre is clicked', () => {
      const { canvas } = renderPane()

      clickAt(canvas, CENTRE_X)

      expect(canvas).toHaveAttribute('data-heading', 'north')
    })

    it('uses the pane\'s on-screen size to find the zone', () => {
      const { canvas, getRect } = renderPane()
      getRect.mockReturnValue(new DOMRect(100, 50, 640, 480))

      // On a 640px pane at x 100, client x 300 is 31% across (centre) and 110 is 2% (left).
      clickAt(canvas, 300)
      expect(canvas).toHaveAttribute('data-heading', 'north')
      clickAt(canvas, 110)
      expect(canvas).toHaveAttribute('data-heading', 'west')
    })

    it.each([
      ['width', new DOMRect(0, 0, 0, VIEW_HEIGHT)],
      ['height', new DOMRect(0, 0, VIEW_WIDTH, 0)],
    ])('ignores clicks when the canvas has zero %s', (_, rect) => {
      const { canvas, getRect } = renderPane()
      getRect.mockReturnValue(rect)

      clickAt(canvas, LEFT_X)

      expect(canvas).toHaveAttribute('data-heading', 'north')
    })

    it('does not request animation frames without a canvas context', () => {
      const frames = stubAnimationFrames()
      const { canvas } = renderPane()

      clickAt(canvas, LEFT_X)

      expect(frames.requestAnimationFrame).not.toHaveBeenCalled()
    })
  })

  describe('turn animation', () => {
    const START = 1000
    let ctx: ReturnType<typeof createFakeContext>
    let frames: ReturnType<typeof stubAnimationFrames>
    let now: MockInstance<() => number>

    beforeEach(() => {
      ctx = createFakeContext()
      provideContext(ctx)
      frames = stubAnimationFrames()
      now = vi.spyOn(performance, 'now').mockReturnValue(START)
    })

    afterEach(() => {
      // Put back the setup's null context rather than restoring the spy, which would
      // remove the setup stub for later tests.
      vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
      now.mockRestore()
      vi.unstubAllGlobals()
    })

    it('requests an animation frame instead of finishing the turn at once', () => {
      const { canvas } = renderPane()

      clickAt(canvas, LEFT_X)

      expect(frames.requestAnimationFrame).toHaveBeenCalledTimes(1)
      expect(canvas).toHaveAttribute('data-heading', 'west')
    })

    it('redraws the scene on every frame', () => {
      const { canvas } = renderPane()
      clickAt(canvas, LEFT_X)

      ctx.fillRect.mockClear()
      frames.flush(START + TURN_DURATION_MS / 4)
      expect(ctx.fillRect).toHaveBeenCalledWith(0, 0, VIEW_WIDTH, VIEW_HEIGHT)

      ctx.fillRect.mockClear()
      frames.flush(START + TURN_DURATION_MS / 2)
      expect(ctx.fillRect).toHaveBeenCalledWith(0, 0, VIEW_WIDTH, VIEW_HEIGHT)
    })

    it('keeps requesting frames until the turn duration has passed', () => {
      const { canvas } = renderPane()
      clickAt(canvas, LEFT_X)

      frames.flush(START + TURN_DURATION_MS / 2)
      expect(frames.pending()).toBe(1)

      frames.flush(START + TURN_DURATION_MS)
      expect(frames.pending()).toBe(0)
    })

    it('ends the turn with the sign out of view', () => {
      const { canvas } = renderPane()
      clickAt(canvas, LEFT_X)

      // The sign is the only thing drawn in the full foreground colour.
      const colours: string[] = []
      ctx.fillRect.mockImplementation(() => {
        colours.push(ctx.fillStyle)
      })
      frames.flush(START + TURN_DURATION_MS)

      expect(colours.length).toBeGreaterThan(0)
      expect(colours).not.toContain(FOREGROUND)
    })

    it('ignores turn clicks during the animation', () => {
      const { canvas } = renderPane()
      clickAt(canvas, LEFT_X)
      frames.flush(START + TURN_DURATION_MS / 2)

      clickAt(canvas, LEFT_X)

      expect(canvas).toHaveAttribute('data-heading', 'west')
      expect(frames.requestAnimationFrame).toHaveBeenCalledTimes(2)
    })

    it('accepts another turn once the animation has finished', () => {
      const { canvas } = renderPane()
      clickAt(canvas, LEFT_X)
      frames.flush(START + TURN_DURATION_MS)

      clickAt(canvas, LEFT_X)

      expect(canvas).toHaveAttribute('data-heading', 'south')
    })

    it('cancels the pending frame when unmounted mid-animation', () => {
      const { canvas, unmount } = renderPane()
      clickAt(canvas, LEFT_X)
      const frameId = frames.requestAnimationFrame.mock.results[0].value as number

      unmount()

      expect(frames.cancelAnimationFrame).toHaveBeenCalledWith(frameId)
    })

    it('does not cancel anything when unmounted after the animation', () => {
      const { canvas, unmount } = renderPane()
      clickAt(canvas, LEFT_X)
      frames.flush(START + TURN_DURATION_MS)

      unmount()

      expect(frames.cancelAnimationFrame).not.toHaveBeenCalled()
    })

    it('snaps to the new heading with reduced motion', () => {
      vi.stubGlobal('matchMedia', (query: string) => ({ matches: true, media: query }))
      const { canvas } = renderPane()
      ctx.fillRect.mockClear()

      clickAt(canvas, LEFT_X)

      expect(frames.requestAnimationFrame).not.toHaveBeenCalled()
      expect(ctx.fillRect).toHaveBeenCalledWith(0, 0, VIEW_WIDTH, VIEW_HEIGHT)
      expect(canvas).toHaveAttribute('data-heading', 'west')
    })

    it('accepts the next turn straight away with reduced motion', () => {
      vi.stubGlobal('matchMedia', (query: string) => ({ matches: true, media: query }))
      const { canvas } = renderPane()

      clickAt(canvas, LEFT_X)
      clickAt(canvas, LEFT_X)

      expect(canvas).toHaveAttribute('data-heading', 'south')
    })

    it('animates when reduced motion is not requested', () => {
      vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query }))
      const { canvas } = renderPane()

      clickAt(canvas, LEFT_X)

      expect(frames.requestAnimationFrame).toHaveBeenCalledTimes(1)
    })
  })

  describe('hand cursor while turning', () => {
    let now: MockInstance<() => number> | null = null

    afterEach(() => {
      vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
      now?.mockRestore()
      now = null
      vi.unstubAllGlobals()
    })

    it('shows the zone cursor rather than the hand over the sign area after turning away', () => {
      const { canvas } = renderPane()

      clickAt(canvas, LEFT_X)
      fireEvent.mouseMove(canvas, { clientX: SIGN_X, clientY: SIGN_Y })

      expect(canvas.style.cursor).toBe(CURSORS.forward)
    })

    it('hides the hand when turning away while hovering the sign', () => {
      const { canvas } = renderPane()
      fireEvent.mouseMove(canvas, { clientX: SIGN_X, clientY: SIGN_Y })
      expect(canvas.style.cursor).toBe(HAND_CURSOR)

      clickAt(canvas, LEFT_X)

      expect(canvas.style.cursor).toBe(CURSORS.forward)
    })

    it('shows the hand again after turning back to north', () => {
      const { canvas } = renderPane()

      clickAt(canvas, LEFT_X)
      clickAt(canvas, RIGHT_X)
      fireEvent.mouseMove(canvas, { clientX: SIGN_X, clientY: SIGN_Y })

      expect(canvas.style.cursor).toBe(HAND_CURSOR)
    })

    it('does not show the hand until a turn back to north has finished', () => {
      const frames = stubAnimationFrames()
      now = vi.spyOn(performance, 'now').mockReturnValue(0)
      const { canvas } = renderPane()
      // Turn to east instantly (no context yet), then animate the turn back to north.
      clickAt(canvas, RIGHT_X)
      provideContext(createFakeContext())
      clickAt(canvas, LEFT_X)
      expect(canvas).toHaveAttribute('data-heading', 'north')

      fireEvent.mouseMove(canvas, { clientX: SIGN_X, clientY: SIGN_Y })
      expect(canvas.style.cursor).toBe(BLOCKED_CURSOR)

      frames.flush(TURN_DURATION_MS)
      expect(canvas.style.cursor).toBe(HAND_CURSOR)
    })
  })

  describe('moving', () => {
    afterEach(() => {
      vi.unstubAllGlobals()
    })

    // Turns left to face west at the start, then steps forward into the nook.
    function enterNook(canvas: HTMLElement) {
      clickAt(canvas, LEFT_X)
      clickAt(canvas, CENTRE_X)
    }

    it('uses a 350 ms move duration', () => {
      expect(MOVE_DURATION_MS).toBe(350)
    })

    it('starts at the start', () => {
      renderPane()

      expect(screen.getByRole('img')).toHaveAttribute('data-place', 'start')
    })

    it('moves into the nook when the centre is clicked facing west', () => {
      const { canvas } = renderPane()

      enterNook(canvas)

      expect(canvas).toHaveAttribute('data-place', 'nook')
      expect(canvas).toHaveAttribute('data-heading', 'west')
    })

    it('moves back to the start from the nook facing east', () => {
      const { canvas } = renderPane()
      enterNook(canvas)
      clickAt(canvas, LEFT_X)
      clickAt(canvas, LEFT_X)
      expect(canvas).toHaveAttribute('data-heading', 'east')

      clickAt(canvas, CENTRE_X)

      expect(canvas).toHaveAttribute('data-place', 'start')
      expect(canvas).toHaveAttribute('data-heading', 'east')
    })

    it.each([
      ['north', []],
      ['east', [RIGHT_X]],
      ['south', [LEFT_X, LEFT_X]],
    ] as const)('does not move from the start facing %s', (_, turns) => {
      const { canvas } = renderPane()
      for (const x of turns) clickAt(canvas, x)

      clickAt(canvas, CENTRE_X, 30)

      expect(canvas).toHaveAttribute('data-place', 'start')
    })

    it.each([
      ['west', []],
      ['north', [RIGHT_X]],
      ['south', [LEFT_X]],
    ] as const)('does not move from the nook facing %s', (heading, turns) => {
      const { canvas } = renderPane()
      enterNook(canvas)
      for (const x of turns) clickAt(canvas, x)
      expect(canvas).toHaveAttribute('data-heading', heading)

      clickAt(canvas, CENTRE_X)

      expect(canvas).toHaveAttribute('data-place', 'nook')
      expect(canvas).toHaveAttribute('data-heading', heading)
    })

    it('turns inside the nook without leaving it', () => {
      const { canvas } = renderPane()
      enterNook(canvas)

      clickAt(canvas, RIGHT_X)
      expect(canvas).toHaveAttribute('data-heading', 'north')
      clickAt(canvas, LEFT_X)
      clickAt(canvas, LEFT_X)

      expect(canvas).toHaveAttribute('data-heading', 'south')
      expect(canvas).toHaveAttribute('data-place', 'nook')
    })

    it('does not request animation frames for a move without a canvas context', () => {
      const frames = stubAnimationFrames()
      const { canvas } = renderPane()

      enterNook(canvas)

      expect(frames.requestAnimationFrame).not.toHaveBeenCalled()
      expect(canvas).toHaveAttribute('data-place', 'nook')
    })
  })

  describe('cursor while moving about', () => {
    it('shows the blocked cursor in the centre after moving into the nook facing west', () => {
      const { canvas } = renderPane()
      clickAt(canvas, LEFT_X)
      fireEvent.mouseMove(canvas, { clientX: CENTRE_X, clientY: MIDDLE_Y })
      expect(canvas.style.cursor).toBe(CURSORS.forward)

      clickAt(canvas, CENTRE_X)

      expect(canvas.style.cursor).toBe(BLOCKED_CURSOR)
    })

    it('shows the forward cursor in the nook facing east, back towards the start', () => {
      const { canvas } = renderPane()
      clickAt(canvas, LEFT_X)
      clickAt(canvas, CENTRE_X)
      clickAt(canvas, LEFT_X)
      clickAt(canvas, LEFT_X)

      fireEvent.mouseMove(canvas, { clientX: CENTRE_X, clientY: MIDDLE_Y })

      expect(canvas.style.cursor).toBe(CURSORS.forward)
    })

    it('hides the hand in the nook facing north, even over the sign area', () => {
      const { canvas } = renderPane()
      clickAt(canvas, LEFT_X)
      clickAt(canvas, CENTRE_X)
      clickAt(canvas, RIGHT_X)
      expect(canvas).toHaveAttribute('data-heading', 'north')

      fireEvent.mouseMove(canvas, { clientX: SIGN_X, clientY: SIGN_Y })

      expect(canvas.style.cursor).not.toBe(HAND_CURSOR)
      expect(canvas.style.cursor).toBe(BLOCKED_CURSOR)
    })

    it('shows the hand again after returning to the start and facing north', () => {
      const { canvas } = renderPane()
      clickAt(canvas, LEFT_X)
      clickAt(canvas, CENTRE_X)
      clickAt(canvas, LEFT_X)
      clickAt(canvas, LEFT_X)
      clickAt(canvas, CENTRE_X)
      clickAt(canvas, LEFT_X)
      expect(canvas).toHaveAttribute('data-place', 'start')
      expect(canvas).toHaveAttribute('data-heading', 'north')

      fireEvent.mouseMove(canvas, { clientX: SIGN_X, clientY: SIGN_Y })

      expect(canvas.style.cursor).toBe(HAND_CURSOR)
    })
  })

  describe('move animation', () => {
    const START = 1000
    type Fill = { args: number[]; fillStyle: string }
    let ctx: ReturnType<typeof createFakeContext>
    let frames: ReturnType<typeof stubAnimationFrames>
    let now: MockInstance<() => number>
    let fills: Fill[]

    beforeEach(() => {
      ctx = createFakeContext()
      fills = []
      ctx.fillRect.mockImplementation((...args: number[]) => {
        fills.push({ args, fillStyle: ctx.fillStyle })
      })
      provideContext(ctx)
      frames = stubAnimationFrames()
      now = vi.spyOn(performance, 'now').mockReturnValue(START)
    })

    afterEach(() => {
      vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
      now.mockRestore()
      vi.unstubAllGlobals()
    })

    // The fills drawScene makes for a view, recorded with a separate fake context.
    function fillsFor(yaw: number, eye: { x: number; z: number }): Fill[] {
      const recorded: Fill[] = []
      const other = createFakeContext()
      other.fillRect.mockImplementation((...args: number[]) => {
        recorded.push({ args, fillStyle: other.fillStyle })
      })
      drawScene(other as unknown as CanvasRenderingContext2D, yaw, eye)
      return recorded
    }

    // Renders, turns left to face west and lets the turn finish, ready to move.
    function renderFacingWest() {
      const result = renderPane()
      clickAt(result.canvas, LEFT_X)
      frames.flush(START + TURN_DURATION_MS)
      frames.requestAnimationFrame.mockClear()
      fills.length = 0
      return result
    }

    it('requests an animation frame instead of finishing the move at once', () => {
      const { canvas } = renderFacingWest()

      clickAt(canvas, CENTRE_X)

      expect(frames.requestAnimationFrame).toHaveBeenCalledTimes(1)
      expect(canvas).toHaveAttribute('data-place', 'nook')
    })

    it('redraws the scene on every frame of the move', () => {
      const { canvas } = renderFacingWest()
      clickAt(canvas, CENTRE_X)

      frames.flush(START + MOVE_DURATION_MS / 4)
      expect(ctx.fillRect).toHaveBeenCalledWith(0, 0, VIEW_WIDTH, VIEW_HEIGHT)

      ctx.fillRect.mockClear()
      frames.flush(START + MOVE_DURATION_MS / 2)
      expect(ctx.fillRect).toHaveBeenCalledWith(0, 0, VIEW_WIDTH, VIEW_HEIGHT)
    })

    it('draws views between the start and the nook mid-move', () => {
      const { canvas } = renderFacingWest()
      clickAt(canvas, CENTRE_X)

      frames.flush(START + MOVE_DURATION_MS / 2)

      expect(fills).not.toEqual(fillsFor(Math.PI / 2, PLACES.start))
      expect(fills).not.toEqual(fillsFor(Math.PI / 2, PLACES.nook))
    })

    it('ends the move drawing the view from the nook', () => {
      const { canvas } = renderFacingWest()
      clickAt(canvas, CENTRE_X)

      frames.flush(START + MOVE_DURATION_MS)

      expect(fills).toEqual(fillsFor(Math.PI / 2, PLACES.nook))
    })

    it('keeps animating past the turn duration until the move duration has passed', () => {
      const { canvas } = renderFacingWest()
      clickAt(canvas, CENTRE_X)

      frames.flush(START + TURN_DURATION_MS)
      expect(frames.pending()).toBe(1)

      frames.flush(START + MOVE_DURATION_MS)
      expect(frames.pending()).toBe(0)
    })

    it.each([
      ['turn', LEFT_X],
      ['move', CENTRE_X],
    ])('ignores %s clicks during the move', (_, clientX) => {
      const { canvas } = renderFacingWest()
      clickAt(canvas, CENTRE_X)
      frames.flush(START + MOVE_DURATION_MS / 2)

      clickAt(canvas, clientX)

      expect(canvas).toHaveAttribute('data-place', 'nook')
      expect(canvas).toHaveAttribute('data-heading', 'west')
      expect(frames.requestAnimationFrame).toHaveBeenCalledTimes(2)
    })

    it('ignores a move click during a turn', () => {
      const { canvas } = renderPane()
      clickAt(canvas, LEFT_X)
      frames.flush(START + TURN_DURATION_MS / 2)

      clickAt(canvas, CENTRE_X)

      expect(canvas).toHaveAttribute('data-place', 'start')
    })

    it('accepts a turn once the move has finished', () => {
      const { canvas } = renderFacingWest()
      clickAt(canvas, CENTRE_X)
      frames.flush(START + MOVE_DURATION_MS)

      clickAt(canvas, LEFT_X)

      expect(canvas).toHaveAttribute('data-heading', 'south')
      expect(canvas).toHaveAttribute('data-place', 'nook')
    })

    it('cancels the pending frame when unmounted mid-move', () => {
      const { canvas, unmount } = renderFacingWest()
      clickAt(canvas, CENTRE_X)
      const frameId = frames.requestAnimationFrame.mock.results[0].value as number

      unmount()

      expect(frames.cancelAnimationFrame).toHaveBeenCalledWith(frameId)
    })

    it('jumps straight into the nook with reduced motion', () => {
      vi.stubGlobal('matchMedia', (query: string) => ({ matches: true, media: query }))
      const { canvas } = renderPane()
      clickAt(canvas, LEFT_X)
      fills.length = 0

      clickAt(canvas, CENTRE_X)

      expect(frames.requestAnimationFrame).not.toHaveBeenCalled()
      expect(canvas).toHaveAttribute('data-place', 'nook')
      expect(fills).toEqual(fillsFor(Math.PI / 2, PLACES.nook))
    })
  })
})
