// Round 10 手機端資料：X4 記憶匯出 → 清資料 → 匯入（筆數一致）；N4 一鍵匯出含記憶、不能下載就複製；
// N6 試用紀錄記「你在車上？」問了沒、為什麼、選了什麼。
import { readFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'
import { FIXED_ORDER, captureOrders, openCard, prime } from './fixtures.ts'

test.beforeEach(async ({ page }) => { await prime(page) })
test.use({ geolocation: { latitude: 25.033, longitude: 121.5654 }, permissions: ['geolocation'] })

const T = Date.parse('2026-11-01T12:00:00+08:00')
const DAY = 86_400_000
/** 四家店：去過兩次的、永久封鎖的、愛店（歇）、只看過的。 */
const MEM = {
  p1: { id: 'p1', module: 'eat', shown: [T, T - DAY], done: [T + 1000], doneCount: 3, dislikes: 0, brand: 'mos', cuisine: 'fast' },
  p2: { id: 'p2', module: 'eat', shown: [T - 2 * DAY], done: [], dislikes: 2, dislikeUntil: 'forever', cuisine: 'ramen' },
  p3: { id: 'p3', module: 'rest', shown: [T - 3 * DAY], done: [T - 3 * DAY], doneCount: 1, dislikes: 0, fav: true },
  p4: { id: 'p4', module: 'eat', shown: [T - 4 * DAY], done: [], dislikes: 0 },
}
const CUISINE = { fast: [2, 1], ramen: [1, 1.5] }

/** 直接寫進 idb-keyval 的庫（keyval-store／keyval）；庫還沒建就照 idb-keyval 的做法建。 */
async function idb(page: Page, write?: Record<string, unknown>): Promise<Record<string, unknown>> {
  return page.evaluate(async (w) => {
    const db: IDBDatabase = await new Promise((res, rej) => {
      const r = indexedDB.open('keyval-store')
      r.onupgradeneeded = () => r.result.createObjectStore('keyval')
      r.onsuccess = () => res(r.result)
      r.onerror = () => rej(r.error)
    })
    const os = () => db.transaction('keyval', w ? 'readwrite' : 'readonly').objectStore('keyval')
    if (w) {
      await new Promise<void>((res, rej) => {
        const tx = db.transaction('keyval', 'readwrite')
        for (const [k, v] of Object.entries(w)) tx.objectStore('keyval').put(v, k)
        tx.oncomplete = () => res()
        tx.onerror = () => rej(tx.error)
      })
    }
    const get = (k: string) => new Promise((res, rej) => { const r = os().get(k); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) })
    const out = { mem: await get('decide.placeMem'), cuisine: await get('decide.cuisine') }
    db.close()
    return out
  }, write)
}

async function openDebug(page: Page) {
  await page.getByTestId('plate').hover()
  await page.mouse.down()
  await page.waitForTimeout(900)
  await page.mouse.up()
  await expect(page.locator('[data-screen="debug"]')).toBeVisible()
}

/** 清資料（像 Safari「清除網站資料」）：刪掉整個 IndexedDB、清空 localStorage，再重開。 */
async function wipe(page: Page) {
  await page.evaluate(() => { indexedDB.deleteDatabase('keyval-store'); localStorage.clear() })
  await page.goto('/') // 舊頁面關掉連線，刪庫才會完成；新頁面開庫會排在刪庫後面
}

/** 走下載這條（測試瀏覽器的 canShare 不一定有，統一關掉）。 */
const noShare = (page: Page) => page.evaluate(() => { (navigator as { canShare?: unknown }).canShare = undefined })

async function download(page: Page, testid: string): Promise<{ name: string; path: string; json: Record<string, unknown> }> {
  const wait = page.waitForEvent('download')
  await page.getByTestId(testid).click()
  const file = await wait
  const path = (await file.path())!
  return { name: file.suggestedFilename(), path, json: JSON.parse(await readFile(path, 'utf8')) }
}

test('X4 匯出記憶 → 清資料 → 匯入：記憶筆數一致、內容一樣；壞檔不動資料、說得出原因', async ({ page }) => {
  await page.goto('/')
  await idb(page, { 'decide.placeMem': MEM, 'decide.cuisine': CUISINE })
  await page.goto('/')
  await openDebug(page)
  await expect(page.getByTestId('mem-count')).toHaveText('店家記憶 4 家')
  const before = await idb(page)

  await noShare(page)
  const out = await download(page, 'mem-export')
  expect(out.name).toMatch(/^decide-memory-\d{4}-\d{2}-\d{2}\.json$/)
  expect(out.json).toMatchObject({ app: 'decide', kind: 'place-memory', version: 1, cuisine: CUISINE })
  expect(out.json.places).toHaveLength(4)
  await expect(page.getByTestId('mem-export')).toHaveText('已下載')

  await wipe(page)
  await openDebug(page)
  await expect(page.getByTestId('mem-count')).toHaveText('店家記憶 0 家')

  // 壞檔：比 App 新的版本 → 不收、說原因、記憶還是 0 家
  const newer = JSON.stringify({ ...out.json, version: 9 })
  await page.getByTestId('mem-file').setInputFiles({ name: 'newer.json', mimeType: 'application/json', buffer: Buffer.from(newer) })
  await expect(page.getByTestId('mem-result')).toContainText('檔案是第 9 版')
  await expect(page.getByTestId('mem-result')).toContainText('原本的記憶沒動')
  await expect(page.getByTestId('mem-count')).toHaveText('店家記憶 0 家')

  await page.getByTestId('mem-file').setInputFiles(out.path)
  await expect(page.getByTestId('mem-result')).toHaveText('匯入完成：新增 4 家、合併 0 家，現在記得 4 家。')
  await expect(page.getByTestId('mem-count')).toHaveText('店家記憶 4 家')
  expect(await idb(page)).toEqual(before)

  // 有資料時再丟壞檔：既有 4 家一個字都不動
  await page.getByTestId('mem-file').setInputFiles({ name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('{壞掉') })
  await expect(page.getByTestId('mem-result')).toContainText('這不是 JSON 檔')
  expect(await idb(page)).toEqual(before)
})

