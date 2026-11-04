// Round 3 B15、T5：預算 chips 依座標切幣別、相鄰補齊、午餐隱藏最高檔、記住上次；吃的 intake 在 375×667 不捲動。
import { expect, test, type Page } from '@playwright/test'
import { captureOrders, prime, openCard } from './fixtures.ts'

test.beforeEach(async ({ page }) => {
  await prime(page)
  // 固定當地時間 20:00（台北）＝ 21:00（東京）：避開午餐時段隱藏最高檔的規則，測試才不會看時鐘。
  await page.clock.setFixedTime(new Date('2026-10-22T20:00:00+08:00'))
})

const TOKYO = { latitude: 35.6812, longitude: 139.7671 }
const TAIPEI = { latitude: 25.033, longitude: 121.5654 }
const PARIS = { latitude: 48.8566, longitude: 2.3522 }

const bands = (page: Page) => page.locator('[data-field="budget"]')
const pressed = async (page: Page) =>
  page.locator('[data-field="budget"] .chip').evaluateAll((els) => els.map((e) => `${e.textContent}:${e.getAttribute('aria-pressed')}`))

test.describe('東京', () => {
  test.use({ geolocation: TOKYO, permissions: ['geolocation'] })
  test('B15 在東京：預算 chips 是日圓', async ({ page }) => {
    await page.goto('/')
    await openCard(page, 'eat')
    await expect(bands(page)).toContainText('¥')
    await expect(bands(page)).not.toContainText('NT$')
    await expect(bands(page).locator('.chip')).toHaveText(['不限', '〜¥1,000', '¥1,000〜2,500', '¥2,500〜6,000', '¥6,000〜'])
  })

  test('日圓檔位送進 request.budget；下次進來記得（分國家記）', async ({ page }) => {
    const sent = await captureOrders(page)
    await page.goto('/')
    await openCard(page, 'eat')
    await expect(bands(page)).toContainText('¥')
    await bands(page).getByText('¥1,000〜2,500').click()
    await page.getByRole('button', { name: '是！班長' }).click()
    await expect(page.locator('[data-screen="cmd"]')).toBeVisible()
    expect(sent[0]?.budget).toEqual([2])
    expect((sent[0]?.choices as Record<string, unknown>).budget).toBeUndefined() // bands 不進 choices

    await page.reload()
    await openCard(page, 'eat')
    await expect(bands(page)).toContainText('¥')
    await expect(bands(page).getByText('¥1,000〜2,500')).toHaveAttribute('aria-pressed', 'true')
    // 台幣那一邊的記憶是另一份
    expect(await page.evaluate(() => localStorage.getItem('decide.budget.TW'))).toBeNull()
  })
})

