// 第 12 節 S7：走 3 道口令後日記出現 3 筆、統計正確。
import { expect, test } from '@playwright/test'
import { FIXED_ORDER, SECOND_ORDER, mockOrder, prime, openCard, refuseOrder } from './fixtures.ts'

test.beforeEach(async ({ page }) => { await prime(page) })

test.use({ geolocation: { latitude: 25.033, longitude: 121.5654 }, permissions: ['geolocation'] })

async function runOrder(page: import('@playwright/test').Page, card: string, action: '完成' | '沒做') {
  await openCard(page, card)
  await page.getByRole('button', { name: '是！班長' }).click()
  await expect(page.locator('[data-screen="cmd"]')).toBeVisible()
  if (action === '完成') {
    await page.getByRole('button', { name: '報告班長，完成' }).click()
    await expect(page.locator('[data-screen="log"]')).toBeVisible()
    await page.getByRole('button', { name: '解散' }).click()
  } else {
    await refuseOrder(page, card)
    await expect(page.locator('[data-screen="stand"]')).toBeVisible()
    await expect(page.locator('[data-screen="home"]')).toBeVisible({ timeout: 25_000 })
  }
  await expect(page.locator('[data-screen="home"]')).toBeVisible()
}

test('走 3 道口令 → 日記 3 筆、統計正確', async ({ page }) => {
  await mockOrder(page)
  await page.goto('/')

  await runOrder(page, 'sleep', '完成')
  await runOrder(page, 'reply', '完成')
  await runOrder(page, 'buy', '沒做')

  await page.getByRole('button', { name: '新兵日記' }).click()
  await expect(page.locator('[data-screen="diary"]')).toBeVisible()

  await expect(page.getByTestId('entry')).toHaveCount(3)
  await expect(page.getByTestId('stat-orders')).toHaveText('3')
  await expect(page.getByTestId('stat-rate')).toHaveText('67%') // 2/3
  await expect(page.getByTestId('stat-punish')).toHaveText('1')
})

test('換口令只留一筆日記（第 10 節）', async ({ page }) => {
  await mockOrder(page, [FIXED_ORDER, SECOND_ORDER])
  await page.goto('/')

  await openCard(page, 'eat')
  await page.getByRole('button', { name: '是！班長' }).click()
  await page.getByTestId('reissue').click()
  await page.getByTestId('reason-closed').click()
  await expect(page.getByTestId('meme-big')).toHaveText('巷口牛肉麵')
  await page.getByRole('button', { name: '報告班長，完成' }).click()
  await page.getByRole('button', { name: '解散' }).click()

  await page.getByRole('button', { name: '新兵日記' }).click()
  await expect(page.getByTestId('entry')).toHaveCount(1)
  await expect(page.getByTestId('stat-orders')).toHaveText('1')
  await expect(page.getByTestId('stat-rate')).toHaveText('100%')
  await expect(page.getByTestId('entry')).toContainText('巷口牛肉麵') // 覆寫成第二家
})

test('日記是唯讀的，空的時候也有話講', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '新兵日記' }).click()
  await expect(page.getByTestId('days')).toContainText('還沒有紀錄')
  await expect(page.getByTestId('stat-orders')).toHaveText('0')
  await expect(page.locator('[data-screen="diary"] input, [data-screen="diary"] textarea')).toHaveCount(0)
})

test('日記寫進本機，重新整理還在', async ({ page }) => {
  await mockOrder(page)
  await page.goto('/')
  await runOrder(page, 'reply', '完成')

  await page.reload()
  await page.getByRole('button', { name: '新兵日記' }).click()
  await expect(page.getByTestId('entry')).toHaveCount(1)
})

test('近 7 天紀錄會送進 API（讓班長講「這週第二次」）', async ({ page }) => {
  const sent: Record<string, unknown>[] = []
  await page.route('**/api/order', async (route) => {
    sent.push(route.request().postDataJSON())
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FIXED_ORDER) })
  })
  await page.goto('/')
  await runOrder(page, 'reply', '完成')
  await page.locator('[data-card="reply"]').click()
  await page.getByRole('button', { name: '是！班長' }).click()
  await expect(page.locator('[data-screen="cmd"]')).toBeVisible()

  expect(sent).toHaveLength(2)
  expect(sent[0]?.recentOrders).toEqual([])
  expect((sent[1]?.recentOrders as unknown[])).toHaveLength(1)
})
