import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

// jsdom has no canvas and logs an error on every getContext call. Return null
// quietly instead; tests that need a context can override this with vi.spyOn.
vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)

// Vitest globals are disabled, so Testing Library can't register its own cleanup.
afterEach(() => {
  cleanup()
})
