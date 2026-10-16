# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — start the Vite dev server with HMR
- `npm run build` — type-check (`tsc -b`, project references in `tsconfig.app.json` / `tsconfig.node.json`) then build for production
- `npm run lint` — run oxlint (type-aware; config in `.oxlintrc.json`)
- `npm run preview` — serve the production build locally
- `npm test` — run the Vitest suite

## Docs

- `docs/ui.md` — planned UI and interaction design. Read before working on rendering, navigation, the cursor or the mirror.
- `docs/layout.md` — the room's floor plan, places, camera and projection, visibility, room detail, object placement and draw order. Read before changing the room, places or what a view shows.
- `docs/components.md` — React component conventions: each component other than `App` goes in `src/ComponentName/` with its `.tsx`, `.test.tsx` and `.scss` files.
- `docs/testing.md` — test commands, Vitest setup and conventions, and how to handle canvas code in tests.

## Stack

React 19 + TypeScript 6 + Vite 8, linted with oxlint (no ESLint/Prettier). The entry point is `index.html` → `src/main.tsx` → `src/App.tsx`. Styles are per-component `.scss` files (compiled by `sass-embedded`); `src/index.css` holds only global page styles and colour variables.

TypeScript settings that affect how code is written (`tsconfig.app.json`):
- `verbatimModuleSyntax`: type-only imports must use `import type`.
- `erasableSyntaxOnly`: no `enum`, `namespace` or constructor parameter properties. Use union types or `as const` objects.
- `noUnusedLocals` / `noUnusedParameters`: unused code fails the build.
- Imports may include the `.tsx`/`.ts` extension (`allowImportingTsExtensions`), as `main.tsx` does.
