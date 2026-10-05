import { test, expect } from '@playwright/test'
import { director } from './env'
import { gotoHydrated, openCreateDialog } from './helpers'

test('an invited singer creates an account, joins the choir with read-only access', async ({ page, browser }) => {
  const run = Date.now().toString(36)
  const email = `choriste-${run}@e2e.test`
  const voice = `Alto ${run}`

  await gotoHydrated(page, '/groups')
  const groupDialog = await openCreateDialog(page, 'Nouveau groupe')
  await groupDialog.getByLabel('Nom').fill(voice)
  await groupDialog.getByRole('button', { name: 'Créer' }).click()
  await expect(groupDialog).toBeHidden()

  await gotoHydrated(page, '/members')
  const dialog = await openCreateDialog(page, "Inviter quelqu'un")
  await dialog.getByLabel('Prénom').fill('Jeanne')
  await dialog.getByLabel('Email').fill(email)
  await dialog.getByLabel('Rôle').selectOption('member')
  await dialog.getByLabel(voice).check()
  await dialog.getByRole('button', { name: "Générer le lien d'invitation" }).click()
  const link = (await dialog.locator('code').textContent())!.trim()
  expect(link).toContain('/accept-invite/')

  const singer = await browser.newContext({ storageState: { cookies: [], origins: [] } })
  const pub = await singer.newPage()
  await gotoHydrated(pub, link)
  await expect(pub.getByText(`Rejoindre ${director.org}`)).toBeVisible()
  await expect(pub.getByText(`Pour ${email}`)).toBeVisible()

  await pub.getByRole('button', { name: 'Ou créer un compte avec un mot de passe' }).click()
  await pub.getByLabel('Nom').fill('Jeanne Choriste')
  await pub.getByLabel('Mot de passe').fill('choriste-password')
  await pub.getByRole('button', { name: 'Créer mon compte' }).click()

  await pub.getByRole('button', { name: 'Accepter' }).click()
  await expect(pub).toHaveURL(/\/dashboard/)
  await expect(pub.getByRole('button', { name: director.org })).toBeVisible()

  // Members can browse but not edit.
  await gotoHydrated(pub, '/songs')
  await expect(pub.getByRole('heading', { name: 'Chants' })).toBeVisible()
  await expect(pub.getByRole('button', { name: 'Nouveau chant' })).toHaveCount(0)
  await singer.close()

  // The director now sees the new member, with the voice granted by the invitation.
  await page.reload()
  const memberRow = page.getByRole('row').filter({ hasText: email })
  await expect(memberRow).toBeVisible()
  await expect(memberRow.getByText(voice)).toBeVisible()
})
