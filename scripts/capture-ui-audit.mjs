import { mkdir } from 'node:fs/promises'
import process from 'node:process'
import console from 'node:console'
import { chromium } from '@playwright/test'

const baseURL = process.env.AUDIT_URL ?? 'http://127.0.0.1:5173/'
const output = process.env.AUDIT_OUTPUT ?? 'docs/screenshots/before'
const viewports = [[360, 740], [390, 844], [430, 932], [768, 1024], [1440, 900]]
const browser = await chromium.launch({ headless: true })

for (const [width, height] of viewports) {
  const folder = `${output}/${width}x${height}`
  await mkdir(folder, { recursive: true })
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 })
  const page = await context.newPage()
  await page.goto(baseURL, { waitUntil: 'networkidle' })
  await page.waitForTimeout(500)
  const shot = async (name) => {
    const metrics = await page.evaluate(() => ({ documentWidth: globalThis.document.documentElement.scrollWidth, innerWidth: globalThis.window.innerWidth }))
    if (metrics.documentWidth > metrics.innerWidth) {
      throw new Error(`${name} overflows horizontally at ${width}x${height}: ${JSON.stringify(metrics)}`)
    }
    const originalViewport = page.viewportSize()
    await page.screenshot({ path: `${folder}/${name}-viewport.png`, animations: 'disabled' })
    if (width <= 820) {
      const contentHeight = await page.locator('.main-content').evaluate((element) => Math.min(10_000, element.scrollHeight + 100))
      await page.setViewportSize({ width, height: Math.max(height, contentHeight) })
      await page.locator('.main-content').evaluate((element) => { element.scrollTop = 0 })
      await page.waitForTimeout(80)
    }
    await page.screenshot({ path: `${folder}/${name}.png`, fullPage: true, animations: 'disabled' })
    if (originalViewport) await page.setViewportSize(originalViewport)
  }

  await shot('today')
  await page.locator('#activities-section').scrollIntoViewIfNeeded()
  await shot('activities')
  await page.locator('.main-content').evaluate((element) => { element.scrollTop = 0 })
  await page.waitForTimeout(150)
  await page.getByRole('tab', { name: 'WEEK' }).click()
  await page.locator('.week-matrix-panel').waitFor()
  await page.waitForTimeout(150)
  await shot('week')
  await page.getByRole('tab', { name: 'MONTH' }).click()
  await page.locator('.calendar-panel').waitFor()
  await page.waitForTimeout(150)
  await shot('month')
  await page.getByRole('tab', { name: 'YEAR' }).click()
  await page.locator('.heatmap-panel').waitFor()
  await page.waitForTimeout(150)
  await shot('year')
  await page.getByRole('tab', { name: 'DAY' }).click()
  await page.locator('.timer-panel').waitFor()
  await page.waitForTimeout(500)
  await page.getByRole('button', { name: /Start focusing/ }).click({ force: true })
  await page.getByText('IN THE GROOVE').waitFor()
  await page.waitForTimeout(200)
  await shot('timer-running')
  await page.getByRole('button', { name: /Add activity/ }).click()
  await page.locator('.activity-modal').waitFor()
  await page.waitForTimeout(150)
  await shot('add-task-dialog')
  await page.getByRole('button', { name: 'Close dialog' }).click()
  await page.getByRole('button', { name: 'Open preferences' }).click()
  await page.getByRole('dialog').waitFor()
  await page.waitForTimeout(150)
  await shot('settings')
  await page.getByLabel('Appearance').selectOption('dark')
  await page.getByRole('button', { name: 'Save preferences' }).click()
  await page.waitForFunction(() => globalThis.document.documentElement.dataset.theme === 'dark')
  await page.waitForTimeout(150)
  await shot('dark-mode')
  await page.getByLabel('Search activities').fill('nothing matches this')
  await page.getByRole('heading', { name: 'Nothing found in these margins.' }).waitFor()
  await page.waitForTimeout(150)
  await shot('empty-search')
  await context.close()
  console.log(`captured ${width}x${height}`)
}
await browser.close()
