// Round 11（Cross 2026-11-04「全部都處理」，待辦 4：手機實機測試）：iPhone 的分享面板這條路。
// Round 10 的 e2e 把 canShare 關掉、只測下載。這裡換成「有分享面板」的手機：
// 1. 點了就馬上叫分享面板（Safari 要在點擊後立刻叫，晚了會被擋）→ 用 navigator.userActivation.isActive 檢查。
// 2. 交出去的是 .json 檔，內容含記憶。3. 使用者關掉分享面板（AbortError）→ 按鈕字不變、不改走下載。
// ⚠️ 這是模擬 iPhone 13（Chromium），不是實機；實機要 Cross 的 iPhone。
import { expect, test, type Page } from '@playwright/test'
import { prime } from './fixtures.ts'

test.beforeEach(async ({ page }) => { await prime(page) })

const T = Date.parse('2026-11-01T12:00:00+08:00')
const MEM = {
  p1: { id: 'p1', module: 'eat', shown: [T], done: [T + 1000], doneCount: 1, dislikes: 0 },
  p2: { id: 'p2', module: 'rest', shown: [T], done: [], dislikes: 0, fav: true },
}

async function seed(page: Page) {
  await page.goto('/')
  await page.evaluate(async (mem) => {
    const db: IDBDatabase = await new Promise((res, rej) => {
      const r = indexedDB.open('keyval-store')
      r.onupgradeneeded = () => r.result.createObjectStore('keyval')
      r.onsuccess = () => res(r.result)
      r.onerror = () => rej(r.error)
    })
    await new Promise<void>((res, rej) => {
      const tx = db.transaction('keyval', 'readwrite')
      tx.objectStore('keyval').put(mem, 'decide.placeMem')
      tx.oncomplete = () => res()
      tx.onerror = () => rej(tx.error)
    })
    db.close()
  }, MEM)
  await page.goto('/')
}

async function openDebug(page: Page) {
  await page.getByTestId('plate').hover()
  await page.mouse.down()
  await page.waitForTimeout(900)
  await page.mouse.up()
  await expect(page.locator('[data-screen="debug"]')).toBeVisible()
  await expect(page.getByTestId('mem-count')).toHaveText('店家記憶 2 家')
}

/** 裝一個像 iPhone 的分享面板：記下叫的時候還在不在點擊的有效期內、交出的檔名與內容；mode=abort 模擬使用者關掉。 */
async function fakeShare(page: Page, mode: 'ok' | 'abort') {
  await page.evaluate((m) => {
    const w = window as unknown as { shared: Array<{ active: boolean; title?: string; files: Array<{ name: string; type: string; text: Promise<string> }> }>; downloads: number }
    w.shared = []
    w.downloads = 0
    const realClick = HTMLAnchorElement.prototype.click
    HTMLAnchorElement.prototype.click = function () { if (this.download) w.downloads++; else realClick.call(this) }
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: (d: { files?: File[] }) => !!d.files?.length })
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: async (d: { files: File[]; title?: string }) => {
        w.shared.push({ active: navigator.userActivation.isActive, title: d.title, files: d.files.map((f) => ({ name: f.name, type: f.type, text: f.text() })) })
        if (m === 'abort') throw new DOMException('Share canceled', 'AbortError')
      },
    })
  }, mode)
}

const shared = (page: Page) => page.evaluate(async () => {
  const w = window as unknown as { shared: Array<{ active: boolean; title?: string; files: Array<{ name: string; type: string; text: Promise<string> }> }>; downloads: number }
  return { downloads: w.downloads, calls: await Promise.all(w.shared.map(async (s) => ({ active: s.active, title: s.title, files: await Promise.all(s.files.map(async (f) => ({ name: f.name, type: f.type, json: JSON.parse(await f.text) }))) }))) }
})

test('匯出記憶：點了馬上叫分享面板（還在點擊有效期內），交出 .json 檔、含 2 家記憶，按鈕寫「已匯出」', async ({ page }) => {
  await seed(page)
  await openDebug(page)
  await fakeShare(page, 'ok')
  await page.getByTestId('mem-export').click()
  await expect(page.getByTestId('mem-export')).toHaveText('已匯出')
  const s = await shared(page)
  expect(s.calls).toHaveLength(1)
  expect(s.calls[0].active).toBe(true)
  expect(s.calls[0].title).toBe('決斷連店家記憶')
  expect(s.calls[0].files[0].name).toMatch(/^decide-memory-\d{4}-\d{2}-\d{2}\.json$/)
  expect(s.calls[0].files[0].type).toBe('application/json')
  expect(s.calls[0].files[0].json).toMatchObject({ app: 'decide', kind: 'place-memory' })
  expect(s.calls[0].files[0].json.places).toHaveLength(2)
  expect(s.downloads).toBe(0)
})

test('一鍵匯出（紀錄＋記憶）：同樣走分享面板、在點擊有效期內，檔裡帶記憶', async ({ page }) => {
  await seed(page)
  await openDebug(page)
  await fakeShare(page, 'ok')
  await page.getByTestId('trial-export').click()
  await expect(page.getByTestId('trial-export')).toHaveText('已匯出')
  const s = await shared(page)
  expect(s.calls).toHaveLength(1)
  expect(s.calls[0].active).toBe(true)
  expect(s.calls[0].files[0].name).toMatch(/^decide-trial-\d{4}-\d{2}-\d{2}\.json$/)
  expect(s.calls[0].files[0].json).toMatchObject({ app: 'decide', kind: 'trial-log', memory: { kind: 'place-memory' } })
  expect(s.calls[0].files[0].json.memory.places).toHaveLength(2)
})

test('使用者關掉分享面板：按鈕字不變、不改走下載；再按一次照樣叫得出來', async ({ page }) => {
  await seed(page)
  await openDebug(page)
  await fakeShare(page, 'abort')
  await page.getByTestId('mem-export').click()
  await expect.poll(async () => (await shared(page)).calls.length).toBe(1)
  await expect(page.getByTestId('mem-export')).toHaveText('匯出記憶')
  expect((await shared(page)).downloads).toBe(0)
  await page.getByTestId('mem-export').click()
  await expect.poll(async () => (await shared(page)).calls.length).toBe(2)
  expect((await shared(page)).calls[1].active).toBe(true)
  await expect(page.getByTestId('mem-export')).toHaveText('匯出記憶')
})
