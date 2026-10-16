import { useEffect, useRef, useState } from 'react'
import type { MouseEvent } from 'react'
import { CURSORS, HAND_CURSOR, getCursorZone } from './cursors.ts'
import type { CursorZone } from './cursors.ts'
import { drawScene } from '../scene/draw.ts'
import { TURN_YAW, turn } from '../scene/heading.ts'
import type { Heading, TurnDirection } from '../scene/heading.ts'
import { signBoardBounds } from '../scene/signpost.ts'
import './ViewPane.scss'

// Drawing resolution of the canvas; CSS scales it up to fit the screen.
export const VIEW_WIDTH = 320
export const VIEW_HEIGHT = 240

// How long a quarter turn takes to animate.
export const TURN_DURATION_MS = 250

const SIGN_BOUNDS = signBoardBounds(VIEW_WIDTH, VIEW_HEIGHT)

// Whether a point in canvas pixels is over the welcome sign's board.
function isOverSign(x: number, y: number): boolean {
  const { left, top, right, bottom } = SIGN_BOUNDS
  return x >= left && x < right + 1 && y >= top && y < bottom + 1
}

const TURNS: Partial<Record<CursorZone, TurnDirection>> = { 'turn-left': 'left', 'turn-right': 'right' }

function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

const easeInOut = (t: number) => (1 - Math.cos(Math.PI * t)) / 2

type Pointer = { zone: CursorZone; overSign: boolean }

function ViewPane() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [pointer, setPointer] = useState<Pointer>({ zone: 'forward', overSign: false })
  const [heading, setHeading] = useState<Heading>('north')
  const [turning, setTurning] = useState(false)
  // The drawn camera yaw. It isn't wrapped, so each turn animates the short way round.
  const yawRef = useRef(0)
  const frameRef = useRef<number | null>(null)

  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d')
    if (ctx) drawScene(ctx, yawRef.current)
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
    }
  }, [])

  // Mouse position as fractions of the canvas's on-screen size, so hit areas scale with the pane.
  function pointerAt(event: MouseEvent<HTMLCanvasElement>): Pointer | null {
    const rect = event.currentTarget.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return null
    const fractionX = (event.clientX - rect.left) / rect.width
    const fractionY = (event.clientY - rect.top) / rect.height
    return {
      zone: getCursorZone(fractionX),
      overSign: isOverSign(fractionX * VIEW_WIDTH, fractionY * VIEW_HEIGHT),
    }
  }

  function handleMouseMove(event: MouseEvent<HTMLCanvasElement>) {
    const next = pointerAt(event)
    // Only re-render when the cursor would change.
    if (next && (next.zone !== pointer.zone || next.overSign !== pointer.overSign)) setPointer(next)
  }

  function handleClick(event: MouseEvent<HTMLCanvasElement>) {
    const at = pointerAt(event)
    const direction = at && TURNS[at.zone]
    if (!direction || turning) return
    setHeading(turn(heading, direction))

    const from = yawRef.current
    const to = from + TURN_YAW[direction]
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx || prefersReducedMotion()) {
      yawRef.current = to
      if (ctx) drawScene(ctx, to)
      return
    }
    setTurning(true)
    const start = performance.now()
    const step = (now: number) => {
      const progress = Math.min(1, (now - start) / TURN_DURATION_MS)
      yawRef.current = progress < 1 ? from + (to - from) * easeInOut(progress) : to
      drawScene(ctx, yawRef.current)
      if (progress < 1) {
        frameRef.current = requestAnimationFrame(step)
      } else {
        frameRef.current = null
        setTurning(false)
      }
    }
    frameRef.current = requestAnimationFrame(step)
  }

  const showHand = pointer.overSign && heading === 'north' && !turning
  return (
    <div className="view-pane-frame">
      <canvas
        ref={canvasRef}
        className="view-pane"
        width={VIEW_WIDTH}
        height={VIEW_HEIGHT}
        role="img"
        aria-label="Dungeon view"
        data-heading={heading}
        style={{ cursor: showHand ? HAND_CURSOR : CURSORS[pointer.zone] }}
        onMouseMove={handleMouseMove}
        onClick={handleClick}
      />
    </div>
  )
}

export default ViewPane
