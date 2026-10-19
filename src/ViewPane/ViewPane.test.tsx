import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MockInstance } from 'vitest'
import { createFakeContext, toFills } from '../test/fakeContext.ts'
import type { Fill } from '../test/fakeContext.ts'
import { extent } from '../test/pixels.ts'
import type { FloorPoint } from '../scene/core/camera.ts'
import { BACKGROUND, FOREGROUND } from '../scene/core/palette.ts'
import { drawScene } from '../scene/draw.ts'
import type { MirrorExtras } from '../scene/draw.ts'
import { mirrorPixels, plaquePixels, previewPixels, pullPixels, screenToMirror } from '../scene/mirror/pixels.ts'
import type { LogoMap, Plaque } from '../scene/mirror/plaque.ts'
import { PREVIEW_HEIGHT, PREVIEW_WIDTH, quantisePreview } from '../scene/mirror/preview.ts'
import { rippleDuration } from '../scene/mirror/ripple.ts'
import { PLACES } from '../scene/navigation/places.ts'
import { NAV_BUTTON_BOUNDS, navButtonPixels } from '../scene/navigation/navButtons.ts'
import type { KeyPress, NavButton } from '../scene/navigation/navButtons.ts'
import { drawNavigationPanel } from '../scene/navigation/navigationPanel.ts'
import { drawTextBox, textBoxLines } from '../scene/textBox/textBox.ts'
import { BLOCKED_CURSOR, CURSORS, HAND_CURSOR } from './cursors.ts'
import { MIRROR_SITES, openUrl } from './mirrorSites.ts'
import { CARET_BLINK_MS, SIGN_PAGES, TYPING_MS_PER_CHAR } from './signText.ts'
import ViewPane, {
  LOWER_PANEL_HEIGHT,
  LOWER_PANEL_WIDTH,
  MOVE_DURATION_MS,
  SIDE_PANEL_HEIGHT,
  SIDE_PANEL_WIDTH,
  SWITCH_DURATION_MS,
  TURN_DURATION_MS,
  VIEW_HEIGHT,
  VIEW_WIDTH,
} from './ViewPane.tsx'

// jsdom can't navigate, so clicks on the mirror go nowhere.
vi.mock('./mirrorSites.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./mirrorSites.ts')>()),
  openUrl: vi.fn(),
}))

const WEST = Math.PI / 2
// The site the mirror shows first, and the one after a pull.
const [MIRROR_SITE, NEXT_SITE] = MIRROR_SITES

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
const MIRROR = extent(mirrorPixels(VIEW_WIDTH, VIEW_HEIGHT, WEST, PLACES.nook))
const MIRROR_X = Math.round((MIRROR.left + MIRROR.right) / 2)
const MIRROR_Y = Math.round((MIRROR.top + MIRROR.bottom) / 2)
// The curtain pull's handle seen from the nook facing west (around x 243-252,
// y 101-123 at 320x240), its centre, and points on and off the pull's hit area.
const HANDLE = extent(pullPixels(VIEW_WIDTH, VIEW_HEIGHT, 0, WEST, PLACES.nook).filter((p) => p.colour === FOREGROUND))
const PULL_X = Math.round((HANDLE.left + HANDLE.right) / 2)
const HANDLE_Y = Math.round((HANDLE.top + HANDLE.bottom) / 2)
// On the cord a little above the handle, and far up it, out of the hit area.
const CORD_Y = HANDLE.top - 10
const HIGH_CORD_Y = HANDLE.top - 60
// Below the handle's tip, past the hit area's padding.
const BELOW_HANDLE_Y = HANDLE.bottom + 12
// On the wall between the mirror's frame and the pull.
const BETWEEN_X = Math.round((MIRROR.right + HANDLE.left) / 2)

const easeInOut = (t: number) => (1 - Math.cos(Math.PI * t)) / 2

// How far the pull is tugged `elapsed` ms into a switch: down 0.1 over 150 ms,
// back up by 600 ms, both eased.
function pullDropAt(elapsed: number): number {
  if (elapsed < 150) return 0.1 * easeInOut(elapsed / 150)
  if (elapsed < 600) return 0.1 * (1 - easeInOut((elapsed - 150) / 450))
  return 0
}

// The plaque mid-switch: it sinks over 200 ms, turns by 650 ms (swapping logos
// edge-on), then pushes back out by the end.
function plaqueAt(elapsed: number, fromLogo: LogoMap, toLogo: LogoMap): Plaque {
  if (elapsed < 200) return { logo: fromLogo, depth: easeInOut(elapsed / 200) }
  if (elapsed < 650) {
    const turn = easeInOut((elapsed - 200) / 450)
    return { logo: turn < 0.5 ? fromLogo : toLogo, depth: 1, turn }
  }
  return { logo: toLogo, depth: 1 - easeInOut(Math.min(1, (elapsed - 650) / 250)) }
}

// The plaque at rest showing the first site's logo, as the pane starts.
const RESTING_PLAQUE: Plaque = { logo: MIRROR_SITE.logo }
// The plaque at rest after one pull, showing the second site's logo.
const NEXT_PLAQUE: Plaque = { logo: NEXT_SITE.logo }

// The fills drawScene makes for a view, the nook facing west by default, with
// `extras`. The plaque defaults to the first site's.
function sceneFills(extras?: MirrorExtras, yaw = WEST, eye: FloorPoint = PLACES.nook): Fill[] {
  const { ctx, fills } = createFakeContext(VIEW_WIDTH, VIEW_HEIGHT)
  drawScene(ctx, yaw, eye, { plaque: RESTING_PLAQUE, ...extras })
  return fills
}

// Renders the pane with its on-screen rect at `rect`, by default (0, 0) and
// the same size as the canvas.
function renderPane(rect = new DOMRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT)) {
  const result = render(<ViewPane />)
  const canvas = screen.getByRole('img')
  const getRect = vi.spyOn(canvas, 'getBoundingClientRect')
  getRect.mockReturnValue(rect)
  return { ...result, canvas, getRect }
}

function clickAt(canvas: HTMLElement, clientX: number, clientY = MIDDLE_Y) {
  fireEvent.click(canvas, { clientX, clientY })
}

// Turns left to face west at the start, then steps forward into the nook.
function enterNook(canvas: HTMLElement) {
  clickAt(canvas, LEFT_X)
  clickAt(canvas, CENTRE_X)
}

// Makes getContext return `ctx` for the room canvas, and null for the panels so
// their drawing doesn't mix with the room's.
function provideContext(ctx: CanvasRenderingContext2D) {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (this: HTMLCanvasElement) {
    return this.classList.contains('view-pane') ? ctx : null
  } as unknown as HTMLCanvasElement['getContext'])
}

// Gives each canvas its own recording context, so the panels' fills can be told
// apart from the room's. Returns the fills made on a canvas.
function contextPerCanvas() {
  const contexts = new Map<HTMLCanvasElement, ReturnType<typeof createFakeContext>>()
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (this: HTMLCanvasElement) {
    let fake = contexts.get(this)
    if (!fake) {
      // Sized like the canvas it's for, as a real context's canvas is.
      fake = createFakeContext(this.width, this.height)
      contexts.set(this, fake)
    }
    return fake.ctx
  } as unknown as HTMLCanvasElement['getContext'])
  return (canvas: HTMLCanvasElement) => contexts.get(canvas)?.fills ?? []
}

const useReducedMotion = (matches = true) =>
  vi.stubGlobal('matchMedia', (query: string) => ({ matches, media: query }))

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

// The time animations start at, and the state useAnimation sets up for each test.
const START = 1000
let frames: ReturnType<typeof stubAnimationFrames>
let now: MockInstance<() => number>
let room: ReturnType<typeof createFakeContext>

// Runs each test in the calling describe with manual animation frames and the
// clock stopped at START, and (unless `withContext` is false) a recording
// context for the room canvas in `room`.
function useAnimation({ withContext = true } = {}) {
  beforeEach(() => {
    if (withContext) {
      room = createFakeContext(VIEW_WIDTH, VIEW_HEIGHT)
      provideContext(room.ctx)
    }
    frames = stubAnimationFrames()
    now = vi.spyOn(performance, 'now').mockReturnValue(START)
  })

  afterEach(() => {
    now.mockRestore()
  })
}

// Renders, turns west and steps into the nook, letting each animation finish,
// then clears the frames requested and the room's fills so far.
function renderInNook() {
  const result = renderPane()
  clickAt(result.canvas, LEFT_X)
  frames.flush(START + TURN_DURATION_MS)
  clickAt(result.canvas, CENTRE_X)
  frames.flush(START + MOVE_DURATION_MS)
  expect(result.canvas).toHaveAttribute('data-place', 'nook')
  expect(result.canvas).toHaveAttribute('data-heading', 'west')
  frames.requestAnimationFrame.mockClear()
  room.fills.length = 0
  return result
}

function lowerPanel(container: HTMLElement): HTMLCanvasElement {
  return container.querySelector<HTMLCanvasElement>('canvas.view-pane-lower')!
}

function sidePanel(container: HTMLElement): HTMLCanvasElement {
  return container.querySelector<HTMLCanvasElement>('canvas.view-pane-side')!
}

// Renders the pane with the room's and the lower panel's on-screen rects at
// (0, 0), each the same size as its canvas's drawing.
function renderWithPanel() {
  const result = renderPane()
  const panel = lowerPanel(result.container)
  const getPanelRect = vi.spyOn(panel, 'getBoundingClientRect')
  getPanelRect.mockReturnValue(new DOMRect(0, 0, LOWER_PANEL_WIDTH, LOWER_PANEL_HEIGHT))
  return { ...result, panel, getPanelRect }
}

// The middle of a button, in the panel's drawing pixels.
function buttonCentre(button: NavButton): { x: number; y: number } {
  const { left, top, right, bottom } = NAV_BUTTON_BOUNDS[button]
  return { x: (left + right + 1) / 2, y: (top + bottom + 1) / 2 }
}

function clickButton(panel: HTMLElement, button: NavButton) {
  const { x, y } = buttonCentre(button)
  fireEvent.click(panel, { clientX: x, clientY: y })
}

function hoverButton(panel: HTMLElement, button: NavButton) {
  const { x, y } = buttonCentre(button)
  fireEvent.mouseMove(panel, { clientX: x, clientY: y })
}

// Fires a keydown for `key` on `target` (the window by default), returning
// false if the pane prevented its default action.
function pressKey(key: string, init: KeyboardEventInit = {}, target: Window | Element = window): boolean {
  return fireEvent.keyDown(target, { key, ...init })
}

