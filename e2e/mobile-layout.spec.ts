import { expect, test } from '@playwright/test'

test.setTimeout(120_000)

test('mobile layouts have no page-level horizontal overflow', async ({ page }) => {
  const sizes: Array<[number, number]> = test.info().project.name === 'chromium'
    ? [[320, 740], [360, 740], [390, 844], [430, 932], [768, 1024]]
    : [[page.viewportSize()?.width ?? 390, page.viewportSize()?.height ?? 844]]
  for (const [width, height] of sizes) {
    if (test.info().project.name === 'chromium') await page.setViewportSize({ width, height })
    await page.goto('/')
    for (const period of ['DAY', 'WEEK', 'MONTH', 'YEAR']) {
      await page.getByRole('tab', { name: period }).click({ force: true })
      if (period === 'WEEK') await page.locator('.week-top-grid').waitFor()
      if (period === 'MONTH') await page.locator('.month-layout').waitFor()
      if (period === 'YEAR') await page.locator('.heatmap-panel').waitFor()
      await page.waitForTimeout(500)
      const metrics = await page.evaluate(() => ({ documentWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth }))
      expect(metrics.documentWidth, `page overflow at ${width}px during ${period}: ${JSON.stringify(metrics)}`).toBeLessThanOrEqual(metrics.innerWidth)
    }
  }
})

test('quick add appears immediately after Enter', async ({ page }) => {
  if (test.info().project.name === 'chromium') await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  const input = page.getByRole('textbox', { name: 'Quick add a task' })
  await input.fill('Fast add check 45m')
  await input.evaluate((element) => element.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return
    performance.mark('quick-add-start')
    const observer = new MutationObserver((records) => {
      const matchingNodeWasAdded = records.some((record) => [...record.addedNodes].some((node) => {
        if (!(node instanceof Element)) return false
        const selector = '.quick-add-optimistic, .activity-row'
        return [node, ...node.querySelectorAll(selector)].some((row) => row.matches(selector) && row.textContent?.includes('Fast add check'))
      }))
      if (matchingNodeWasAdded) {
        performance.mark('quick-add-visible')
        observer.disconnect()
      }
    })
    observer.observe(document.body, { childList: true, subtree: true })
  }, { once: true }))
  await input.press('Enter')
  await expect(page.locator('.activity-row').filter({ hasText: 'Fast add check' })).toBeVisible()
  const elapsed = await page.evaluate(() => {
    const start = performance.getEntriesByName('quick-add-start', 'mark')[0]?.startTime ?? 0
    const visible = performance.getEntriesByName('quick-add-visible', 'mark')[0]?.startTime ?? Number.POSITIVE_INFINITY
    return visible - start
  })
  expect(elapsed).toBeLessThan(100)
})

test('phone controls meet touch size and inputs avoid iOS zoom', async ({ page }) => {
  if (test.info().project.name === 'chromium') await page.setViewportSize({ width: 360, height: 740 })
  await page.goto('/')
  const assertTouchAndInputSizes = async () => {
    const metrics = await page.evaluate(() => ({
      undersizedTargets: [...document.querySelectorAll('button, a[href]')].flatMap((element) => {
        const rect = element.getBoundingClientRect()
        const style = getComputedStyle(element)
        return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden' && (rect.width < 44 || rect.height < 44)
          ? [{ label: element.getAttribute('aria-label') ?? element.textContent?.trim().slice(0, 40), width: Math.round(rect.width), height: Math.round(rect.height) }]
          : []
      }),
      smallInputs: [...document.querySelectorAll('input, select, textarea')].flatMap((element) => {
        const rect = element.getBoundingClientRect()
        return rect.width > 0 && rect.height > 0 && Number.parseFloat(getComputedStyle(element).fontSize) < 16
          ? [{ label: element.getAttribute('aria-label') ?? element.getAttribute('placeholder') ?? element.tagName, fontSize: getComputedStyle(element).fontSize }]
          : []
      }),
    }))
    expect(metrics.undersizedTargets, JSON.stringify(metrics.undersizedTargets)).toEqual([])
    expect(metrics.smallInputs, JSON.stringify(metrics.smallInputs)).toEqual([])
  }

  await assertTouchAndInputSizes()
  await page.getByRole('button', { name: 'Open preferences' }).click()
  await page.waitForTimeout(250)
  await assertTouchAndInputSizes()
  await page.getByRole('button', { name: 'Close preferences' }).click()
  await page.getByRole('button', { name: /Add activity/ }).click()
  await page.waitForTimeout(250)
  await assertTouchAndInputSizes()
})

test('keyboard shortcut guide opens with ? and closes with Escape', async ({ page }) => {
  await page.goto('/')
  await page.keyboard.press('Shift+/')
  const dialog = page.getByRole('dialog', { name: 'Keyboard shortcuts' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByText('Add an activity')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
})
