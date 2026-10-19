# View pane

How the pane around the room is laid out and styled (`src/ViewPane/ViewPane.tsx` and `ViewPane.scss`).

## Areas

The pane is a CSS grid inside a `.view-pane-frame` wrapper, 457×377 canvas pixels inside the frame. It's split into three areas, all canvases:

| Area | Size | Constants / class | Contents |
| --- | --- | --- | --- |
| Room | 320×240 | `VIEW_WIDTH`/`VIEW_HEIGHT` | The room, in the upper left, 70% of the pane's width. |
| Lower panel | 320×132 | `LOWER_PANEL_WIDTH`/`LOWER_PANEL_HEIGHT`, `.view-pane-lower` | The navigation panel ([navigation.md](navigation.md#navigation-panel)), or the text box while the sign's text is open ([text-box.md](text-box.md)). As tall as the side panel is wide, to keep it compact. |
| Side panel | 132×377 | `SIDE_PANEL_WIDTH`/`SIDE_PANEL_HEIGHT`, `.view-pane-side` | The character card at the top ([character.md](character.md)); the rest is background. |

The panel sizes are derived from the pane width and the 5-pixel dividing bands, so the room keeps exactly 70% of the width (and about 64% of the height). The panels are hidden from assistive tech.

Only the room canvas has cursor zones and click handling. The lower panel handles clicks on its buttons, and the side panel handles clicks on the character card. The frame and bands take no input, except that while the text box is open a click anywhere in the pane moves its text on.

## Scaling

CSS sizes everything in canvas pixels: `--canvas-pixel` (`src/index.scss`) is the size of one on screen, and the `px()` function in `src/styles/_pane.scss` multiplies it. It's the largest size that fits the pane, and the Controls panel when it's beside it, inside 90vw × 80vh ([controls-panel.md](controls-panel.md#layout)). The canvases use `image-rendering: pixelated`. Drawing coordinates stay the same at every window size.

## Frame and bands

- **Frame:** a pixel-art `border-image` (`src/assets/frame.svg`, through the `pixel-frame` mixin) with stepped corners, a black outer outline, an off-white band with a worn bevel, and a black inner outline. It's 5 frame pixels thick, and each frame pixel is sized to match one canvas pixel on screen.
- **Bands:** the areas are divided by 5-pixel bands in the same colours, bevelled on both sides (`.view-pane-divider`). The vertical band runs unbroken past the end of the horizontal one.
- **Cursor:** the wrapper sets the blocked cursor, which the frame, bands and side panel (away from the card) inherit (see [cursor.md](cursor.md)).
