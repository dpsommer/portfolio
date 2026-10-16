import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MockInstance } from 'vitest'
import { drawScene } from '../scene/draw.ts'
import { FOREGROUND } from '../scene/palette.ts'
import { PLACES } from '../scene/places.ts'
import { PREVIEW_HEIGHT, PREVIEW_WIDTH, quantisePreview } from '../scene/preview.ts'
import { rippleDuration } from '../scene/ripple.ts'
import { mirrorPixels, previewPixels, screenToMirror } from '../scene/room.ts'
import type { RippleState } from '../scene/room.ts'
import { BLOCKED_CURSOR, CURSORS, HAND_CURSOR } from './cursors.ts'
import { MIRROR_SITE, openUrl } from './mirrorSite.ts'
import ViewPane, { MOVE_DURATION_MS, TURN_DURATION_MS, VIEW_HEIGHT, VIEW_WIDTH } from './ViewPane.tsx'

// jsdom can't navigate, so clicks on the mirror go nowhere.
vi.mock('./mirrorSite.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./mirrorSite.ts')>()),
  openUrl: vi.fn(),
}))

// Client positions in the left, centre and right zones of a 320x240 pane at (0, 0).
const LEFT_X = 10
const CENTRE_X = 160
const RIGHT_X = 310
const MIDDLE_Y = 120
// Over the sign's board, away from the post.
const SIGN_X = 130
const SIGN_Y = 120
// In the centre zone but left of the mirror, seen from the nook facing west.
const BESIDE_MIRROR_X = 70
// The rectangle the mirror covers seen from the nook facing west (left 94,
// top 37, right 226, bottom 207 at 320x240, inclusive).
const MIRROR_PIXELS = mirrorPixels(VIEW_WIDTH, VIEW_HEIGHT, Math.PI / 2, PLACES.nook)
const MIRROR = {
  left: Math.min(...MIRROR_PIXELS.map((p) => p.x)),
  top: Math.min(...MIRROR_PIXELS.map((p) => p.y)),
  right: Math.max(...MIRROR_PIXELS.map((p) => p.x)),
  bottom: Math.max(...MIRROR_PIXELS.map((p) => p.y)),
}
const MIRROR_X = Math.round((MIRROR.left + MIRROR.right) / 2)
const MIRROR_Y = Math.round((MIRROR.top + MIRROR.bottom) / 2)

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

      // Only the sign and the mirror's frame are drawn in the full foreground
      // colour, so with the sign out of view only the frame's pixels are.
      const colours: string[] = []
      ctx.fillRect.mockImplementation(() => {
        colours.push(ctx.fillStyle)
      })
      frames.flush(START + TURN_DURATION_MS)
      const frame = mirrorPixels(VIEW_WIDTH, VIEW_HEIGHT, Math.PI / 2).filter((p) => p.colour === FOREGROUND)

      expect(colours.length).toBeGreaterThan(0)
      expect(colours.filter((c) => c === FOREGROUND)).toHaveLength(frame.length)
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

  describe('mirror cursor', () => {
    let now: MockInstance<() => number> | null = null

    afterEach(() => {
      vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
      now?.mockRestore()
      now = null
      vi.unstubAllGlobals()
    })

    // Turns left to face west at the start, then steps forward into the nook.
    function enterNook(canvas: HTMLElement) {
      clickAt(canvas, LEFT_X)
      clickAt(canvas, CENTRE_X)
    }

    it('shows the hand over the centre of the mirror in the nook facing west', () => {
      const { canvas } = renderPane()
      enterNook(canvas)

      fireEvent.mouseMove(canvas, { clientX: MIRROR_X, clientY: MIRROR_Y })

      expect(canvas.style.cursor).toBe(HAND_CURSOR)
    })

    it('shows the hand when the pointer is already over the mirror on arriving in the nook', () => {
      const { canvas } = renderPane()
      clickAt(canvas, LEFT_X)
      fireEvent.mouseMove(canvas, { clientX: MIRROR_X, clientY: MIRROR_Y })
      expect(canvas.style.cursor).toBe(CURSORS.forward)

      clickAt(canvas, MIRROR_X, MIRROR_Y)

      expect(canvas).toHaveAttribute('data-place', 'nook')
      expect(canvas.style.cursor).toBe(HAND_CURSOR)
    })

    it('returns to the blocked cursor when moving off the mirror', () => {
      const { canvas } = renderPane()
      enterNook(canvas)
      fireEvent.mouseMove(canvas, { clientX: MIRROR_X, clientY: MIRROR_Y })

      fireEvent.mouseMove(canvas, { clientX: BESIDE_MIRROR_X, clientY: MIDDLE_Y })

      expect(canvas.style.cursor).toBe(BLOCKED_CURSOR)
    })

    it('does nothing when the mirror is clicked', () => {
      const { canvas } = renderPane()
      enterNook(canvas)

      clickAt(canvas, MIRROR_X, MIRROR_Y)

      expect(canvas).toHaveAttribute('data-place', 'nook')
      expect(canvas).toHaveAttribute('data-heading', 'west')
    })

    // The glass's edges along the row and column through the mirror's centre,
    // in client pixels on a 640x480 pane, where each canvas pixel is 2 client
    // pixels and odd coordinates land half-way through one.
    const isGlassAt = (clientX: number, clientY: number) =>
      screenToMirror(clientX / 2, clientY / 2, VIEW_WIDTH, VIEW_HEIGHT, Math.PI / 2, PLACES.nook) !== null
    const clientXs = Array.from({ length: 640 }, (_, x) => x)
    const clientYs = Array.from({ length: 480 }, (_, y) => y)
    const GLASS_LEFT = clientXs.find((x) => isGlassAt(x, 2 * MIRROR_Y))!
    const GLASS_RIGHT = clientXs.findLast((x) => isGlassAt(x, 2 * MIRROR_Y))!
    const GLASS_TOP = clientYs.find((y) => isGlassAt(2 * MIRROR_X, y))!
    const GLASS_BOTTOM = clientYs.findLast((y) => isGlassAt(2 * MIRROR_X, y))!

    it.each([
      ['left', GLASS_LEFT, 2 * MIRROR_Y],
      ['right', GLASS_RIGHT, 2 * MIRROR_Y],
      ['top', 2 * MIRROR_X, GLASS_TOP],
      ['bottom', 2 * MIRROR_X, GLASS_BOTTOM],
    ])('shows the hand just inside the glass\'s %s edge', (_, clientX, clientY) => {
      const { canvas, getRect } = renderPane()
      enterNook(canvas)
      getRect.mockReturnValue(new DOMRect(0, 0, 640, 480))

      fireEvent.mouseMove(canvas, { clientX, clientY })

      expect(canvas.style.cursor).toBe(HAND_CURSOR)
    })

    it.each([
      ['left', GLASS_LEFT - 1, 2 * MIRROR_Y],
      ['right', GLASS_RIGHT + 1, 2 * MIRROR_Y],
      ['top', 2 * MIRROR_X, GLASS_TOP - 1],
      ['bottom', 2 * MIRROR_X, GLASS_BOTTOM + 1],
    ])('does not show the hand just outside the glass\'s %s edge', (_, clientX, clientY) => {
      const { canvas, getRect } = renderPane()
      enterNook(canvas)
      getRect.mockReturnValue(new DOMRect(0, 0, 640, 480))

      fireEvent.mouseMove(canvas, { clientX, clientY })

      expect(canvas.style.cursor).not.toBe(HAND_CURSOR)
    })

    it.each([
      ['left side', MIRROR.left + 3, MIRROR_Y],
      ['right side', MIRROR.right - 3, MIRROR_Y],
      ['crest', MIRROR_X, MIRROR.top + 3],
      ['pendant', MIRROR_X, MIRROR.bottom - 3],
    ])('does not show the hand over the frame\'s %s', (_, clientX, clientY) => {
      const { canvas } = renderPane()
      enterNook(canvas)

      fireEvent.mouseMove(canvas, { clientX, clientY })

      expect(canvas.style.cursor).toBe(BLOCKED_CURSOR)
    })

    it('does not show the hand over the mirror area from the start facing west', () => {
      // The mirror is in view far off, but is only clickable from the nook.
      const { canvas } = renderPane()
      clickAt(canvas, LEFT_X)

      fireEvent.mouseMove(canvas, { clientX: MIRROR_X, clientY: MIRROR_Y })

      expect(canvas.style.cursor).toBe(CURSORS.forward)
    })

    it.each([
      ['north', [RIGHT_X]],
      ['south', [LEFT_X]],
      ['east', [LEFT_X, LEFT_X]],
    ] as const)('does not show the hand over the mirror area in the nook facing %s', (heading, turns) => {
      const { canvas } = renderPane()
      enterNook(canvas)
      for (const x of turns) clickAt(canvas, x)
      expect(canvas).toHaveAttribute('data-heading', heading)

      fireEvent.mouseMove(canvas, { clientX: MIRROR_X, clientY: MIRROR_Y })

      expect(canvas.style.cursor).not.toBe(HAND_CURSOR)
    })

    it('shows the hand again after turning away and back to west in the nook', () => {
      const { canvas } = renderPane()
      enterNook(canvas)
      clickAt(canvas, RIGHT_X)
      fireEvent.mouseMove(canvas, { clientX: MIRROR_X, clientY: MIRROR_Y })
      expect(canvas.style.cursor).not.toBe(HAND_CURSOR)

      clickAt(canvas, LEFT_X)
      fireEvent.mouseMove(canvas, { clientX: MIRROR_X, clientY: MIRROR_Y })

      expect(canvas).toHaveAttribute('data-heading', 'west')
      expect(canvas.style.cursor).toBe(HAND_CURSOR)
    })

    it('does not show the hand until the move into the nook has finished', () => {
      const frames = stubAnimationFrames()
      now = vi.spyOn(performance, 'now').mockReturnValue(0)
      const { canvas } = renderPane()
      // Turn to west instantly (no context yet), then animate the move into the nook.
      clickAt(canvas, LEFT_X)
      provideContext(createFakeContext())
      clickAt(canvas, CENTRE_X)
      expect(canvas).toHaveAttribute('data-place', 'nook')

      fireEvent.mouseMove(canvas, { clientX: MIRROR_X, clientY: MIRROR_Y })
      expect(canvas.style.cursor).not.toBe(HAND_CURSOR)

      frames.flush(MOVE_DURATION_MS / 2)
      expect(canvas.style.cursor).not.toBe(HAND_CURSOR)

      frames.flush(MOVE_DURATION_MS)
      expect(canvas.style.cursor).toBe(HAND_CURSOR)
    })

    it('does not show the hand until a turn back to west in the nook has finished', () => {
      const frames = stubAnimationFrames()
      now = vi.spyOn(performance, 'now').mockReturnValue(0)
      const { canvas } = renderPane()
      // Reach the nook and face north instantly, then animate the turn back to west.
      enterNook(canvas)
      clickAt(canvas, RIGHT_X)
      provideContext(createFakeContext())
      clickAt(canvas, LEFT_X)
      expect(canvas).toHaveAttribute('data-heading', 'west')

      fireEvent.mouseMove(canvas, { clientX: MIRROR_X, clientY: MIRROR_Y })
      expect(canvas.style.cursor).not.toBe(HAND_CURSOR)

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
    it('shows the blocked cursor beside the mirror after moving into the nook facing west', () => {
      const { canvas } = renderPane()
      clickAt(canvas, LEFT_X)
      fireEvent.mouseMove(canvas, { clientX: BESIDE_MIRROR_X, clientY: MIDDLE_Y })
      expect(canvas.style.cursor).toBe(CURSORS.forward)

      clickAt(canvas, BESIDE_MIRROR_X)

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

  describe('mirror ripple', () => {
    const START = 1000
    const WEST = Math.PI / 2
    // On the glass but in the shoulder above the arch, inside the mirror's bounds.
    const FRAME_X = MIRROR_X + 38
    const FRAME_Y = MIRROR_Y - 60
    // The glass point under the mirror's centre, and how long its ripple runs.
    const ORIGIN = screenToMirror(MIRROR_X, MIRROR_Y, VIEW_WIDTH, VIEW_HEIGHT, WEST, PLACES.nook)!
    const DURATION = rippleDuration(ORIGIN)
    // A frame time at or just past the end. START + DURATION itself can round to an
    // elapsed time a hair under DURATION.
    const END = START + Math.ceil(DURATION)
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

    // The fills drawScene makes for the nook facing west, recorded with a separate fake context.
    function fillsFor(ripple?: RippleState): Fill[] {
      const recorded: Fill[] = []
      const other = createFakeContext()
      other.fillRect.mockImplementation((...args: number[]) => {
        recorded.push({ args, fillStyle: other.fillStyle })
      })
      drawScene(other as unknown as CanvasRenderingContext2D, WEST, PLACES.nook, ripple)
      return recorded
    }

    // Renders, turns west and steps into the nook, letting each animation finish.
    function renderInNook() {
      const result = renderPane()
      clickAt(result.canvas, LEFT_X)
      frames.flush(START + TURN_DURATION_MS)
      clickAt(result.canvas, CENTRE_X)
      frames.flush(START + MOVE_DURATION_MS)
      expect(result.canvas).toHaveAttribute('data-place', 'nook')
      expect(result.canvas).toHaveAttribute('data-heading', 'west')
      frames.requestAnimationFrame.mockClear()
      fills.length = 0
      return result
    }

    it('starts on the glass at the mirror\'s centre', () => {
      expect(ORIGIN).not.toBeNull()
      expect(DURATION).toBeGreaterThan(TURN_DURATION_MS)
    })

    it('requests an animation frame when the glass is clicked', () => {
      const { canvas } = renderInNook()

      clickAt(canvas, MIRROR_X, MIRROR_Y)

      expect(frames.requestAnimationFrame).toHaveBeenCalledTimes(1)
    })

    it('stays in the nook facing west when the glass is clicked', () => {
      const { canvas } = renderInNook()

      clickAt(canvas, MIRROR_X, MIRROR_Y)

      expect(canvas).toHaveAttribute('data-place', 'nook')
      expect(canvas).toHaveAttribute('data-heading', 'west')
    })

    it('draws the ripple on top of the plain scene mid-ripple', () => {
      const { canvas } = renderInNook()
      clickAt(canvas, MIRROR_X, MIRROR_Y)

      frames.flush(START + DURATION / 2)

      expect(fills.length).toBeGreaterThan(fillsFor().length)
      expect(fills).toEqual(fillsFor({ origin: ORIGIN, elapsedMs: DURATION / 2 }))
    })

    it('keeps requesting frames until the ripple duration has passed', () => {
      const { canvas } = renderInNook()
      clickAt(canvas, MIRROR_X, MIRROR_Y)

      frames.flush(START + DURATION / 2)
      expect(frames.pending()).toBe(1)

      frames.flush(END)
      expect(frames.pending()).toBe(0)
    })

    it('ends drawing the plain scene, without the ripple', () => {
      const { canvas } = renderInNook()
      clickAt(canvas, MIRROR_X, MIRROR_Y)
      frames.flush(START + DURATION / 2)
      fills.length = 0

      frames.flush(END)

      expect(fills).toEqual(fillsFor())
    })

    it.each([
      ['turn left', LEFT_X],
      ['turn right', RIGHT_X],
    ])('ignores a %s click mid-ripple', (_, clientX) => {
      const { canvas } = renderInNook()
      clickAt(canvas, MIRROR_X, MIRROR_Y)
      frames.flush(START + DURATION / 2)

      clickAt(canvas, clientX)

      expect(canvas).toHaveAttribute('data-heading', 'west')
      expect(frames.requestAnimationFrame).toHaveBeenCalledTimes(2)
    })

    it('hides the hand over the mirror mid-ripple', () => {
      const { canvas } = renderInNook()
      clickAt(canvas, MIRROR_X, MIRROR_Y)
      frames.flush(START + DURATION / 2)

      fireEvent.mouseMove(canvas, { clientX: MIRROR_X, clientY: MIRROR_Y })

      expect(canvas.style.cursor).not.toBe(HAND_CURSOR)
    })

    it('shows the hand again once the ripple has finished', () => {
      const { canvas } = renderInNook()
      clickAt(canvas, MIRROR_X, MIRROR_Y)
      fireEvent.mouseMove(canvas, { clientX: MIRROR_X, clientY: MIRROR_Y })

      frames.flush(END)

      expect(canvas.style.cursor).toBe(HAND_CURSOR)
    })

    it('accepts a turn once the ripple has finished', () => {
      const { canvas } = renderInNook()
      clickAt(canvas, MIRROR_X, MIRROR_Y)
      frames.flush(END)

      clickAt(canvas, LEFT_X)

      expect(canvas).toHaveAttribute('data-heading', 'south')
    })

    it('does not restart the ripple when the glass is clicked again mid-ripple', () => {
      const { canvas } = renderInNook()
      clickAt(canvas, MIRROR_X, MIRROR_Y)
      frames.flush(START + DURATION / 2)
      // A restart would time the new ripple from here.
      now.mockReturnValue(START + DURATION / 2)

      clickAt(canvas, MIRROR_X, MIRROR_Y)

      expect(frames.requestAnimationFrame).toHaveBeenCalledTimes(2)
      expect(frames.pending()).toBe(1)
      frames.flush(END)
      expect(frames.pending()).toBe(0)
    })

    it('can ripple again once the first ripple has finished', () => {
      const { canvas } = renderInNook()
      clickAt(canvas, MIRROR_X, MIRROR_Y)
      frames.flush(END)
      frames.requestAnimationFrame.mockClear()

      clickAt(canvas, MIRROR_X, MIRROR_Y)

      expect(frames.requestAnimationFrame).toHaveBeenCalledTimes(1)
    })

    it.each([
      ['the frame above the arch', FRAME_X, FRAME_Y],
      ['the crest', MIRROR_X, MIRROR.top + 3],
    ])('does nothing when %s is clicked', (_, clientX, clientY) => {
      expect(isInside(clientX, clientY)).toBe(true)
      const { canvas } = renderInNook()

      clickAt(canvas, clientX, clientY)

      expect(frames.requestAnimationFrame).not.toHaveBeenCalled()
      expect(fills).toEqual([])
      expect(canvas).toHaveAttribute('data-place', 'nook')
      expect(canvas).toHaveAttribute('data-heading', 'west')
    })

    it('shows no hand over the frame, before or after clicking it', () => {
      const { canvas } = renderInNook()
      fireEvent.mouseMove(canvas, { clientX: FRAME_X, clientY: FRAME_Y })
      expect(canvas.style.cursor).not.toBe(HAND_CURSOR)

      clickAt(canvas, FRAME_X, FRAME_Y)

      expect(canvas.style.cursor).not.toBe(HAND_CURSOR)
    })

    it('shows no ripple with reduced motion', () => {
      vi.stubGlobal('matchMedia', (query: string) => ({ matches: true, media: query }))
      const { canvas } = renderPane()
      clickAt(canvas, LEFT_X)
      clickAt(canvas, CENTRE_X)
      expect(canvas).toHaveAttribute('data-place', 'nook')
      fills.length = 0

      clickAt(canvas, MIRROR_X, MIRROR_Y)

      expect(frames.requestAnimationFrame).not.toHaveBeenCalled()
      expect(fills).toEqual([])
      expect(canvas).toHaveAttribute('data-place', 'nook')
      expect(canvas).toHaveAttribute('data-heading', 'west')
    })

    it('moves into the nook rather than rippling when the mirror area is clicked from the start facing west', () => {
      const { canvas } = renderPane()
      clickAt(canvas, LEFT_X)
      frames.flush(START + TURN_DURATION_MS)

      clickAt(canvas, MIRROR_X, MIRROR_Y)
      expect(canvas).toHaveAttribute('data-place', 'nook')
      fills.length = 0
      frames.flush(START + MOVE_DURATION_MS)

      expect(frames.pending()).toBe(0)
      expect(fills).toEqual(fillsFor())
    })

    describe('going to the mirror\'s site', () => {
      beforeEach(() => {
        vi.mocked(openUrl).mockClear()
      })

      it('links to the GitHub profile', () => {
        expect(MIRROR_SITE.url).toBe('https://github.com/dpsommer/')
      })

      it('does not go there mid-ripple', () => {
        const { canvas } = renderInNook()
        clickAt(canvas, MIRROR_X, MIRROR_Y)

        frames.flush(START + DURATION / 2)

        expect(openUrl).not.toHaveBeenCalled()
      })

      it('goes there once the ripple has finished', () => {
        const { canvas } = renderInNook()
        clickAt(canvas, MIRROR_X, MIRROR_Y)
        frames.flush(START + DURATION / 2)

        frames.flush(END)

        expect(openUrl).toHaveBeenCalledTimes(1)
        expect(openUrl).toHaveBeenCalledWith(MIRROR_SITE.url)
      })

      it('goes there only once when the glass is clicked again mid-ripple', () => {
        const { canvas } = renderInNook()
        clickAt(canvas, MIRROR_X, MIRROR_Y)
        frames.flush(START + DURATION / 2)
        clickAt(canvas, MIRROR_X, MIRROR_Y)

        frames.flush(END)

        expect(openUrl).toHaveBeenCalledTimes(1)
      })

      it('does not go there for turns or moves', () => {
        const { canvas } = renderInNook()
        clickAt(canvas, RIGHT_X)
        frames.flush(START + TURN_DURATION_MS)
        now.mockReturnValue(START + TURN_DURATION_MS)
        clickAt(canvas, RIGHT_X)
        frames.flush(START + 2 * TURN_DURATION_MS)
        now.mockReturnValue(START + 2 * TURN_DURATION_MS)
        clickAt(canvas, CENTRE_X)
        frames.flush(START + 2 * TURN_DURATION_MS + MOVE_DURATION_MS)

        expect(canvas).toHaveAttribute('data-place', 'start')
        expect(openUrl).not.toHaveBeenCalled()
      })

      it.each([
        ['the frame above the arch', FRAME_X, FRAME_Y],
        ['the crest', MIRROR_X, MIRROR.top + 3],
      ])('does not go there when %s is clicked', (_, clientX, clientY) => {
        const { canvas } = renderInNook()

        clickAt(canvas, clientX, clientY)
        frames.flush(END)

        expect(openUrl).not.toHaveBeenCalled()
      })

      it('does not go there when the mirror area is clicked from the start facing west', () => {
        const { canvas } = renderPane()
        clickAt(canvas, LEFT_X)
        frames.flush(START + TURN_DURATION_MS)

        clickAt(canvas, MIRROR_X, MIRROR_Y)
        frames.flush(START + MOVE_DURATION_MS)

        expect(canvas).toHaveAttribute('data-place', 'nook')
        expect(openUrl).not.toHaveBeenCalled()
      })

      it('goes there at once with reduced motion, without rippling', () => {
        vi.stubGlobal('matchMedia', (query: string) => ({ matches: true, media: query }))
        const { canvas } = renderPane()
        clickAt(canvas, LEFT_X)
        clickAt(canvas, CENTRE_X)
        expect(canvas).toHaveAttribute('data-place', 'nook')
        fills.length = 0

        clickAt(canvas, MIRROR_X, MIRROR_Y)

        expect(openUrl).toHaveBeenCalledTimes(1)
        expect(openUrl).toHaveBeenCalledWith(MIRROR_SITE.url)
        expect(frames.requestAnimationFrame).not.toHaveBeenCalled()
        expect(fills).toEqual([])
      })

      it('goes there at once without a canvas context', () => {
        vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
        const { canvas } = renderPane()
        clickAt(canvas, LEFT_X)
        clickAt(canvas, CENTRE_X)
        expect(canvas).toHaveAttribute('data-place', 'nook')

        clickAt(canvas, MIRROR_X, MIRROR_Y)

        expect(openUrl).toHaveBeenCalledTimes(1)
        expect(openUrl).toHaveBeenCalledWith(MIRROR_SITE.url)
        expect(frames.requestAnimationFrame).not.toHaveBeenCalled()
      })

      it('does not go there when the glass is clicked from the nook facing another way', () => {
        vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
        const { canvas } = renderPane()
        clickAt(canvas, LEFT_X)
        clickAt(canvas, CENTRE_X)
        clickAt(canvas, RIGHT_X)
        expect(canvas).toHaveAttribute('data-heading', 'north')

        clickAt(canvas, MIRROR_X, MIRROR_Y)

        expect(openUrl).not.toHaveBeenCalled()
      })
    })

    function isInside(x: number, y: number) {
      return x >= MIRROR.left && x <= MIRROR.right && y >= MIRROR.top && y <= MIRROR.bottom
    }
  })
  describe('mirror preview', () => {
    const WEST = Math.PI / 2
    // A portrait screenshot, taller than the glass's aspect, so its height is cropped.
    const IMAGE_WIDTH = 1280
    const IMAGE_HEIGHT = 2400
    const WHITE = new Uint8ClampedArray(PREVIEW_WIDTH * PREVIEW_HEIGHT * 4).fill(255)
    const WHITE_PREVIEW = quantisePreview(WHITE, PREVIEW_WIDTH, PREVIEW_HEIGHT)
    type Fill = { args: number[]; fillStyle: string }
    let ctx: ReturnType<typeof createFakeContext>
    let fills: Fill[]
    let images: FakeImage[]

    // An Image that loads (or fails) as soon as its src is set.
    class FakeImage {
      static fail = false
      width = IMAGE_WIDTH
      height = IMAGE_HEIGHT
      onload: (() => void) | null = null
      onerror: ((error: unknown) => void) | null = null
      private source = ''
      constructor() {
        images.push(this)
      }
      get src() {
        return this.source
      }
      set src(value: string) {
        this.source = value
        if (FakeImage.fail) this.onerror?.(new Error('failed'))
        else this.onload?.()
      }
    }

    function createOffscreenContext() {
      return {
        imageSmoothingQuality: '',
        drawImage: vi.fn(),
        getImageData: vi.fn(() => ({ data: WHITE })),
      }
    }

    // The visible canvas gets `ctx`; the offscreen one (asked for with
    // willReadFrequently) gets `offscreen`.
    function provideContexts(offscreen: ReturnType<typeof createOffscreenContext> | null) {
      return vi
        .spyOn(HTMLCanvasElement.prototype, 'getContext')
        .mockImplementation(((_: string, options?: CanvasRenderingContext2DSettings) =>
          options?.willReadFrequently ? offscreen : ctx) as unknown as HTMLCanvasElement['getContext'])
    }

    // The fills drawScene makes for the nook facing west with `preview`.
    function fillsFor(preview?: Uint8Array): Fill[] {
      const recorded: Fill[] = []
      const other = createFakeContext()
      other.fillRect.mockImplementation((...args: number[]) => {
        recorded.push({ args, fillStyle: other.fillStyle })
      })
      drawScene(other as unknown as CanvasRenderingContext2D, WEST, PLACES.nook, undefined, preview)
      return recorded
    }

    // Renders and lets the preview's load settle.
    async function renderLoaded() {
      const result = renderPane()
      await act(async () => {})
      return result
    }

    // Snaps into the nook facing west (reduced motion), leaving only that view's fills.
    function enterNook(canvas: HTMLElement) {
      clickAt(canvas, LEFT_X)
      fills.length = 0
      clickAt(canvas, CENTRE_X)
      expect(canvas).toHaveAttribute('data-place', 'nook')
      expect(canvas).toHaveAttribute('data-heading', 'west')
    }

    beforeEach(() => {
      ctx = createFakeContext()
      fills = []
      images = []
      FakeImage.fail = false
      ctx.fillRect.mockImplementation((...args: number[]) => {
        fills.push({ args, fillStyle: ctx.fillStyle })
      })
      vi.stubGlobal('Image', FakeImage)
      vi.stubGlobal('matchMedia', (query: string) => ({ matches: true, media: query }))
    })

    afterEach(() => {
      vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
      vi.unstubAllGlobals()
    })

    it('loads the mirror site\'s preview image', async () => {
      provideContexts(createOffscreenContext())

      await renderLoaded()

      expect(images).toHaveLength(1)
      expect(images[0].src).toBe(MIRROR_SITE.preview)
    })

    it('asks for an offscreen context it can read back often', async () => {
      const getContext = provideContexts(createOffscreenContext())

      await renderLoaded()

      expect(getContext).toHaveBeenCalledWith('2d', { willReadFrequently: true })
    })

    it('draws the image to cover the preview grid, centred', async () => {
      const offscreen = createOffscreenContext()
      provideContexts(offscreen)

      await renderLoaded()

      expect(offscreen.drawImage).toHaveBeenCalledTimes(1)
      const [image, x, y, width, height] = offscreen.drawImage.mock.calls[0] as unknown as [unknown, ...number[]]
      expect(image).toBe(images[0])
      expect(width).toBeCloseTo(PREVIEW_WIDTH)
      expect(height).toBeGreaterThanOrEqual(PREVIEW_HEIGHT)
      expect(width / height).toBeCloseTo(IMAGE_WIDTH / IMAGE_HEIGHT)
      expect(x).toBeCloseTo((PREVIEW_WIDTH - width) / 2)
      expect(y).toBeCloseTo((PREVIEW_HEIGHT - height) / 2)
    })

    it('reads back the whole preview grid', async () => {
      const offscreen = createOffscreenContext()
      provideContexts(offscreen)

      await renderLoaded()

      expect(offscreen.getImageData).toHaveBeenCalledWith(0, 0, PREVIEW_WIDTH, PREVIEW_HEIGHT)
    })

    it('redraws the view once the preview has loaded', async () => {
      provideContexts(createOffscreenContext())

      await renderLoaded()

      const backgrounds = fills.filter(({ args }) => args.join() === `0,0,${VIEW_WIDTH},${VIEW_HEIGHT}`)
      expect(backgrounds).toHaveLength(2)
    })

    it('draws the preview on the glass from the nook facing west', async () => {
      provideContexts(createOffscreenContext())
      const { canvas } = await renderLoaded()
      fills.length = 0

      enterNook(canvas)

      expect(fills).toEqual(fillsFor(WHITE_PREVIEW))
      const preview = previewPixels(VIEW_WIDTH, VIEW_HEIGHT, WHITE_PREVIEW, WEST, PLACES.nook)
      expect(preview.some(({ colour }) => colour === FOREGROUND)).toBe(true)
      expect(fills.length).toBeGreaterThan(fillsFor().length)
    })

    it('draws the preview under a ripple on the glass', async () => {
      vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query }))
      const frames = stubAnimationFrames()
      const now = vi.spyOn(performance, 'now').mockReturnValue(0)
      provideContexts(createOffscreenContext())
      const { canvas } = await renderLoaded()
      clickAt(canvas, LEFT_X)
      frames.flush(TURN_DURATION_MS)
      clickAt(canvas, CENTRE_X)
      frames.flush(MOVE_DURATION_MS)
      const origin = screenToMirror(MIRROR_X, MIRROR_Y, VIEW_WIDTH, VIEW_HEIGHT, WEST, PLACES.nook)!
      const ripple = { origin, elapsedMs: rippleDuration(origin) / 2 }
      clickAt(canvas, MIRROR_X, MIRROR_Y)
      fills.length = 0

      frames.flush(ripple.elapsedMs)

      const expected: Fill[] = []
      const other = createFakeContext()
      other.fillRect.mockImplementation((...args: number[]) => {
        expected.push({ args, fillStyle: other.fillStyle })
      })
      drawScene(other as unknown as CanvasRenderingContext2D, WEST, PLACES.nook, ripple, WHITE_PREVIEW)
      expect(fills).toEqual(expected)
      now.mockRestore()
    })

    it('draws the empty glass without an offscreen context', async () => {
      provideContexts(null)
      const { canvas } = await renderLoaded()
      fills.length = 0

      enterNook(canvas)

      expect(fills).toEqual(fillsFor())
    })

    it('does not redraw without an offscreen context', async () => {
      provideContexts(null)

      await renderLoaded()

      expect(fills.filter(({ args }) => args.join() === `0,0,${VIEW_WIDTH},${VIEW_HEIGHT}`)).toHaveLength(1)
    })

    it('draws the empty glass when the image fails to load', async () => {
      FakeImage.fail = true
      const offscreen = createOffscreenContext()
      provideContexts(offscreen)
      const { canvas } = await renderLoaded()
      fills.length = 0

      enterNook(canvas)

      expect(offscreen.drawImage).not.toHaveBeenCalled()
      expect(fills).toEqual(fillsFor())
    })

    it('does not draw the preview when unmounted before it loads', async () => {
      // Hold the load until after unmounting.
      let finishLoad = () => {}
      class LateImage extends FakeImage {
        set src(value: string) {
          finishLoad = () => this.onload?.()
          void value
        }
      }
      vi.stubGlobal('Image', LateImage)
      provideContexts(createOffscreenContext())
      const { unmount } = renderPane()
      unmount()
      fills.length = 0

      await act(async () => finishLoad())

      expect(fills).toEqual([])
    })
  })
})
