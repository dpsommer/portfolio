# Mirror

The mirror hangs on the nook's back wall, one step west of the start. Its glass shows a preview of one of several profiles. Clicking the glass plays a water-ripple animation and then sends the browser to that profile. Clicking the curtain pull to its right switches to the next profile, and a plaque below the pull shows the current profile's logo.

It's only interactive from the nook facing west. The code is in `src/scene/mirror/`; `ViewPane` holds the current site and runs the animations.

## Sites

The profiles are `MIRROR_SITES` in `src/ViewPane/mirrorSites.ts`, in the order the pull steps through them: GitHub, then LinkedIn. Each has a `name`, a `url`, a `preview` screenshot and a `logo`. The room canvas's `data-site` attribute names the current site.

### Adding a site

1. Add the page to `PAGES` in `scripts/capture-preview.mjs`, with `invert: true` if it has no dark mode, and run `npm run capture:preview`. The two lists must stay in step.
2. Draw a 16×16 `LogoMap` for it in `src/ViewPane/siteLogos.ts` (see [Logo plaque](#logo-plaque) for the format).
3. Add an entry to `MIRROR_SITES` importing the new screenshot and logo.

## Geometry

The mirror, pull and plaque are drawn in mirror-local units (s right, t up, centred on the mirror with t 0 at eye height), as sparse lines like the room. `mirrorToWall` (`src/scene/room/room.ts`) places them on the `nook-back` wall (`MIRROR_WALL`), and `src/scene/mirror/pixels.ts` projects them with the room's wall visibility. Going the other way, `screenToWall` and `screenToMirror` cast a ray from a canvas position to the wall.

Each object exports bounds (`MIRROR_BOUNDS`, `PULL_BOUNDS`, `PLAQUE_BOUNDS`) that `room.ts` uses to keep bricks off it. A new object on the mirror's wall needs the same.

## Frame

An ornate, arch-topped frame (`src/scene/mirror/frame.ts`), 1.3 high on the 1.5-high wall (crest and pendant included) and 0.8 wide at the frame, centred on the wall at eye height. `MIRROR_LAYERS` draws it in three layers:

- dim glints on the glass
- a worn inner glass edge
- a bright outer frame with a diamond crest, side and corner scrolls, and a pendant with a bead

`isOnGlass` tests whether a mirror-local point is on the glass (inside the arch, not the frame).

## Preview

Each preview is a committed screenshot of the profile page, because browsers can't draw a cross-origin page into a canvas and these sites can't be framed. The screenshots are in `src/assets/*-preview.png`.

- **Capture:** `npm run capture:preview` (`scripts/capture-preview.mjs`, using Playwright) retakes them all: a 390-wide phone viewport in dark mode, cropped to the glass's aspect ratio, with any sign-in prompt dismissed. Pages marked `invert` (LinkedIn has no dark mode) have CSS inverting the page's colours and inverting pictures back, so the page goes dark like the scene while photos stay normal.
- **Loading:** `ViewPane` loads every site's screenshot on mount. Each is scaled to cover a grid of `PREVIEW_WIDTH` × `PREVIEW_HEIGHT` cells (`src/scene/mirror/preview.ts`), one per canvas pixel from the nook. `quantisePreview` maps it to the scene's four tones with 4×4 ordered dithering, treating near-black as background. Until a site's screenshot loads, or if it fails, its glass is empty.
- **Drawing:** `previewPixels` projects each glass cell onto the mirror's wall and draws it as a block sized by its depth, so it shows one pixel per cell from the nook and smaller from further away.

## Ripple

Clicking the glass plays a water ripple from the click point, then redirects the browser.

- **Hit test:** `screenToMirror` turns the click into a point on the glass. Clicks on the frame or ornaments, off the glass, do nothing.
- **Rings:** `src/scene/mirror/ripple.ts` sends out three rings, `EMIT_INTERVAL` apart. A ring's radius is `SPEED · age^GROWTH`, so each ring speeds up as it spreads and the outer rings are further apart.
- **Fade:** a ring's strength falls from 1 at the click to 0 at `1 / FADE_RATE` of the way to the glass's furthest point from it, so rings fade out before the far edge. Strong rings are drawn worn, weaker ones dim, and the weakest lose more and more pixels until they vanish. `rippleDuration` is when the last ring fades, so clicks near an edge ripple for longer.
- **Distortion:** while it plays, the preview is sampled through `rippleOffset`, so the picture under each ring is pushed outward just behind its crest and inward just ahead of it. `ripplePixels` draws the rings over the picture, clipped to the glass.
- **From the keyboard:** with the mirror selected ([selection.md](selection.md)), Enter or Space ripples from `GLASS_CENTRE` (`src/scene/mirror/frame.ts`), the middle of the glass.
- **Redirect:** when it ends, `openUrl` sends the browser to the profile in the same tab. With reduced motion (or no canvas), a click goes straight to the profile.

## Curtain pull

A cord hanging from the ceiling to the right of the mirror, ending in an acorn-shaped handle (`src/scene/mirror/pull.ts`).

- **Placement:** at s `PULL_S`, right of the mirror's side scroll. The cord ends at the handle's top a little above eye height, keeping the handle clear of the brick below it.
- **Style:** a worn cord and a band across the handle, and a bright handle outline. `pullLayers(drop)` lowers the handle by `drop` and stretches the cord, for the tug animation.
- **Clicking** it, or pressing Enter or Space with it selected, switches to the next site, wrapping after the last.

## Logo plaque

A stone block set into a niche in the wall below the pull, its face showing the current site's logo (`src/scene/mirror/plaque.ts`). It isn't clickable.

- **Placement:** centred under the pull's cord, below the pull's lowest drop and clear of the brick between them.
- **Logos:** each site's logo is a hand-drawn 16×16 `LogoMap` in `src/ViewPane/siteLogos.ts` (the Octocat and LinkedIn's "in"): `#` full foreground, `+` worn, `-` dim, `.` empty, one cell per canvas pixel from the nook, like the preview.
- **Depth:** drawn in the wall's plane in the room's "narrowing box" style. `plaqueLayers(depth, turn)` draws the niche (dim), lines from its corners to the face's corners, and the face's outline (worn).
  - Sinking (`depth` 0 to 1) shrinks the face toward the niche's centre, lengthening those lines, and `logoCells` drops the logo a tone into shadow.
  - Turning (`turn` 0 to 1, a half turn on the vertical axis) narrows the face and logo by `|cos(π·turn)|`.
- **Drawing:** `plaquePixels` projects the lines like the mirror and the logo's cells as blocks, like the preview's.

## Switching sites

Clicking the pull plays a `SWITCH_DURATION_MS` animation in `ViewPane`, with three overlapping parts:

| Time (ms) | Pull (`PULL_DOWN_MS`, `PULL_UP_MS`) | Plaque (`PLAQUE_SINK_MS`, `PLAQUE_TURN_END_MS`; `plaqueAt`) | Glass |
| --- | --- | --- | --- |
| 0–150 | Drops 0.1 units, cord stretching | Sinks into the wall | Old preview |
| 150–200 | Springs back | Sinks into the wall | Shimmers to the new preview |
| 200–600 | Springs back | Turns; logos swap when it's edge-on | Shimmers |
| 600–650 | At rest | Turns | Shimmers |
| 650–900 | At rest | Pushes back out | Shimmers |

The shimmer (`shimmerTone` in `src/scene/mirror/preview.ts`) switches each cell at its own moment, from a sweep down from the top left plus random jitter. Cells close to their switch flash a tone brighter, so a sparkle passes over the glass as the picture changes.

It follows the shared animation rules in [architecture.md](architecture.md#animations); with reduced motion (or no canvas) the site changes at once.
