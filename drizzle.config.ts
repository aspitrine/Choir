import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  // Each feature owns its tables (hexagonal: persistence is an infrastructure detail).
  schema: './src/features/*/infrastructure/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
})
