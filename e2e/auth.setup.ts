import { test as setup, expect } from '@playwright/test'
import { director } from './env'
import { gotoHydrated } from './helpers'

// Signs in through the real login form once; other specs reuse the session.
setup('director signs in with a password', async ({ page }) => {
  await gotoHydrated(page, '/')
  await page.getByRole('button', { name: 'Ou se connecter avec un mot de passe' }).click()
  await page.getByLabel('Email').fill(director.email)
  await page.getByLabel('Mot de passe').fill(director.password)
  await page.getByRole('button', { name: 'Se connecter', exact: true }).click()

  await expect(page).toHaveURL(/\/dashboard/)
  await expect(page.getByRole('heading', { name: 'Tableau de bord' })).toBeVisible()
  // Single choir → selected automatically.
  await expect(page.getByRole('button', { name: director.org })).toBeVisible()
  await page.context().storageState({ path: 'e2e/.auth/director.json' })
})
