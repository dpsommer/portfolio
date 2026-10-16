import { useEffect, useRef, useState } from 'react'
import type { MouseEvent } from 'react'
import { BLOCKED_CURSOR, CURSORS, HAND_CURSOR, getCursorZone } from './cursors.ts'
import type { CursorZone } from './cursors.ts'
import { drawScene } from '../scene/draw.ts'
import { TURN_YAW, turn } from '../scene/heading.ts'
import type { Heading, TurnDirection } from '../scene/heading.ts'
import { PLACES, forwardFrom } from '../scene/places.ts'
import type { PlaceName } from '../scene/places.ts'
import { mirrorBounds, screenToMirror } from '../scene/room.ts'
import type { RippleState } from '../scene/room.ts'
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
// The mirror as seen from the nook facing west, the view it's clicked from.
const MIRROR_BOUNDS = mirrorBounds(VIEW_WIDTH, VIEW_HEIGHT, TURN_YAW.left, PLACES.nook)

// Whether a point in canvas pixels is inside inclusive bounds.
function isInside(bounds: Bounds | null, x: number, y: number): boolean {
  if (!bounds) return false
  const { left, top, right, bottom } = bounds
  return x >= left && x < right + 1 && y >= top && y < bottom + 1
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

function drawView(ctx: CanvasRenderingContext2D, { x, z, yaw, ripple }: View) {
  drawScene(ctx, yaw, { x, z }, ripple)
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

  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d')
    if (ctx) drawView(ctx, viewRef.current)
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
    }
  }, [])

  // Runs `frame` on each animation frame for `duration` ms with the elapsed
  // time, ending with a call at exactly `duration`. Input waits until it's done.
  function runAnimation(ctx: CanvasRenderingContext2D, duration: number, frame: (elapsed: number) => View) {
    setAnimating(true)
    const start = performance.now()
    const step = (now: number) => {
      const elapsed = Math.min(duration, now - start)
      viewRef.current = frame(elapsed)
      drawView(ctx, viewRef.current)
      if (elapsed < duration) {
        frameRef.current = requestAnimationFrame(step)
      } else {
        frameRef.current = null
        setAnimating(false)
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
      if (ctx) drawView(ctx, to)
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

  // Plays a ripple on the mirror from the canvas position (x, y), if it's on the glass.
  function rippleAt(x: number, y: number) {
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx || prefersReducedMotion()) return
    const view = viewRef.current
    const origin = screenToMirror(x, y, VIEW_WIDTH, VIEW_HEIGHT, view.yaw, view)
    if (!origin) return
    const duration = rippleDuration(origin)
    runAnimation(ctx, duration, (elapsed) =>
      elapsed < duration ? { ...view, ripple: { origin, elapsedMs: elapsed } } : { ...view, ripple: undefined },
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
      overMirror: isInside(MIRROR_BOUNDS, x, y),
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
