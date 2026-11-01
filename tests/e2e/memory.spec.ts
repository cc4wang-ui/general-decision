// Round 3 B14：換一家 → 底部選單三個原因 → 每個原因都寫進 PlaceMem；重新整理後 request 的 mem 還帶得出來。
import { expect, test, type Page } from '@playwright/test'
import { FIXED_ORDER, SECOND_ORDER, captureOrders, prime, openCard, refuseOrder } from './fixtures.ts'

test.beforeEach(async ({ page }) => { await prime(page) })
test.use({ geolocation: { latitude: 25.033, longitude: 121.5654 }, permissions: ['geolocation'] })

type Mem = { id: string; sh: number[]; dn: number[]; x?: number | 'forever'; fav?: boolean }
const memOf = (body: Record<string, unknown> | undefined, id: string) => (body?.mem as Mem[] | undefined)?.find((m) => m.id === id)

async function toCmd(page: Page) {
  await page.goto('/')
  await openCard(page, 'eat')
  await page.getByRole('button', { name: '是！班長' }).click()
  await expect(page.locator('[data-screen="cmd"]')).toBeVisible()
}

test('B14 換一家：選單有三個原因；選「這家不要再來」→ 下一道不是 p1；重新整理後 mem 還在', async ({ page }) => {
  const sent = await captureOrders(page, [FIXED_ORDER, SECOND_ORDER, SECOND_ORDER])
  await toCmd(page)
  await expect(page.getByTestId('meme-big')).toHaveText('阿財魯肉飯')
  expect(sent[0]?.mem).toBeUndefined() // 第一次什麼都不記得

  await page.getByTestId('reissue').click()
  await expect(page.getByTestId('reason-closed')).toBeVisible()
  await expect(page.getByTestId('reason-kind')).toBeVisible()
  await expect(page.getByTestId('reason-never')).toBeVisible()
  await page.getByTestId('reason-never').click()

  await expect(page.getByTestId('meme-big')).toHaveText('巷口牛肉麵')
  expect((sent[1]?.exclude as string[])).toEqual(['p1'])
  const p1 = memOf(sent[1], 'p1')
  expect(p1?.sh).toHaveLength(1) // 拿到口令的當下就記了 shown
  expect(typeof p1?.x).toBe('number') // 90 天
  expect((p1!.x as number) - Date.now()).toBeGreaterThan(80 * 24 * 3600 * 1000)
  await expect(page.getByTestId('reissue')).toHaveCount(0) // 一道口令最多換 1 次

  // 關掉 App 重開：記憶在 IndexedDB，不在記憶體
  await page.reload()
  await openCard(page, 'eat')
  await page.getByRole('button', { name: '是！班長' }).click()
  await expect(page.locator('[data-screen="cmd"]')).toBeVisible()
  const again = memOf(sent[2], 'p1')
  expect(again?.id).toBe('p1')
  expect(typeof again?.x).toBe('number')
  expect(memOf(sent[2], 'p2')?.sh).toHaveLength(1)
  expect(sent[2]?.exclude).toBeUndefined() // exclude 只管這一道，不跨道
})

test('「店關了」只擋 24 小時、不動細類；「今天不想吃這類」動細類、不擋店', async ({ page }) => {
  const sent = await captureOrders(page, [FIXED_ORDER, SECOND_ORDER])
  await toCmd(page)
  await page.getByTestId('reissue').click()
  await page.getByTestId('reason-closed').click()
  await expect(page.getByTestId('meme-big')).toHaveText('巷口牛肉麵')
  const x = memOf(sent[1], 'p1')?.x as number
  expect(x - Date.now()).toBeGreaterThan(23 * 3600 * 1000)
  expect(x - Date.now()).toBeLessThan(25 * 3600 * 1000)
  expect(sent[1]?.cuisine).toBeUndefined()
  expect(sent[1]?.rejectedCuisines).toBeUndefined()

  // 同一台手機再換一道（上一道已結束）：這次選「今天不想吃這類」
  await refuseOrder(page)
  await expect(page.locator('[data-screen="home"]')).toBeVisible({ timeout: 25_000 })
  await openCard(page, 'eat')
  await page.getByRole('button', { name: '是！班長' }).click()
  await expect(page.locator('[data-screen="cmd"]')).toBeVisible()
  await page.getByTestId('reissue').click()
  await page.getByTestId('reason-kind').click()
  await expect(page.locator('[data-screen="cmd"]')).toBeVisible()
  const last = sent.at(-1)!
  expect(last.rejectedCuisines).toEqual(['noodle']) // 被換掉的那一道的細類
  expect((last.cuisine as Record<string, number[]>).noodle).toEqual([1, 1.5])
})

