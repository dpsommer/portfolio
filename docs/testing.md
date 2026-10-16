# Testing

## Commands

- `npm test` — run all tests once (Vitest)
- `npm run test:watch` — run tests in watch mode
- `npx vitest run src/App.test.tsx` — run a single file; add `-t "name"` to filter by test name

## Setup

Vitest is configured in the `test` block of `vite.config.ts` (jsdom environment). Tests live next to the code as `*.test.ts(x)` and use React Testing Library + `@testing-library/user-event`. Vitest globals are off, so import `describe`/`it`/`expect` from `vitest`. `src/test/setup.ts` loads the jest-dom matchers and runs RTL `cleanup` after each test.

## Canvas

jsdom has no canvas implementation (`getContext` returns `null`), so canvas drawing code needs to be mocked or kept separate from pure logic that can be tested directly.
