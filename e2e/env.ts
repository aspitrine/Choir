export const E2E_BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:3100'
export const E2E_DATABASE_URL =
  process.env.E2E_DATABASE_URL ?? 'postgres://chorale:chorale@localhost:5433/chorale_e2e'

// Seeded by global-setup: a choir director owning one choir.
export const director = {
  name: 'Directrice E2E',
  email: 'directrice@e2e.test',
  password: 'e2e-password-123',
  org: 'Chorale E2E',
}
