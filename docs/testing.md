# Testing

## Commands

- `npm test` — run all tests once (Vitest)
- `npm run test:watch` — run tests in watch mode
- `npx vitest run src/App.test.tsx` — run a single file; add `-t "name"` to filter by test name

## Setup

Vitest is configured in `vitest.config.ts`, which merges in `vite.config.ts` so tests get the same plugins. Tests run in the jsdom environment on the `vmThreads` pool: each file gets its own VM context on shared workers, so jsdom isn't set up from scratch for every file. Module state isn't shared between files, but globals patched inside a file stay patched in that file until it restores them. Tests live next to the code as `*.test.ts(x)` and use React Testing Library + `@testing-library/user-event`. Vitest globals are off, so import `describe`/`it`/`expect` from `vitest`. `src/test/setup.ts` loads the jest-dom matchers and runs RTL `cleanup` after each test. The config sets `unstubGlobals` and `clearMocks`, so `vi.stubGlobal` stubs are undone and mock calls cleared between tests without an `afterEach`.

## Canvas

jsdom has no canvas implementation. `src/test/setup.ts` stubs `HTMLCanvasElement.prototype.getContext` to return `null` quietly (jsdom would otherwise log an error on each call). Tests that need a context can override it with `vi.spyOn(...).mockReturnValue(fakeCtx)`. Keep drawing logic pure (functions in `src/scene/` that return `Pixel[]`) so it can be tested without a canvas. After each test the setup puts the null `getContext` back, so a test that hands out a context doesn't need to undo it (don't `mockRestore` the spy, which would remove the stub).

## Shared helpers

- `src/test/fakeContext.ts`: `createFakeContext(width, height)` is a stand-in 2D context that records each `fillRect` as a `Fill` (`{ args, fillStyle }`), and `toFills(pixels)` gives the fills that drawing `pixels` makes. Compare the two to check what a draw function painted, and in what order.
- `src/test/pixels.ts`: `expectOnCanvas(pixels, width, height)` checks for integer coordinates within the canvas; `extent(pixels)` gives the inclusive bounding box; `WIDTH`, `HEIGHT`, `FOCAL`, `columnAt` and `rowAt` work out where a point projects at 320x240.
