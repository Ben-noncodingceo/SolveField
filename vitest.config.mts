import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    // API/ingestion integration tests execute Payload, Wrangler and Web Crypto.
    // A jsdom TextEncoder belongs to a different realm and violates esbuild's
    // Uint8Array invariant; these tests do not need a DOM.
    environment: 'node',
    setupFiles: ['./vitest.setup.ts'],
    include: ['tests/int/**/*.int.spec.ts'],
  },
})
