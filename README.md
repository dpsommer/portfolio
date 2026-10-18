# Duncan Sommerville Web Portfolio

A TypeScript web portfolio in the style of an old first-person point-and-click dungeon crawler, drawn as 8-bit pixel art on HTML5 canvas.

Visitors start facing a welcome sign in a small stone room. They turn and move by clicking the edges and centre of the view, with the navigation panel below it, or with the arrow keys. In a nook to the west hangs a mirror showing a preview of a profile (GitHub or LinkedIn). Clicking the glass ripples it like water and then opens that profile. Tugging the curtain pull beside the mirror switches to the next profile, and a plaque below the pull shows its logo.

## Development

```sh
npm install
npm run dev      # Vite dev server
npm test         # Vitest
npm run lint     # oxlint
npm run build    # type-check and build
```

`npm run capture:preview` retakes the profile screenshots shown in the mirror (needs `npx playwright install chromium` once).

## Docs

Design and implementation notes are in [docs/](docs/README.md).
