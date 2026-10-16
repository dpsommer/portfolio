import { useEffect, useRef, useState } from 'react'
import type { MouseEvent } from 'react'
import { BLOCKED_CURSOR, CURSORS, HAND_CURSOR, getCursorZone } from './cursors.ts'
import type { CursorZone } from './cursors.ts'
import { MIRROR_SITE, openUrl } from './mirrorSite.ts'
import { drawScene } from '../scene/draw.ts'
import { TURN_YAW, turn } from '../scene/heading.ts'
import type { Heading, TurnDirection } from '../scene/heading.ts'
import { PLACES, forwardFrom } from '../scene/places.ts'
import type { PlaceName } from '../scene/places.ts'
import { screenToMirror } from '../scene/room.ts'
import type { RippleState } from '../scene/room.ts'
import { PREVIEW_HEIGHT, PREVIEW_WIDTH, quantisePreview } from '../scene/preview.ts'
import type { Preview } from '../scene/preview.ts'
import { rippleDuration } from '../scene/ripple.ts'
import { signBoardBounds } from '../scene/signpost.ts'
import type { Bounds } from '../scene/signpost.ts'
import './ViewPane.scss'

// Drawing resolution of the canvas; CSS scales it up to fit the screen.
export const VIEW_WIDTH = 320
export const VIEW_HEIGHT = 240

// How long a quarter turn and a step forward take to animate.
export const TURN_DURATION_MS = 250
export const MOVE_DURATION_MS = 350

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

const TURNS: Partial<Record<CursorZone, TurnDirection>> = { 'turn-left': 'left', 'turn-right': 'right' }

function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

const easeInOut = (t: number) => (1 - Math.cos(Math.PI * t)) / 2

type Pointer = { zone: CursorZone; overSign: boolean; overMirror: boolean }
// What the camera is drawing: where it stands, which way it faces, and any
// ripple playing on the mirror.
type View = { x: number; z: number; yaw: number; ripple?: RippleState }

function drawView(ctx: CanvasRenderingContext2D, { x, z, yaw, ripple }: View, preview: Preview | null) {
  drawScene(ctx, yaw, { x, z }, ripple, preview ?? undefined)
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
  const [pointer, setPointer] = useState<Pointer>({ zone: 'forward', overSign: false, overMirror: false })
  const [place, setPlace] = useState<PlaceName>('start')
  const [heading, setHeading] = useState<Heading>('north')
  const [animating, setAnimating] = useState(false)
  // The drawn view. Yaw isn't wrapped, so each turn animates the short way round.
  const viewRef = useRef<View>({ x: PLACES.start.x, z: PLACES.start.z, yaw: 0 })
  const frameRef = useRef<number | null>(null)
  // The mirror's picture, once loaded.
  const previewRef = useRef<Preview | null>(null)

  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d')
    if (ctx) drawView(ctx, viewRef.current, previewRef.current)
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
    }
  }, [])

  // Without the picture the mirror just shows empty glass.
  useEffect(() => {
    let cancelled = false
    loadPreview(MIRROR_SITE.preview)
      .then((preview) => {
        const ctx = canvasRef.current?.getContext('2d')
        if (cancelled || !preview) return
        previewRef.current = preview
        if (ctx) drawView(ctx, viewRef.current, preview)
      })
      .catch(() => {})
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
  ) {
    setAnimating(true)
    const start = performance.now()
    const step = (now: number) => {
      const elapsed = Math.min(duration, now - start)
      viewRef.current = frame(elapsed)
      drawView(ctx, viewRef.current, previewRef.current)
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

  // Animates the drawn view to `to`, or jumps there with reduced motion or no canvas.
  function animateTo(to: View, duration: number) {
    const from = viewRef.current
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx || prefersReducedMotion()) {
      viewRef.current = to
      if (ctx) drawView(ctx, to, previewRef.current)
      return
    }
    runAnimation(ctx, duration, (elapsed) => {
      if (elapsed >= duration) return to
      const eased = easeInOut(elapsed / duration)
      return {
        x: from.x + (to.x - from.x) * eased,
        z: from.z + (to.z - from.z) * eased,
        yaw: from.yaw + (to.yaw - from.yaw) * eased,
      }
    })
  }

  // Plays a ripple on the mirror from the canvas position (x, y), if it's on
  // the glass, then goes to the mirror's site. With reduced motion or no
  // canvas it goes straight there.
  function rippleAt(x: number, y: number) {
    const view = viewRef.current
    const origin = screenToMirror(x, y, VIEW_WIDTH, VIEW_HEIGHT, view.yaw, view)
    if (!origin) return
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx || prefersReducedMotion()) {
      openUrl(MIRROR_SITE.url)
      return
    }
    const duration = rippleDuration(origin)
    runAnimation(
      ctx,
      duration,
      (elapsed) =>
        elapsed < duration ? { ...view, ripple: { origin, elapsedMs: elapsed } } : { ...view, ripple: undefined },
      () => openUrl(MIRROR_SITE.url),
    )
  }

  // Mouse position in canvas pixels, from fractions of the canvas's on-screen
  // size so hit areas scale with the pane.
  function canvasPointAt(event: MouseEvent<HTMLCanvasElement>): { x: number; y: number } | null {
    const rect = event.currentTarget.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return null
    return {
      x: ((event.clientX - rect.left) / rect.width) * VIEW_WIDTH,
      y: ((event.clientY - rect.top) / rect.height) * VIEW_HEIGHT,
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
    }
  }

  function handleMouseMove(event: MouseEvent<HTMLCanvasElement>) {
    const next = pointerAt(event)
    // Only re-render when the cursor would change.
    if (
      next &&
      (next.zone !== pointer.zone || next.overSign !== pointer.overSign || next.overMirror !== pointer.overMirror)
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
    const direction = TURNS[at.zone]
    if (direction) {
      setHeading(turn(heading, direction))
      animateTo({ ...viewRef.current, yaw: viewRef.current.yaw + TURN_YAW[direction] }, TURN_DURATION_MS)
      return
    }
    const next = forwardFrom(place, heading)
    // A click on the sign or mirror is for it, even if there's a way forward behind it.
    if (!next || showHand) return
    setPlace(next)
    animateTo({ ...viewRef.current, x: PLACES[next].x, z: PLACES[next].z }, MOVE_DURATION_MS)
  }

  // The sign and mirror are only clickable from where they were designed to be seen.
  const isMirrorView = place === 'nook' && heading === 'west'
  const showHand =
    !animating &&
    ((pointer.overSign && place === 'start' && heading === 'north') || (pointer.overMirror && isMirrorView))
  const canMoveForward = forwardFrom(place, heading) !== null
  const cursor = showHand
    ? HAND_CURSOR
    : pointer.zone === 'forward' && !canMoveForward
      ? BLOCKED_CURSOR
      : CURSORS[pointer.zone]
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
        style={{ cursor }}
        onMouseMove={handleMouseMove}
        onClick={handleClick}
      />
    </div>
  )
}

export default ViewPane
