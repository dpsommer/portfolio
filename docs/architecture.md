# Architecture

How the code is organised and how a frame gets drawn. For the room's geometry see [layout.md](layout.md); for component file conventions see [components.md](components.md).

## Overview

`App` renders the view pane, `ViewPane` (`src/ViewPane/ViewPane.tsx`), and the Controls panel beside it (`src/ControlsPanel/`, [controls-panel.md](controls-panel.md)). It owns all state (place, heading, current site, pointer, animations), handles input, and draws three canvases: the room, the lower panel and the side panel. Everything it draws comes from pure functions in `src/scene/`.

## Scene modules

Drawing logic lives in `src/scene/` as pure functions that return lists of `Pixel`s (`{ x, y, colour }`, `src/scene/core/types.ts`). Only a few functions touch a canvas context: `drawPixels` and `drawScene` (`src/scene/draw.ts`), `drawNavigationPanel`, `drawTextBox`, `drawSidePanel`, `drawProfile` and `clearPanel`. Keeping the rest pure lets it be tested without a canvas (see [testing.md](testing.md#canvas)).

The modules are grouped by what they draw:

| Folder | Contents |
| --- | --- |
| `core/` | The camera and projection, line rasterising, palette, pixel font, seeded randomness and the `Pixel` type. Nothing here imports from the other folders. |
| `room/` | The floor plan, walls, visibility and the room's own detail. |
| `mirror/` | The mirror's frame, preview, ripple, curtain pull and logo plaque. `pixels.ts` projects them all onto the mirror's wall and maps canvas positions back to it. |
| `sign/` | The welcome sign hanging on the far wall: its shape (`board.ts`), its pixels (`pixels.ts`), and its text and the text box's typing and caret timing (`signText.ts`). |
| `window/` | The plate tracery window in the hall's dead end, with its leading and open casement: its shape (`tracery.ts`) and its pixels (`pixels.ts`). |
| `navigation/` | Headings and places, and the navigation panel's compass and buttons. |
| `selection/` | The carets around the object selected with the keyboard, their bounce, and `pixelBounds`. |
| `character/` | The character card in the side panel, the icons (keyboard, mouse, headphones, hoodie), the profile view with its health potion and equipment table, photos quantised to the palette (`picture.ts`), and the card's name and health, the profile's text and the About Me text (`aboutText.ts`). |
| `textBox/` | The text box the lower panel shows while the sign's text is open: wrapping, layout, text and caret. |
| `panels/` | Logic shared by the panels beside the room, such as `clearPanel`. |
| `draw.ts` | `drawScene`, which paints everything in the room canvas in order (see [layout.md](layout.md#draw-order)), and sprite placement. |

`src/ViewPane/` also holds non-drawing data and helpers used only by the pane: cursors (`cursors.ts`), the mirror's sites (`mirrorSites.ts`) and their logos (`siteLogos.ts`).

## Art rules

- **Palette:** four tones in `src/scene/core/palette.ts`: `BACKGROUND`, then `FOREGROUND_DIM`, `FOREGROUND_WORN` and `FOREGROUND`. Draw only in these. `src/index.scss` repeats the background, worn and foreground tones as CSS variables for the page.
- **Text:** use the 5×7 bitmap font in `src/scene/core/pixelFont.ts`, not canvas text, which would be anti-aliased. Add glyphs there as needed.
- **Randomness:** never use `Math.random`. Use the seeded `createRandom` for one-off sprites, or `hashRandom`/`hashSeed` keyed to something fixed (such as world coordinates) for anything that moves between frames, so it stays put instead of shimmering. Something meant to differ between visits, like the avatar's speech bubble messages, seeds `createRandom` from `Date.now()`.
- **Lines:** objects in the room and the panel's compass and buttons are one-pixel lines in solid tones: bright main outlines, worn secondary lines and dim detail, with no fills.

## Rendering loop

The room canvas draws at a fixed 320×240 (`VIEW_WIDTH`/`VIEW_HEIGHT`), and CSS scales it up (see [pane.md](pane.md)). Drawing coordinates therefore never depend on window size; pointer positions are converted to canvas pixels using fractions of the canvas's on-screen size.

`ViewPane` keeps what the camera is drawing in a `View` ref (eye position, yaw, and whatever is playing on the mirror wall) and redraws with `drawScene` when it changes:

- on mount, and when a site's preview finishes loading
- on every frame of an animation, through `runAnimation`, which calls `requestAnimationFrame` until its duration has passed and then runs a `done` callback

The lower panel is redrawn with `drawNavigationPanel` whenever the place or heading changes, and on every frame of a turn or move so the compass turns with the view. While the sign's text is open it's drawn with `drawTextBox` instead, from its own frame loop ([text-box.md](text-box.md#typing)). While the profile view is open, the room canvas shows `drawProfile` and the lower panel the About Me text ([character.md](character.md#profile-view)).

The side panel is redrawn with `drawSidePanel` on mount, when the card's avatar loads, and when the card's selection or caret bounce changes.

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

The text box's typing and caret blink (`TYPING_MS_PER_CHAR`, `CARET_BLINK_MS` in `src/scene/sign/signText.ts`) are the exception. They run on their own frame loop, not through `runAnimation`, and don't count as animating, because the text box takes the pane's clicks itself. They still follow reduced motion. See [text-box.md](text-box.md#typing). The selection carets' bounce (`caretInset`, `src/scene/selection/selection.ts`) works the same way ([selection.md](selection.md#carets)).
