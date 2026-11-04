// Round 3 B16：首次啟動出現同意畫面；同意前 /api/* 一次都不呼叫；同意後正常走。
// 這支刻意不呼叫 prime()。
import { expect, test } from '@playwright/test'
import { FIXED_ORDER, openCard } from './fixtures.ts'

test.use({ geolocation: { latitude: 25.033, longitude: 121.5654 }, permissions: ['geolocation'] })

test('B16 首次啟動 → 同意畫面；同意前 0 次 API；同意後正常流程且之後不再問', async ({ page }) => {
  const calls: string[] = []
  await page.route('**/api/**', async (route) => {
    calls.push(new URL(route.request().url()).pathname)
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FIXED_ORDER) })
  })
  await page.goto('/')
  await expect(page.getByTestId('consent')).toBeVisible()
  await expect(page.getByTestId('consent-accept')).toBeVisible()
  await expect(page.locator('[data-screen="home"]')).toHaveCount(0) // 沒同意就進不了首頁
  await expect(page.locator('[data-card="eat"]')).toHaveCount(0)
  await page.waitForTimeout(500)
  expect(calls).toEqual([]) // 同意前 0 次
  expect(await page.evaluate(() => localStorage.getItem('decide.consent'))).toBeNull()

  await page.getByTestId('consent-accept').click()
  await expect(page.locator('[data-screen="home"]')).toBeVisible()
  expect(await page.evaluate(() => localStorage.getItem('decide.consent'))).toBe('v1')
  expect(calls).toEqual([])

  await openCard(page, 'eat')
  await page.getByRole('button', { name: '是！班長' }).click()
  await expect(page.locator('[data-screen="cmd"]')).toBeVisible()
  expect(calls).toEqual(['/api/order'])

  await page.reload()
  await expect(page.locator('[data-screen="home"]')).toBeVisible() // 同意過就不再問
  await expect(page.getByTestId('consent')).toHaveCount(0)
})

test('首頁底部的「隱私」進得了隱私頁，回得來', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('decide.consent', 'v1'))
  await page.goto('/')
  await page.getByTestId('privacy-link').click()
  await expect(page.getByTestId('privacy')).toBeVisible()
  await page.locator('[data-screen="privacy"] .back').click()
  await expect(page.locator('[data-screen="home"]')).toBeVisible()
})
