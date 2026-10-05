import { test, expect } from '@playwright/test'
import { gotoHydrated } from './helpers'

test.describe('authentication', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('anonymous visitors are sent to the login page', async ({ page }) => {
    await page.goto('/songs')
    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByText('Partitions, audio et playlists pour votre chorale')).toBeVisible()
  })

  test('wrong password is rejected', async ({ page }) => {
    await gotoHydrated(page, '/')
    await page.getByRole('button', { name: 'Ou se connecter avec un mot de passe' }).click()
    await page.getByLabel('Email').fill('directrice@e2e.test')
    await page.getByLabel('Mot de passe').fill('nope-nope-nope')
    await page.getByRole('button', { name: 'Se connecter', exact: true }).click()
    await expect(page.locator('form .text-destructive')).toBeVisible()
    await expect(page).not.toHaveURL(/dashboard/)
  })
})
