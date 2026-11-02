import { test, expect } from '@playwright/test'
import { director } from './env'
import { gotoHydrated, openCreateDialog } from './helpers'

// Runs last: it leaves the director with a second choir.
test('switching choir refreshes the page in place', async ({ page }) => {
  const run = Date.now().toString(36)
  const song = `Magnificat ${run}`
  const other = `Autre chorale ${run}`

  await gotoHydrated(page, '/songs')
  const dialog = await openCreateDialog(page, 'Nouveau chant')
  await dialog.getByLabel('Titre').fill(song)
  await dialog.getByRole('button', { name: 'Créer' }).click()
  await expect(page.getByRole('link', { name: song })).toBeVisible()

  // Creating a choir makes it the active one: its song list is empty.
  await page.getByRole('button', { name: director.org }).click()
  await page.getByRole('menuitem', { name: 'Créer une nouvelle chorale' }).click()
  const create = page.getByRole('dialog', { name: 'Créer une nouvelle chorale' })
  await create.getByLabel('Nom de la chorale').fill(other)
  await create.getByRole('button', { name: 'Créer' }).click()
  await expect(page.getByRole('button', { name: other })).toBeVisible()
  await expect(page.getByRole('link', { name: song })).toHaveCount(0)

  await page.getByRole('button', { name: other }).click()
  await page.getByRole('menuitem', { name: director.org }).click()
  await expect(page.getByRole('button', { name: director.org })).toBeVisible()
  await expect(page.getByRole('link', { name: song })).toBeVisible()
})
