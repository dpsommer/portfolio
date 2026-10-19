# Testing

## Commands

- `npm test` — run all tests once (Vitest)
- `npm run test:watch` — run tests in watch mode
- `npx vitest run src/App.test.tsx` — run a single file; add `-t "name"` to filter by test name

## Setup

Vitest is configured in `vitest.config.ts`, which merges in `vite.config.ts` so tests get the same plugins.

- **Environment:** jsdom, on the `vmThreads` pool. Each file gets its own VM context on shared workers, so jsdom isn't set up from scratch for every file. Module state isn't shared between files, but a global patched inside a file stays patched in that file until it's restored.
- **Location:** tests live next to the code as `*.test.ts(x)`.
- **Imports:** Vitest globals are off, so import `describe`/`it`/`expect`/`vi` from `vitest`. Component tests use React Testing Library and `@testing-library/user-event`.
- **Setup file:** `src/test/setup.ts` loads the jest-dom matchers and runs RTL `cleanup` after each test.
- **Automatic resets:** the config sets `unstubGlobals` and `clearMocks`, so `vi.stubGlobal` stubs are undone and mock calls cleared between tests without an `afterEach`.

## Canvas

jsdom has no canvas implementation. `src/test/setup.ts` stubs `HTMLCanvasElement.prototype.getContext` to return `null` quietly (jsdom would otherwise log an error on each call).

- Keep drawing logic pure (functions in `src/scene/` that return `Pixel[]`) so it can be tested without a canvas.
- Tests that need a context can override the stub with `vi.spyOn(...).mockReturnValue(fakeCtx)`.
- After each test the setup puts the null `getContext` back, so a test that hands out a context doesn't need to undo it. Don't `mockRestore` the spy, which would remove the stub.

## Shared helpers

- `src/test/fakeContext.ts`: `createFakeContext(width, height)` is a stand-in 2D context that records each `fillRect` as a `Fill` (`{ args, fillStyle }`), and `toFills(pixels)` gives the fills that drawing `pixels` makes. Compare the two to check what a draw function painted, and in what order.
- `src/test/pixels.ts`: `expectOnCanvas(pixels, width, height)` checks for integer coordinates within the canvas; `extent(pixels)` gives the inclusive bounding box; `WIDTH`, `HEIGHT`, `FOCAL`, `columnAt` and `rowAt` work out where a point projects at 320×240.

## Style

- **Parametrise:** when cases differ only in their inputs, use `it.each` or `describe.each` rather than repeating a test. `ViewPane.test.tsx` runs its navigation tests over each input method (panel clicks, arrow keys and WASD, plus room clicks for key presses) this way.
- **Share setup:** use the helpers above, or a helper at the top of the file, rather than repeating the same arrangement in each test.
- **Test behaviour, not duplicates:** don't add a case that a parametrised or broader test already covers.
