import './ViewPane.scss'

// Drawing resolution of the canvas; CSS scales it up to fit the screen.
export const VIEW_WIDTH = 320
export const VIEW_HEIGHT = 240

function ViewPane() {
  return (
    <canvas
      className="view-pane"
      width={VIEW_WIDTH}
      height={VIEW_HEIGHT}
      role="img"
      aria-label="Dungeon view"
    />
  )
}

export default ViewPane
