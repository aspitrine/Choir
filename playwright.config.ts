import { defineConfig, devices } from '@playwright/test'
import { E2E_BASE_URL, E2E_DATABASE_URL } from './e2e/env'

// E2E runs the real app against a dedicated `chorale_e2e` database (same
// Postgres/MinIO as `docker compose up`), so dev data is never touched.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  globalSetup: './e2e/global-setup.ts',
  use: {
    baseURL: E2E_BASE_URL,
    locale: 'fr-FR',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], storageState: 'e2e/.auth/director.json' },
      dependencies: ['setup'],
    },
  ],
  webServer: {
    command: `pnpm exec vite dev --port ${new URL(E2E_BASE_URL).port} --strictPort`,
    url: E2E_BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: { DATABASE_URL: E2E_DATABASE_URL, BASE_URL: E2E_BASE_URL },
  },
})
