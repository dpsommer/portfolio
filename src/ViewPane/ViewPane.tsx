import { useEffect, useRef, useState } from 'react'
import type { MouseEvent } from 'react'
import { CURSORS, getCursorZone } from './cursors.ts'
import type { CursorZone } from './cursors.ts'
import { drawScene } from '../scene/draw.ts'
import './ViewPane.scss'

// Drawing resolution of the canvas; CSS scales it up to fit the screen.
export const VIEW_WIDTH = 320
export const VIEW_HEIGHT = 240

function ViewPane() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [zone, setZone] = useState<CursorZone>('forward')

  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d')
    if (ctx) drawScene(ctx)
  }, [])

  function handleMouseMove(event: MouseEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect()
    if (rect.width === 0) return
    // React bails out of the re-render when the zone is unchanged.
    setZone(getCursorZone((event.clientX - rect.left) / rect.width))
  }

  return (
    <canvas
      ref={canvasRef}
      className="view-pane"
      width={VIEW_WIDTH}
      height={VIEW_HEIGHT}
      role="img"
      aria-label="Dungeon view"
      style={{ cursor: CURSORS[zone] }}
      onMouseMove={handleMouseMove}
    />
  )
}

export default ViewPane
