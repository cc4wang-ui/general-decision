import type { Page } from '@playwright/test'

/**
 * Round 3：首次啟動先出同意畫面（旗標 decide.consent = v1）。
 * 既有 e2e 不是在測這個流程，每條開頭呼叫 prime() 先把旗標設好；consent.spec.ts 不呼叫。
 * 用 addInitScript：每次導覽（含 reload）都會先寫一次。
 */
export async function prime(page: Page) {
  await page.addInitScript(() => {
    try { localStorage.setItem('decide.consent', 'v1') } catch { /* 無痕模式 */ }
  })
}

export const FIXED_ORDER = {
  verdict: 'do',
  meme: { top: '去吃熱的', big: '阿財魯肉飯', bot: '這週兩天超商了' },
  steps: ['步行 6 分鐘，營業到 21:00。', '魯肉飯、滷蛋、燙青菜。', '12 分鐘吃完，手機收起來。'],
  // Round 3：伺服器會帶 mode／visits／band／priceText／country／cuisine。
  place: {
    id: 'p1', name: '阿財魯肉飯', mapUrl: 'https://www.google.com/maps/search/?api=1&query=x&query_place_id=p1', walkMin: 6, openUntil: '21:00',
    mode: 'new', visits: 1, band: 2, priceText: '≈NT$150–400', country: 'TW', cuisine: 'tw',
  },
  log: '12:41 魯肉飯，12:58 完成。',
}

export const SECOND_ORDER = {
  ...FIXED_ORDER,
  meme: { top: '換一家，照樣是口令', big: '巷口牛肉麵', bot: '第二道口令一樣算' },
  place: { id: 'p2', name: '巷口牛肉麵', mapUrl: 'https://www.google.com/maps/search/?api=1&query=x&query_place_id=p2', walkMin: 3, mode: 'new', visits: 1, band: null, country: 'TW', cuisine: 'noodle' },
  steps: ['步行 3 分鐘，營業中。', '清燉，不加辣。'],
  log: '13:05 牛肉麵，13:22 完成。',
}

/** 第 13.2 節：e2e 一律 mock API 回固定 Order。 */
export async function mockOrder(page: Page, orders: unknown[] = [FIXED_ORDER]) {
  let i = 0
  await page.route('**/api/order', async (route) => {
    const body = orders[Math.min(i, orders.length - 1)]
    i++
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'x-places-calls': '1' },
      body: JSON.stringify(body),
    })
  })
}

/** 記下每次 /api/order 的 request body，並依序回 orders（最後一個重複）。 */
export async function captureOrders(page: Page, orders: unknown[] = [FIXED_ORDER]) {
  const sent: Record<string, unknown>[] = []
  await page.route('**/api/order', async (route) => {
    const body = orders[Math.min(sent.length, orders.length - 1)]
    sent.push(route.request().postDataJSON())
    await route.fulfill({
      status: 200, contentType: 'application/json', headers: { 'x-places-calls': '1' }, body: JSON.stringify(body),
    })
  })
  return sent
}

export async function mockOrderFailure(page: Page, status: number, body = '{"error":"upstream","message":"班長在開會。30 秒後再報告。"}') {
  await page.route('**/api/order', (route) =>
    route.fulfill({ status, contentType: 'application/json', body }),
  )
}

/**
 * Round 5：吃／歇第一步先選情境（獨立一頁）。點卡片 → 有情境頁就點一個（預設第一個）→ 等到原本的選單。
 * 其他卡片照舊直接進選單。scene='其他' 時停在情境頁（輸入框由測試自己填）。
 */
export async function openCard(page: Page, id: string, scene?: string) {
  await page.locator(`[data-card="${id}"]`).click()
  if (id !== 'eat' && id !== 'rest') return
  await pickScene(page, scene)
}

export async function pickScene(page: Page, scene?: string) {
  const row = page.locator('[data-screen="scene"] [data-field="scene"]')
  await row.waitFor()
  // 已選的 chip 前面有 CSS 的 ✓（算進無障礙名稱），用 textContent 比對。
  const chip = scene ? row.locator('.chip').filter({ hasText: new RegExp(`^${scene}$`) }) : row.locator('.chip').first()
  await chip.click()
  if (scene === '其他') return
  await page.locator('[data-screen="intake"]').waitFor()
}

/** Round 5：吃／歇的「沒做」先問原因；這裡選「我就是不想做」（照舊罰站）。其他卡片直接罰站。 */
export async function refuseOrder(page: Page, card = 'eat') {
  await page.getByRole('button', { name: '沒做' }).click()
  if (card === 'eat' || card === 'rest') await page.getByTestId('skip-refuse').click()
}
