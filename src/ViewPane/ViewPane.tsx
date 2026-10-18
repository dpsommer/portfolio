import { useEffect, useRef, useState } from 'react'
import type { MouseEvent } from 'react'
import { BLOCKED_CURSOR, CURSORS, HAND_CURSOR, getCursorZone } from './cursors.ts'
import type { CursorZone } from './cursors.ts'
import { MIRROR_SITES, openUrl } from './mirrorSites.ts'
import { drawScene } from '../scene/draw.ts'
import { screenToMirror, screenToWall } from '../scene/mirror/pixels.ts'
import type { RippleState } from '../scene/mirror/pixels.ts'
import { PREVIEW_HEIGHT, PREVIEW_WIDTH, quantisePreview } from '../scene/mirror/preview.ts'
import type { LogoMap, Plaque } from '../scene/mirror/plaque.ts'
import type { Preview, Shimmer } from '../scene/mirror/preview.ts'
import { isOnPull } from '../scene/mirror/pull.ts'
import { rippleDuration } from '../scene/mirror/ripple.ts'
import { TURN_YAW, turn } from '../scene/navigation/heading.ts'
import type { Heading, TurnDirection } from '../scene/navigation/heading.ts'
import { navButtonAt } from '../scene/navigation/navButtons.ts'
import type { NavButton } from '../scene/navigation/navButtons.ts'
import { drawNavigationPanel } from '../scene/navigation/navigationPanel.ts'
import { PLACES, backFrom, forwardFrom } from '../scene/navigation/places.ts'
import type { PlaceName } from '../scene/navigation/places.ts'
import { clearPanel } from '../scene/panels/panelCanvas.ts'
import { signBoardBounds } from '../scene/signpost/signpost.ts'
import type { Bounds } from '../scene/signpost/signpost.ts'
import './ViewPane.scss'

// Drawing resolution of the canvas; CSS scales it up to fit the screen.
export const VIEW_WIDTH = 320
export const VIEW_HEIGHT = 240
// The pane is split into the room in the upper left (70% of its width, 60% of
// its height), a panel below the room and a panel down the right. Panels are
// drawn at the same pixel scale as the room, and the 5-pixel bands dividing
// the areas come out of the panels.
const PANE_WIDTH = 457
const PANE_HEIGHT = 400
const DIVIDER_THICKNESS = 5
export const LOWER_PANEL_WIDTH = VIEW_WIDTH
export const LOWER_PANEL_HEIGHT = PANE_HEIGHT - VIEW_HEIGHT - DIVIDER_THICKNESS
export const SIDE_PANEL_WIDTH = PANE_WIDTH - VIEW_WIDTH - DIVIDER_THICKNESS
export const SIDE_PANEL_HEIGHT = PANE_HEIGHT

// How long a quarter turn and a step forward take to animate.
export const TURN_DURATION_MS = 250
export const MOVE_DURATION_MS = 350
// How long a tug on the curtain pull and the mirror's change of site take.
export const SWITCH_DURATION_MS = 900
// The pull drops this far (mirror units) over the first PULL_DOWN_MS, springs
// back by PULL_UP_MS, and the glass shimmers over to the next site from then
// on.
const PULL_DROP = 0.1
const PULL_DOWN_MS = 150
const PULL_UP_MS = 600
// Meanwhile the logo plaque sinks into the wall over the first PLAQUE_SINK_MS,
// turns to the next site's logo by PLAQUE_TURN_END_MS, then pushes back out.
const PLAQUE_SINK_MS = 200
const PLAQUE_TURN_END_MS = 650

const SIGN_BOUNDS = signBoardBounds(VIEW_WIDTH, VIEW_HEIGHT)

// Whether a point in canvas pixels is inside inclusive bounds.
function isInside(bounds: Bounds, x: number, y: number): boolean {
  const { left, top, right, bottom } = bounds
  return x >= left && x < right + 1 && y >= top && y < bottom + 1
}

