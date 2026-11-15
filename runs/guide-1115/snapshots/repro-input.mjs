// 重現「自訂輸入難打」：iPhone 13 模擬，本機 vite，/api/daily-route 不會被呼叫（只打字）。
// 用法：BROWSER=chromium|webkit OUT=檔名 node runs/guide-1115/snapshots/repro-input.mjs
import { chromium, webkit, devices } from '@playwright/test'
import { writeFileSync } from 'node:fs'
const BASE = process.env.BASE ?? 'http://127.0.0.1:5199'
const which = process.env.BROWSER ?? 'chromium'
const out = {}
const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
const cand = (id, name) => ({ id, name, address: '東京都渋谷区 ' + name, mapUrl: 'https://maps.google.com/?cid=' + id, lat: 35.66, lng: 139.7, rating: 4.3, userRatingCount: 300, types: ['restaurant'], primaryType: 'restaurant' })
const state = { day, area: '澀谷', areaOnly: true, currentPlace: '渋谷駅', intent: { destination: '', destinationStation: '', activities: [] }, appliedIntent: { destination: '', destinationStation: '', activities: [] },
  tasks: [{ id: 'meal', title: '定食屋', minutes: 45, kind: 'meal', done: false, candidate: cand('m1', '定食屋') }, { id: 'coffee', title: '咖啡店', minutes: 60, kind: 'creative', done: false, candidate: cand('c1', '咖啡店') }],
  notes: [], avoid: [], seen: {}, disliked: [], dislikedKinds: [] }
const browser = await (which === 'webkit' ? webkit : chromium).launch()
const { defaultBrowserType: _d, ...iphone } = devices['iPhone 13']
const ctx = await browser.newContext({ ...iphone, deviceScaleFactor: 1 })
const page = await ctx.newPage()
await page.addInitScript((s) => { localStorage.setItem('decide.consent', 'v1'); if (!localStorage.getItem('decide.daily.v1')) localStorage.setItem('decide.daily.v1', JSON.stringify(s)) }, state)
await page.route('**/api/place-photo**', (r) => r.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"photo_unavailable"}' }))
let routeCalls = 0
await page.route('**/api/daily-route', (r) => { routeCalls++; return r.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"repro 不打 API"}' }) })
await page.goto(BASE + '/')
await page.getByTestId('daily-entry').click()
await page.locator('[data-screen="daily-decision"]').waitFor()

// 1) 所有文字輸入的字級（iOS Safari：<16px 的輸入框一對焦就自動放大整頁）
out.fontSizes = await page.evaluate(() => [...document.querySelectorAll('.dd input:not([type=checkbox]), .dd textarea, .dd select')].map((el) => ({ label: el.getAttribute('aria-label') ?? el.id, px: getComputedStyle(el).fontSize })))

// 2) 「想去哪裡」逐鍵輸入含空白的店名
await page.getByTestId('daily-chip-dest').click()
const dest = page.getByTestId('daily-intent-destination')
await dest.click()
await page.keyboard.type('Fuglen Tokyo', { delay: 30 })
out.destTyped = { typed: 'Fuglen Tokyo', got: await dest.inputValue() }
await page.keyboard.press('Enter')
out.destEnter = { sheetStillOpen: await page.getByTestId('daily-sheet').isVisible() }
await dest.fill('')

// 3) 輸入法組字（只有 Chromium 有 CDP IME；WebKit 略過）
if (which === 'chromium') {
  const cdp = await ctx.newCDPSession(page)
  await dest.click()
  const steps = ['ｔ', 'と', 'とう', 'とうｋ', 'とうきょ', 'とうきょう']
  const seen = []
  for (const text of steps) { await cdp.send('Input.imeSetComposition', { text, selectionStart: text.length, selectionEnd: text.length }); seen.push(await dest.inputValue()) }
  await cdp.send('Input.insertText', { text: '東京' })
  // 第二段：中間有空白的組字（iOS 拼音／英數混打會出現）
  const steps2 = ['た', 'たわー ', 'たわー れこーど']
  const seen2 = []
  for (const text of steps2) { await cdp.send('Input.imeSetComposition', { text, selectionStart: text.length, selectionEnd: text.length }); seen2.push(await dest.inputValue()) }
  await cdp.send('Input.insertText', { text: 'タワー レコード' })
  out.ime = { composing: seen, composing2: seen2, want: '東京タワー レコード', got: await dest.inputValue() }
  await dest.fill('')
}
await page.getByTestId('daily-sheet-close').click()

// 4) 逐站「指定地點」：要點幾層、第一鍵之後輸入框位移多少
const card = page.locator('.dd-stop').first()
const stopInputVisibleBefore = await card.locator('.dd-change-place input').isVisible()
await card.locator('.dd-change-place summary').click()
const stopInput = card.locator('.dd-change-place input')
await stopInput.click()
const y0 = (await stopInput.boundingBox()).y + await page.evaluate(() => scrollY)
await page.keyboard.type('F')
const y1 = (await stopInput.boundingBox()).y + await page.evaluate(() => scrollY)
await page.keyboard.type('uglen Tokyo', { delay: 30 })
out.stopInput = { visibleWithoutExpanding: stopInputVisibleBefore, pageYBeforeFirstKey: Math.round(y0), pageYAfterFirstKey: Math.round(y1), jumpPx: Math.round(y1 - y0), got: await stopInput.inputValue(), focusedAfterTyping: await stopInput.evaluate((el) => document.activeElement === el) }
await page.keyboard.press('Enter')
await page.waitForTimeout(300)
out.stopInput.enterTriggeredSearch = routeCalls > 0
out.quickAddEntry = await page.getByTestId('daily-add-place-input').count()
await page.screenshot({ path: `runs/guide-1115/snapshots/${process.env.OUT ?? 'repro-' + which}.jpg`, type: 'jpeg', quality: 60 })
writeFileSync(`runs/guide-1115/snapshots/${process.env.OUT ?? 'repro-' + which}.json`, JSON.stringify(out, null, 1))
console.log(JSON.stringify(out, null, 1))
await browser.close()
