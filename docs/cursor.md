# Cursor

The mouse cursor is a large pixel-art pointer that changes with what's under it. Cursors are built in `src/ViewPane/cursors.ts` and set by `ViewPane`.

## Rule

Whenever the mouse is inside any canvas area (the room, the lower panel or the side panel), the cursor is a retro pixel-art pointer suited to what's under it, never the browser's own cursor. Anything added to a panel must pick a fitting pointer from `cursors.ts`, or add a new pixel map there, and set it in `ViewPane`.

## Where each cursor shows

| Where | Cursor |
| --- | --- |
| Room, left and right `EDGE_ZONE_FRACTION` (15%) | Turn arrow in that direction |
| Room, middle, with a way forward | Forward arrow |
| Room, middle, with no way forward | Blocked hand |
| Welcome sign's board, at the start facing north | Pointing hand (a click opens its text box) |
| Mirror's glass or curtain pull, in the nook facing west | Pointing hand |
| Usable navigation button | Pointing hand |
| Dimmed button, or anywhere on a panel with nothing usable | Blocked hand |
| Frame, dividing bands, side panel | Blocked hand |

While the sign's text box is open, the pointing hand shows everywhere in the pane, because a click anywhere moves the text on ([text-box.md](text-box.md)).

While an animation plays, the hands don't show: the room shows its zone cursor, and every panel button shows the blocked hand.

`ViewPane` sets the blocked hand on `.view-pane-frame`, so the frame's border, the bands and the side panel inherit it; the room and lower panel canvases set their own.

Keyboard selection ([selection.md](selection.md)) is shown with carets drawn in the room, not the cursor, and doesn't change the cursor.

The Controls panel beside the pane is page content, not a canvas, so it keeps the browser's own cursor ([controls-panel.md](controls-panel.md#style)).

## Hover areas

`ViewPane` converts the mouse position to canvas pixels using fractions of the canvas's on-screen size, so every area scales with the pane.

- **Sign:** the rectangle from the tilted board's lower-left corner to its upper-right corner (`signBoardBounds` in `src/scene/signpost/signpost.ts`).
- **Mirror:** the glass's arch-topped shape, not the frame or ornaments. `ViewPane` checks it with `screenToMirror` (`src/scene/mirror/pixels.ts`), the same test a click uses.
- **Curtain pull:** `PULL_HIT` (`src/scene/mirror/pull.ts`): the handle and the lower cord, padded so the one-pixel cord is easy to hit. `ViewPane` finds the point on the wall with `screenToWall` and checks it with `isOnPull`.
- **Buttons:** `navButtonAt` (`src/scene/navigation/navButtons.ts`).

## Pixel maps

Cursors are 16×16 pixel maps of strings, drawn at 2× as 32px SVG data-URI CSS cursors by `pixelMapToCursor`, which also takes a fallback cursor keyword and an optional hotspot in map pixels. Outlines are generated.

- **Arrows** are flat shapes lying on the floor, seen from above at 45° with the same forced perspective as the room. `projectArrow` rasterises floor-coordinate polygons into maps: `#` is the top face and `+` is the visible side face, in the worn colour. The far end is foreshortened by cos 45° and narrowed by `PERSPECTIVE`.
- **Blocked hand** (`BLOCKED_MAP` / `BLOCKED_CURSOR`): an open hand, fingers spread, lying on the floor in the same projection as the arrows. Its fingers fan out slightly so each lands on its own pixel column once foreshortened.
- **Pointing hand** (`HAND_MAP` / `HAND_CURSOR`): upright, not projected onto the floor, with its hotspot at the fingertip.
