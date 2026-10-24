import { expect, test } from '@playwright/test'

test('create an activity, finish a focus timer, then reload persisted history', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-24T10:00:00+05:30') })
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Sat, 24 Oct' })).toBeVisible()

  await page.getByRole('button', { name: /Add activity/ }).click()
  await page.getByLabel('Activity name').fill('E2E reading sprint')
  await page.getByLabel('Default session').fill('1')
  await page.getByRole('button', { name: 'Add to atlas' }).click()
  await expect(page.getByText('E2E reading sprint', { exact: true }).first()).toBeVisible()

  await page.getByLabel('Custom duration in minutes').fill('1')
  await page.getByRole('button', { name: 'Start focusing' }).click()
  await expect(page.getByText('IN THE GROOVE')).toBeVisible()
  await page.clock.fastForward(61_000)

  const completedTask = page.getByRole('button', { name: 'Mark incomplete: E2E reading sprint' })
  await expect(completedTask).toBeVisible()
  await expect(page.locator('.activity-row').filter({ has: page.getByText('E2E reading sprint', { exact: true }) })).toHaveClass(/completed/)

  await page.reload()
  await expect(page.getByRole('button', { name: 'Mark incomplete: E2E reading sprint' })).toBeVisible()
})
