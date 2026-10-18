# Architecture

How the code is organised and how a frame gets drawn. For the room's geometry see [layout.md](layout.md); for component file conventions see [components.md](components.md).

## Overview

`App` renders a single component, `ViewPane` (`src/ViewPane/ViewPane.tsx`). It owns all state (place, heading, current site, pointer, animations), handles input, and draws three canvases: the room, the lower panel and the side panel. Everything it draws comes from pure functions in `src/scene/`.

## Scene modules

Drawing logic lives in `src/scene/` as pure functions that return lists of `Pixel`s (`{ x, y, colour }`, `src/scene/core/types.ts`). Only a few functions touch a canvas context: `drawPixels` and `drawScene` (`src/scene/draw.ts`), `drawNavigationPanel` and `clearPanel`. Keeping the rest pure lets it be tested without a canvas (see [testing.md](testing.md#canvas)).

The modules are grouped by what they draw:

| Folder | Contents |
| --- | --- |
| `core/` | The camera and projection, line rasterising, palette, pixel font, seeded randomness and the `Pixel` type. Nothing here imports from the other folders. |
| `room/` | The floor plan, walls, visibility and the room's own detail. |
| `mirror/` | The mirror's frame, preview, ripple, curtain pull and logo plaque. `pixels.ts` projects them all onto the mirror's wall and maps canvas positions back to it. |
| `signpost/` | The welcome sign. |
| `navigation/` | Headings and places, and the navigation panel's compass and buttons. |
| `panels/` | Logic shared by the panels beside the room, such as `clearPanel` and `weather`. |
| `draw.ts` | `drawScene`, which paints everything in the room canvas in order (see [layout.md](layout.md#draw-order)), and sprite placement. |

`src/ViewPane/` also holds non-drawing data and helpers used only by the pane: cursors (`cursors.ts`), the mirror's sites (`mirrorSites.ts`) and their logos (`siteLogos.ts`).

## Art rules

- **Palette:** four tones in `src/scene/core/palette.ts`: `BACKGROUND`, then `FOREGROUND_DIM`, `FOREGROUND_WORN` and `FOREGROUND`. Draw only in these. `src/index.css` repeats the background and foreground as CSS variables for the page.
- **Text:** use the 5×7 bitmap font in `src/scene/core/pixelFont.ts`, not canvas text, which would be anti-aliased. Add glyphs there as needed.
- **Randomness:** never use `Math.random`. Use the seeded `createRandom` for one-off sprites, or `hashRandom`/`hashSeed` keyed to something fixed (world coordinates, a notch's place on the compass) for anything that moves between frames, so the wear stays put instead of shimmering.
- **Weathering:** sprites and panel art are worn by dropping some pixels and fading others a tone (`weather` in `src/scene/panels/panelCanvas.ts`).

## Rendering loop

The room canvas draws at a fixed 320×240 (`VIEW_WIDTH`/`VIEW_HEIGHT`), and CSS scales it up (see [pane.md](pane.md)). Drawing coordinates therefore never depend on window size; pointer positions are converted to canvas pixels using fractions of the canvas's on-screen size.

`ViewPane` keeps what the camera is drawing in a `View` ref (eye position, yaw, and whatever is playing on the mirror wall) and redraws with `drawScene` when it changes:

- on mount, and when a site's preview finishes loading
- on every frame of an animation, through `runAnimation`, which calls `requestAnimationFrame` until its duration has passed and then runs a `done` callback

The lower panel is redrawn with `drawNavigationPanel` whenever the place or heading changes, and on every frame of a turn or move so the compass turns with the view.

## Animations

Every animation goes through `runAnimation` and follows the same rules:

- **Input waits:** while one plays, the view counts as animating. Clicks and key presses are ignored, and hover hands don't show.
- **Easing:** movement uses ease-in-out.
- **Reduced motion:** with `prefers-reduced-motion: reduce`, or when there's no canvas context, the end state is applied at once with no animation.

| Animation | Duration | Defined in | Details |
| --- | --- | --- | --- |
| Turn | `TURN_DURATION_MS` (250 ms) | `ViewPane` | [navigation.md](navigation.md#turning-and-moving) |
| Move | `MOVE_DURATION_MS` (350 ms) | `ViewPane` | [navigation.md](navigation.md#turning-and-moving) |
| Key press | first and last `KEY_PRESS_MS` (60 ms) of a turn or move | `ViewPane` | [navigation.md](navigation.md#pressing) |
| Ripple | `rippleDuration(origin)`, longer near the glass's edge | `src/scene/mirror/ripple.ts` | [mirror.md](mirror.md#ripple) |
| Site switch | `SWITCH_DURATION_MS` (900 ms) | `ViewPane` | [mirror.md](mirror.md#switching-sites) |
