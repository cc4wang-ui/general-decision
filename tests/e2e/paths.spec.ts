// 第 13.2 節 三路：完成→log 頁；店關了→big 改變且 reissue 鍵消失；沒做→stand 倒數至 0 回 home。
import { expect, test } from '@playwright/test'
import { FIXED_ORDER, SECOND_ORDER, mockOrder, prime, openCard, refuseOrder } from './fixtures.ts'

test.beforeEach(async ({ page }) => { await prime(page) })

test.use({ geolocation: { latitude: 25.033, longitude: 121.5654 }, permissions: ['geolocation'] })

async function toCmd(page: import('@playwright/test').Page, card = 'eat') {
  await page.goto('/')
  await openCard(page, card)
  await page.getByRole('button', { name: '是！班長' }).click()
  await expect(page.locator('[data-screen="cmd"]')).toBeVisible()
}

test('完成 → 登記頁', async ({ page }) => {
  await mockOrder(page)
  await toCmd(page)
  await page.getByRole('button', { name: '報告班長，完成' }).click()
  await expect(page.locator('[data-screen="log"]')).toBeVisible()
  await expect(page.getByTestId('meme-big')).toHaveText(FIXED_ORDER.log)
  await expect(page.getByTestId('meme')).toHaveClass(/ok/)
  await page.getByRole('button', { name: '解散' }).click()
  await expect(page.locator('[data-screen="home"]')).toBeVisible()
})

test('店關了 → big 改變，且換口令鍵消失（一次只能換一次）', async ({ page }) => {
  await mockOrder(page, [FIXED_ORDER, SECOND_ORDER])
  await toCmd(page)
  await expect(page.getByTestId('meme-big')).toHaveText('阿財魯肉飯')
  await expect(page.getByTestId('reissue')).toHaveText('換一家')

  // Round 3：換一家先問原因（底部選單），選了才換。
  await page.getByTestId('reissue').click()
  await page.getByTestId('reason-closed').click()
  await expect(page.getByTestId('meme-big')).toHaveText('巷口牛肉麵')
  await expect(page.getByTestId('reissue')).toHaveCount(0)
})

test('換口令會把上一家放進 exclude', async ({ page }) => {
  const sent: Record<string, unknown>[] = []
  let i = 0
  await page.route('**/api/order', async (route) => {
    sent.push(route.request().postDataJSON())
    const body = i++ === 0 ? FIXED_ORDER : SECOND_ORDER
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
  })
  await toCmd(page)
  await page.getByTestId('reissue').click()
  await page.getByTestId('reason-closed').click()
  await expect(page.getByTestId('meme-big')).toHaveText('巷口牛肉麵')
  expect(sent[0]?.exclude).toBeUndefined()
  expect(sent[1]?.exclude).toEqual(['p1'])
})

test('沒做 → 罰則倒數到 0 自動回首頁', async ({ page }) => {
  await mockOrder(page)
  await toCmd(page)
  await refuseOrder(page)
  await expect(page.locator('[data-screen="stand"]')).toBeVisible()
  await expect(page.getByTestId('meme')).toHaveClass(/red/)
  await expect(page.getByTestId('meme-num')).toHaveText('20') // level 1：伏地挺身 20 下
  await expect(page.locator('[data-screen="home"]')).toBeVisible({ timeout: 20_000 })
})

test('沒有 reissueLabel 的卡不顯示換口令鍵', async ({ page }) => {
  await mockOrder(page)
  await toCmd(page, 'sleep')
  await expect(page.getByTestId('reissue')).toHaveCount(0)
  await expect(page.getByRole('button', { name: '報告班長，完成' })).toBeVisible()
})
