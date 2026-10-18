import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config.ts'

// https://vitest.dev/config/
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      // Runs each file in its own VM context on shared workers, so jsdom isn't
      // set up from scratch per file.
      pool: 'vmThreads',
      // Undo vi.stubGlobal and clear mock calls after every test.
      unstubGlobals: true,
      clearMocks: true,
    },
  }),
)
