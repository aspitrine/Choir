import { test, expect, type Page } from '@playwright/test'
import { gotoHydrated, openCreateDialog } from './helpers'
import { mp3File, pdfFile } from './fixtures'

// The central flow of the app: a director organizes files by voice, builds a
// playlist and shares it; singers open the link without an account.
test.describe.configure({ mode: 'serial' })

const run = Date.now().toString(36)
const basse = `Basse ${run}`
const soprano = `Soprano ${run}`
const songTitle = `Ave Verum ${run}`
const playlistName = `Concert ${run}`
let playlistUrl = ''

async function createGroup(page: Page, name: string) {
  const dialog = await openCreateDialog(page, 'Nouveau groupe')
  await dialog.getByLabel('Nom').fill(name)
  await dialog.getByRole('button', { name: 'Créer' }).click()
  await expect(dialog).toBeHidden()
  await expect(page.getByRole('cell', { name, exact: true })).toBeVisible()
}

async function upload(page: Page, file: { name: string; mimeType: string; buffer: Buffer }, groups: Array<string>) {
  await page.getByRole('button', { name: 'Ajouter un fichier' }).click()
  const dialog = page.getByRole('dialog', { name: 'Ajouter un fichier' })
  await dialog.locator('#file').setInputFiles(file)
  for (const g of groups) await dialog.getByLabel(g).check()
  await dialog.getByRole('button', { name: 'Envoyer' }).click()
  await expect(dialog).toBeHidden()
}

const shareLinkBlocks = (page: Page) =>
  page.locator('div.rounded-md.border').filter({ has: page.locator('code') })

async function shareLinkUrl(page: Page, audience: string) {
  const block = shareLinkBlocks(page).filter({ hasText: audience })
  return (await block.locator('code').textContent())!.trim()
}

test('director creates voice groups', async ({ page }) => {
  await gotoHydrated(page, '/groups')
  await createGroup(page, basse)
  await createGroup(page, soprano)
})

test('director creates a song and uploads files per voice', async ({ page }) => {
  await gotoHydrated(page, '/songs')
  const dialog = await openCreateDialog(page, 'Nouveau chant')
  await dialog.getByLabel('Titre').fill(songTitle)
  await dialog.getByLabel('Compositeur').fill('Mozart')
  await dialog.getByRole('button', { name: 'Créer' }).click()
  await expect(dialog).toBeHidden()

  await page.getByRole('link', { name: songTitle }).click()
  await expect(page.getByRole('heading', { name: songTitle })).toBeVisible()

  await upload(page, await pdfFile('Partition basse', 2), [basse])
  await upload(page, mp3File('Tutti'), [])
  await upload(page, mp3File('Pupitres graves'), [basse, soprano])

  await expect(page.getByText('3 fichier(s)')).toBeVisible()
  await expect(page.getByRole('cell', { name: 'Partition basse' })).toBeVisible()
  await expect(page.getByRole('cell', { name: 'Tutti' })).toBeVisible()
})

test('director builds a playlist and shares it', async ({ page }) => {
  await gotoHydrated(page, '/playlists')
  const createDialog = await openCreateDialog(page, 'Nouvelle playlist')
  await createDialog.getByLabel('Nom').fill(playlistName)
  await createDialog.getByRole('button', { name: 'Créer' }).click()
  await expect(createDialog).toBeHidden()

  await page.getByRole('link', { name: playlistName }).click()
  await expect(page.getByRole('heading', { name: playlistName })).toBeVisible()
  playlistUrl = page.url()

  await page.getByRole('button', { name: 'Ajouter un chant' }).click()
  const addDialog = page.getByRole('dialog', { name: 'Ajouter un chant' })
  await addDialog.getByPlaceholder('Rechercher un titre ou compositeur…').fill(run)
  await addDialog.getByRole('cell', { name: songTitle }).click()
  await page.keyboard.press('Escape')
  await expect(page.getByText('1 chant(s)')).toBeVisible()

  // One link for everyone, one restricted to sopranos.
  await page.getByRole('button', { name: 'Créer un lien' }).click()
  await expect(shareLinkBlocks(page)).toHaveCount(1)
  await page.getByLabel(soprano).check()
  await page.getByRole('button', { name: 'Créer un lien' }).click()
  await expect(shareLinkBlocks(page)).toHaveCount(2)
})

