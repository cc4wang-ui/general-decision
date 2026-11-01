// Round 3 B17、C2：拒絕定位 → 錯誤畫面有「手動報座標」→ 輸入地名 → /api/geocode → 拿到口令。
import { expect, test } from '@playwright/test'
import { FIXED_ORDER, captureOrders, prime, openCard } from './fixtures.ts'

test.beforeEach(async ({ page }) => { await prime(page) })

const STATION = { loc: { lat: 25.0478, lng: 121.517 }, label: '台北車站' }

async function toLocationError(page: import('@playwright/test').Page, context: import('@playwright/test').BrowserContext) {
  await context.clearPermissions() // 不給定位權限
  await page.goto('/')
  await openCard(page, 'eat')
  await page.getByRole('button', { name: '是！班長' }).click()
  await expect(page.locator('[data-screen="error"]')).toBeVisible({ timeout: 15_000 })
}

test('B17 拒絕定位 → 手動報「台北車站」→ 拿到口令；座標只用在這一道、不存本機', async ({ page, context }) => {
  const geocoded: unknown[] = []
  await page.route('**/api/geocode', async (route) => {
    geocoded.push(route.request().postDataJSON())
    await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'x-places-calls': '1' }, body: JSON.stringify(STATION) })
  })
  const sent = await captureOrders(page, [FIXED_ORDER])
  await toLocationError(page, context)
  expect(sent).toHaveLength(0)

  await expect(page.getByTestId('manual-loc')).toBeVisible()
  await page.getByTestId('manual-loc').fill('台北車站')
  await page.getByTestId('manual-loc-go').click()

  await expect(page.locator('[data-screen="cmd"]')).toBeVisible()
  await expect(page.getByTestId('meme-big')).toHaveText('阿財魯肉飯')
  expect(geocoded).toEqual([{ q: '台北車站' }])
  expect(sent).toHaveLength(1)
  expect(sent[0]?.loc).toEqual(STATION.loc)

  // 不存本機：localStorage 沒有座標
  const stored = await page.evaluate(() => JSON.stringify({ ...localStorage }))
  expect(stored).not.toContain('25.0478')
  expect(stored).not.toContain('121.517')
})

test('查不到 → 留在錯誤畫面、顯示班長的話，可以再輸入', async ({ page, context }) => {
  let n = 0
  await page.route('**/api/geocode', async (route) => {
    n++
    if (n === 1) {
      await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'not_found', message: '找不到這個地方。報個車站或地標。' }) })
    } else {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(STATION) })
    }
  })
  await captureOrders(page, [FIXED_ORDER])
  await toLocationError(page, context)

  await page.getByTestId('manual-loc').fill('asdfgh')
  await page.getByTestId('manual-loc').press('Enter')
  await expect(page.getByTestId('manual-loc-error')).toHaveText('找不到這個地方。報個車站或地標。')
  await expect(page.locator('[data-screen="error"]')).toBeVisible()

  await page.getByTestId('manual-loc').fill('台北車站')
  await page.getByTestId('manual-loc-go').click()
  await expect(page.locator('[data-screen="cmd"]')).toBeVisible()
})

test('不是定位問題的錯誤（500）不出現手動報座標', async ({ page }) => {
  await page.route('**/api/order', (r) => r.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"upstream"}' }))
  await page.goto('/')
  await page.locator('[data-card="sleep"]').click()
  await page.getByRole('button', { name: '是！班長' }).click()
  await expect(page.locator('[data-screen="error"]')).toBeVisible()
  await expect(page.getByTestId('manual-loc')).toHaveCount(0)
})
