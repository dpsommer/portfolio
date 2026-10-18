# View pane

How the pane around the room is laid out and styled (`src/ViewPane/ViewPane.tsx` and `ViewPane.scss`).

## Areas

The pane is a CSS grid inside a `.view-pane-frame` wrapper, 457×377 canvas pixels inside the frame. It's split into three areas, all canvases:

| Area | Size | Constants / class | Contents |
| --- | --- | --- | --- |
| Room | 320×240 | `VIEW_WIDTH`/`VIEW_HEIGHT` | The room, in the upper left, 70% of the pane's width. |
| Lower panel | 320×132 | `LOWER_PANEL_WIDTH`/`LOWER_PANEL_HEIGHT`, `.view-pane-lower` | The navigation panel ([navigation.md](navigation.md#navigation-panel)). As tall as the side panel is wide, to keep it compact. |
| Side panel | 132×377 | `SIDE_PANEL_WIDTH`/`SIDE_PANEL_HEIGHT`, `.view-pane-side` | Filled with the background for now. |

The panel sizes are derived from the pane width and the 5-pixel dividing bands, so the room keeps exactly 70% of the width (and about 64% of the height). The panels are hidden from assistive tech.

Only the room canvas has cursor zones and click handling. The lower panel handles clicks on its buttons; the frame, bands and side panel take no input.

## Scaling

CSS scales the whole pane to the largest size that fits inside 80vw × 80vh, centred, with `image-rendering: pixelated`. Drawing coordinates stay the same at every window size.

## Frame and bands

- **Frame:** a pixel-art `border-image` (`src/ViewPane/frame.svg`) with stepped corners, a black outer outline, an off-white band with a worn bevel, and a black inner outline. It's 5 frame pixels thick, and each frame pixel is sized to match one canvas pixel on screen.
- **Bands:** the areas are divided by 5-pixel bands in the same colours, bevelled on both sides (`.view-pane-divider`). The vertical band runs unbroken past the end of the horizontal one.
- **Cursor:** the wrapper sets the blocked cursor, which the frame, bands and side panel inherit (see [cursor.md](cursor.md)).
