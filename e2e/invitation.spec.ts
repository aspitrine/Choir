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

  expect(new URL(link).searchParams.get('k')).toMatch(/^[\w-]{43}$/)
  await dialog.getByRole('button', { name: 'Fermer' }).click()

  // A pending invitation can be corrected; the link stays the same while the email does.
  const invitationRow = page.getByRole('row').filter({ hasText: email })
  await invitationRow.getByRole('button', { name: 'Modifier' }).click()
  const editInvite = page.getByRole('dialog', { name: "Modifier l'invitation" })
  await expect(editInvite.getByLabel('Prénom')).toHaveValue('Jeanne')
  await editInvite.getByLabel('Nom', { exact: true }).fill('Durand')
  await editInvite.getByRole('button', { name: 'Enregistrer' }).click()
  await expect(editInvite).toBeHidden()
  await expect(invitationRow.getByText('Jeanne Durand')).toBeVisible()
  await expect(invitationRow.getByText(voice)).toBeVisible()

  // The invitee's sign-up form starts with the name the director entered.
  const visitor = await browser.newContext({ storageState: { cookies: [], origins: [] } })
  const preview = await visitor.newPage()
  await gotoHydrated(preview, link)
  await preview.getByRole('button', { name: 'Ou créer un compte avec un mot de passe' }).click()
  await expect(preview.getByLabel('Nom')).toHaveValue('Jeanne Durand')
  await visitor.close()

  const singer = await browser.newContext({ storageState: { cookies: [], origins: [] } })
  const pub = await singer.newPage()
  // The invitation id alone (e.g. listed through Better Auth by any member) is not enough.
  const withoutSecret = new URL(link)
  withoutSecret.searchParams.delete('k')
  await gotoHydrated(pub, withoutSecret.toString())
  await expect(pub.getByText(`Rejoindre ${director.org}`)).toBeVisible()
  await expect(pub.getByText(`Pour ${email}`)).toBeVisible()

  await pub.getByRole('button', { name: 'Ou créer un compte avec un mot de passe' }).click()
  await pub.getByLabel('Nom').fill('Jeanne Choriste')
  await pub.getByLabel('Mot de passe').fill('choriste-password')
  await pub.getByRole('button', { name: 'Créer mon compte' }).click()

  await pub.getByRole('button', { name: 'Accepter' }).click()
  await expect(pub.getByText("Impossible d'accepter l'invitation")).toBeVisible()
  // Better Auth's own endpoint is closed: it would accept on the id alone.
  const direct = await pub.request.post('/api/auth/organization/accept-invitation', {
    data: { invitationId: new URL(link).pathname.split('/').pop() },
  })
  expect(direct.status()).toBe(404)

  await gotoHydrated(pub, link)
  await pub.getByRole('button', { name: 'Accepter' }).click()
  await expect(pub).toHaveURL(/\/dashboard/)
  await expect(pub.getByRole('button', { name: director.org })).toBeVisible()

  // A used link leads home: the dashboard when signed in, the login page otherwise.
  await gotoHydrated(pub, link)
  await expect(pub).toHaveURL(/\/dashboard/)
  const stranger = await browser.newContext({ storageState: { cookies: [], origins: [] } })
  const anonymous = await stranger.newPage()
  await gotoHydrated(anonymous, link)
  await expect(anonymous).toHaveURL(new URL('/', link).toString())
  await expect(anonymous.getByRole('button', { name: 'Se connecter avec Google' })).toBeVisible()
  await stranger.close()

  // Members can browse but not edit.
  await gotoHydrated(pub, '/songs')
  await expect(pub.getByRole('heading', { name: 'Chants' })).toBeVisible()
  await expect(pub.getByRole('button', { name: 'Nouveau chant' })).toHaveCount(0)
  // Member and invitation lists (emails, invite links) are for managers only.
  await gotoHydrated(pub, '/members')
  await expect(pub).toHaveURL(/\/dashboard/)

  // The director now sees the new member, with the voice granted by the invitation.
  await page.reload()
  const memberRow = page.getByRole('row').filter({ hasText: email })
  await expect(memberRow).toBeVisible()
  await expect(memberRow.getByText(voice)).toBeVisible()

  // Role and groups are edited together, and the row shows the result right away.
  await memberRow.getByRole('button', { name: 'Modifier' }).click()
  const editMember = page.getByRole('dialog', { name: 'Modifier Jeanne Choriste' })
  await expect(editMember.getByLabel('Email')).toHaveValue(email)
  await editMember.getByLabel('Nom').fill('Jeanne Martin')
  await editMember.getByLabel('Rôle').selectOption('admin')
  await editMember.getByLabel(voice).uncheck()
  await editMember.getByRole('button', { name: 'Enregistrer' }).click()
  await expect(editMember).toBeHidden()
  await expect(memberRow.getByRole('cell', { name: 'Admin', exact: true })).toBeVisible()
  await expect(memberRow.getByText('Tout le monde')).toBeVisible()
  await expect(memberRow.getByRole('cell', { name: 'Jeanne Martin' })).toBeVisible()

  // Once removed, the singer's still-open session loses access to the choir.
  await memberRow.getByRole('button', { name: 'Retirer' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Retirer' }).click()
  // The table is aria-hidden while the dialog is open: wait for it to close first.
  await expect(page.getByRole('alertdialog')).toBeHidden()
  await expect(page.getByText(email)).toHaveCount(0)
  await gotoHydrated(pub, '/songs')
  await expect(pub).toHaveURL(/\/dashboard/)
  await expect(pub.getByText('Aucune chorale active')).toBeVisible()
  await singer.close()
})
