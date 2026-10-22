# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — start the Vite dev server with HMR
- `npm run build` — type-check (`tsc -b`, project references in `tsconfig.app.json` / `tsconfig.node.json`) then build for production
- `npm run lint` — run oxlint (type-aware; config in `.oxlintrc.json`)
- `npm run preview` — serve the production build locally
- `npm test` — run the Vitest suite
- `npm run build:font` — rebuild `src/assets/pixel-font.otf`, the page's web font, from the glyphs in `src/scene/core/pixelFont.ts`. Rerun after changing a glyph.
- `npm run capture:preview` — re-capture the profile screenshots shown in the mirror (`src/assets/*-preview.png`, one per page in the script's `PAGES` list, via Playwright; needs `npx playwright install chromium` once)

## Docs

`docs/README.md` indexes them all. Read the relevant doc before changing that area, and update it when behaviour changes.

- `docs/ui.md` — the site's concept and look, and which doc covers each part.
- `docs/architecture.md` — how `src/` is organised, the pure `Pixel[]` scene modules, art rules (palette, font, seeded randomness), the rendering loop and shared animation rules. Read before any rendering work.
- `docs/pane.md` — the view pane's areas, scaling, frame and dividing bands.
- `docs/layout.md` — the room's floor plan, places, camera and projection, visibility, room detail, object placement and draw order. Read before changing the room, places or what a view shows.
- `docs/navigation.md` — turning and moving, the navigation panel's compass and buttons, and the arrow keys.
- `docs/cursor.md` — which cursor shows where, hover areas and the cursor pixel maps. Anything added to a panel must set a pixel-art cursor.
- `docs/owl.md` — the owl perched in the hall's window: its shape, poses, resting animation (blinks and head tilts), the head-turning look when used, and its frame loop.
- `docs/mirror.md` — the mirror's sites, previews, ripple, curtain pull, logo plaque and site switching, and how to add a site.
- `docs/character.md` — the side panel's character card, the avatar asset and its quantising, the keyboard and mouse icons, and the profile view with its About Me text.
- `docs/text-box.md` — the lower panel's text box: the sign's pages, typing speed, caret, moving the text on (clicks, Enter, Space) and reduced motion.
- `docs/selection.md` — selecting the room's objects with Tab, the corner carets and their bounce, using objects with Enter or Space, and how to make a new object selectable.
- `docs/controls-panel.md` — the Controls panel, the page's grid layout and breakpoint, shared Sass sizes and the pixel web font.
- `docs/accessibility.md` — keyboard controls, screen reader support, reduced motion and contrast in one place, plus suggested improvements. Update it when adding input, animation or colours.
- `docs/components.md` — React component conventions: each component other than `App` goes in `src/ComponentName/` with its `.tsx`, `.test.tsx` and `.scss` files, plus where helpers go.
- `docs/testing.md` — test commands, Vitest setup, how to handle canvas code, shared helpers and test style.

## Stack

React 19 + TypeScript 6 + Vite 8, linted with oxlint (no ESLint/Prettier). The entry point is `index.html` → `src/main.tsx` → `src/App.tsx`. Styles are per-component `.scss` files (compiled by `sass-embedded`); `src/index.scss` holds only global page styles, the page layout, the font face and the colour and `--canvas-pixel` variables. Sizes shared between them are in `src/styles/_pane.scss`.

TypeScript settings that affect how code is written (`tsconfig.app.json`):
- `verbatimModuleSyntax`: type-only imports must use `import type`.
- `erasableSyntaxOnly`: no `enum`, `namespace` or constructor parameter properties. Use union types or `as const` objects.
- `noUnusedLocals` / `noUnusedParameters`: unused code fails the build.
- Imports may include the `.tsx`/`.ts` extension (`allowImportingTsExtensions`), as `main.tsx` does.