// Whether a point in canvas pixels is over the mirror's glass, seen from the
// nook facing west, the view it's clicked from. The frame doesn't count.
function isOverGlass(x: number, y: number): boolean {
  return screenToMirror(x, y, VIEW_WIDTH, VIEW_HEIGHT, TURN_YAW.left, PLACES.nook) !== null
}

// Whether a point in canvas pixels is over the curtain pull, seen from the same view.
function isOverPull(x: number, y: number): boolean {
  const point = screenToWall(x, y, VIEW_WIDTH, VIEW_HEIGHT, TURN_YAW.left, PLACES.nook)
  return point !== null && isOnPull(point)
}

const TURNS: Partial<Record<CursorZone, TurnDirection>> = { 'turn-left': 'left', 'turn-right': 'right' }

// Which navigation buttons can be used from `place` facing `heading`.
function enabledButtons(place: PlaceName, heading: Heading): Record<NavButton, boolean> {
  return {
    forward: forwardFrom(place, heading) !== null,
    back: backFrom(place, heading) !== null,
    left: true,
    right: true,
  }
}

function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

const easeInOut = (t: number) => (1 - Math.cos(Math.PI * t)) / 2

// How far the pull is tugged down `elapsed` ms into a change of site.
function pullDropAt(elapsed: number): number {
  if (elapsed < PULL_DOWN_MS) return PULL_DROP * easeInOut(elapsed / PULL_DOWN_MS)
  if (elapsed < PULL_UP_MS) return PULL_DROP * (1 - easeInOut((elapsed - PULL_DOWN_MS) / (PULL_UP_MS - PULL_DOWN_MS)))
  return 0
}

// The plaque `elapsed` ms into a change of site from `fromLogo` to `toLogo`.
// The logo swaps when the block is edge-on, half-way through its turn.
function plaqueAt(elapsed: number, fromLogo: LogoMap, toLogo: LogoMap): Plaque {
  if (elapsed < PLAQUE_SINK_MS) return { logo: fromLogo, depth: easeInOut(elapsed / PLAQUE_SINK_MS) }
  if (elapsed < PLAQUE_TURN_END_MS) {
    const turn = easeInOut((elapsed - PLAQUE_SINK_MS) / (PLAQUE_TURN_END_MS - PLAQUE_SINK_MS))
    return { logo: turn < 0.5 ? fromLogo : toLogo, depth: 1, turn }
  }
  const out = Math.min(1, (elapsed - PLAQUE_TURN_END_MS) / (SWITCH_DURATION_MS - PLAQUE_TURN_END_MS))
  return { logo: toLogo, depth: 1 - easeInOut(out) }
}

type Pointer = { zone: CursorZone; overSign: boolean; overMirror: boolean; overPull: boolean }
// What the camera is drawing: where it stands, which way it faces, and what's
// playing on the mirror wall.
type View = {
  x: number
  z: number
  yaw: number
  ripple?: RippleState
  shimmer?: Shimmer
  pullDrop?: number
  plaque?: Plaque
}
// What the current site puts on the mirror wall: its preview on the glass and
// its logo on the plaque.
type SiteLook = { preview: Preview | null; logo: LogoMap }

function drawView(
  ctx: CanvasRenderingContext2D,
  { x, z, yaw, ripple, shimmer, pullDrop, plaque }: View,
  { preview, logo }: SiteLook,
) {
  drawScene(ctx, yaw, { x, z }, { preview, ripple, shimmer, pullDrop, plaque: plaque ?? { logo } })
}

// Loads an image and quantises it to a preview covering the glass, cropping
// whichever dimension overflows. Resolves to null without a 2D canvas.
function loadPreview(src: string): Promise<Preview | null> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = PREVIEW_WIDTH
      canvas.height = PREVIEW_HEIGHT
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      if (!ctx) return resolve(null)
      const scale = Math.max(PREVIEW_WIDTH / image.width, PREVIEW_HEIGHT / image.height)
      const width = image.width * scale
      const height = image.height * scale
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(image, (PREVIEW_WIDTH - width) / 2, (PREVIEW_HEIGHT - height) / 2, width, height)
      const { data } = ctx.getImageData(0, 0, PREVIEW_WIDTH, PREVIEW_HEIGHT)
      resolve(quantisePreview(data, PREVIEW_WIDTH, PREVIEW_HEIGHT))
    }
    image.onerror = reject
    image.src = src
  })
}

