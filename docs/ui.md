# UI

The site is a portfolio styled as a retro first-person point-and-click dungeon crawler. The planned design:

- **Rendering:** the room is drawn on an HTML5 `<canvas>`, not as DOM elements. It uses a dark background with off-white, 8-bit pixel-art elements. Walls are sparse pixelated brick patterns. Text uses a medium 8-bit retro font.
  - Implemented in `src/ViewPane/`: the canvas draws at a fixed 320×240 (`VIEW_WIDTH`/`VIEW_HEIGHT`). CSS scales it to the largest 4:3 size that fits inside 80vw × 80vh, centred, with `image-rendering: pixelated`. Drawing coordinates therefore stay the same at every window size.
- **Navigation:** the visitor starts facing a welcome sign. Clicking the left or right edge of the view turns the visitor, and clicking the centre moves them forward when forward movement is possible.
- **Cursor:** a large pixelated pointer that changes by hover region: a turn arrow at the left and right edges, and a forward arrow in the centre when the visitor can move forward.
  - Implemented in `src/ViewPane/cursors.ts`. The left and right 25% of the pane (`EDGE_ZONE_FRACTION`) show turn arrows and the middle shows the forward arrow. Arrows are 16×16 fill-only pixel maps (outlines are generated) drawn at 2× as 32px SVG data-URI CSS cursors. The centre always shows the forward arrow until navigation state exists.
- **Mirror:** on the left wall, one space from the start. A dial at its top has left and right buttons that rotate it through site names (LinkedIn, GitHub, …). Clicking the mirror plays a water-ripple animation that spreads from the click point to the mirror's edges, then redirects the browser to the selected profile.
