# React Component Conventions

## File layout

`App` is the only component that lives directly in `src/`. Every other component gets its own directory under `src/`, named after the component in PascalCase. The directory holds the component, its tests and its styles, all using the same name:

```
src/
├── App.tsx
├── App.test.tsx
└── ComponentName/
    ├── ComponentName.tsx
    ├── ComponentName.test.tsx
    └── ComponentName.scss
```

- `ComponentName.tsx` — the component itself.
- `ComponentName.test.tsx` — its tests. See [testing.md](testing.md) for how tests are written and run.
- `ComponentName.scss` — its styles, imported by the component with `import './ComponentName.scss'`.

## Helpers and assets

A component's directory can also hold modules, data and assets that only it uses, each with its own `*.test.ts` where there's logic to test. `src/ViewPane/` holds:

- `cursors.ts` — the cursor pixel maps and CSS cursors
- `mirrorSites.ts` — the mirror's profiles and `openUrl`
- `signText.ts` — the sign's pages and the text box's typing and caret timing
- `siteLogos.ts` — the profiles' logo pixel maps

`src/ControlsPanel/` holds `controls.ts`, the list of keyboard controls.

Shared styles and assets:

- `src/styles/_pane.scss` — sizes in canvas pixels, the `px()` function and the `pixel-frame` mixin, `@use`d by components and `index.scss`
- `src/assets/frame.svg` — the pixel frame's `border-image`
- `src/assets/pixel-font.otf` — the page's pixel web font, built by `npm run build:font`

Code that draws the scene goes in `src/scene/` instead, as pure functions that don't depend on React or the DOM (see [architecture.md](architecture.md#scene-modules)). Put it in the component's directory when it's about the page around the scene (cursors, links, site data), and in `src/scene/` when it produces pixels.
