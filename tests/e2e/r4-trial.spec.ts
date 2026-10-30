// Round 4：60 天試用。換一家多兩個原因（又是這家／價格不對）；每道口令寫進試用紀錄；除錯畫面看得到摘要、匯出得出檔案。
import { expect, test, type Page } from '@playwright/test'
import { FIXED_ORDER, SECOND_ORDER, captureOrders, prime } from './fixtures.ts'

test.beforeEach(async ({ page }) => { await prime(page) })
test.use({ geolocation: { latitude: 25.033, longitude: 121.5654 }, permissions: ['geolocation'] })

type Mem = { id: string; x?: number | 'forever' }
type Trial = { module: string; ok: boolean; placeId?: string; outcome?: string; reason?: string; error?: string }
const trialOf = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('decide.trial.v1') ?? '[]') as Trial[])

async function toCmd(page: Page, card = 'eat') {
  await page.goto('/')
  await page.locator(`[data-card="${card}"]`).click()
  await page.getByRole('button', { name: '是！班長' }).click()
  await expect(page.locator('[data-screen="cmd"]')).toBeVisible()
}

test('R4 吃：選單有「又是這家」「價格不對」；選「又是這家」→ 14 天不派、試用紀錄標上原因', async ({ page }) => {
  const sent = await captureOrders(page, [FIXED_ORDER, SECOND_ORDER])
  await toCmd(page)
  await page.getByTestId('reissue').click()
  await expect(page.getByTestId('reason-repeat')).toBeVisible()
  await expect(page.getByTestId('reason-price')).toBeVisible()
  await page.getByTestId('reason-repeat').click()

  await expect(page.getByTestId('meme-big')).toHaveText('巷口牛肉麵')
  expect(sent[1]?.exclude as string[]).toEqual(['p1'])
  const p1 = (sent[1]?.mem as Mem[]).find((m) => m.id === 'p1')
  const days = ((p1!.x as number) - Date.now()) / 86_400_000
  expect(days).toBeGreaterThan(13)
  expect(days).toBeLessThan(15)

  const trial = await trialOf(page)
  expect(trial).toHaveLength(2)
  expect(trial.find((e) => e.placeId === 'p1')).toMatchObject({ ok: true, outcome: 'reissued', reason: 'repeat' })
  expect(JSON.stringify(trial)).not.toContain('阿財') // 試用紀錄不存店名
})

test('R4 吃：「價格不對」→ 這次排除、不封鎖這家', async ({ page }) => {
  const sent = await captureOrders(page, [FIXED_ORDER, SECOND_ORDER])
  await toCmd(page)
  await page.getByTestId('reissue').click()
  await page.getByTestId('reason-price').click()
  await expect(page.getByTestId('meme-big')).toHaveText('巷口牛肉麵')
  expect(sent[1]?.exclude as string[]).toEqual(['p1'])
  expect((sent[1]?.mem as Mem[]).find((m) => m.id === 'p1')?.x).toBeUndefined()
  expect((await trialOf(page)).find((e) => e.placeId === 'p1')?.reason).toBe('price')
})

test('R4 歇：沒有「價格不對」（只有吃有預算）', async ({ page }) => {
  await captureOrders(page, [FIXED_ORDER])
  await toCmd(page, 'rest')
  await page.getByTestId('reissue').click()
  await expect(page.getByTestId('reason-repeat')).toBeVisible()
  await expect(page.getByTestId('reason-price')).toHaveCount(0)
})

test('R4 失敗也記：no_places 寫進試用紀錄；除錯畫面看得到摘要、匯出下載得到 JSON', async ({ page }) => {
  await page.route('**/api/order', (route) => route.fulfill({ status: 502, contentType: 'application/json', body: '{"error":"no_places","message":"x"}' }))
  await toCmd(page).catch(() => {}) // 會停在錯誤畫面，不是 cmd
  await expect(page.locator('[data-screen="error"]')).toBeVisible()
  const trial = await trialOf(page)
  expect(trial[0]).toMatchObject({ module: 'eat', ok: false, error: 'no_places' })

  await page.goto('/')
  await page.getByTestId('plate').hover()
  await page.mouse.down()
  await page.waitForTimeout(900)
  await page.mouse.up()
  await expect(page.getByTestId('trial-summary')).toContainText('1 道')
  await page.evaluate(() => { (navigator as { canShare?: unknown }).canShare = undefined }) // 走下載這條
  const download = page.waitForEvent('download')
  await page.getByTestId('trial-export').click()
  const file = await download
  expect(file.suggestedFilename()).toMatch(/^decide-trial-\d{4}-\d{2}-\d{2}\.json$/)
  const path = await file.path()
  const json = JSON.parse(await (await import('node:fs/promises')).readFile(path!, 'utf8'))
  expect(json).toMatchObject({ kind: 'trial-log', summary: { orders: 1, errors: { no_places: 1 } } })
})
