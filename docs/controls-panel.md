# Controls panel

A framed list of the keyboard controls, beside the view pane on wide windows and under it on narrow ones (`src/ControlsPanel/`). Unlike the pane, it's HTML text rather than canvas, so screen readers, text selection and zoom all work. It's set in a web font built from the canvases' own 5×7 glyphs.

## Content

The entries are `CONTROLS` in `src/ControlsPanel/controls.ts`:

| Keys | Action |
| --- | --- |
| ↑/↓ \| W/S | Move |
| ←/→ \| A/D | Rotate |
| Tab | Select |
| Shift+Tab | Previous |
| Enter/Space | Interact |
| Esc | Cancel |

- **Markup:** an `<aside>` landmark labelled by its "Controls" heading, holding a `<dl>`. Each entry is a `<dt>` of `<kbd>` keys and a `<dd>` action.
- **Key groups:** an entry's `keyGroups` are alternative sets of keys for the same action, such as the arrow keys and WASD. Keys in a group are joined by `/`, and groups by ` | `. Screen readers hear "or" in place of the pipe, which is `aria-hidden`.
- **Key names:** keys whose symbol doesn't say what it is to a screen reader have a `name` ("Up arrow", "Escape"). The `<kbd>` shows the symbol with `aria-hidden` and holds the name in visually hidden text (`.controls-panel-hidden`). It doesn't use `aria-label`, because a `<kbd>` has no role and screen readers may ignore a label on it.
- **Keeping it in step:** the entries describe the keys `ViewPane` handles ([navigation.md](navigation.md#arrow-keys), [selection.md](selection.md#keys), [text-box.md](text-box.md#moving-the-text-on)). Change both together.
- **Characters:** every character must have a glyph in the pixel font (see [Font](#font)).
- **Fitting beside the pane:** in the side-by-side layout, each key label and action must fit on one line of the 150-pixel column (11 characters), so the list stays within the pane's height.

## Layout

`App` renders a grid (`.app` in `src/index.scss`) holding the pane and then the Controls panel.

- **Narrow windows:** one column. The panel sits under the pane and is as wide as it, and its entries flow into as many columns as fit (three at the pane's width).
- **Wide windows:** two columns. The panel is `$controls-width` (150) canvas pixels wide beside the pane and stretches to the pane's height, with its entries in one column.
- **Switching:** the layout changes at the aspect ratio where both layouts give the pane the same size, so the pane doesn't jump when the window crosses it. That's the `min-aspect-ratio` media query in `index.scss`.
- **Scaling:** both layouts are measured in canvas pixels through `--canvas-pixel` ([pane.md](pane.md#scaling)). The page fits 90vw across and 80vh down, beside or not. When stacked, only the pane has to fit the height, and the page scrolls to the panel.

The shared sizes (pane, frame, Controls width and the gap between them) are Sass variables in `src/styles/_pane.scss`, along with the `px()` function and the `pixel-frame` mixin.

## Style

- **Frame:** the pane's pixel frame (`pixel-frame`, using `src/assets/frame.svg`), filled with the background.
- **Text:** the `Pixel` font at 2 canvas pixels per glyph pixel, like the text box. Keys and the heading are in `--fg`, and actions in `--fg-worn`, the palette's worn tone. The padding is 8 canvas pixels.
- **Smoothing:** `-webkit-font-smoothing: none` keeps the edges crisp in Safari. Elsewhere the glyphs can be slightly soft when a canvas pixel isn't a whole number of screen pixels.
- **Cursor:** the browser's own. The pixel-art cursor rule in [cursor.md](cursor.md) covers the pane's canvases, not page content.

## Font

`src/assets/pixel-font.otf` is built from `GLYPHS` in `src/scene/core/pixelFont.ts` by `npm run build:font` (`scripts/build-pixel-font.mjs`, using opentype.js), and committed. `src/index.scss` loads it as `font-family: 'Pixel'`.

- **Metrics:** each glyph pixel is a 100-unit square in a 1000-unit em, so one glyph pixel is 0.1 em and `font-size: 10px` draws one glyph pixel per screen pixel. Glyphs are 7 pixels tall on the baseline, with a 6-pixel advance (5 plus 1 of spacing).
- **Outlines:** each run of filled pixels in a row is one rectangle, so neighbouring pixels don't show seams.
- **Rebuilding:** rerun `npm run build:font` after adding or changing a glyph. The build pins the font's timestamps, so unchanged glyphs give an identical file. `src/scene/core/pixelFontFile.test.ts` fails if the committed font doesn't match the glyphs.
