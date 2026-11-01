// Round 6（Cross 2026-11-01，東京地鐵）：地下沒定位 → 報下車的站；定位太舊／太粗 → 先問；選單上可以換出發點；最近 5 站一鍵。
import { expect, test, type Page } from '@playwright/test'
import { FIXED_ORDER, captureOrders, openCard, prime } from './fixtures.ts'

test.beforeEach(async ({ page }) => { await prime(page) })
test.use({ geolocation: { latitude: 25.033, longitude: 121.5654 }, permissions: ['geolocation'] })

const STATIONS: Record<string, { lat: number; lng: number }> = {
  新宿駅: { lat: 35.6896, lng: 139.7006 },
  東京駅: { lat: 35.6812, lng: 139.7671 },
}
/** /api/geocode 假回應：站名 → 參考座標；其他 → 404。 */
async function mockGeocode(page: Page) {
  const asked: string[] = []
  await page.route('**/api/geocode', async (route) => {
    const q = (route.request().postDataJSON() as { q: string }).q
    asked.push(q)
    const hit = STATIONS[q]
    if (!hit) { await route.fulfill({ status: 404, contentType: 'application/json', headers: { 'x-places-calls': '1' }, body: JSON.stringify({ error: 'not_found' }) }); return }
    await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'x-places-calls': '1' }, body: JSON.stringify({ loc: hit, label: q }) })
  })
  return asked
}
/** 蓋掉瀏覽器定位：code 2 = 地下收不到；或回一個舊的／粗的座標。 */
const geoFail = (page: Page, code: number) => page.addInitScript((c) => {
  navigator.geolocation.getCurrentPosition = (_ok, err) => { err?.({ code: c, message: 'x', PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 }) }
}, code)
const geoFix = (page: Page, fix: { ageMs?: number; accuracy?: number }) => page.addInitScript((f) => {
  navigator.geolocation.getCurrentPosition = (ok) => {
    ok({ coords: { latitude: 25.033, longitude: 121.5654, accuracy: f.accuracy ?? 10, altitude: null, altitudeAccuracy: null, heading: null, speed: null, toJSON: () => ({}) }, timestamp: Date.now() - (f.ageMs ?? 0), toJSON: () => ({}) })
  }
}, fix)
const seedStations = (page: Page, list: string[]) => page.addInitScript((l) => { localStorage.setItem('decide.stations.v1', JSON.stringify(l)) }, list)
const submit = (page: Page) => page.getByRole('button', { name: '是！班長' })

test('R6 地下收不到定位 → 不叫人開定位，叫人報下車的站 → 打「新宿駅」→ 口令以該站為起點；只存站名不存座標', async ({ page }) => {
  await geoFail(page, 2)
  const asked = await mockGeocode(page)
  const sent = await captureOrders(page, [FIXED_ORDER])
  await page.goto('/')
  await openCard(page, 'eat', '一個人快吃')
  await submit(page).click()
  await expect(page.locator('[data-screen="error"]')).toBeVisible({ timeout: 15_000 })
  await expect(page.getByTestId('error-line')).toContainText('地下收不到定位。報你要下車的站。')
  await expect(page.getByTestId('error-line')).not.toContainText('開定位')
  await expect(page.getByTestId('loc-recent')).toHaveCount(0) // 第一次用，還沒有最近的站
  await page.getByTestId('manual-loc').fill('新宿駅')
  await page.getByTestId('manual-loc-go').click()
  await expect(page.locator('[data-screen="cmd"]')).toBeVisible()
  expect(asked).toEqual(['新宿駅'])
  expect(sent[0]?.loc).toEqual({ ...STATIONS['新宿駅'], label: '新宿駅' })
  const stored = await page.evaluate(() => JSON.stringify({ ...localStorage }))
  expect(stored).toContain('"decide.stations.v1":"[\\"新宿駅\\"]"')
  expect(stored).not.toContain('35.6896')
  expect(stored).not.toContain('139.7006')
})

test('R6 錯誤頁的最近站一鍵：點「東京駅」直接派', async ({ page }) => {
  await geoFail(page, 2)
  await seedStations(page, ['東京駅', '新宿駅'])
  const asked = await mockGeocode(page)
  const sent = await captureOrders(page, [FIXED_ORDER])
  await page.goto('/')
  await openCard(page, 'rest', '工作讀書')
  await submit(page).click()
  await expect(page.locator('[data-screen="error"]')).toBeVisible({ timeout: 15_000 })
  await expect(page.getByTestId('loc-recent').locator('.chip')).toHaveText(['東京駅', '新宿駅'])
  await page.getByTestId('loc-recent').getByRole('button', { name: '東京駅' }).click()
  await expect(page.locator('[data-screen="cmd"]')).toBeVisible()
  expect(asked).toEqual(['東京駅'])
  expect(sent[0]?.loc).toEqual({ ...STATIONS['東京駅'], label: '東京駅' })
  // 剛用過的排第一
  expect(await page.evaluate(() => localStorage.getItem('decide.stations.v1'))).toBe('["東京駅","新宿駅"]')
})

