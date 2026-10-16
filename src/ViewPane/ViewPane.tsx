import { useEffect, useRef, useState } from 'react'
import type { MouseEvent } from 'react'
import { CURSORS, HAND_CURSOR, getCursorZone } from './cursors.ts'
import { drawScene } from '../scene/draw.ts'
import { signBoardBounds } from '../scene/signpost.ts'
import './ViewPane.scss'

// Drawing resolution of the canvas; CSS scales it up to fit the screen.
export const VIEW_WIDTH = 320
export const VIEW_HEIGHT = 240

const SIGN_BOUNDS = signBoardBounds(VIEW_WIDTH, VIEW_HEIGHT)

// Whether a point in canvas pixels is over the welcome sign's board.
function isOverSign(x: number, y: number): boolean {
  const { left, top, right, bottom } = SIGN_BOUNDS
  return x >= left && x < right + 1 && y >= top && y < bottom + 1
}

function ViewPane() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [cursor, setCursor] = useState(CURSORS.forward)

  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d')
    if (ctx) drawScene(ctx)
  }, [])

  function handleMouseMove(event: MouseEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return
    // Fractions of the on-screen size, so hit areas scale with the pane.
    const fractionX = (event.clientX - rect.left) / rect.width
    const fractionY = (event.clientY - rect.top) / rect.height
    // React bails out of the re-render when the cursor is unchanged.
    setCursor(
      isOverSign(fractionX * VIEW_WIDTH, fractionY * VIEW_HEIGHT) ? HAND_CURSOR : CURSORS[getCursorZone(fractionX)],
    )
  }

  return (
    <div className="view-pane-frame">
      <canvas
        ref={canvasRef}
        className="view-pane"
        width={VIEW_WIDTH}
        height={VIEW_HEIGHT}
        role="img"
        aria-label="Dungeon view"
        style={{ cursor }}
        onMouseMove={handleMouseMove}
      />
    </div>
  )
}

export default ViewPane
