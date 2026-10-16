# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — start the Vite dev server with HMR
- `npm run build` — type-check (`tsc -b`, project references in `tsconfig.app.json` / `tsconfig.node.json`) then build for production
- `npm run lint` — run oxlint (type-aware; config in `.oxlintrc.json`)
- `npm run preview` — serve the production build locally

No test runner is configured yet. If you add tests, add Vitest (it fits the Vite toolchain) and an `npm test` script, and update this section with how to run a single test.

## Stack

React 19 + TypeScript 6 + Vite 8, linted with oxlint (no ESLint/Prettier). The entry point is `index.html` → `src/main.tsx` → `src/App.tsx`. `src/App.tsx`, `src/App.css` and the files in `src/assets/` are still the Vite starter template and should be replaced.

TypeScript settings that affect how code is written (`tsconfig.app.json`):
- `verbatimModuleSyntax`: type-only imports must use `import type`.
- `erasableSyntaxOnly`: no `enum`, `namespace` or constructor parameter properties. Use union types or `as const` objects.
- `noUnusedLocals` / `noUnusedParameters`: unused code fails the build.
- Imports may include the `.tsx`/`.ts` extension (`allowImportingTsExtensions`), as `main.tsx` does.

## Product design (from README)

The site is a portfolio styled as a retro first-person point-and-click dungeon crawler. The planned design:

- **Rendering:** the room is drawn on an HTML5 `<canvas>`, not as DOM elements. It uses a dark background with off-white, 8-bit pixel-art elements. Walls are sparse pixelated brick patterns. Text uses a medium 8-bit retro font.
- **Navigation:** the visitor starts facing a welcome sign. Clicking the left or right edge of the view turns the visitor, and clicking the centre moves them forward when forward movement is possible.
- **Cursor:** a large pixelated pointer that changes by hover region: a turn arrow at the left and right edges, and a forward arrow in the centre when the visitor can move forward.
- **Mirror:** on the left wall, one space from the start. A dial at its top has left and right buttons that rotate it through site names (LinkedIn, GitHub, …). Clicking the mirror plays a water-ripple animation that spreads from the click point to the mirror's edges, then redirects the browser to the selected profile.