test('R6 選單上的出發點標籤：預設「目前位置」→ 點開選最近的站 → 標籤換成站名 → 送出帶 label；選單不多一列', async ({ page }) => {
  await seedStations(page, ['新宿駅'])
  const asked = await mockGeocode(page)
  const sent = await captureOrders(page, [FIXED_ORDER])
  await page.goto('/')
  await openCard(page, 'eat', '外帶')
  const tag = page.getByTestId('loc-change')
  await expect(tag).toHaveText('📍目前位置')
  // 跟情境標籤同一行：兩個標籤的 y 相同
  const [a, b] = await Promise.all([tag.boundingBox(), page.getByTestId('scene-change').boundingBox()])
  expect(Math.abs((a?.y ?? 0) - (b?.y ?? 99))).toBeLessThan(2)
  await tag.click()
  await expect(page.getByTestId('loc-sheet')).toBeVisible()
  await expect(page.getByTestId('loc-sheet')).toContainText('從哪裡出發？')
  await page.getByTestId('loc-recent').getByRole('button', { name: '新宿駅' }).click()
  await expect(page.getByTestId('loc-sheet')).toHaveCount(0)
  await expect(tag).toHaveText('📍新宿駅')
  await expect(page.locator('[data-screen="intake"]')).toBeVisible() // 選站不送出
  await submit(page).click()
  await expect(page.locator('[data-screen="cmd"]')).toBeVisible()
  expect(asked).toEqual(['新宿駅'])
  expect(sent[0]?.loc).toEqual({ ...STATIONS['新宿駅'], label: '新宿駅' })
})

test('R6 選單上換回「目前位置」→ 送出用 GPS、沒有 label；「我再想想」只收起', async ({ page }) => {
  await seedStations(page, ['新宿駅'])
  await mockGeocode(page)
  const sent = await captureOrders(page, [FIXED_ORDER])
  await page.goto('/')
  await openCard(page, 'eat', '外帶')
  await page.getByTestId('loc-change').click()
  await page.getByTestId('loc-cancel').click()
  await expect(page.getByTestId('loc-sheet')).toHaveCount(0)
  await page.getByTestId('loc-change').click()
  await page.getByTestId('loc-recent').getByRole('button', { name: '新宿駅' }).click()
  await expect(page.getByTestId('loc-change')).toHaveText('📍新宿駅')
  await page.getByTestId('loc-change').click()
  await page.getByTestId('loc-current').click()
  await expect(page.getByTestId('loc-change')).toHaveText('📍目前位置')
  await submit(page).click()
  await expect(page.locator('[data-screen="cmd"]')).toBeVisible()
  expect(sent[0]?.loc).toEqual({ lat: 25.033, lng: 121.5654 })
})

test('R6 定位太舊（2 分鐘前）→ 先問「你在車上？」→「就用目前位置」→ 照那個座標派、不再問', async ({ page }) => {
  await geoFix(page, { ageMs: 120_000 })
  const sent = await captureOrders(page, [FIXED_ORDER])
  await page.goto('/')
  await openCard(page, 'eat', '一個人快吃')
  await submit(page).click()
  await expect(page.getByTestId('loc-sheet')).toBeVisible()
  await expect(page.getByTestId('loc-sheet')).toContainText('定位是 1 分鐘以前的。你在車上？')
  expect(sent).toHaveLength(0)
  await page.getByTestId('loc-current').click()
  await expect(page.locator('[data-screen="cmd"]')).toBeVisible()
  expect(sent).toHaveLength(1)
  expect(sent[0]?.loc).toEqual({ lat: 25.033, lng: 121.5654 })
})

test('R6 定位太粗（誤差 1500 m）→ 先問 → 打站名 → 直接派、口令從車站算', async ({ page }) => {
  await geoFix(page, { accuracy: 1500 })
  const asked = await mockGeocode(page)
  const sent = await captureOrders(page, [FIXED_ORDER])
  await page.goto('/')
  await openCard(page, 'rest', '朋友聊天')
  await submit(page).click()
  await expect(page.getByTestId('loc-sheet')).toContainText('定位誤差超過 300 公尺。你在車上？')
  await page.getByTestId('loc-sheet').getByTestId('manual-loc').fill('asdf')
  await page.getByTestId('loc-sheet').getByTestId('manual-loc-go').click()
  await expect(page.getByTestId('manual-loc-error')).toHaveText('找不到這個地方。報個車站或地標。')
  await page.getByTestId('loc-sheet').getByTestId('manual-loc').fill('東京駅')
  await page.getByTestId('loc-sheet').getByTestId('manual-loc-go').click()
  await expect(page.locator('[data-screen="cmd"]')).toBeVisible()
  expect(asked).toEqual(['asdf', '東京駅'])
  expect(sent[0]?.loc).toEqual({ ...STATIONS['東京駅'], label: '東京駅' })
})

test('R6 定位新鮮又準 → 不問，直接派（行為不變）；不用定位的卡沒有出發點標籤', async ({ page }) => {
  const sent = await captureOrders(page, [FIXED_ORDER])
  await page.goto('/')
  await openCard(page, 'eat', '一個人快吃')
  await submit(page).click()
  await expect(page.locator('[data-screen="cmd"]')).toBeVisible()
  expect(sent[0]?.loc).toEqual({ lat: 25.033, lng: 121.5654 })
  await page.goto('/')
  await page.locator('[data-card="sleep"]').click()
  await expect(page.locator('[data-screen="intake"]')).toBeVisible()
  await expect(page.getByTestId('loc-change')).toHaveCount(0)
})