const ARROW_KEYS: Record<NavButton, string> = { forward: 'ArrowUp', back: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' }

// Ways of working a navigation button: clicking it on the panel, pressing its
// arrow key, or clicking the room's matching zone, which has no way back.
type Pane = ReturnType<typeof renderWithPanel>
type Input = { name: string; use: (pane: Pane, button: NavButton) => void; buttons: NavButton[] }
const PANEL_INPUT: Input = {
  name: 'the panel',
  use: ({ panel }, button) => clickButton(panel, button),
  buttons: ['forward', 'back', 'left', 'right'],
}
const KEY_INPUT: Input = {
  name: 'the arrow keys',
  use: (_, button) => pressKey(ARROW_KEYS[button]),
  buttons: ['forward', 'back', 'left', 'right'],
}
const ROOM_INPUT: Input = {
  name: 'the room',
  use: ({ canvas }, button) => clickAt(canvas, { forward: CENTRE_X, back: NaN, left: LEFT_X, right: RIGHT_X }[button]),
  buttons: ['forward', 'left', 'right'],
}
const INPUTS = [PANEL_INPUT, KEY_INPUT]

type Enabled = Record<NavButton, boolean>

// Which buttons can be used at each place and heading the tests visit.
const START_NORTH: Enabled = { forward: false, back: false, left: true, right: true }
const START_WEST: Enabled = { forward: true, back: false, left: true, right: true }
const START_EAST: Enabled = { forward: false, back: true, left: true, right: true }
const NOOK_WEST: Enabled = { forward: false, back: true, left: true, right: true }
// Mid-move the pressed key looks usable while it's held, even where it
// won't be once the move ends.
const NOOK_WEST_FORWARD_HELD: Enabled = { ...NOOK_WEST, forward: true }

// The fills drawNavigationPanel makes on a canvas the lower panel's size.
function navPanelFills(yaw: number, enabled: Enabled, press?: KeyPress): Fill[] {
  const { ctx, fills } = createFakeContext(LOWER_PANEL_WIDTH, LOWER_PANEL_HEIGHT)
  drawNavigationPanel(ctx, yaw, enabled, press)
  return fills
}

// The fills since the panel's last background fill: its most recent drawing.
function lastPanelDraw(fills: Fill[]): Fill[] {
  const isBackground = ({ args }: Fill) =>
    args[0] === 0 && args[1] === 0 && args[2] === LOWER_PANEL_WIDTH && args[3] === LOWER_PANEL_HEIGHT
  const starts = fills.flatMap((fill, index) => (isBackground(fill) ? [index] : []))
  return starts.length === 0 ? [] : fills.slice(starts[starts.length - 1])
}

// How many times the panel has been drawn, counting its background fills.
function panelDraws(fills: Fill[]): number {
  return fills.filter(({ args }) => args[2] === LOWER_PANEL_WIDTH && args[3] === LOWER_PANEL_HEIGHT).length
}

describe('ViewPane', () => {
  it('renders the room as the only image, a canvas named "Dungeon view" at its drawing resolution', () => {
    render(<ViewPane />)

    const canvas = screen.getByRole('img', { name: 'Dungeon view' })
    expect(screen.getAllByRole('img')).toHaveLength(1)
    expect(canvas.tagName).toBe('CANVAS')
    expect(canvas).toHaveClass('view-pane')
    expect(canvas).toHaveAttribute('width', String(VIEW_WIDTH))
    expect(canvas).toHaveAttribute('height', String(VIEW_HEIGHT))
  })

  it('starts at the start facing north, on the first site', () => {
    render(<ViewPane />)

    const canvas = screen.getByRole('img')
    expect(canvas).toHaveAttribute('data-place', 'start')
    expect(canvas).toHaveAttribute('data-heading', 'north')
    expect(canvas).toHaveAttribute('data-site', MIRROR_SITE.name)
  })

  it('draws the scene background on mount', () => {
    const { ctx, fillRect } = createFakeContext(VIEW_WIDTH, VIEW_HEIGHT)
    // spyOn returns the existing setup.ts spy; mockReturnValueOnce leaves its
    // null default in place for the panels.
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext')
    getContext.mockReturnValueOnce(ctx)

    render(<ViewPane />)

    expect(getContext).toHaveBeenLastCalledWith('2d')
    expect(fillRect).toHaveBeenCalledWith(0, 0, VIEW_WIDTH, VIEW_HEIGHT)
  })

  describe('panels', () => {
    it.each([
      ['lower', lowerPanel, LOWER_PANEL_WIDTH, LOWER_PANEL_HEIGHT],
      ['side', sidePanel, SIDE_PANEL_WIDTH, SIDE_PANEL_HEIGHT],
    ])('renders the %s panel at its drawing size, hidden from assistive technology', (_, find, width, height) => {
      const { container } = render(<ViewPane />)

      const panel = find(container)
      expect(panel).toHaveAttribute('width', String(width))
      expect(panel).toHaveAttribute('height', String(height))
      expect(panel).toHaveAttribute('aria-hidden', 'true')
    })

    it('fills the side panel with the background on mount', () => {
      const fillsOn = contextPerCanvas()

      const { container } = render(<ViewPane />)

      expect(fillsOn(sidePanel(container))).toEqual([
        { args: [0, 0, SIDE_PANEL_WIDTH, SIDE_PANEL_HEIGHT], fillStyle: BACKGROUND },
      ])
    })

    it('shows the blocked cursor over the frame, which its dividers and the side panel inherit', () => {
      const { container } = render(<ViewPane />)

      expect(container.querySelector<HTMLElement>('.view-pane-frame')!.style.cursor).toBe(BLOCKED_CURSOR)
      for (const element of [sidePanel(container), ...container.querySelectorAll<HTMLElement>('.view-pane-divider')]) {
        expect(element.style.cursor).toBe('')
      }
    })

    it('keeps the blocked cursor over the frame when the mouse moves over the side panel', () => {
      const { container } = render(<ViewPane />)

      fireEvent.mouseMove(sidePanel(container), { clientX: CENTRE_X, clientY: MIDDLE_Y })

      expect(container.querySelector<HTMLElement>('.view-pane-frame')!.style.cursor).toBe(BLOCKED_CURSOR)
    })

    it('leaves the room cursor unchanged when the mouse moves over a panel', () => {
      const { canvas, container, panel } = renderWithPanel()
      fireEvent.mouseMove(canvas, { clientX: LEFT_X, clientY: MIDDLE_Y })

      hoverButton(panel, 'right')
      fireEvent.mouseMove(lowerPanel(container), { clientX: RIGHT_X, clientY: MIDDLE_Y })
      fireEvent.mouseMove(sidePanel(container), { clientX: CENTRE_X, clientY: MIDDLE_Y })

      expect(canvas.style.cursor).toBe(CURSORS['turn-left'])
    })
  })

  describe('lower panel drawing', () => {
    it('draws the navigation panel facing north on mount, with forward and back unusable', () => {
      const fillsOn = contextPerCanvas()

      const { container } = render(<ViewPane />)

      expect(fillsOn(lowerPanel(container))).toEqual(navPanelFills(0, START_NORTH))
    })

    it.each([
      ['west, with forward usable, after turning left', LEFT_X, Math.PI / 2, START_WEST],
      ['east, with back usable, after turning right', RIGHT_X, -Math.PI / 2, START_EAST],
    ])('redraws facing %s', (_, x, yaw, enabled) => {
      useReducedMotion()
      const fillsOn = contextPerCanvas()
      const { canvas, container } = renderPane()

      clickAt(canvas, x)

      expect(lastPanelDraw(fillsOn(lowerPanel(container)))).toEqual(navPanelFills(yaw, enabled))
    })

    it('redraws with only back usable after moving into the nook', () => {
      useReducedMotion()
      const fillsOn = contextPerCanvas()
      const { canvas, container } = renderPane()

      enterNook(canvas)

      expect(canvas).toHaveAttribute('data-place', 'nook')
      expect(lastPanelDraw(fillsOn(lowerPanel(container)))).toEqual(navPanelFills(Math.PI / 2, NOOK_WEST))
    })

    it('does not redraw the panel when the mouse moves over the room', () => {
      const fillsOn = contextPerCanvas()
      const { canvas, container } = renderPane()
      const before = panelDraws(fillsOn(lowerPanel(container)))

      fireEvent.mouseMove(canvas, { clientX: LEFT_X, clientY: MIDDLE_Y })

      expect(panelDraws(fillsOn(lowerPanel(container)))).toBe(before)
    })

    describe('while animating', () => {
      useAnimation({ withContext: false })

      it('redraws the compass part way round on each frame of a turn', () => {
        const fillsOn = contextPerCanvas()
        const { canvas, container } = renderPane()
        clickAt(canvas, LEFT_X)

        frames.flush(START + TURN_DURATION_MS / 2)

        expect(lastPanelDraw(fillsOn(lowerPanel(container)))).toEqual(
          navPanelFills(Math.PI / 4, START_WEST, { button: 'left', depth: 1 }),
        )
      })

      it('draws the panel once per frame of a turn', () => {
        const fillsOn = contextPerCanvas()
        const { canvas, container } = renderPane()
        clickAt(canvas, LEFT_X)
        const before = panelDraws(fillsOn(lowerPanel(container)))

        frames.flush(START + TURN_DURATION_MS / 4)
        frames.flush(START + TURN_DURATION_MS / 2)

        expect(panelDraws(fillsOn(lowerPanel(container)))).toBe(before + 2)
      })

      it('redraws the panel on each frame of a move, showing the buttons for where it leads', () => {
        const fillsOn = contextPerCanvas()
        const { canvas, container } = renderPane()
        clickAt(canvas, LEFT_X)
        frames.flush(START + TURN_DURATION_MS)
        clickAt(canvas, CENTRE_X)
        const before = panelDraws(fillsOn(lowerPanel(container)))

        frames.flush(START + MOVE_DURATION_MS / 2)

        expect(panelDraws(fillsOn(lowerPanel(container)))).toBe(before + 1)
        expect(lastPanelDraw(fillsOn(lowerPanel(container)))).toEqual(
          navPanelFills(Math.PI / 2, NOOK_WEST_FORWARD_HELD, { button: 'forward', depth: 1 }),
        )
      })
    })
  })

  describe('key presses', () => {
    useAnimation({ withContext: false })
    let fillsOn: ReturnType<typeof contextPerCanvas>

    beforeEach(() => {
      fillsOn = contextPerCanvas()
    })

    // Expects the panel's latest drawing to end with the buttons showing `enabled` with `press`.
    function expectButtons(container: HTMLElement, enabled: Enabled, press?: KeyPress) {
      const expected = toFills(navButtonPixels(enabled, press))
      expect(lastPanelDraw(fillsOn(lowerPanel(container))).slice(-expected.length)).toEqual(expected)
    }

    // Each button, what the panel shows while it's pressed, and the turn that
    // first makes it usable.
    const PRESSES: [NavButton, Enabled, NavButton[]][] = [
      ['left', START_WEST, []],
      ['right', START_EAST, []],
      ['forward', NOOK_WEST_FORWARD_HELD, ['left']],
      // In the nook facing east only forward leads anywhere, but the back key
      // looks usable while it's held.
      ['back', { forward: true, back: true, left: true, right: true }, ['right']],
    ]
    const PRESS_CASES = [ROOM_INPUT, ...INPUTS].flatMap((input) =>
      PRESSES.filter(([button]) => input.buttons.includes(button)).map(
        ([button, enabled, before]) => [button, input.name, input, enabled, before] as const,
      ),
    )

    it.each(PRESS_CASES)('presses the %s key half-way through its animation from %s', (button, _, input, enabled, before) => {
      const pane = renderWithPanel()
      for (const turn of before) {
        input.use(pane, turn)
        frames.flush(START + TURN_DURATION_MS)
      }
      input.use(pane, button)

      const isTurn = button === 'left' || button === 'right'
      frames.flush(START + (isTurn ? TURN_DURATION_MS : MOVE_DURATION_MS) / 2)

      expectButtons(pane.container, enabled, { button, depth: 1 })
    })

    // The key goes down over the first 60 ms and comes up over the last 60 ms.
    it.each([
      [0, 0],
      [20, 1 / 3],
      [40, 2 / 3],
      [60, 1],
      [TURN_DURATION_MS / 2, 1],
      [TURN_DURATION_MS - 60, 1],
      [TURN_DURATION_MS - 40, 2 / 3],
      [TURN_DURATION_MS - 20, 1 / 3],
    ])('has the key %s ms into a turn at depth %s', (elapsed, depth) => {
      const { canvas, container } = renderPane()
      clickAt(canvas, LEFT_X)

      frames.flush(START + elapsed)

      expectButtons(container, START_WEST, { button: 'left', depth })
    })

    it.each([
      [20, 1 / 3],
      [MOVE_DURATION_MS / 2, 1],
      [MOVE_DURATION_MS - 20, 1 / 3],
    ])('has the key %s ms into a move at depth %s', (elapsed, depth) => {
      const { canvas, container } = renderPane()
      clickAt(canvas, LEFT_X)
      frames.flush(START + TURN_DURATION_MS)
      clickAt(canvas, CENTRE_X)

      frames.flush(START + elapsed)

      expectButtons(container, NOOK_WEST_FORWARD_HELD, { button: 'forward', depth })
    })

    it('releases the key on the last frame of a turn', () => {
      const { canvas, container } = renderPane()
      clickAt(canvas, LEFT_X)
      frames.flush(START + TURN_DURATION_MS / 2)

      frames.flush(START + TURN_DURATION_MS)

      expect(frames.pending()).toBe(0)
      expect(lastPanelDraw(fillsOn(lowerPanel(container)))).toEqual(navPanelFills(Math.PI / 2, START_WEST))
    })

    it('releases the key on the last frame of a move', () => {
      const { canvas, container } = renderPane()
      clickAt(canvas, LEFT_X)
      frames.flush(START + TURN_DURATION_MS)
      clickAt(canvas, CENTRE_X)
      frames.flush(START + MOVE_DURATION_MS / 2)

      frames.flush(START + MOVE_DURATION_MS)

      expect(frames.pending()).toBe(0)
      expect(lastPanelDraw(fillsOn(lowerPanel(container)))).toEqual(navPanelFills(Math.PI / 2, NOOK_WEST))
    })

    it('releases the key when a late frame runs past the end of a turn', () => {
      const { canvas, container } = renderPane()
      clickAt(canvas, LEFT_X)

      frames.flush(START + TURN_DURATION_MS + 100)

      expect(lastPanelDraw(fillsOn(lowerPanel(container)))).toEqual(navPanelFills(Math.PI / 2, START_WEST))
    })

    it.each(INPUTS)('presses no key with reduced motion, using $name', (input) => {
      useReducedMotion()
      const pane = renderWithPanel()

      input.use(pane, 'left')
      input.use(pane, 'forward')

      expect(frames.requestAnimationFrame).not.toHaveBeenCalled()
      expect(pane.canvas).toHaveAttribute('data-place', 'nook')
      expect(pane.canvas).toHaveAttribute('data-heading', 'west')
      expect(lastPanelDraw(fillsOn(lowerPanel(pane.container)))).toEqual(navPanelFills(Math.PI / 2, NOOK_WEST))
    })

    it('draws the same panel frames for an arrow key as for a click on its button', () => {
      const clicked = renderWithPanel()
      clickButton(clicked.panel, 'left')
      frames.flush(START + 20)
      frames.flush(START + TURN_DURATION_MS / 2)
      frames.flush(START + TURN_DURATION_MS)
      const clickFills = [...fillsOn(lowerPanel(clicked.container))]
      clicked.unmount()

      const pressed = renderPane()
      pressKey('ArrowLeft')
      frames.flush(START + 20)
      frames.flush(START + TURN_DURATION_MS / 2)
      frames.flush(START + TURN_DURATION_MS)

      expect(fillsOn(lowerPanel(pressed.container))).toEqual(clickFills)
    })

    it.each([
      ['a mirror ripple', MIRROR_X, MIRROR_Y],
      ['a curtain pull', PULL_X, HANDLE_Y],
    ])('does not draw the panel during %s', (_, x, y) => {
      const { canvas, container } = renderPane()
      clickAt(canvas, LEFT_X)
      frames.flush(START + TURN_DURATION_MS)
      clickAt(canvas, CENTRE_X)
      frames.flush(START + MOVE_DURATION_MS)
      expect(canvas).toHaveAttribute('data-place', 'nook')
      const before = panelDraws(fillsOn(lowerPanel(container)))

      clickAt(canvas, x, y)
      frames.flush(START + 50)
      frames.flush(START + 100)

      expect(frames.pending()).toBe(1)
      expect(panelDraws(fillsOn(lowerPanel(container)))).toBe(before)
    })
  })

  describe.each(INPUTS)('navigating with $name', (input) => {
    // Renders, then works the given buttons in turn.
    function renderAndUse(...buttons: NavButton[]) {
      const pane = renderWithPanel()
      for (const button of buttons) input.use(pane, button)
      return pane
    }

    it.each([
      ['left', 'west'],
      ['right', 'east'],
    ] as const)('turns %s to face %s, staying at the start', (button, heading) => {
      const { canvas } = renderAndUse(button)

      expect(canvas).toHaveAttribute('data-heading', heading)
      expect(canvas).toHaveAttribute('data-place', 'start')
    })

    it('keeps turning with each use of a turn button', () => {
      const { canvas } = renderAndUse('left', 'left')

      expect(canvas).toHaveAttribute('data-heading', 'south')
    })

    it('turns the same way as clicking the room\'s edge', () => {
      const { canvas } = renderAndUse('left')

      clickAt(canvas, RIGHT_X)

      expect(canvas).toHaveAttribute('data-heading', 'north')
    })

    it.each(['forward', 'back'] as const)('does nothing for %s with nowhere to go', (button) => {
      const { canvas } = renderAndUse(button)

      expect(canvas).toHaveAttribute('data-place', 'start')
      expect(canvas).toHaveAttribute('data-heading', 'north')
    })

    it.each<[string, NavButton[], string, string]>([
      ['steps forward into the nook facing west', ['left', 'forward'], 'nook', 'west'],
      ['steps back out of the nook to the start without turning', ['left', 'forward', 'back'], 'start', 'west'],
      ['steps back from the start into the nook facing east', ['right', 'back'], 'nook', 'east'],
      ['steps forward out of the nook facing east, after stepping back into it', ['right', 'back', 'forward'], 'start', 'east'],
      ['does not step back from the nook facing east, where only forward leads', ['right', 'back', 'back'], 'nook', 'east'],
    ])('%s', (_, buttons, place, heading) => {
      const { canvas } = renderAndUse(...buttons)

      expect(canvas).toHaveAttribute('data-place', place)
      expect(canvas).toHaveAttribute('data-heading', heading)
    })

    describe('with animation', () => {
      useAnimation()

      it('animates a turn', () => {
        const { canvas } = renderAndUse('left')

        expect(frames.requestAnimationFrame).toHaveBeenCalledTimes(1)
        expect(canvas).toHaveAttribute('data-heading', 'west')
      })

      it('animates a step over the move duration', () => {
        const pane = renderAndUse('right')
        frames.flush(START + TURN_DURATION_MS)

        input.use(pane, 'back')
        frames.flush(START + TURN_DURATION_MS)

        expect(pane.canvas).toHaveAttribute('data-place', 'nook')
        expect(frames.pending()).toBe(1)
        frames.flush(START + MOVE_DURATION_MS)
        expect(frames.pending()).toBe(0)
      })

      it('does not animate for the unusable forward and back', () => {
        renderAndUse('forward', 'back')

        expect(frames.requestAnimationFrame).not.toHaveBeenCalled()
      })

      it('is ignored during a turn', () => {
        const pane = renderAndUse('left')
        frames.flush(START + TURN_DURATION_MS / 2)

        input.use(pane, 'left')
        input.use(pane, 'forward')

        expect(pane.canvas).toHaveAttribute('data-heading', 'west')
        expect(pane.canvas).toHaveAttribute('data-place', 'start')
        expect(frames.requestAnimationFrame).toHaveBeenCalledTimes(2)
      })

      it('is ignored during a move started from the room', () => {
        const pane = renderWithPanel()
        clickAt(pane.canvas, LEFT_X)
        frames.flush(START + TURN_DURATION_MS)
        clickAt(pane.canvas, CENTRE_X)
        frames.flush(START + MOVE_DURATION_MS / 2)

        input.use(pane, 'back')
        input.use(pane, 'right')

        expect(pane.canvas).toHaveAttribute('data-place', 'nook')
        expect(pane.canvas).toHaveAttribute('data-heading', 'west')
      })

      it('makes the room ignore clicks during a turn it started', () => {
        const { canvas } = renderAndUse('left')
        frames.flush(START + TURN_DURATION_MS / 2)

        clickAt(canvas, LEFT_X)

        expect(canvas).toHaveAttribute('data-heading', 'west')
      })

      it('is accepted again once the animation has finished', () => {
        const pane = renderAndUse('left')
        frames.flush(START + TURN_DURATION_MS)

        input.use(pane, 'forward')

        expect(pane.canvas).toHaveAttribute('data-place', 'nook')
      })

      it('moves at once with reduced motion', () => {
        useReducedMotion()

        const { canvas } = renderAndUse('left', 'forward')

        expect(frames.requestAnimationFrame).not.toHaveBeenCalled()
        expect(canvas).toHaveAttribute('data-place', 'nook')
        expect(canvas).toHaveAttribute('data-heading', 'west')
      })
    })
  })

  describe('navigation buttons', () => {
    it.each([
      ['the compass', 78, 80],
      ['the middle of the buttons', 230, 80],
      ['the panel\'s corner', 0, 0],
    ])('does nothing when %s is clicked', (_, clientX, clientY) => {
      const { canvas, panel } = renderWithPanel()

      fireEvent.click(panel, { clientX, clientY })

      expect(canvas).toHaveAttribute('data-place', 'start')
      expect(canvas).toHaveAttribute('data-heading', 'north')
    })

    it('uses the panel\'s on-screen size and position to find the button', () => {
      const { canvas, panel, getPanelRect } = renderWithPanel()
      getPanelRect.mockReturnValue(new DOMRect(100, 50, LOWER_PANEL_WIDTH * 2, LOWER_PANEL_HEIGHT * 2))
      const { x, y } = buttonCentre('left')

      // Where the left button is in drawing pixels is a different button at this size.
      fireEvent.click(panel, { clientX: x, clientY: y })
      expect(canvas).toHaveAttribute('data-heading', 'north')
      fireEvent.click(panel, { clientX: 100 + x * 2, clientY: 50 + y * 2 })
      expect(canvas).toHaveAttribute('data-heading', 'west')
    })

    it.each([
      ['width', new DOMRect(0, 0, 0, LOWER_PANEL_HEIGHT)],
      ['height', new DOMRect(0, 0, LOWER_PANEL_WIDTH, 0)],
    ])('ignores clicks when the panel has zero %s', (_, rect) => {
      const { canvas, panel, getPanelRect } = renderWithPanel()
      getPanelRect.mockReturnValue(rect)

      clickButton(panel, 'left')

      expect(canvas).toHaveAttribute('data-heading', 'north')
    })
  })

  describe('arrow keys', () => {
    it('visits the same places as the buttons do over a mixed sequence of keys', () => {
      const { canvas } = renderPane()
      const visited: string[] = []

      for (const key of ['ArrowLeft', 'ArrowUp', 'ArrowDown', 'ArrowRight']) {
        pressKey(key)
        visited.push(`${canvas.dataset.place}/${canvas.dataset.heading}`)
      }

      expect(visited).toEqual(['start/west', 'nook/west', 'start/west', 'start/north'])
    })

    it('mixes with panel clicks, both working the same buttons', () => {
      const { canvas, panel } = renderWithPanel()

      pressKey('ArrowLeft')
      clickButton(panel, 'forward')
      pressKey('ArrowDown')

      expect(canvas).toHaveAttribute('data-place', 'start')
      expect(canvas).toHaveAttribute('data-heading', 'west')
    })

    it('works when the key is aimed at an element that does not take typing', () => {
      const { canvas } = renderPane()

      pressKey('ArrowLeft', {}, document.body)

      expect(canvas).toHaveAttribute('data-heading', 'west')
    })

    // ArrowUp and ArrowDown lead nowhere from the start, so this includes keys
    // whose button is unusable.
    it.each(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'])('prevents the default action of %s', (key) => {
      renderPane()

      expect(pressKey(key)).toBe(false)
    })

    it.each(['a', 'Enter', ' ', 'Escape', 'Tab', 'PageDown', 'Up', 'Left'])(
      'ignores the %j key and leaves its default action',
      (key) => {
        const { canvas } = renderPane()

        expect(pressKey(key)).toBe(true)
        expect(canvas).toHaveAttribute('data-heading', 'north')
      },
    )

    it.each(['altKey', 'ctrlKey', 'metaKey'] as const)('ignores arrow keys with %s held', (modifier) => {
      const { canvas } = renderPane()

      expect(pressKey('ArrowLeft', { [modifier]: true })).toBe(true)
      expect(canvas).toHaveAttribute('data-heading', 'north')
    })

    it('still handles arrow keys with shift held', () => {
      const { canvas } = renderPane()

      expect(pressKey('ArrowLeft', { shiftKey: true })).toBe(false)
      expect(canvas).toHaveAttribute('data-heading', 'west')
    })

    it.each([
      ['an input', 'input'],
      ['a textarea', 'textarea'],
      ['a select', 'select'],
    ])('leaves arrow keys aimed at %s alone', (_, tag) => {
      const { canvas } = renderPane()
      const field = render(<div />).container.appendChild(document.createElement(tag))

      expect(pressKey('ArrowLeft', {}, field)).toBe(true)
      expect(canvas).toHaveAttribute('data-heading', 'north')
    })

    it('leaves arrow keys aimed at a contentEditable element alone', () => {
      const { canvas } = renderPane()
      render(<div aria-label="field" contentEditable />)
      const field = screen.getByLabelText('field')
      // jsdom doesn't implement isContentEditable, so give it what a browser would.
      Object.defineProperty(field, 'isContentEditable', { value: true })

      expect(pressKey('ArrowLeft', {}, field)).toBe(true)
      expect(canvas).toHaveAttribute('data-heading', 'north')
    })

    describe('with animation', () => {
      useAnimation()

      it('stops listening for keys once unmounted', () => {
        const { canvas, unmount } = renderPane()
        unmount()

        expect(pressKey('ArrowLeft')).toBe(true)
        expect(canvas).toHaveAttribute('data-heading', 'north')
        expect(frames.requestAnimationFrame).not.toHaveBeenCalled()
      })

      it('prevents the default action of arrow keys pressed mid-animation', () => {
        renderPane()
        pressKey('ArrowLeft')

        expect(pressKey('ArrowRight')).toBe(false)
      })

      it('ignores repeats of a held key until the animation ends', () => {
        const { canvas } = renderPane()
        pressKey('ArrowLeft')

        pressKey('ArrowLeft', { repeat: true })
        frames.flush(START + TURN_DURATION_MS / 2)
        pressKey('ArrowLeft', { repeat: true })

        expect(canvas).toHaveAttribute('data-heading', 'west')
      })

      it('turns again on a repeat of a held key once the animation ends', () => {
        const { canvas } = renderPane()
        pressKey('ArrowLeft')
        frames.flush(START + TURN_DURATION_MS)

        pressKey('ArrowLeft', { repeat: true })

        expect(canvas).toHaveAttribute('data-heading', 'south')
        expect(frames.pending()).toBe(1)
      })

      it('keeps turning as a held key repeats through several animations', () => {
        const { canvas } = renderPane()
        pressKey('ArrowRight')
        for (let turn = 1; turn <= 3; turn++) {
          const end = START + turn * TURN_DURATION_MS
          frames.flush(end)
          now.mockReturnValue(end)
          pressKey('ArrowRight', { repeat: true })
        }

        // Four quarter turns bring it back round to north, the last still playing.
        expect(canvas).toHaveAttribute('data-heading', 'north')
        expect(frames.pending()).toBe(1)
      })
    })
  })

  describe('panel cursor', () => {
    it('shows the blocked cursor before the mouse moves over it', () => {
      const { panel } = renderWithPanel()

      expect(panel.style.cursor).toBe(BLOCKED_CURSOR)
    })

    it.each(['left', 'right'] as const)('shows the hand over the %s button', (button) => {
      const { panel } = renderWithPanel()

      hoverButton(panel, button)

      expect(panel.style.cursor).toBe(HAND_CURSOR)
    })

    it.each(['forward', 'back'] as const)('shows the blocked cursor over the unusable %s button', (button) => {
      const { panel } = renderWithPanel()

      hoverButton(panel, button)

      expect(panel.style.cursor).toBe(BLOCKED_CURSOR)
    })

    it('shows the blocked cursor away from the buttons', () => {
      const { panel } = renderWithPanel()
      hoverButton(panel, 'left')

      fireEvent.mouseMove(panel, { clientX: 78, clientY: 80 })

      expect(panel.style.cursor).toBe(BLOCKED_CURSOR)
    })

    it('returns to the blocked cursor when the mouse leaves the panel', () => {
      const { panel } = renderWithPanel()
      hoverButton(panel, 'left')

      fireEvent.mouseLeave(panel)

      expect(panel.style.cursor).toBe(BLOCKED_CURSOR)
    })

    it('shows the hand over forward once there\'s a way forward', () => {
      const { panel } = renderWithPanel()
      hoverButton(panel, 'left')
      clickButton(panel, 'left')

      hoverButton(panel, 'forward')

      expect(panel.style.cursor).toBe(HAND_CURSOR)
    })

    it('updates the cursor over a button when the place changes under it', () => {
      const { canvas, panel } = renderWithPanel()
      clickAt(canvas, LEFT_X)
      hoverButton(panel, 'back')
      expect(panel.style.cursor).toBe(BLOCKED_CURSOR)

      clickAt(canvas, CENTRE_X)

      expect(canvas).toHaveAttribute('data-place', 'nook')
      expect(panel.style.cursor).toBe(HAND_CURSOR)
    })

    it('uses the panel\'s on-screen size to find the button under the mouse', () => {
      const { panel, getPanelRect } = renderWithPanel()
      getPanelRect.mockReturnValue(new DOMRect(100, 50, LOWER_PANEL_WIDTH * 2, LOWER_PANEL_HEIGHT * 2))
      const { x, y } = buttonCentre('left')

      fireEvent.mouseMove(panel, { clientX: 100 + x * 2, clientY: 50 + y * 2 })

      expect(panel.style.cursor).toBe(HAND_CURSOR)
    })

    it('shows the blocked cursor when the panel has no size on screen', () => {
      const { panel, getPanelRect } = renderWithPanel()
      getPanelRect.mockReturnValue(new DOMRect(0, 0, 0, 0))

      hoverButton(panel, 'left')

      expect(panel.style.cursor).toBe(BLOCKED_CURSOR)
    })

    describe('while animating', () => {
      useAnimation()

      it('shows the blocked cursor over a button during a turn', () => {
        const { panel } = renderWithPanel()
        hoverButton(panel, 'left')

        clickButton(panel, 'left')

        expect(panel.style.cursor).toBe(BLOCKED_CURSOR)
      })

      it('shows the blocked cursor over a button hovered during a turn', () => {
        const { panel } = renderWithPanel()
        clickButton(panel, 'left')
        frames.flush(START + TURN_DURATION_MS / 2)

        hoverButton(panel, 'right')

        expect(panel.style.cursor).toBe(BLOCKED_CURSOR)
      })

      it('shows the cursor again once the turn has finished', () => {
        const { panel } = renderWithPanel()
        hoverButton(panel, 'left')
        clickButton(panel, 'left')

        frames.flush(START + TURN_DURATION_MS)

        expect(panel.style.cursor).toBe(HAND_CURSOR)
      })
    })
  })

  describe('cursor', () => {
    // A 400px wide pane at x 100.
    const WIDE = new DOMRect(100, 0, 400, 300)

    it('defaults to the blocked cursor, since there\'s no way forward from the start facing north', () => {
      render(<ViewPane />)

      expect(screen.getByRole('img').style.cursor).toBe(BLOCKED_CURSOR)
    })

    it.each([
      [110, 'turn-left', CURSORS['turn-left']],
      [300, 'blocked', BLOCKED_CURSOR],
      [490, 'turn-right', CURSORS['turn-right']],
    ] as const)('at clientX %s facing north uses the %s cursor', (clientX, _, cursor) => {
      const { canvas } = renderPane(WIDE)

      fireEvent.mouseMove(canvas, { clientX })

      expect(canvas.style.cursor).toBe(cursor)
    })

    it('uses the forward cursor in the centre facing west, towards the nook', () => {
      const { canvas } = renderPane(WIDE)
      fireEvent.click(canvas, { clientX: 110, clientY: 100 })

      fireEvent.mouseMove(canvas, { clientX: 300 })

      expect(canvas.style.cursor).toBe(CURSORS.forward)
    })

    it.each([
      ['blocked', 'north', [], BLOCKED_CURSOR],
      ['forward', 'west', [110], CURSORS.forward],
    ] as const)('returns to the %s cursor after leaving an edge zone facing %s', (_, __, clicks, cursor) => {
      const { canvas } = renderPane(WIDE)
      for (const clientX of clicks) fireEvent.click(canvas, { clientX, clientY: 100 })

      fireEvent.mouseMove(canvas, { clientX: 110 })
      fireEvent.mouseMove(canvas, { clientX: 300 })

      expect(canvas.style.cursor).toBe(cursor)
    })
  })

  describe('sign cursor', () => {
    it('shows the hand over the centre of the sign', () => {
      const { canvas } = renderPane()

      fireEvent.mouseMove(canvas, { clientX: 160, clientY: 120 })

      expect(canvas.style.cursor).toBe(HAND_CURSOR)
    })

    it('shows the hand over the sign when the pane is scaled and offset', () => {
      const { canvas } = renderPane(new DOMRect(50, 30, 640, 480))

      fireEvent.mouseMove(canvas, { clientX: 50 + 160 * 2, clientY: 30 + 120 * 2 })

      expect(canvas.style.cursor).toBe(HAND_CURSOR)
    })

    it('does not show the hand at the unscaled sign position when the pane is scaled', () => {
      // (110, 100) is over the sign at 320x240 but maps to canvas (55, 50) at 640x480,
      // which is left of the sign in the forward zone.
      const { canvas } = renderPane(new DOMRect(0, 0, 640, 480))

      fireEvent.mouseMove(canvas, { clientX: 110, clientY: 100 })

      expect(canvas.style.cursor).toBe(BLOCKED_CURSOR)
    })

    it.each([
      ['above', 160, 50, BLOCKED_CURSOR],
      ['below', 160, 200, BLOCKED_CURSOR],
      ['left of', 40, 120, CURSORS['turn-left']],
      ['right of', 300, 120, CURSORS['turn-right']],
    ] as const)('returns to the zone cursor when moving %s the sign', (_, clientX, clientY, cursor) => {
      const { canvas } = renderPane()

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
      const { canvas } = renderPane(new DOMRect(0, 0, 640, 480))

      fireEvent.mouseMove(canvas, { clientX, clientY })

      expect(canvas.style.cursor).toBe(HAND_CURSOR)
    })

    it.each([
      ['left', 199, 240],
      ['right', 440, 240],
      ['top', 320, 189],
      ['bottom', 320, 290],
    ])('does not show the hand just outside the %s edge', (_, clientX, clientY) => {
      const { canvas } = renderPane(new DOMRect(0, 0, 640, 480))

      fireEvent.mouseMove(canvas, { clientX, clientY })

      expect(canvas.style.cursor).not.toBe(HAND_CURSOR)
    })

    it.each([
      ['width', new DOMRect(0, 0, 0, 240)],
      ['height', new DOMRect(0, 0, 320, 0)],
    ])('ignores mouse moves when the canvas has zero %s', (_, rect) => {
      const { canvas, getRect } = renderPane()
      fireEvent.mouseMove(canvas, { clientX: 160, clientY: 120 })

      // Without the guard, clientX 10 would select the turn-left cursor.
      getRect.mockReturnValue(rect)
      fireEvent.mouseMove(canvas, { clientX: 10, clientY: 120 })

      expect(canvas.style.cursor).toBe(HAND_CURSOR)
    })
  })

  describe('turning', () => {
    it.each<[number[], string]>([
      [[], 'north'],
      [[LEFT_X], 'west'],
      [[LEFT_X, LEFT_X], 'south'],
      [[RIGHT_X], 'east'],
      [[LEFT_X, RIGHT_X], 'north'],
      [[CENTRE_X], 'north'],
    ])('faces the right way after clicks at %j: %s', (clicks, heading) => {
      const { canvas } = renderPane()

      for (const x of clicks) clickAt(canvas, x)

      expect(canvas).toHaveAttribute('data-heading', heading)
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
  })

  describe('without a canvas context', () => {
    useAnimation({ withContext: false })

    it.each<[string, (pane: Pane) => void, string]>([
      ['turns from the room', ({ canvas }) => clickAt(canvas, LEFT_X), 'start'],
      ['turns from the panel', ({ panel }) => clickButton(panel, 'left'), 'start'],
      ['moves from the room', ({ canvas }) => enterNook(canvas), 'nook'],
    ])('%s at once, requesting no animation frames', (_, use, place) => {
      const pane = renderWithPanel()

      use(pane)

      expect(frames.requestAnimationFrame).not.toHaveBeenCalled()
      expect(pane.canvas).toHaveAttribute('data-heading', 'west')
      expect(pane.canvas).toHaveAttribute('data-place', place)
    })
  })

  describe('turn animation', () => {
    useAnimation()

    it('requests an animation frame instead of finishing the turn at once', () => {
      const { canvas } = renderPane()

      clickAt(canvas, LEFT_X)

      expect(frames.requestAnimationFrame).toHaveBeenCalledTimes(1)
      expect(canvas).toHaveAttribute('data-heading', 'west')
    })

    it('redraws the scene on every frame', () => {
      const { canvas } = renderPane()
      clickAt(canvas, LEFT_X)

      room.fillRect.mockClear()
      frames.flush(START + TURN_DURATION_MS / 4)
      expect(room.fillRect).toHaveBeenCalledWith(0, 0, VIEW_WIDTH, VIEW_HEIGHT)

      room.fillRect.mockClear()
      frames.flush(START + TURN_DURATION_MS / 2)
      expect(room.fillRect).toHaveBeenCalledWith(0, 0, VIEW_WIDTH, VIEW_HEIGHT)
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
      room.fills.length = 0

      frames.flush(START + TURN_DURATION_MS)

      // Only the sign, the mirror's frame, the pull's handle and the plaque's
      // logo are drawn in the full foreground colour, so with the sign out of
      // view only the frame's, handle's and logo's pixels are.
      const frame = mirrorPixels(VIEW_WIDTH, VIEW_HEIGHT, WEST).filter((p) => p.colour === FOREGROUND)
      const handle = pullPixels(VIEW_WIDTH, VIEW_HEIGHT, 0, WEST).filter((p) => p.colour === FOREGROUND)
      const logo = plaquePixels(VIEW_WIDTH, VIEW_HEIGHT, RESTING_PLAQUE, WEST).filter((p) => p.colour === FOREGROUND)
      expect(room.fills.length).toBeGreaterThan(0)
      expect(room.fills.filter((f) => f.fillStyle === FOREGROUND)).toHaveLength(frame.length + handle.length + logo.length)
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

    it('snaps to each new heading with reduced motion, ready for the next turn straight away', () => {
      useReducedMotion()
      const { canvas } = renderPane()
      room.fillRect.mockClear()

      clickAt(canvas, LEFT_X)
      expect(canvas).toHaveAttribute('data-heading', 'west')
      clickAt(canvas, LEFT_X)

      expect(frames.requestAnimationFrame).not.toHaveBeenCalled()
      expect(room.fillRect).toHaveBeenCalledWith(0, 0, VIEW_WIDTH, VIEW_HEIGHT)
      expect(canvas).toHaveAttribute('data-heading', 'south')
    })

    it('animates when reduced motion is not requested', () => {
      useReducedMotion(false)
      const { canvas } = renderPane()

      clickAt(canvas, LEFT_X)

      expect(frames.requestAnimationFrame).toHaveBeenCalledTimes(1)
    })
  })

  describe('hand cursor while turning', () => {
    // Without a context until a test provides one, so turns and moves are instant.
    useAnimation({ withContext: false })

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
      const { canvas } = renderPane()
      // Turn to east instantly (no context yet), then animate the turn back to north.
      clickAt(canvas, RIGHT_X)
      provideContext(createFakeContext().ctx)
      clickAt(canvas, LEFT_X)
      expect(canvas).toHaveAttribute('data-heading', 'north')

      fireEvent.mouseMove(canvas, { clientX: SIGN_X, clientY: SIGN_Y })
      expect(canvas.style.cursor).toBe(BLOCKED_CURSOR)

      frames.flush(START + TURN_DURATION_MS)
      expect(canvas.style.cursor).toBe(HAND_CURSOR)
    })
  })

  describe('mirror cursor', () => {
    // Without a context until a test provides one, so turns and moves are instant.
    useAnimation({ withContext: false })

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
      screenToMirror(clientX / 2, clientY / 2, VIEW_WIDTH, VIEW_HEIGHT, WEST, PLACES.nook) !== null
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
      const { canvas } = renderPane()
      // Turn to west instantly (no context yet), then animate the move into the nook.
      clickAt(canvas, LEFT_X)
      provideContext(createFakeContext().ctx)
      clickAt(canvas, CENTRE_X)
      expect(canvas).toHaveAttribute('data-place', 'nook')

      fireEvent.mouseMove(canvas, { clientX: MIRROR_X, clientY: MIRROR_Y })
      expect(canvas.style.cursor).not.toBe(HAND_CURSOR)

      frames.flush(START + MOVE_DURATION_MS / 2)
      expect(canvas.style.cursor).not.toBe(HAND_CURSOR)

      frames.flush(START + MOVE_DURATION_MS)
      expect(canvas.style.cursor).toBe(HAND_CURSOR)
    })

    it('does not show the hand until a turn back to west in the nook has finished', () => {
      const { canvas } = renderPane()
      // Reach the nook and face north instantly, then animate the turn back to west.
      enterNook(canvas)
      clickAt(canvas, RIGHT_X)
      provideContext(createFakeContext().ctx)
      clickAt(canvas, LEFT_X)
      expect(canvas).toHaveAttribute('data-heading', 'west')

      fireEvent.mouseMove(canvas, { clientX: MIRROR_X, clientY: MIRROR_Y })
      expect(canvas.style.cursor).not.toBe(HAND_CURSOR)

      frames.flush(START + TURN_DURATION_MS)
      expect(canvas.style.cursor).toBe(HAND_CURSOR)
    })
  })

  describe('moving', () => {
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
      enterNook(canvas)
      clickAt(canvas, LEFT_X)
      clickAt(canvas, LEFT_X)

      fireEvent.mouseMove(canvas, { clientX: CENTRE_X, clientY: MIDDLE_Y })

      expect(canvas.style.cursor).toBe(CURSORS.forward)
    })

    it('hides the hand in the nook facing north, even over the sign area', () => {
      const { canvas } = renderPane()
      enterNook(canvas)
      clickAt(canvas, RIGHT_X)
      expect(canvas).toHaveAttribute('data-heading', 'north')

      fireEvent.mouseMove(canvas, { clientX: SIGN_X, clientY: SIGN_Y })

      expect(canvas.style.cursor).toBe(BLOCKED_CURSOR)
    })

    it('shows the hand again after returning to the start and facing north', () => {
      const { canvas } = renderPane()
      enterNook(canvas)
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
    useAnimation()

    // Renders, turns left to face west and lets the turn finish, ready to move.
    function renderFacingWest() {
      const result = renderPane()
      clickAt(result.canvas, LEFT_X)
      frames.flush(START + TURN_DURATION_MS)
      frames.requestAnimationFrame.mockClear()
      room.fills.length = 0
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
      expect(room.fillRect).toHaveBeenCalledWith(0, 0, VIEW_WIDTH, VIEW_HEIGHT)

      room.fillRect.mockClear()
      frames.flush(START + MOVE_DURATION_MS / 2)
      expect(room.fillRect).toHaveBeenCalledWith(0, 0, VIEW_WIDTH, VIEW_HEIGHT)
    })

    it('draws views between the start and the nook mid-move', () => {
      const { canvas } = renderFacingWest()
      clickAt(canvas, CENTRE_X)

      frames.flush(START + MOVE_DURATION_MS / 2)

      expect(room.fills).not.toEqual(sceneFills(undefined, WEST, PLACES.start))
      expect(room.fills).not.toEqual(sceneFills())
    })

    it('ends the move drawing the view from the nook', () => {
      const { canvas } = renderFacingWest()
      clickAt(canvas, CENTRE_X)

      frames.flush(START + MOVE_DURATION_MS)

      expect(room.fills).toEqual(sceneFills())
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
      useReducedMotion()
      const { canvas } = renderPane()
      clickAt(canvas, LEFT_X)
      room.fills.length = 0

      clickAt(canvas, CENTRE_X)

      expect(frames.requestAnimationFrame).not.toHaveBeenCalled()
      expect(canvas).toHaveAttribute('data-place', 'nook')
      expect(room.fills).toEqual(sceneFills())
    })
  })

  describe('mirror ripple', () => {
    useAnimation()
    // On the glass but in the shoulder above the arch, inside the mirror's bounds.
    const FRAME_X = MIRROR_X + 38
    const FRAME_Y = MIRROR_Y - 60
    // The glass point under the mirror's centre, and how long its ripple runs.
    const ORIGIN = screenToMirror(MIRROR_X, MIRROR_Y, VIEW_WIDTH, VIEW_HEIGHT, WEST, PLACES.nook)!
    const DURATION = rippleDuration(ORIGIN)
    // A frame time at or just past the end. START + DURATION itself can round to an
    // elapsed time a hair under DURATION.
    const END = START + Math.ceil(DURATION)
    const isInside = (x: number, y: number) => x >= MIRROR.left && x <= MIRROR.right && y >= MIRROR.top && y <= MIRROR.bottom

    it('starts on the glass at the mirror\'s centre', () => {
      expect(ORIGIN).not.toBeNull()
      expect(DURATION).toBeGreaterThan(TURN_DURATION_MS)
    })

    it('requests an animation frame when the glass is clicked, staying in the nook facing west', () => {
      const { canvas } = renderInNook()

      clickAt(canvas, MIRROR_X, MIRROR_Y)

      expect(frames.requestAnimationFrame).toHaveBeenCalledTimes(1)
      expect(canvas).toHaveAttribute('data-place', 'nook')
      expect(canvas).toHaveAttribute('data-heading', 'west')
    })

    it('draws the ripple on top of the plain scene mid-ripple', () => {
      const { canvas } = renderInNook()
      clickAt(canvas, MIRROR_X, MIRROR_Y)

      frames.flush(START + DURATION / 2)

      expect(room.fills.length).toBeGreaterThan(sceneFills().length)
      expect(room.fills).toEqual(sceneFills({ ripple: { origin: ORIGIN, elapsedMs: DURATION / 2 } }))
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
      room.fills.length = 0

      frames.flush(END)

      expect(room.fills).toEqual(sceneFills())
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
      frames.flush(END)

      expect(frames.requestAnimationFrame).not.toHaveBeenCalled()
      expect(room.fills).toEqual([])
      expect(canvas).toHaveAttribute('data-place', 'nook')
      expect(canvas).toHaveAttribute('data-heading', 'west')
      expect(openUrl).not.toHaveBeenCalled()
    })

    it('shows no hand over the frame, before or after clicking it', () => {
      const { canvas } = renderInNook()
      fireEvent.mouseMove(canvas, { clientX: FRAME_X, clientY: FRAME_Y })
      expect(canvas.style.cursor).not.toBe(HAND_CURSOR)

      clickAt(canvas, FRAME_X, FRAME_Y)

      expect(canvas.style.cursor).not.toBe(HAND_CURSOR)
    })

    it('moves into the nook rather than rippling when the mirror area is clicked from the start facing west', () => {
      const { canvas } = renderPane()
      clickAt(canvas, LEFT_X)
      frames.flush(START + TURN_DURATION_MS)

      clickAt(canvas, MIRROR_X, MIRROR_Y)
      expect(canvas).toHaveAttribute('data-place', 'nook')
      room.fills.length = 0
      frames.flush(START + MOVE_DURATION_MS)

      expect(frames.pending()).toBe(0)
      expect(room.fills).toEqual(sceneFills())
      expect(openUrl).not.toHaveBeenCalled()
    })

    describe('going to the mirror\'s site', () => {
      it('goes there once the ripple has finished, not before', () => {
        const { canvas } = renderInNook()
        clickAt(canvas, MIRROR_X, MIRROR_Y)

        frames.flush(START + DURATION / 2)
        expect(openUrl).not.toHaveBeenCalled()

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
        ['with reduced motion', () => useReducedMotion()],
        ['without a canvas context', () => vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)],
      ])('goes there at once %s, without rippling', (_, setUp) => {
        setUp()
        const { canvas } = renderPane()
        enterNook(canvas)
        expect(canvas).toHaveAttribute('data-place', 'nook')
        room.fills.length = 0

        clickAt(canvas, MIRROR_X, MIRROR_Y)

        expect(openUrl).toHaveBeenCalledTimes(1)
        expect(openUrl).toHaveBeenCalledWith(MIRROR_SITE.url)
        expect(frames.requestAnimationFrame).not.toHaveBeenCalled()
        expect(room.fills).toEqual([])
        expect(canvas).toHaveAttribute('data-heading', 'west')
      })

      it('does not go there when the glass is clicked from the nook facing another way', () => {
        vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
        const { canvas } = renderPane()
        enterNook(canvas)
        clickAt(canvas, RIGHT_X)
        expect(canvas).toHaveAttribute('data-heading', 'north')

        clickAt(canvas, MIRROR_X, MIRROR_Y)

        expect(openUrl).not.toHaveBeenCalled()
      })
    })
  })

  describe('curtain pull cursor', () => {
    it.each([
      ['handle', PULL_X, HANDLE_Y],
      ['cord just above the handle', PULL_X, CORD_Y],
    ])('shows the hand over the pull\'s %s in the nook facing west', (_, clientX, clientY) => {
      const { canvas } = renderPane()
      enterNook(canvas)

      fireEvent.mouseMove(canvas, { clientX, clientY })

      expect(canvas.style.cursor).toBe(HAND_CURSOR)
    })

    it.each([
      ['between the mirror and the pull', BETWEEN_X, HANDLE_Y],
      ['far up the cord', PULL_X, HIGH_CORD_Y],
      ['below the handle', PULL_X, BELOW_HANDLE_Y],
    ])('does not show the hand %s', (_, clientX, clientY) => {
      const { canvas } = renderPane()
      enterNook(canvas)

      fireEvent.mouseMove(canvas, { clientX, clientY })

      expect(canvas.style.cursor).toBe(BLOCKED_CURSOR)
    })

    it('returns to the blocked cursor when moving off the pull', () => {
      const { canvas } = renderPane()
      enterNook(canvas)
      fireEvent.mouseMove(canvas, { clientX: PULL_X, clientY: HANDLE_Y })

      fireEvent.mouseMove(canvas, { clientX: BETWEEN_X, clientY: HANDLE_Y })

      expect(canvas.style.cursor).toBe(BLOCKED_CURSOR)
    })

    it('does not show the hand over the pull\'s screen area from the start facing west', () => {
      const { canvas } = renderPane()
      clickAt(canvas, LEFT_X)

      fireEvent.mouseMove(canvas, { clientX: PULL_X, clientY: HANDLE_Y })

      expect(canvas.style.cursor).toBe(CURSORS.forward)
    })

    it('does not show the hand over the pull\'s screen area in the nook facing north', () => {
      const { canvas } = renderPane()
      enterNook(canvas)
      clickAt(canvas, RIGHT_X)
      expect(canvas).toHaveAttribute('data-heading', 'north')

      fireEvent.mouseMove(canvas, { clientX: PULL_X, clientY: HANDLE_Y })

      expect(canvas.style.cursor).not.toBe(HAND_CURSOR)
    })

    it('moves into the nook rather than switching when the pull\'s area is clicked from the start facing west', () => {
      const { canvas } = renderPane()
      clickAt(canvas, LEFT_X)

      clickAt(canvas, PULL_X, HANDLE_Y)

      expect(canvas).toHaveAttribute('data-place', 'nook')
      expect(canvas).toHaveAttribute('data-site', MIRROR_SITE.name)
    })
  })

  describe('curtain pull', () => {
    useAnimation()
    const ORIGIN = screenToMirror(MIRROR_X, MIRROR_Y, VIEW_WIDTH, VIEW_HEIGHT, WEST, PLACES.nook)!
    const RIPPLE_END = Math.ceil(rippleDuration(ORIGIN))

    function pull(canvas: HTMLElement) {
      clickAt(canvas, PULL_X, HANDLE_Y)
    }

    // The fills for a frame `elapsed` ms into a switch from `fromLogo` to
    // `toLogo`, with the first site's preview not yet loaded: the pull tugged,
    // the plaque sinking and turning, and the glass shimmering from 150 ms in.
    const switchFills = (elapsed: number, fromLogo = MIRROR_SITE.logo, toLogo = NEXT_SITE.logo) =>
      sceneFills({
        preview: null,
        shimmer: { from: null, progress: Math.max(0, (elapsed - 150) / 750) },
        pullDrop: pullDropAt(elapsed),
        plaque: plaqueAt(elapsed, fromLogo, toLogo),
      })

    it('switches to the next site, animating, staying in the nook facing west', () => {
      const { canvas } = renderInNook()

      pull(canvas)

      expect(canvas).toHaveAttribute('data-site', NEXT_SITE.name)
      expect(frames.requestAnimationFrame).toHaveBeenCalledTimes(1)
      frames.flush(START + SWITCH_DURATION_MS)
      expect(canvas).toHaveAttribute('data-place', 'nook')
      expect(canvas).toHaveAttribute('data-heading', 'west')
    })

    it('hides the hand over the pull mid-switch', () => {
      const { canvas } = renderInNook()
      fireEvent.mouseMove(canvas, { clientX: PULL_X, clientY: HANDLE_Y })
      expect(canvas.style.cursor).toBe(HAND_CURSOR)

      pull(canvas)

      expect(canvas.style.cursor).not.toBe(HAND_CURSOR)
    })

    it('shows the hand again once the switch has finished', () => {
      const { canvas } = renderInNook()
      fireEvent.mouseMove(canvas, { clientX: PULL_X, clientY: HANDLE_Y })
      pull(canvas)

      frames.flush(START + SWITCH_DURATION_MS)

      expect(canvas.style.cursor).toBe(HAND_CURSOR)
    })

    it('keeps requesting frames until the switch duration has passed', () => {
      const { canvas } = renderInNook()
      pull(canvas)

      frames.flush(START + SWITCH_DURATION_MS / 2)
      expect(frames.pending()).toBe(1)

      frames.flush(START + SWITCH_DURATION_MS)
      expect(frames.pending()).toBe(0)
    })

    it.each([
      ['the plaque flush, showing the old logo', 0],
      ['the pull dropping, before the shimmer starts', 75],
      ['the pull fully down and the plaque sinking', 150],
      ['the plaque fully sunk at the start of its turn', 200],
      ['the old logo just before the turn\'s half-way point', 400],
      ['the new logo just after the turn\'s half-way point', 430],
      ['the pull springing back, part-way through the shimmer', 450],
      ['the new logo after the turn\'s half-way point', 500],
      ['the plaque pushing back out with the new logo', 775],
      ['the pull back at rest, near the end of the shimmer', 800],
    ])('draws %s (%i ms in)', (_, elapsed) => {
      const { canvas } = renderInNook()
      pull(canvas)

      frames.flush(START + elapsed)

      expect(room.fills).toEqual(switchFills(elapsed))
    })

    it('ends drawing the plain scene, without the shimmer or the drop', () => {
      const { canvas } = renderInNook()
      pull(canvas)
      frames.flush(START + SWITCH_DURATION_MS / 2)
      room.fills.length = 0

      frames.flush(START + SWITCH_DURATION_MS)

      expect(room.fills).toEqual(sceneFills({ plaque: NEXT_PLAQUE }))
    })

    it('ignores turn clicks mid-switch', () => {
      const { canvas } = renderInNook()
      pull(canvas)

      clickAt(canvas, LEFT_X)
      frames.flush(START + SWITCH_DURATION_MS)

      expect(canvas).toHaveAttribute('data-heading', 'west')
    })

    it('ignores glass clicks mid-switch', () => {
      const { canvas } = renderInNook()
      pull(canvas)

      clickAt(canvas, MIRROR_X, MIRROR_Y)
      frames.flush(START + SWITCH_DURATION_MS)
      frames.flush(START + RIPPLE_END)

      expect(frames.pending()).toBe(0)
      expect(openUrl).not.toHaveBeenCalled()
    })

    it('ignores pull clicks mid-switch', () => {
      const { canvas } = renderInNook()
      pull(canvas)

      pull(canvas)
      frames.flush(START + SWITCH_DURATION_MS)

      expect(canvas).toHaveAttribute('data-site', NEXT_SITE.name)
      expect(frames.pending()).toBe(0)
    })

    it('wraps back to the first site on a second pull', () => {
      const { canvas } = renderInNook()
      pull(canvas)
      frames.flush(START + SWITCH_DURATION_MS)

      pull(canvas)
      expect(frames.pending()).toBe(1)
      frames.flush(START + SWITCH_DURATION_MS)

      expect(canvas).toHaveAttribute('data-site', MIRROR_SITE.name)
    })

    it('goes to the new site when the glass is clicked after switching', () => {
      const { canvas } = renderInNook()
      pull(canvas)
      frames.flush(START + SWITCH_DURATION_MS)

      clickAt(canvas, MIRROR_X, MIRROR_Y)
      frames.flush(START + RIPPLE_END)

      expect(openUrl).toHaveBeenCalledTimes(1)
      expect(openUrl).toHaveBeenCalledWith(NEXT_SITE.url)
    })

    it('goes back to the first site after wrapping round', () => {
      const { canvas } = renderInNook()
      pull(canvas)
      frames.flush(START + SWITCH_DURATION_MS)
      pull(canvas)
      frames.flush(START + SWITCH_DURATION_MS)

      clickAt(canvas, MIRROR_X, MIRROR_Y)
      frames.flush(START + RIPPLE_END)

      expect(openUrl).toHaveBeenCalledWith(MIRROR_SITE.url)
    })

    it('switches at once with reduced motion, redrawing each new logo without a shimmer', () => {
      useReducedMotion()
      const { canvas } = renderPane()
      enterNook(canvas)
      room.fills.length = 0

      pull(canvas)
      expect(canvas).toHaveAttribute('data-site', NEXT_SITE.name)
      expect(room.fills).toEqual(sceneFills({ plaque: NEXT_PLAQUE }))
      room.fills.length = 0
      pull(canvas)

      expect(canvas).toHaveAttribute('data-site', MIRROR_SITE.name)
      expect(frames.requestAnimationFrame).not.toHaveBeenCalled()
      expect(room.fills).toEqual(sceneFills({ plaque: RESTING_PLAQUE }))
    })

    it('switches at once without a canvas context', () => {
      vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
      const { canvas } = renderPane()
      enterNook(canvas)

      pull(canvas)

      expect(canvas).toHaveAttribute('data-site', NEXT_SITE.name)
      expect(frames.requestAnimationFrame).not.toHaveBeenCalled()
    })

    it('does not switch when the pull\'s area is clicked from the nook facing north', () => {
      vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
      const { canvas } = renderPane()
      enterNook(canvas)
      clickAt(canvas, RIGHT_X)
      expect(canvas).toHaveAttribute('data-heading', 'north')

      pull(canvas)

      expect(canvas).toHaveAttribute('data-site', MIRROR_SITE.name)
    })

    it('does not switch when clicked between the mirror and the pull', () => {
      const { canvas } = renderInNook()

      clickAt(canvas, BETWEEN_X, HANDLE_Y)

      expect(canvas).toHaveAttribute('data-site', MIRROR_SITE.name)
      expect(frames.requestAnimationFrame).not.toHaveBeenCalled()
    })

    describe('logo plaque', () => {
      it('draws the first site\'s logo at rest before any pull', () => {
        const { canvas } = renderPane()
        clickAt(canvas, LEFT_X)
        frames.flush(START + TURN_DURATION_MS)
        clickAt(canvas, CENTRE_X)
        room.fills.length = 0

        frames.flush(START + MOVE_DURATION_MS)

        expect(room.fills).toEqual(sceneFills({ plaque: RESTING_PLAQUE }))
      })

      it('turns from the second site\'s logo back to the first\'s on the next pull', () => {
        const { canvas } = renderInNook()
        pull(canvas)
        frames.flush(START + SWITCH_DURATION_MS)
        room.fills.length = 0

        pull(canvas)
        frames.flush(START + 100)

        expect(room.fills).toEqual(switchFills(100, NEXT_SITE.logo, MIRROR_SITE.logo))
      })

      it('rests on the first site\'s logo again after switching there and back', () => {
        const { canvas } = renderInNook()
        pull(canvas)
        frames.flush(START + SWITCH_DURATION_MS)
        pull(canvas)
        frames.flush(START + SWITCH_DURATION_MS / 2)
        room.fills.length = 0

        frames.flush(START + SWITCH_DURATION_MS)

        expect(room.fills).toEqual(sceneFills({ plaque: RESTING_PLAQUE }))
      })

      it('keeps the resting logo when turning away and back after a switch', () => {
        const { canvas } = renderInNook()
        pull(canvas)
        frames.flush(START + SWITCH_DURATION_MS)
        clickAt(canvas, RIGHT_X)
        frames.flush(START + TURN_DURATION_MS)
        clickAt(canvas, LEFT_X)
        room.fills.length = 0

        frames.flush(START + TURN_DURATION_MS)

        expect(room.fills).toEqual(sceneFills({ plaque: NEXT_PLAQUE }))
      })
    })
  })

  describe('mirror preview', () => {
    useAnimation({ withContext: false })
    // A portrait screenshot, taller than the glass's aspect, so its height is cropped.
    const IMAGE_WIDTH = 1280
    const IMAGE_HEIGHT = 2400
    const WHITE = new Uint8ClampedArray(PREVIEW_WIDTH * PREVIEW_HEIGHT * 4).fill(255)
    const WHITE_PREVIEW = quantisePreview(WHITE, PREVIEW_WIDTH, PREVIEW_HEIGHT)
    let images: FakeImage[]

    // An Image that loads (or fails) as soon as its src is set.
    class FakeImage {
      static fail = false
      width = IMAGE_WIDTH
      height = IMAGE_HEIGHT
      onload: (() => void) | null = null
      onerror: ((error: unknown) => void) | null = null
      protected source = ''
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

    // The room canvas gets `room`'s context; the offscreen one (asked for with
    // willReadFrequently) gets `offscreen`, and the panels none.
    function provideContexts(offscreen: ReturnType<typeof createOffscreenContext> | null) {
      return vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (
        this: HTMLCanvasElement,
        _: string,
        options?: CanvasRenderingContext2DSettings,
      ) {
        if (options?.willReadFrequently) return offscreen
        return this.classList.contains('view-pane') ? room.ctx : null
      } as unknown as HTMLCanvasElement['getContext'])
    }

    // Renders and lets the preview's load settle.
    async function renderLoaded() {
      const result = renderPane()
      await act(async () => {})
      return result
    }

    // Snaps into the nook facing west (reduced motion), leaving only that view's fills.
    function snapIntoNook(canvas: HTMLElement) {
      clickAt(canvas, LEFT_X)
      room.fills.length = 0
      clickAt(canvas, CENTRE_X)
      expect(canvas).toHaveAttribute('data-place', 'nook')
      expect(canvas).toHaveAttribute('data-heading', 'west')
    }

    // Animates into the nook facing west, letting each animation finish.
    function animateIntoNook(canvas: HTMLElement) {
      clickAt(canvas, LEFT_X)
      frames.flush(START + TURN_DURATION_MS)
      clickAt(canvas, CENTRE_X)
      frames.flush(START + MOVE_DURATION_MS)
    }

    const backgrounds = () => room.fills.filter(({ args }) => args.join() === `0,0,${VIEW_WIDTH},${VIEW_HEIGHT}`)

    beforeEach(() => {
      room = createFakeContext(VIEW_WIDTH, VIEW_HEIGHT)
      images = []
      FakeImage.fail = false
      vi.stubGlobal('Image', FakeImage)
      useReducedMotion()
    })

    it('loads every mirror site\'s preview image', async () => {
      provideContexts(createOffscreenContext())

      await renderLoaded()

      expect(images.map((image) => image.src)).toEqual(MIRROR_SITES.map(({ preview }) => preview))
    })

    it('draws each image to cover the preview grid, centred, in an offscreen context it reads back often', async () => {
      const offscreen = createOffscreenContext()
      const getContext = provideContexts(offscreen)

      await renderLoaded()

      expect(getContext).toHaveBeenCalledWith('2d', { willReadFrequently: true })
      expect(offscreen.drawImage).toHaveBeenCalledTimes(MIRROR_SITES.length)
      const [image, x, y, width, height] = offscreen.drawImage.mock.calls[0] as unknown as [unknown, ...number[]]
      expect(image).toBe(images[0])
      expect(width).toBeCloseTo(PREVIEW_WIDTH)
      expect(height).toBeGreaterThanOrEqual(PREVIEW_HEIGHT)
      expect(width / height).toBeCloseTo(IMAGE_WIDTH / IMAGE_HEIGHT)
      expect(x).toBeCloseTo((PREVIEW_WIDTH - width) / 2)
      expect(y).toBeCloseTo((PREVIEW_HEIGHT - height) / 2)
      expect(offscreen.getImageData).toHaveBeenCalledWith(0, 0, PREVIEW_WIDTH, PREVIEW_HEIGHT)
    })

    it('redraws the view once the preview has loaded', async () => {
      provideContexts(createOffscreenContext())

      await renderLoaded()

      expect(backgrounds()).toHaveLength(2)
    })

    it('does not redraw without an offscreen context', async () => {
      provideContexts(null)

      await renderLoaded()

      expect(backgrounds()).toHaveLength(1)
    })

    it('draws the preview on the glass from the nook facing west', async () => {
      provideContexts(createOffscreenContext())
      const { canvas } = await renderLoaded()
      room.fills.length = 0

      snapIntoNook(canvas)

      expect(room.fills).toEqual(sceneFills({ preview: WHITE_PREVIEW }))
      const preview = previewPixels(VIEW_WIDTH, VIEW_HEIGHT, WHITE_PREVIEW, WEST, PLACES.nook)
      expect(preview.some(({ colour }) => colour === FOREGROUND)).toBe(true)
      expect(room.fills.length).toBeGreaterThan(sceneFills().length)
    })

    it('draws the preview under a ripple on the glass', async () => {
      useReducedMotion(false)
      provideContexts(createOffscreenContext())
      const { canvas } = await renderLoaded()
      animateIntoNook(canvas)
      const origin = screenToMirror(MIRROR_X, MIRROR_Y, VIEW_WIDTH, VIEW_HEIGHT, WEST, PLACES.nook)!
      const ripple = { origin, elapsedMs: rippleDuration(origin) / 2 }
      clickAt(canvas, MIRROR_X, MIRROR_Y)
      room.fills.length = 0

      frames.flush(START + ripple.elapsedMs)

      expect(room.fills).toEqual(sceneFills({ ripple, preview: WHITE_PREVIEW }))
    })

    it.each([
      ['without an offscreen context', false],
      ['when the image fails to load', true],
    ])('draws the empty glass %s', async (_, fails) => {
      FakeImage.fail = fails
      const offscreen = fails ? createOffscreenContext() : null
      provideContexts(offscreen)
      const { canvas } = await renderLoaded()
      room.fills.length = 0

      snapIntoNook(canvas)

      if (offscreen) expect(offscreen.drawImage).not.toHaveBeenCalled()
      expect(room.fills).toEqual(sceneFills())
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
      room.fills.length = 0

      await act(async () => finishLoad())

      expect(room.fills).toEqual([])
    })

    describe('for each site', () => {
      const GREY = new Uint8ClampedArray(PREVIEW_WIDTH * PREVIEW_HEIGHT * 4).fill(128)
      const GREY_PREVIEW = quantisePreview(GREY, PREVIEW_WIDTH, PREVIEW_HEIGHT)

      // An offscreen context reading back white for the first site's image and
      // grey for the next one's, keyed by the image last drawn.
      function createSiteContext() {
        let drawn = ''
        return {
          imageSmoothingQuality: '',
          drawImage: vi.fn((image: { src: string }) => {
            drawn = image.src
          }),
          getImageData: vi.fn(() => ({ data: drawn === MIRROR_SITE.preview ? WHITE : GREY })),
        }
      }

      // Images that load only when told to, by src.
      const finishers = new Map<string, () => void>()
      class HeldImage extends FakeImage {
        get src() {
          return this.source
        }
        set src(value: string) {
          this.source = value
          finishers.set(value, () => this.onload?.())
        }
      }

      async function finishLoad(src: string) {
        await act(async () => finishers.get(src)!())
      }

      beforeEach(() => {
        finishers.clear()
      })

      it('shows the first site\'s preview on the glass', async () => {
        provideContexts(createSiteContext())
        const { canvas } = await renderLoaded()
        room.fills.length = 0

        snapIntoNook(canvas)

        expect(room.fills).toEqual(sceneFills({ preview: WHITE_PREVIEW }))
      })

      it('shows the next site\'s preview after the pull is clicked', async () => {
        provideContexts(createSiteContext())
        const { canvas } = await renderLoaded()
        snapIntoNook(canvas)
        room.fills.length = 0

        clickAt(canvas, PULL_X, HANDLE_Y)

        expect(canvas).toHaveAttribute('data-site', NEXT_SITE.name)
        expect(room.fills).toEqual(sceneFills({ preview: GREY_PREVIEW, plaque: NEXT_PLAQUE }))
      })

      it('shows the first site\'s preview again after a second pull', async () => {
        provideContexts(createSiteContext())
        const { canvas } = await renderLoaded()
        snapIntoNook(canvas)
        clickAt(canvas, PULL_X, HANDLE_Y)
        room.fills.length = 0

        clickAt(canvas, PULL_X, HANDLE_Y)

        expect(room.fills).toEqual(sceneFills({ preview: WHITE_PREVIEW }))
      })

      it('shimmers from the old preview to the new one', async () => {
        useReducedMotion(false)
        provideContexts(createSiteContext())
        const { canvas } = await renderLoaded()
        animateIntoNook(canvas)
        clickAt(canvas, PULL_X, HANDLE_Y)
        room.fills.length = 0

        // Half-way through the shimmer, 150 + 375 ms in.
        frames.flush(START + 525)

        expect(room.fills).toEqual(
          sceneFills({
            preview: GREY_PREVIEW,
            shimmer: { from: WHITE_PREVIEW, progress: 0.5 },
            pullDrop: pullDropAt(525),
            plaque: plaqueAt(525, MIRROR_SITE.logo, NEXT_SITE.logo),
          }),
        )
        room.fills.length = 0

        frames.flush(START + SWITCH_DURATION_MS)

        expect(room.fills).toEqual(sceneFills({ preview: GREY_PREVIEW, plaque: NEXT_PLAQUE }))
      })

      it('does not redraw when another site\'s preview loads', async () => {
        vi.stubGlobal('Image', HeldImage)
        provideContexts(createSiteContext())
        renderPane()
        room.fills.length = 0

        await finishLoad(NEXT_SITE.preview)

        expect(room.fills).toEqual([])
      })

      it('redraws when the current site\'s preview loads late', async () => {
        vi.stubGlobal('Image', HeldImage)
        provideContexts(createSiteContext())
        const { canvas } = renderPane()
        snapIntoNook(canvas)
        clickAt(canvas, PULL_X, HANDLE_Y)
        expect(canvas).toHaveAttribute('data-site', NEXT_SITE.name)
        room.fills.length = 0

        await finishLoad(NEXT_SITE.preview)

        expect(room.fills).toEqual(sceneFills({ preview: GREY_PREVIEW, plaque: NEXT_PLAQUE }))
      })

      it('uses a preview that loaded while another site was shown once switched to', async () => {
        vi.stubGlobal('Image', HeldImage)
        provideContexts(createSiteContext())
        const { canvas } = renderPane()
        snapIntoNook(canvas)
        await finishLoad(NEXT_SITE.preview)
        room.fills.length = 0

        clickAt(canvas, PULL_X, HANDLE_Y)

        expect(room.fills).toEqual(sceneFills({ preview: GREY_PREVIEW, plaque: NEXT_PLAQUE }))
      })

      it('waits for the next frame when the preview loads mid-switch', async () => {
        vi.stubGlobal('Image', HeldImage)
        useReducedMotion(false)
        provideContexts(createSiteContext())
        const { canvas } = renderPane()
        animateIntoNook(canvas)
        clickAt(canvas, PULL_X, HANDLE_Y)
        room.fills.length = 0

        await finishLoad(NEXT_SITE.preview)
        expect(room.fills).toEqual([])

        frames.flush(START + SWITCH_DURATION_MS)
        expect(room.fills).toEqual(sceneFills({ preview: GREY_PREVIEW, plaque: NEXT_PLAQUE }))
      })
    })
  })

  describe('sign text', () => {
    useAnimation({ withContext: false })
    let fillsOn: ReturnType<typeof contextPerCanvas>

    beforeEach(() => {
      fillsOn = contextPerCanvas()
    })

    const [FIRST_PAGE] = SIGN_PAGES
    const pageLength = (page: string) => textBoxLines(LOWER_PANEL_WIDTH, page).join('').length
    // When a page's last character is typed, after it starts at START.
    const typedAt = (page: string) => START + (pageLength(page) - 1) * TYPING_MS_PER_CHAR

    // The fills drawTextBox makes on a canvas the lower panel's size.
    function textBoxFills(page: string, shown: number, caretOn: boolean): Fill[] {
      const { ctx, fills } = createFakeContext(LOWER_PANEL_WIDTH, LOWER_PANEL_HEIGHT)
      drawTextBox(ctx, textBoxLines(LOWER_PANEL_WIDTH, page), shown, caretOn)
      return fills
    }

    // Renders the pane and clicks the welcome sign.
    function openSign() {
      const pane = renderWithPanel()
      clickAt(pane.canvas, SIGN_X, SIGN_Y)
      return pane
    }

    const frame = (container: HTMLElement) => container.querySelector<HTMLElement>('.view-pane-frame')!
    const lowerPanelDraw = (container: HTMLElement) => lastPanelDraw(fillsOn(lowerPanel(container)))
    const status = () => screen.getByRole('status')

    // The places in the pane a click can land to move the text on.
    const TARGETS: [string, (pane: Pane) => void][] = [
      ['the sign', ({ canvas }) => clickAt(canvas, SIGN_X, SIGN_Y)],
      ['the room', ({ canvas }) => clickAt(canvas, LEFT_X)],
      ['the lower panel', ({ panel }) => clickButton(panel, 'left')],
      ['the side panel', ({ container }) => fireEvent.click(sidePanel(container))],
      ['the frame', ({ container }) => fireEvent.click(frame(container))],
    ]

    describe('opening', () => {
      it('has an empty, visually hidden status before the sign is clicked', () => {
        renderWithPanel()

        expect(status().tagName).toBe('P')
        expect(status()).toHaveClass('view-pane-status')
        expect(status()).toHaveTextContent(/^$/)
      })

      it('puts the first page in the status when the sign is clicked', () => {
        openSign()

        expect(status()).toHaveTextContent(FIRST_PAGE)
      })

      it('draws the first character of the first page in place of the navigation panel at once', () => {
        const { container } = openSign()

        expect(lowerPanelDraw(container)).toEqual(textBoxFills(FIRST_PAGE, 1, false))
      })

      it('requests an animation frame to carry on typing', () => {
        openSign()

        expect(frames.pending()).toBe(1)
      })

      it.each([
        ['west', LEFT_X],
        ['east', RIGHT_X],
      ])('does not open from the sign\'s position facing %s', (_, x) => {
        const { canvas } = renderWithPanel()
        clickAt(canvas, x)
        frames.flush(START + TURN_DURATION_MS)

        clickAt(canvas, SIGN_X, SIGN_Y)

        expect(status()).toHaveTextContent(/^$/)
      })
    })

    describe('typing', () => {
      it.each([
        ['one more character a character\'s time later', START + TYPING_MS_PER_CHAR, 2],
        ['whole characters only, part way through one', START + 2.5 * TYPING_MS_PER_CHAR, 3],
        ['one character before the end', typedAt(FIRST_PAGE) - TYPING_MS_PER_CHAR, pageLength(FIRST_PAGE) - 1],
      ])('shows %s', (_, time, shown) => {
        const { container } = openSign()

        frames.flush(time)

        expect(lowerPanelDraw(container)).toEqual(textBoxFills(FIRST_PAGE, shown, false))
      })

      it('shows the whole page with the caret on once the last character is due', () => {
        const { container } = openSign()

        frames.flush(typedAt(FIRST_PAGE))

        expect(lowerPanelDraw(container)).toEqual(textBoxFills(FIRST_PAGE, pageLength(FIRST_PAGE), true))
      })

      it('does not redraw on a frame where nothing has changed', () => {
        const { container } = openSign()
        const before = panelDraws(fillsOn(lowerPanel(container)))

        frames.flush(START + TYPING_MS_PER_CHAR / 2)

        expect(panelDraws(fillsOn(lowerPanel(container)))).toBe(before)
      })

      it('keeps requesting frames once the page is typed, to blink the caret', () => {
        openSign()

        frames.flush(typedAt(FIRST_PAGE) + 3 * CARET_BLINK_MS)

        expect(frames.pending()).toBe(1)
      })

      it.each([
        ['on until a blink has passed', CARET_BLINK_MS - 1, true],
        ['off for the next blink', CARET_BLINK_MS, false],
        ['still off just before the second blink ends', 2 * CARET_BLINK_MS - 1, false],
        ['on again after that', 2 * CARET_BLINK_MS, true],
      ])('keeps the caret %s after the page is typed', (_, sinceTyped, caretOn) => {
        const { container } = openSign()

        frames.flush(typedAt(FIRST_PAGE) + sinceTyped)

        expect(lowerPanelDraw(container)).toEqual(textBoxFills(FIRST_PAGE, pageLength(FIRST_PAGE), caretOn))
      })
    })

    describe.each(TARGETS)('clicking %s', (_, click) => {
      it('finishes typing the page at once, with the caret on, while it is typing', () => {
        const pane = openSign()

        click(pane)

        expect(lowerPanelDraw(pane.container)).toEqual(textBoxFills(FIRST_PAGE, pageLength(FIRST_PAGE), true))
        expect(status()).toHaveTextContent(FIRST_PAGE)
      })

      it('closes the text after the last page is typed and redraws the navigation panel', () => {
        const pane = openSign()
        frames.flush(typedAt(FIRST_PAGE))

        click(pane)

        expect(lowerPanelDraw(pane.container)).toEqual(navPanelFills(0, START_NORTH))
        expect(status()).toHaveTextContent(/^$/)
      })

      it('stops requesting frames once the text is closed', () => {
        const pane = openSign()
        frames.flush(typedAt(FIRST_PAGE))

        click(pane)

        expect(frames.pending()).toBe(0)
      })
    })

    it('leaves the navigation panel alone when the frame or side panel is clicked with the text closed', () => {
      const { container } = renderWithPanel()

      fireEvent.click(sidePanel(container))
      fireEvent.click(frame(container))

      expect(status()).toHaveTextContent(/^$/)
      expect(lowerPanelDraw(container)).toEqual(navPanelFills(0, START_NORTH))
    })

    it('blinks the caret from when a click finished the page', () => {
      const pane = openSign()
      clickAt(pane.canvas, SIGN_X, SIGN_Y)

      frames.flush(START + CARET_BLINK_MS)

      expect(lowerPanelDraw(pane.container)).toEqual(textBoxFills(FIRST_PAGE, pageLength(FIRST_PAGE), false))
    })

    it('takes two clicks to close a page that is still typing', () => {
      const pane = openSign()

      clickAt(pane.canvas, SIGN_X, SIGN_Y)
      expect(status()).toHaveTextContent(FIRST_PAGE)
      clickAt(pane.canvas, SIGN_X, SIGN_Y)

      expect(status()).toHaveTextContent(/^$/)
    })

    it('stops requesting frames when the pane is unmounted with the text open', () => {
      const { unmount } = openSign()

      unmount()

      expect(frames.pending()).toBe(0)
    })

    describe('with more than one page', () => {
      const SECOND_PAGE = 'Second page'

      beforeEach(() => {
        SIGN_PAGES.push(SECOND_PAGE)
      })

      afterEach(() => {
        SIGN_PAGES.splice(SIGN_PAGES.indexOf(SECOND_PAGE), 1)
      })

      it('goes on to type the next page from its first character', () => {
        const pane = openSign()
        frames.flush(typedAt(FIRST_PAGE))

        fireEvent.click(frame(pane.container))

        expect(status()).toHaveTextContent(SECOND_PAGE)
        expect(lowerPanelDraw(pane.container)).toEqual(textBoxFills(SECOND_PAGE, 1, false))
      })

      it('types the next page out over the following frames', () => {
        const pane = openSign()
        frames.flush(typedAt(FIRST_PAGE))
        fireEvent.click(frame(pane.container))

        frames.flush(START + 2 * TYPING_MS_PER_CHAR)

        expect(lowerPanelDraw(pane.container)).toEqual(textBoxFills(SECOND_PAGE, 3, false))
      })

      it('types the next page even when the one before was finished with a click', () => {
        const pane = openSign()
        fireEvent.click(frame(pane.container))

        fireEvent.click(frame(pane.container))

        expect(lowerPanelDraw(pane.container)).toEqual(textBoxFills(SECOND_PAGE, 1, false))
      })

      it('closes after the last page', () => {
        const pane = openSign()
        frames.flush(typedAt(FIRST_PAGE))
        fireEvent.click(frame(pane.container))
        frames.flush(typedAt(SECOND_PAGE))

        fireEvent.click(frame(pane.container))

        expect(status()).toHaveTextContent(/^$/)
        expect(lowerPanelDraw(pane.container)).toEqual(navPanelFills(0, START_NORTH))
      })
    })

    describe.each([
      ['Enter', 'Enter'],
      ['Space', ' '],
    ])('with %s', (_, key) => {
      it('finishes the page while it is typing', () => {
        const { container } = openSign()

        expect(pressKey(key)).toBe(false)

        expect(lowerPanelDraw(container)).toEqual(textBoxFills(FIRST_PAGE, pageLength(FIRST_PAGE), true))
      })

      it('closes the text once the last page is typed', () => {
        const { container } = openSign()
        frames.flush(typedAt(FIRST_PAGE))

        pressKey(key)

        expect(status()).toHaveTextContent(/^$/)
        expect(lowerPanelDraw(container)).toEqual(navPanelFills(0, START_NORTH))
      })

      it('moves the text on only once while held', () => {
        openSign()
        pressKey(key)

        pressKey(key, { repeat: true })

        expect(status()).toHaveTextContent(FIRST_PAGE)
      })

      it.each(['altKey', 'ctrlKey', 'metaKey'])('ignores it with %s held', (modifier) => {
        const { container } = openSign()

        expect(pressKey(key, { [modifier]: true })).toBe(true)

        expect(lowerPanelDraw(container)).toEqual(textBoxFills(FIRST_PAGE, 1, false))
      })

      it('ignores it in a text field', () => {
        const { container } = openSign()
        const field = document.createElement('input')
        document.body.append(field)

        expect(pressKey(key, {}, field)).toBe(true)

        expect(lowerPanelDraw(container)).toEqual(textBoxFills(FIRST_PAGE, 1, false))
        field.remove()
      })

      it('does not open the sign, and leaves the key alone, while the text is closed', () => {
        renderWithPanel()

        expect(pressKey(key)).toBe(true)

        expect(status()).toHaveTextContent(/^$/)
      })
    })

    describe('while open', () => {
      it.each([PANEL_INPUT, KEY_INPUT, ROOM_INPUT])('does not turn with $name', (input) => {
        const pane = openSign()

        input.use(pane, 'left')
        frames.flush(START + TURN_DURATION_MS)

        expect(pane.canvas).toHaveAttribute('data-heading', 'north')
      })

      it('does not move the text on with an arrow key', () => {
        const { container } = openSign()

        pressKey(ARROW_KEYS.left)

        expect(lowerPanelDraw(container)).toEqual(textBoxFills(FIRST_PAGE, 1, false))
      })

      it('turns again once the text is closed', () => {
        const pane = openSign()
        frames.flush(typedAt(FIRST_PAGE))
        clickAt(pane.canvas, SIGN_X, SIGN_Y)

        clickAt(pane.canvas, LEFT_X)
        frames.flush(START + TURN_DURATION_MS)

        expect(pane.canvas).toHaveAttribute('data-heading', 'west')
      })

      it('shows the hand over the frame, which the side panel inherits', () => {
        const { container } = openSign()

        expect(frame(container).style.cursor).toBe(HAND_CURSOR)
        expect(sidePanel(container).style.cursor).toBe('')
      })

      it.each([
        ['turn zone', LEFT_X, MIDDLE_Y],
        ['blocked centre', CENTRE_X, 50],
      ])('shows the hand over the room\'s %s', (_, clientX, clientY) => {
        const { canvas } = openSign()

        fireEvent.mouseMove(canvas, { clientX, clientY })

        expect(canvas.style.cursor).toBe(HAND_CURSOR)
      })

      it.each<[string, (panel: HTMLElement) => void]>([
        ['an unusable button', (panel) => hoverButton(panel, 'forward')],
        ['no button', (panel) => fireEvent.mouseMove(panel, { clientX: 78, clientY: 80 })],
      ])('shows the hand over the lower panel over %s', (_, hover) => {
        const { panel } = openSign()

        hover(panel)

        expect(panel.style.cursor).toBe(HAND_CURSOR)
      })

      it('goes back to the usual cursors once the text is closed', () => {
        const { canvas, container, panel } = openSign()
        frames.flush(typedAt(FIRST_PAGE))
        fireEvent.mouseMove(canvas, { clientX: CENTRE_X, clientY: 50 })
        hoverButton(panel, 'forward')

        fireEvent.click(frame(container))

        expect(frame(container).style.cursor).toBe(BLOCKED_CURSOR)
        expect(canvas.style.cursor).toBe(BLOCKED_CURSOR)
        expect(panel.style.cursor).toBe(BLOCKED_CURSOR)
      })
    })

    describe('with reduced motion', () => {
      beforeEach(() => {
        useReducedMotion()
      })

      it('shows the whole page at once with the caret on', () => {
        const { container } = openSign()

        expect(lowerPanelDraw(container)).toEqual(textBoxFills(FIRST_PAGE, pageLength(FIRST_PAGE), true))
      })

      it('requests no animation frames', () => {
        openSign()

        expect(frames.requestAnimationFrame).not.toHaveBeenCalled()
      })

      it('closes with one click', () => {
        const { container } = openSign()

        fireEvent.click(frame(container))

        expect(status()).toHaveTextContent(/^$/)
        expect(lowerPanelDraw(container)).toEqual(navPanelFills(0, START_NORTH))
      })
    })

    describe('without a canvas context', () => {
      beforeEach(() => {
        vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
      })

      it('opens, putting the page in the status, without requesting animation frames', () => {
        openSign()

        expect(status()).toHaveTextContent(FIRST_PAGE)
        expect(frames.requestAnimationFrame).not.toHaveBeenCalled()
      })

      it('closes with one click', () => {
        const { container } = openSign()

        fireEvent.click(frame(container))

        expect(status()).toHaveTextContent(/^$/)
      })
    })
  })
})