test('完成 → 細類 a+1、dn 有紀錄；沒做 → PlaceMem 不動', async ({ page }) => {
  const sent = await captureOrders(page, [FIXED_ORDER])
  await toCmd(page)
  await refuseOrder(page)
  await expect(page.locator('[data-screen="home"]')).toBeVisible({ timeout: 25_000 })
  await openCard(page, 'eat')
  await page.getByRole('button', { name: '是！班長' }).click()
  await expect(page.locator('[data-screen="cmd"]')).toBeVisible()
  const afterSkip = memOf(sent[1], 'p1')
  expect(afterSkip?.sh).toHaveLength(1)
  expect(afterSkip?.dn).toEqual([])
  expect(afterSkip?.x).toBeUndefined()
  expect(sent[1]?.cuisine).toBeUndefined()

  await page.getByRole('button', { name: '報告班長，完成' }).click()
  await expect(page.locator('[data-screen="log"]')).toBeVisible()
  await page.getByTestId('fav').click()
  await expect(page.getByTestId('fav')).toHaveText('已列入愛店')
  await page.getByRole('button', { name: '解散' }).click()
  await openCard(page, 'eat')
  await page.getByRole('button', { name: '是！班長' }).click()
  await expect(page.locator('[data-screen="cmd"]')).toBeVisible()
  const last = sent.at(-1)!
  expect(memOf(last, 'p1')?.dn).toHaveLength(1)
  expect(memOf(last, 'p1')?.fav).toBe(true)
  expect((last.cuisine as Record<string, number[]>).tw).toEqual([2, 1])
  // 隱私：送出去的記憶沒有店名、評分、座標
  expect(JSON.stringify(last.mem)).not.toMatch(/"(name|rating|lat|lng)"/)
})

test('偵察方針：首頁一顆鍵循環三段、記住、送進 request', async ({ page }) => {
  const sent = await captureOrders(page)
  await page.goto('/')
  const nov = page.getByTestId('novelty')
  await expect(nov).toHaveText('均衡')
  await nov.click()
  await expect(nov).toHaveText('全面偵察')
  await nov.click()
  await expect(nov).toHaveText('熟門熟路')
  await nov.click()
  await expect(nov).toHaveText('均衡')
  await nov.click()
  await expect(nov).toHaveText('全面偵察')
  await page.reload()
  await expect(page.getByTestId('novelty')).toHaveText('全面偵察')
  await openCard(page, 'eat')
  await page.getByRole('button', { name: '是！班長' }).click()
  await expect(page.locator('[data-screen="cmd"]')).toBeVisible()
  expect(sent[0]?.novelty).toBe('recon')
})

test('日記：吃的口令記 placeId 不記店名；長按可列入愛店；本週新占領／回防', async ({ page }) => {
  await captureOrders(page, [FIXED_ORDER])
  await toCmd(page)
  await page.getByRole('button', { name: '報告班長，完成' }).click()
  await page.getByRole('button', { name: '解散' }).click()
  // 日記 IndexedDB 裡不該有 placeName
  const hasName = await page.evaluate(async () => {
    const db: IDBDatabase = await new Promise((res, rej) => {
      const r = indexedDB.open('keyval-store')
      r.onsuccess = () => res(r.result)
      r.onerror = () => rej(r.error)
    })
    const rows: unknown = await new Promise((res, rej) => {
      const r = db.transaction('keyval').objectStore('keyval').get('decide.entries')
      r.onsuccess = () => res(r.result)
      r.onerror = () => rej(r.error)
    })
    return { raw: JSON.stringify(rows) }
  })
  expect(hasName.raw).toContain('"placeId":"p1"')
  expect(hasName.raw).not.toContain('placeName')

  await page.getByRole('button', { name: '新兵日記' }).click()
  await expect(page.getByTestId('stat-new')).toHaveText('1')
  await expect(page.getByTestId('stat-revisit')).toHaveText('0')
  // 長按那一列
  const row = page.getByTestId('entry').first()
  await row.hover()
  await page.mouse.down()
  await page.waitForTimeout(900)
  await page.mouse.up()
  await expect(page.getByTestId('diary-fav')).toBeVisible()
  await expect(page.getByTestId('diary-never')).toBeVisible()
  await page.getByTestId('diary-fav').click()
  await expect(page.getByTestId('diary-note')).toContainText('愛店')
})
