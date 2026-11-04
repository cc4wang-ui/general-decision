// Round 10（C 線發現）：定位在進選單時就預先抓；在選單停超過 1 分鐘再送出，舊邏輯會誤問「你在車上？」。
// 現在送出時先重抓一次：重抓到新的就直接派；重抓還是舊的（例如地下）才照 Round 6 問。
import { expect, test, type Page } from '@playwright/test'
import { FIXED_ORDER, captureOrders, openCard, prime } from './fixtures.ts'

test.beforeEach(async ({ page }) => { await prime(page) })
test.use({ geolocation: { latitude: 25.033, longitude: 121.5654 }, permissions: ['geolocation'] })

/** 第 n 次呼叫回 ages[n]（毫秒前的定位）；超過的沿用最後一個。記錄呼叫次數在 window.__geoCalls。 */
const geoSequence = (page: Page, ages: number[]) => page.addInitScript((a) => {
  const w = window as unknown as { __geoCalls: number }
  w.__geoCalls = 0
  navigator.geolocation.getCurrentPosition = (ok) => {
    const age = a[Math.min(w.__geoCalls, a.length - 1)]!
    w.__geoCalls++
    ok({ coords: { latitude: 25.033, longitude: 121.5654, accuracy: 10, altitude: null, altitudeAccuracy: null, heading: null, speed: null, toJSON: () => ({}) }, timestamp: Date.now() - age, toJSON: () => ({}) })
  }
}, ages)
const submit = (page: Page) => page.getByRole('button', { name: '是！班長' })

test('R10 預先抓的定位變舊（在選單停太久）→ 送出時重抓到新的 → 不問「你在車上？」，直接派', async ({ page }) => {
  await geoSequence(page, [120_000, 0])
  const sent = await captureOrders(page, [FIXED_ORDER])
  await page.goto('/')
  await openCard(page, 'eat', '一個人快吃')
  await submit(page).click()
  await expect(page.locator('[data-screen="cmd"]')).toBeVisible()
  await expect(page.getByTestId('loc-sheet')).toHaveCount(0)
  expect(sent).toHaveLength(1)
  expect(sent[0]?.loc).toEqual({ lat: 25.033, lng: 121.5654 })
  expect(await page.evaluate(() => (window as unknown as { __geoCalls: number }).__geoCalls)).toBe(2)
})

test('R10 重抓還是舊的（地下、OS 只給舊座標）→ 照 Round 6 問「你在車上？」', async ({ page }) => {
  await geoSequence(page, [120_000, 120_000])
  const sent = await captureOrders(page, [FIXED_ORDER])
  await page.goto('/')
  await openCard(page, 'eat', '一個人快吃')
  await submit(page).click()
  await expect(page.getByTestId('loc-sheet')).toContainText('你在車上？')
  expect(sent).toHaveLength(0)
})