function ViewPane() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const lowerPanelRef = useRef<HTMLCanvasElement>(null)
  const sidePanelRef = useRef<HTMLCanvasElement>(null)
  const [pointer, setPointer] = useState<Pointer>({
    zone: 'forward',
    overSign: false,
    overMirror: false,
    overPull: false,
  })
  const [place, setPlace] = useState<PlaceName>('start')
  const [heading, setHeading] = useState<Heading>('north')
  // The navigation button under the mouse in the lower panel, if any.
  const [panelButton, setPanelButton] = useState<NavButton | null>(null)
  const [animating, setAnimating] = useState(false)
  // Which of MIRROR_SITES the mirror shows. The ref is for drawing mid-animation.
  const [site, setSite] = useState(0)
  const siteRef = useRef(0)
  // The drawn view. Yaw isn't wrapped, so each turn animates the short way round.
  const viewRef = useRef<View>({ x: PLACES.start.x, z: PLACES.start.z, yaw: 0 })
  const frameRef = useRef<number | null>(null)
  // Each site's picture for the mirror, once loaded.
  const previewsRef = useRef<(Preview | null)[]>(MIRROR_SITES.map(() => null))
  const currentLook = (): SiteLook => ({
    preview: previewsRef.current[siteRef.current],
    logo: MIRROR_SITES[siteRef.current].logo,
  })

  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d')
    if (ctx) drawView(ctx, viewRef.current, currentLook())
    const sideCtx = sidePanelRef.current?.getContext('2d')
    if (sideCtx) clearPanel(sideCtx)
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
    }
  }, [])

  // The navigation panel's compass follows the drawn yaw and its buttons the
  // current place and heading. Turns and moves redraw it every frame too.
  const drawPanel = (enabled: Record<NavButton, boolean>) => {
    const ctx = lowerPanelRef.current?.getContext('2d')
    if (ctx) drawNavigationPanel(ctx, viewRef.current.yaw, enabled)
  }
  useEffect(() => {
    drawPanel(enabledButtons(place, heading))
  }, [place, heading])

  // Without its picture a site shows empty glass.
  useEffect(() => {
    let cancelled = false
    MIRROR_SITES.forEach(({ preview: src }, index) => {
      loadPreview(src)
        .then((preview) => {
          if (cancelled || !preview) return
          previewsRef.current[index] = preview
          const ctx = canvasRef.current?.getContext('2d')
          // Mid-animation, the next frame picks it up.
          if (ctx && index === siteRef.current && frameRef.current === null) drawView(ctx, viewRef.current, currentLook())
        })
        .catch(() => {})
    })
    return () => {
      cancelled = true
    }
  }, [])

  // Runs `frame` on each animation frame for `duration` ms with the elapsed
  // time, ending with a call at exactly `duration` and then `done`. Input waits
  // until it's finished.
  function runAnimation(
    ctx: CanvasRenderingContext2D,
    duration: number,
    frame: (elapsed: number) => View,
    done?: () => void,
    panelButtons?: Record<NavButton, boolean>,
  ) {
    setAnimating(true)
    const start = performance.now()
    const step = (now: number) => {
      const elapsed = Math.min(duration, now - start)
      viewRef.current = frame(elapsed)
      drawView(ctx, viewRef.current, currentLook())
      if (panelButtons) drawPanel(panelButtons)
      if (elapsed < duration) {
        frameRef.current = requestAnimationFrame(step)
      } else {
        frameRef.current = null
        setAnimating(false)
        done?.()
      }
    }
    frameRef.current = requestAnimationFrame(step)
  }

  // Animates the drawn view to `to`, or jumps there with reduced motion or no
  // canvas. The navigation panel turns along with it, showing `panelButtons`.
  function animateTo(to: View, duration: number, panelButtons: Record<NavButton, boolean>) {
    const from = viewRef.current
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx || prefersReducedMotion()) {
      viewRef.current = to
      if (ctx) drawView(ctx, to, currentLook())
      return
    }
    runAnimation(
      ctx,
      duration,
      (elapsed) => {
        if (elapsed >= duration) return to
        const eased = easeInOut(elapsed / duration)
        return {
          x: from.x + (to.x - from.x) * eased,
          z: from.z + (to.z - from.z) * eased,
          yaw: from.yaw + (to.yaw - from.yaw) * eased,
        }
      },
      undefined,
      panelButtons,
    )
  }

  // Turns a quarter turn in `direction`, as the room's edges and the panel's
  // turn buttons do.
  function turnView(direction: TurnDirection) {
    const next = turn(heading, direction)
    setHeading(next)
    animateTo(
      { ...viewRef.current, yaw: viewRef.current.yaw + TURN_YAW[direction] },
      TURN_DURATION_MS,
      enabledButtons(place, next),
    )
  }

  // Moves to `next` without turning, for stepping forward or back.
  function moveTo(next: PlaceName) {
    setPlace(next)
    animateTo({ ...viewRef.current, x: PLACES[next].x, z: PLACES[next].z }, MOVE_DURATION_MS, enabledButtons(next, heading))
  }

  // Plays a ripple on the mirror from the canvas position (x, y), if it's on
  // the glass, then goes to the site it shows. With reduced motion or no
  // canvas it goes straight there.
  function rippleAt(x: number, y: number) {
    const view = viewRef.current
    const origin = screenToMirror(x, y, VIEW_WIDTH, VIEW_HEIGHT, view.yaw, view)
    if (!origin) return
    const { url } = MIRROR_SITES[siteRef.current]
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx || prefersReducedMotion()) {
      openUrl(url)
      return
    }
    const duration = rippleDuration(origin)
    runAnimation(
      ctx,
      duration,
      (elapsed) =>
        elapsed < duration ? { ...view, ripple: { origin, elapsedMs: elapsed } } : { ...view, ripple: undefined },
      () => openUrl(url),
    )
  }

  // Tugs the curtain pull, shimmers the mirror over to the next site and turns
  // the plaque to its logo. With reduced motion or no canvas the site just
  // changes.
  function switchSite() {
    const view = viewRef.current
    const from = currentLook()
    siteRef.current = (siteRef.current + 1) % MIRROR_SITES.length
    setSite(siteRef.current)
    const ctx = canvasRef.current?.getContext('2d')
    const to = currentLook()
    if (!ctx || prefersReducedMotion()) {
      if (ctx) drawView(ctx, view, to)
      return
    }
    runAnimation(ctx, SWITCH_DURATION_MS, (elapsed) => {
      if (elapsed >= SWITCH_DURATION_MS) return { ...view, shimmer: undefined, pullDrop: undefined, plaque: undefined }
      const progress = Math.max(0, (elapsed - PULL_DOWN_MS) / (SWITCH_DURATION_MS - PULL_DOWN_MS))
      return {
        ...view,
        pullDrop: pullDropAt(elapsed),
        shimmer: { from: from.preview, progress },
        plaque: plaqueAt(elapsed, from.logo, to.logo),
      }
    })
  }

  // Mouse position in the canvas's drawing pixels, from fractions of its
  // on-screen size so hit areas scale with the pane.
  function canvasPointAt(event: MouseEvent<HTMLCanvasElement>): { x: number; y: number } | null {
    const canvas = event.currentTarget
    const rect = canvas.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return null
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    }
  }

  function pointerAt(event: MouseEvent<HTMLCanvasElement>): Pointer | null {
    const point = canvasPointAt(event)
    if (!point) return null
    const { x, y } = point
    return {
      zone: getCursorZone(x / VIEW_WIDTH),
      overSign: isInside(SIGN_BOUNDS, x, y),
      overMirror: isOverGlass(x, y),
      overPull: isOverPull(x, y),
    }
  }

  function handleMouseMove(event: MouseEvent<HTMLCanvasElement>) {
    const next = pointerAt(event)
    // Only re-render when the cursor would change.
    if (
      next &&
      (next.zone !== pointer.zone ||
        next.overSign !== pointer.overSign ||
        next.overMirror !== pointer.overMirror ||
        next.overPull !== pointer.overPull)
    )
      setPointer(next)
  }

  function handleClick(event: MouseEvent<HTMLCanvasElement>) {
    const point = canvasPointAt(event)
    const at = pointerAt(event)
    if (!point || !at || animating) return
    if (at.overMirror && isMirrorView) {
      rippleAt(point.x, point.y)
      return
    }
    if (at.overPull && isMirrorView) {
      switchSite()
      return
    }
    const direction = TURNS[at.zone]
    if (direction) {
      turnView(direction)
      return
    }
    const next = forwardFrom(place, heading)
    // A click on the sign, mirror or pull is for it, even if there's a way forward behind it.
    if (!next || showHand) return
    moveTo(next)
  }

  function panelButtonAt(event: MouseEvent<HTMLCanvasElement>): NavButton | null {
    const point = canvasPointAt(event)
    return point && navButtonAt(point.x, point.y)
  }

  function handlePanelMouseMove(event: MouseEvent<HTMLCanvasElement>) {
    const next = panelButtonAt(event)
    if (next !== panelButton) setPanelButton(next)
  }

  // The panel's buttons do what clicking the room does: turn left or right,
  // or step forward, plus stepping back without turning.
  function handlePanelClick(event: MouseEvent<HTMLCanvasElement>) {
    const button = panelButtonAt(event)
    if (!button || animating || !enabledButtons(place, heading)[button]) return
    if (button === 'left' || button === 'right') {
      turnView(button)
      return
    }
    const next = button === 'forward' ? forwardFrom(place, heading) : backFrom(place, heading)
    if (next) moveTo(next)
  }

  // The sign, mirror and pull are only clickable from where they were designed to be seen.
  const isMirrorView = place === 'nook' && heading === 'west'
  const showHand =
    !animating &&
    ((pointer.overSign && place === 'start' && heading === 'north') ||
      ((pointer.overMirror || pointer.overPull) && isMirrorView))
  const canMoveForward = forwardFrom(place, heading) !== null
  const cursor = showHand
    ? HAND_CURSOR
    : pointer.zone === 'forward' && !canMoveForward
      ? BLOCKED_CURSOR
      : CURSORS[pointer.zone]
  const panelCursor =
    panelButton === null || animating
      ? undefined
      : enabledButtons(place, heading)[panelButton]
        ? HAND_CURSOR
        : BLOCKED_CURSOR
  return (
    <div className="view-pane-frame">
      <canvas
        ref={canvasRef}
        className="view-pane"
        width={VIEW_WIDTH}
        height={VIEW_HEIGHT}
        role="img"
        aria-label="Dungeon view"
        data-place={place}
        data-heading={heading}
        data-site={MIRROR_SITES[site].name}
        style={{ cursor }}
        onMouseMove={handleMouseMove}
        onClick={handleClick}
      />
      <div className="view-pane-divider view-pane-divider--horizontal" />
      <canvas
        ref={lowerPanelRef}
        className="view-pane-lower"
        width={LOWER_PANEL_WIDTH}
        height={LOWER_PANEL_HEIGHT}
        aria-hidden="true"
        style={{ cursor: panelCursor }}
        onMouseMove={handlePanelMouseMove}
        onMouseLeave={() => setPanelButton(null)}
        onClick={handlePanelClick}
      />
      <div className="view-pane-divider view-pane-divider--vertical" />
      <canvas
        ref={sidePanelRef}
        className="view-pane-side"
        width={SIDE_PANEL_WIDTH}
        height={SIDE_PANEL_HEIGHT}
        aria-hidden="true"
      />
    </div>
  )
}

export default ViewPane