test('N4 一鍵匯出：試用紀錄＋記憶同一個檔，這個檔也能匯入；不能下載就複製到剪貼簿', async ({ page }) => {
  await page.goto('/')
  await idb(page, { 'decide.placeMem': MEM, 'decide.cuisine': CUISINE })
  await page.evaluate(() => localStorage.setItem('decide.trial.v1', JSON.stringify([{ at: new Date().toISOString(), module: 'eat', level: 1, ok: true, placeId: 'p1' }])))
  await page.goto('/')
  await openDebug(page)
  await expect(page.getByTestId('mem-count')).toHaveText('店家記憶 4 家')

  await noShare(page)
  const out = await download(page, 'trial-export')
  expect(out.name).toMatch(/^decide-trial-\d{4}-\d{2}-\d{2}\.json$/)
  expect(out.json).toMatchObject({ app: 'decide', kind: 'trial-log', version: 2, summary: { orders: 1 }, memory: { kind: 'place-memory', version: 1 } })
  expect((out.json.memory as { places: unknown[] }).places).toHaveLength(4)

  // 不能下載（沒有 createObjectURL）→ 沿用原本的退路：複製到剪貼簿，內容一樣含記憶
  await page.evaluate(() => {
    const w = window as unknown as { copied: string }
    w.copied = ''
    URL.createObjectURL = () => { throw new Error('no download') }
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (t: string) => { w.copied = t } } })
  })
  await page.getByTestId('trial-export').click()
  await expect(page.getByTestId('trial-export')).toHaveText('已複製')
  const copied = JSON.parse(await page.evaluate(() => (window as unknown as { copied: string }).copied))
  expect(copied.memory.places).toHaveLength(4)

  await wipe(page)
  await openDebug(page)
  await expect(page.getByTestId('mem-count')).toHaveText('店家記憶 0 家')
  await page.getByTestId('mem-file').setInputFiles(out.path)
  await expect(page.getByTestId('mem-result')).toContainText('現在記得 4 家')
  await expect(page.getByTestId('mem-count')).toHaveText('店家記憶 4 家')
})

/** 蓋掉瀏覽器定位：回一個多舊（ms）、多粗（m）的座標（同 r6-station.spec.ts）。 */
const geoFix = (page: Page, fix: { ageMs?: number; accuracy?: number }) => page.addInitScript((f) => {
  navigator.geolocation.getCurrentPosition = (ok) => {
    ok({ coords: { latitude: 25.033, longitude: 121.5654, accuracy: f.accuracy ?? 10, altitude: null, altitudeAccuracy: null, heading: null, speed: null, toJSON: () => ({}) }, timestamp: Date.now() - (f.ageMs ?? 0), toJSON: () => ({}) })
  }
}, fix)
type Geo = { ask: string | null; pick?: string; acc?: number; age?: number }
const trialOf = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('decide.trial.v1') ?? '[]') as { ok: boolean; error?: string; geo?: Geo }[])

test('N6 定位太舊 → 問「你在車上？」：關掉也記一筆、「就用目前位置」記下選擇；摘要看得到問幾次', async ({ page }) => {
  await geoFix(page, { ageMs: 120_000, accuracy: 35 })
  const sent = await captureOrders(page, [FIXED_ORDER])
  await page.goto('/')
  await openCard(page, 'eat', '一個人快吃')
  const submit = page.getByRole('button', { name: '是！班長' })

  await submit.click()
  await expect(page.getByTestId('loc-sheet')).toContainText('你在車上？')
  await page.getByTestId('loc-cancel').click()
  let trial = await trialOf(page)
  expect(trial[0]).toMatchObject({ ok: false, error: 'geo_cancel', geo: { ask: 'stale', pick: 'cancel', acc: 35 } })
  expect(trial[0]!.geo!.age).toBeGreaterThanOrEqual(120)

  await submit.click()
  await page.getByTestId('loc-current').click()
  await expect(page.locator('[data-screen="cmd"]')).toBeVisible()
  expect(sent).toHaveLength(1)
  expect(JSON.stringify(sent[0])).not.toContain('"ask"') // 只進試用紀錄，不送伺服器
  trial = await trialOf(page)
  expect(trial).toHaveLength(2)
  expect(trial[0]).toMatchObject({ ok: true, geo: { ask: 'stale', pick: 'current', acc: 35 } })

  await page.goto('/')
  await openDebug(page)
  await expect(page.getByTestId('trial-summary')).toContainText('問在車上 2／2')
})

test('N6 定位正常 → 沒問，紀錄 ask 是 null、帶誤差與新舊', async ({ page }) => {
  await geoFix(page, { ageMs: 2_000, accuracy: 18 })
  await captureOrders(page, [FIXED_ORDER])
  await page.goto('/')
  await openCard(page, 'eat', '一個人快吃')
  await page.getByRole('button', { name: '是！班長' }).click()
  await expect(page.locator('[data-screen="cmd"]')).toBeVisible()
  const [e] = await trialOf(page)
  expect(e).toMatchObject({ ok: true, geo: { ask: null, acc: 18 } })
  expect(e!.geo!.pick).toBeUndefined()
  expect(e!.geo!.age).toBeLessThan(60)
})
