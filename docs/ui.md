# UI

The site is a portfolio styled as a retro first-person point-and-click dungeon crawler. The visitor stands in a small stone room, starting in front of a welcome sign. Clicking it types its message into the panel below the view, RPG-style. They turn and move by clicking the edges and centre of the view, or with the navigation panel below it. In a nook to the west hangs a mirror showing the owner's profiles: clicking it ripples the glass and opens the profile, and a curtain pull beside it switches between them.

## Look

- **Rendering:** everything is drawn on HTML5 `<canvas>`es as pixel art, not as DOM elements. The canvases draw at a fixed low resolution and are scaled up with `image-rendering: pixelated`.
- **Colour:** a dark background with off-white elements, in four tones (background, dim, worn and bright). See [architecture.md](architecture.md#art-rules).
- **Style:** sparse lines, so the viewer fills in the rest. Walls are scattered brick edges, the floor scattered flagstones. The panels are weathered, with pixels dropped or faded.
- **Text:** a 5×7 8-bit bitmap font, drawn pixel by pixel on the canvases and built into a web font for page text.
- **Cursor:** a large pixel-art pointer everywhere in the pane, never the browser's own.

## Where to find what

| Topic | Doc |
| --- | --- |
| How the code is organised, the rendering loop and animations | [architecture.md](architecture.md) |
| The pane: room, panels, frame and scaling | [pane.md](pane.md) |
| The room's geometry, places, camera, objects and draw order | [layout.md](layout.md) |
| Turning, moving, the compass, buttons and arrow keys | [navigation.md](navigation.md) |
| The cursor and hover areas | [cursor.md](cursor.md) |
| The mirror, its previews, ripple, curtain pull and logo plaque | [mirror.md](mirror.md) |
| The text box the sign's text types into | [text-box.md](text-box.md) |
| Selecting and using objects from the keyboard | [selection.md](selection.md) |
| Keyboard, screen reader and reduced-motion support | [accessibility.md](accessibility.md) |
| The Controls panel, page layout and pixel web font | [controls-panel.md](controls-panel.md) |
