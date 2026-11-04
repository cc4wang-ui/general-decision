// Round 3 修正輪（CLIENT 組）：R2-01、R2-05、R2-07/12、R2-10、R2-11、手動報座標 maxLength。
import { expect, test, type Page } from '@playwright/test'
import { FIXED_ORDER, captureOrders, prime, openCard } from './fixtures.ts'

test.beforeEach(async ({ page }) => { await prime(page) })

const MAP = 'https://www.google.com/maps/search/?api=1&query=x&query_place_id=ChIJxxx'
const TAIPEI = { latitude: 25.033, longitude: 121.5654 }
const bands = (page: Page) => page.locator('[data-field="budget"]')

async function submitCard(page: Page, id: string) {
  await page.goto('/')
  await openCard(page, id)
  await page.getByRole('button', { name: '是！班長' }).click()
}

test.describe('定位在台北', () => {
  test.use({ geolocation: TAIPEI, permissions: ['geolocation'] })

  test('R2-05 IndexedDB 卡住（open 永不回）時，口令照樣送出、畫面照樣換', async ({ page }) => {
    await page.addInitScript(() => {
      indexedDB.open = () => new EventTarget() as unknown as IDBOpenDBRequest // 永遠不觸發 success／error
    })
    const sent = await captureOrders(page, [{ ...FIXED_ORDER, place: { ...FIXED_ORDER.place, mapUrl: MAP } }])
    await submitCard(page, 'eat')
    await expect(page.locator('[data-screen="cmd"]')).toBeVisible({ timeout: 15_000 })
    expect(sent).toHaveLength(1)
    await expect(page.getByTestId('meme-big')).toHaveText('阿財魯肉飯')
  })

  test('R2-07/12 今天的 Places 額度已滿：顯示 over_cap 文案、不打 /api/order、不出現手動報座標', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('decide.placesCalls', JSON.stringify({ date: new Date().toISOString().slice(0, 10), n: 40 }))
    })
    const sent = await captureOrders(page)
    await submitCard(page, 'eat')
    await expect(page.getByTestId('error-line')).toContainText('今天的偵察額度用完了。明天再報告。')
    await expect(page.getByTestId('error-line')).not.toContainText('開定位')
    await expect(page.getByTestId('manual-loc')).toHaveCount(0)
    expect(sent).toHaveLength(0)
  })

  test('R2-10 「歇」卡換一家：原因選單沒有「今天不想喝這類」，只剩店關了／這家不要再來', async ({ page }) => {
    await captureOrders(page, [{ ...FIXED_ORDER, place: { ...FIXED_ORDER.place, mapUrl: MAP } }])
    await submitCard(page, 'rest')
    await expect(page.locator('[data-screen="cmd"]')).toBeVisible()
    await page.getByTestId('reissue').click()
    await expect(page.getByTestId('reason-closed')).toBeVisible()
    await expect(page.getByTestId('reason-never')).toBeVisible()
    await expect(page.getByTestId('reason-kind')).toHaveCount(0)
    await expect(page.getByText('今天不想喝這類')).toHaveCount(0)
  })

  test('R2-10 「吃」卡不變：三個原因都在', async ({ page }) => {
    await captureOrders(page, [{ ...FIXED_ORDER, place: { ...FIXED_ORDER.place, mapUrl: MAP } }])
    await submitCard(page, 'eat')
    await page.getByTestId('reissue').click()
    await expect(page.getByTestId('reason-kind')).toHaveText(/今天不想吃這類/)
    await expect(page.getByTestId('reason-closed')).toBeVisible()
    await expect(page.getByTestId('reason-never')).toBeVisible()
  })

  test('R2-11 午餐點預算：用原始檔位算，存好的最高檔不會被刪掉', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-10-22T12:30:00+08:00'))
    await page.addInitScript(() => localStorage.setItem('decide.budget.TW', '[3,4]'))
    await page.goto('/')
    await openCard(page, 'eat')
    await expect(bands(page).getByText('400–1,000')).toHaveAttribute('aria-pressed', 'true')
    await bands(page).getByText('400–1,000').click()
    expect(await page.evaluate(() => localStorage.getItem('decide.budget.TW'))).toBe('[4]')
  })
})

test('R2-12 手動報座標換來的那一次也算額度：重送時顯示 over_cap，不打 /api/order；輸入框 maxlength=60', async ({ page, context }) => {
  await context.clearPermissions()
  await page.route('**/api/geocode', (route) => route.fulfill({
    status: 200, contentType: 'application/json', headers: { 'x-places-calls': '40' },
    body: JSON.stringify({ loc: { lat: 25.0478, lng: 121.517 }, label: '台北車站' }),
  }))
  const sent = await captureOrders(page)
  await submitCard(page, 'eat')
  await expect(page.locator('[data-screen="error"]')).toBeVisible({ timeout: 15_000 })
  await expect(page.getByTestId('manual-loc')).toHaveAttribute('maxlength', '60')
  await page.getByTestId('manual-loc').fill('台北車站')
  await page.getByTestId('manual-loc-go').click()
  await expect(page.getByTestId('error-line')).toContainText('今天的偵察額度用完了。明天再報告。')
  expect(sent).toHaveLength(0)
})

test.describe('R2-01 不是真店的 place 不上畫面、不進日記', () => {
  test.use({ geolocation: TAIPEI, permissions: ['geolocation'] })

  test('「去」卡：模型編的 place（無 mapUrl）不畫店家區；完成後日記不帶 placeId', async ({ page }) => {
    const fake = { ...FIXED_ORDER, place: { id: 'fake-1', name: '模型編的店', mode: 'new', visits: 1 } }
    await captureOrders(page, [fake])
    await submitCard(page, 'go')
    await expect(page.locator('[data-screen="cmd"]')).toBeVisible()
    await expect(page.locator('.place-head')).toHaveCount(0)
    await expect(page.getByTestId('attribution')).toHaveCount(0)
    await expect(page.getByText('模型編的店')).toHaveCount(0)
    await page.getByRole('button', { name: '報告班長，完成' }).click()
    await expect(page.locator('[data-screen="log"]')).toBeVisible()
    const entries = await page.evaluate(() => new Promise<{ placeId?: string }[]>((resolve, reject) => {
      const open = indexedDB.open('keyval-store')
      open.onerror = () => reject(open.error)
      open.onsuccess = () => {
        const g = open.result.transaction('keyval').objectStore('keyval').get('decide.entries')
        g.onsuccess = () => resolve((g.result ?? []) as { placeId?: string }[])
        g.onerror = () => reject(g.error)
      }
    }))
    expect(entries.length).toBeGreaterThan(0)
    expect(entries.every((e) => e.placeId === undefined)).toBe(true)
  })
})
