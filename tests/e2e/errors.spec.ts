// 第 13.2 節 Error ×4：定位拒絕→要座標（2026-09-18 起不再降級）；API 500→重試訊息與重試鍵；非法 JSON→同 500 路徑；離線→離線訊息且日記可開。
import { expect, test } from '@playwright/test'
import { FIXED_ORDER, mockOrder, mockOrderFailure, prime, openCard } from './fixtures.ts'

test.beforeEach(async ({ page }) => { await prime(page) })

// 2026-09-18 斷言改了：Cross 規定吃／歇只能點地圖上的真店，不准用類別糊過去。
// 沒定位就點不了店，所以定位被拒 → 錯誤畫面要座標 + 重試鍵，而且不打 API（mock 沒被叫到）。
test('① 定位被拒 → 班長要座標，不打 API', async ({ page, context }) => {
  await context.clearPermissions() // 不給定位權限
  let called = 0
  await page.route('**/api/order', async (route) => { called++; await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FIXED_ORDER) }) })
  await page.goto('/')
  await openCard(page, 'eat')
  await page.getByRole('button', { name: '是！班長' }).click()
  await expect(page.locator('[data-screen="error"]')).toBeVisible({ timeout: 15_000 })
  await expect(page.getByTestId('error-line')).toContainText('不報座標，班長就點不了店。開定位再報告。')
  await expect(page.getByTestId('retry')).toBeVisible()
  expect(called).toBe(0)
})

test('② API 500 → 班長在開會 + 重試鍵，重試後回到口令', async ({ page }) => {
  await mockOrderFailure(page, 500)
  await page.goto('/')
  await page.locator('[data-card="sleep"]').click()
  await page.getByRole('button', { name: '是！班長' }).click()

  await expect(page.locator('[data-screen="error"]')).toBeVisible()
  await expect(page.getByTestId('error-line')).toContainText('班長在開會。30 秒後再報告。')

  await page.unroute('**/api/order')
  await mockOrder(page)
  await page.getByTestId('retry').click()
  await expect(page.locator('[data-screen="cmd"]')).toBeVisible()
})

test('③ 非法 JSON（伺服器回 502）走同一條路徑', async ({ page }) => {
  await mockOrderFailure(page, 502)
  await page.goto('/')
  await page.locator('[data-card="reply"]').click()
  await page.getByRole('button', { name: '是！班長' }).click()
  await expect(page.getByTestId('error-line')).toContainText('班長在開會')
  await expect(page.getByTestId('retry')).toBeVisible()
})

test('④ 離線 → 離線訊息，且日記仍可開', async ({ page, context }) => {
  await page.goto('/')
  await context.setOffline(true)
  await page.locator('[data-card="buy"]').click()
  await page.getByRole('button', { name: '是！班長' }).click()

  await expect(page.getByTestId('error-line')).toContainText('沒訊號。原地站好，有訊號再報告。')
  await page.getByRole('button', { name: '看日記' }).click()
  await expect(page.locator('[data-screen="diary"], [data-screen="placeholder"]')).toBeVisible()
  await context.setOffline(false)
})

test('429 → 一樣是班長在開會', async ({ page, context }) => {
  // Round 10 X2：去也查真地點，要有定位才會打 API（不然停在「開定位」）。
  await context.grantPermissions(['geolocation'])
  await context.setGeolocation({ latitude: 25.033, longitude: 121.5654 })
  await mockOrderFailure(page, 429, '{"error":"rate_limited","message":"班長在開會。30 秒後再報告。"}')
  await page.goto('/')
  await page.locator('[data-card="go"]').click()
  await page.getByRole('button', { name: '是！班長' }).click()
  await expect(page.getByTestId('error-line')).toContainText('班長在開會')
})