test.describe('台北', () => {
  test.use({ geolocation: TAIPEI, permissions: ['geolocation'] })

  test('B15 在台北：預算 chips 是台幣；選 1,000+ 再點 ≤150 → 中間兩檔自動補上', async ({ page }) => {
    const sent = await captureOrders(page)
    await page.goto('/')
    await openCard(page, 'eat')
    await expect(bands(page)).toContainText('≤150')
    await expect(bands(page).locator('.chip')).toHaveText(['不限', '≤150', '150–400', '400–1,000', '1,000+'])
    expect(await pressed(page)).toEqual(['不限:true', '≤150:false', '150–400:false', '400–1,000:false', '1,000+:false'])

    await bands(page).getByText('1,000+').click()
    await bands(page).getByText('≤150').click()
    expect(await pressed(page)).toEqual(['不限:false', '≤150:true', '150–400:true', '400–1,000:true', '1,000+:true'])

    await page.getByRole('button', { name: '是！班長' }).click()
    await expect(page.locator('[data-screen="cmd"]')).toBeVisible()
    expect(sent[0]?.budget).toEqual([1, 2, 3, 4])
  })

  test('點「不限」回到不限、不送 budget；重新整理後記得上次的選擇', async ({ page }) => {
    const sent = await captureOrders(page)
    await page.goto('/')
    await openCard(page, 'eat')
    await bands(page).getByText('150–400').click()
    await page.reload()
    await openCard(page, 'eat')
    await expect(bands(page).getByText('150–400')).toHaveAttribute('aria-pressed', 'true')
    await bands(page).getByText('不限').click()
    expect(await pressed(page)).toEqual(['不限:true', '≤150:false', '150–400:false', '400–1,000:false', '1,000+:false'])
    await page.getByRole('button', { name: '是！班長' }).click()
    await expect(page.locator('[data-screen="cmd"]')).toBeVisible()
    expect(sent[0]?.budget).toBeUndefined()
  })

  test('當地 11:00–14:00 隱藏最高檔，送出去的預算也不含它', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-10-22T12:30:00+08:00'))
    const sent = await captureOrders(page)
    await page.goto('/')
    await openCard(page, 'eat')
    await expect(bands(page).locator('.chip')).toHaveText(['不限', '≤150', '150–400', '400–1,000'])
    await bands(page).getByText('≤150').click()
    await bands(page).getByText('400–1,000').click()
    await page.getByRole('button', { name: '是！班長' }).click()
    await expect(page.locator('[data-screen="cmd"]')).toBeVisible()
    expect(sent[0]?.budget).toEqual([1, 2, 3])
  })

  test('T5：吃的 intake ≤3 列、每列 ≤5 chips、沒有輸入框；375×667 不捲動就按得到送出，點擊目標 ≥48px', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 })
    await page.goto('/')
    await openCard(page, 'eat')
    await expect(bands(page)).toContainText('≤150')
    await expectIntakeFits(page)
  })
})

test.describe('日本版面', () => {
  test.use({ geolocation: TOKYO, permissions: ['geolocation'] })
  test('T5（日圓字比較長）：375×667 一樣不捲動、按得到送出', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 })
    await page.goto('/')
    await openCard(page, 'eat')
    await expect(bands(page)).toContainText('¥')
    await expectIntakeFits(page)
  })
})

test.describe('台日以外', () => {
  test.use({ geolocation: PARIS, permissions: ['geolocation'] })
  test('座標在台日以外：預算整列隱藏，不顯示幣別，也不送 budget', async ({ page }) => {
    const sent = await captureOrders(page)
    await page.goto('/')
    await openCard(page, 'eat')
    await expect(page.locator('[data-screen="intake"]')).toBeVisible()
    // 定位回來才知道國家：等一下再斷言「沒有」
    await expect(page.locator('[data-field="diet"]')).toBeVisible()
    await page.waitForFunction(() => localStorage.getItem('decide.lastCountry') === 'other')
    await expect(bands(page)).toHaveCount(0)
    await page.getByRole('button', { name: '是！班長' }).click()
    await expect(page.locator('[data-screen="cmd"]')).toBeVisible()
    expect(sent[0]?.budget).toBeUndefined()
  })
})

async function expectIntakeFits(page: Page) {
  const fields = page.locator('[data-screen="intake"] [data-field]')
  expect(await fields.count()).toBeLessThanOrEqual(3)
  for (const f of await fields.all()) {
    expect(await f.locator('button').count()).toBeLessThanOrEqual(5)
    for (const b of await f.locator('button').all()) {
      const box = (await b.boundingBox())!
      expect(box.height, await b.innerText()).toBeGreaterThanOrEqual(47.5)
      expect(box.width, await b.innerText()).toBeGreaterThanOrEqual(47.5)
    }
  }
  await expect(page.locator('[data-screen="intake"] input, [data-screen="intake"] textarea')).toHaveCount(0)
  const submit = page.getByRole('button', { name: '是！班長' })
  // 不捲動就按得到：送出鍵整顆在第一屏內（頁尾那行小字掉到第一屏外沒關係）。
  await expect(submit).toBeInViewport({ ratio: 1 })
  const box = (await submit.boundingBox())!
  expect(box.y + box.height).toBeLessThanOrEqual(667)
}
