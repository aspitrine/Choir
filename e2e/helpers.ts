import { expect, type Page } from '@playwright/test'

// SSR renders clickable-looking buttons before React attaches handlers; clicking
// then does nothing. Wait until the body content is owned by React.
export async function gotoHydrated(page: Page, url: string) {
  await page.goto(url)
  await waitForHydration(page)
}

export async function waitForHydration(page: Page) {
  await page.waitForFunction(() => {
    const el = document.querySelector('body button, body a, body input')
    return !!el && Object.keys(el).some((k) => k.startsWith('__reactFiber'))
  })
}

// Empty lists open their creation dialog on their own; otherwise use the button.
export async function openCreateDialog(page: Page, name: string) {
  const dialog = page.getByRole('dialog', { name })
  if (!(await dialog.isVisible())) await page.getByRole('button', { name }).click()
  await expect(dialog).toBeVisible()
  return dialog
}