test('director reorders songs and the order survives a reload', async ({ page }) => {
  const second = `Kyrie ${run}`
  await gotoHydrated(page, '/songs')
  const dialog = await openCreateDialog(page, 'Nouveau chant')
  await dialog.getByLabel('Titre').fill(second)
  await dialog.getByRole('button', { name: 'Créer' }).click()
  await expect(dialog).toBeHidden()

  await gotoHydrated(page, playlistUrl)
  await page.getByRole('button', { name: 'Ajouter un chant' }).click()
  const addDialog = page.getByRole('dialog', { name: 'Ajouter un chant' })
  await addDialog.getByPlaceholder('Rechercher un titre ou compositeur…').fill(second)
  await addDialog.getByRole('cell', { name: second }).click()
  await page.keyboard.press('Escape')
  await expect(page.getByText('2 chant(s)')).toBeVisible()

  const titles = page.locator('[aria-roledescription="sortable"]').locator('xpath=../div/div[1]')
  await expect(titles).toHaveText([songTitle, second])

  // dnd-kit keyboard sensor: pick up the second row, move it up, drop it.
  // It measures layout between frames, hence the short pauses.
  await page.getByRole('button', { name: 'Réordonner' }).nth(1).focus()
  for (const key of ['Space', 'ArrowUp', 'Space']) {
    await page.keyboard.press(key)
    await page.waitForTimeout(150)
  }
  await expect(titles).toHaveText([second, songTitle])

  await page.reload()
  await expect(titles).toHaveText([second, songTitle])
})

test('singers get per-voice looping playlists and merged scores', async ({ page, browser }) => {
  await gotoHydrated(page, playlistUrl)
  const url = await shareLinkUrl(page, 'Tout le monde')

  // Public page: no session at all.
  const singer = await browser.newContext({ storageState: { cookies: [], origins: [] } })
  const pub = await singer.newPage()
  await gotoHydrated(pub, url)

  await expect(pub.getByRole('heading', { name: playlistName })).toBeVisible()
  await expect(pub.getByRole('button', { name: new RegExp(songTitle) })).toBeVisible()
  await expect(pub.getByRole('heading', { level: 3 })).toHaveText([
    'Tout le monde',
    basse,
    `${basse} et ${soprano}`,
  ])

  const block = (audience: string) =>
    pub.locator('div.rounded-md.border').filter({ has: pub.getByRole('heading', { name: audience, exact: true }) })
  await expect(block('Tout le monde').locator('audio')).toHaveAttribute('src', /Tutti\.mp3/)
  await expect(block(basse).locator('audio')).toHaveCount(0)

  // Merging fetches the PDFs straight from object storage.
  await block(basse).getByRole('button', { name: 'Partitions (1 PDF)' }).click()
  const merged = pub.getByRole('dialog', { name: `Partitions — ${basse}` })
  await expect(merged.getByText('1 partition · 2 pages')).toBeVisible()
  await expect(merged.getByRole('link', { name: 'Télécharger' })).toHaveAttribute(
    'download',
    `Partitions - ${basse}.pdf`,
  )
  await singer.close()
})

test('a voice-restricted link hides files of other voices', async ({ page, browser }) => {
  await gotoHydrated(page, playlistUrl)
  const url = await shareLinkUrl(page, soprano)

  const singer = await browser.newContext({ storageState: { cookies: [], origins: [] } })
  const pub = await singer.newPage()
  await gotoHydrated(pub, url)
  await expect(pub.getByRole('heading', { level: 3 })).toHaveText(['Tout le monde', `${basse} et ${soprano}`])
  await singer.close()
})

test('a revoked link stops working', async ({ page, browser }) => {
  await gotoHydrated(page, playlistUrl)
  const url = await shareLinkUrl(page, soprano)
  await shareLinkBlocks(page).filter({ hasText: soprano }).getByRole('button', { name: 'Révoquer' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Révoquer' }).click()
  await expect(shareLinkBlocks(page)).toHaveCount(1)

  const singer = await browser.newContext({ storageState: { cookies: [], origins: [] } })
  const pub = await singer.newPage()
  await pub.goto(url)
  await expect(pub.getByText('Lien introuvable')).toBeVisible()
  await singer.close()
})
