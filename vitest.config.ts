import { defineConfig } from 'vitest/config'
import viteReact from '@vitejs/plugin-react'

// Separate from vite.config.ts: unit tests don't need the Start/Nitro plugins.
export default defineConfig({
  plugins: [viteReact()],
  resolve: { tsconfigPaths: true },
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    environment: 'node',
    // Each PGlite instance boots a WASM Postgres; give migrations room.
    hookTimeout: 30_000,
  },
})
