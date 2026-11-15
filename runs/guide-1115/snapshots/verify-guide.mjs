// guide-1115 真瀏覽器驗證（iPhone 13 模擬，本機 vite）：輸入、手動排序、換主題。
// /api/daily-route 一律攔截：回「請求裡的站，照請求順序」＋固定的假店與到店時間（不打 Google）。
// 用法：BROWSER=chromium|webkit node runs/guide-1115/snapshots/verify-guide.mjs
import { chromium, webkit, devices } from '@playwright/test'
import { writeFileSync } from 'node:fs'
const BASE = process.env.BASE ?? 'http://127.0.0.1:5199'
const which = process.env.BROWSER ?? 'chromium'
const DIR = 'runs/guide-1115/snapshots/'
const out = { browser: which, checks: {} }
const ok = (name, pass, detail) => { out.checks[name] = { pass: !!pass, detail }; console.log((pass ? 'PASS ' : 'FAIL ') + name + ' ' + JSON.stringify(detail)) }
const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
const cand = (id, name) => ({ id, name, address: '東京都渋谷区 ' + name, mapUrl: 'https://maps.google.com/?cid=' + id, lat: 35.66, lng: 139.7, rating: 4.3, userRatingCount: 321, types: ['restaurant'], primaryType: 'restaurant' })
const state = { day, area: '澀谷', areaOnly: true, currentPlace: '渋谷駅', intent: { destination: '', destinationStation: '', activities: [] }, appliedIntent: { destination: '', destinationStation: '', activities: [] },
  tasks: [
    { id: 'meal', title: '定食屋', minutes: 45, kind: 'meal', done: false, candidate: cand('m1', '定食屋') },
    { id: 'creative', title: '舊藝廊', minutes: 65, kind: 'creative', done: false, candidate: cand('g1', '舊藝廊') },
    { id: 'coffee', title: '咖啡店', minutes: 60, kind: 'creative', done: false, candidate: cand('c1', '咖啡店') },
    { id: 'fixed-1', title: '牙醫', place: '渋谷', start: '15:00', minutes: 30, kind: 'rest', done: false, locked: true, custom: true, candidate: cand('f1', '牙醫診所') },
  ], notes: [], avoid: ['gym', 'shopping', 'rest'], seen: {}, disliked: [], dislikedKinds: [] }
const browser = await (which === 'webkit' ? webkit : chromium).launch()
const { defaultBrowserType: _d, ...iphone } = devices['iPhone 13']
const ctx = await browser.newContext({ ...iphone, deviceScaleFactor: 1 })
const page = await ctx.newPage()
await page.addInitScript((s) => { localStorage.setItem('decide.consent', 'v1'); if (!localStorage.getItem('decide.daily.v1')) localStorage.setItem('decide.daily.v1', JSON.stringify(s)) }, state)
await page.route('**/api/place-photo**', (r) => r.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"photo_unavailable"}' }))
const sent = []
let n = 0
await page.route('**/api/daily-route', async (r) => {
  const body = r.request().postDataJSON(); sent.push(body); n++
  const full = !body.shuffle && !body.reorderOnly
  const stops = body.stops.map((s, i) => {
    const auto = !s.done && !s.locked && !s.custom && !s.specified
    const repick = !s.candidate || s.id === body.shuffle || (full && auto)
    const name = s.theme ? '假店・' + s.theme + (s.themeArea ? '・' + s.themeArea : '') : s.specified || s.custom ? '假店・' + s.place : '假店・' + s.id + n
    const candidate = repick ? cand('x' + n + '-' + s.id, name) : s.candidate
    const h = 10 + i
    return { id: s.id, kind: s.kind, title: s.custom || s.locked ? s.title : candidate.name, place: candidate.address, locked: !!s.locked, done: !!s.done, custom: !!s.custom, specified: !!s.specified, start: s.start ?? '', minutes: s.minutes, candidate, ...(s.theme ? { theme: s.theme } : {}), ...(s.themeArea ? { themeArea: s.themeArea } : {}), eta: (s.start || h + ':00'), departure: h + ':45', travelMin: 7 + i, etaDayOffset: 0, departureDayOffset: 0, openAtEta: 'open' }
  })
  await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ stops, routeVerified: true, distanceKm: 2.1, travelMinutes: 30, conflicts: [], partial: false, missingStops: [], anchorTime: '10:00' }) })
})
const shot = (name) => page.screenshot({ path: DIR + 'shot-' + which + '-' + name + '.jpg', type: 'jpeg', quality: 55 })
const open = async () => { await page.goto(BASE + '/'); await page.getByTestId('daily-entry').click(); await page.locator('[data-screen="daily-decision"]').waitFor() }
const cardIds = () => page.evaluate(() => [...document.querySelectorAll('.dd-stop [data-testid^="daily-move-up-"], .dd-stop .dd-kind')].map((el) => el.dataset.testid ? el.dataset.testid.replace('daily-move-up-', '') : el.textContent.includes('固定') ? '(fixed)' : null).filter(Boolean))
const saved = () => page.evaluate(() => JSON.parse(localStorage.getItem('decide.daily.v1')))
const idle = () => page.getByTestId('daily-generate').and(page.locator(':not([disabled])')).waitFor()
await open()

// ── A. 輸入 ──
const fonts = await page.evaluate(() => [...document.querySelectorAll('.dd input:not([type=checkbox]), .dd textarea, .dd select')].map((el) => ({ label: el.getAttribute('aria-label') ?? el.id, px: getComputedStyle(el).fontSize })))
ok('A1 所有輸入框字級 ≥16px（iOS 不自動放大）', fonts.every((f) => parseFloat(f.px) >= 16), { count: fonts.length, sizes: [...new Set(fonts.map((f) => f.px))] })
await page.getByTestId('daily-chip-dest').click()
const dest = page.getByTestId('daily-intent-destination')
await dest.click()
await page.keyboard.type('Fuglen Tokyo', { delay: 30 })
ok('A2 目的地逐鍵打「Fuglen Tokyo」不丟空白、不失焦', (await dest.inputValue()) === 'Fuglen Tokyo' && await dest.evaluate((el) => document.activeElement === el), { got: await dest.inputValue(), savedIntent: (await saved()).intent.destination })
await dest.fill('')
if (which === 'chromium') {
  const cdp = await ctx.newCDPSession(page)
  await dest.click()
  const seen = []
  for (const text of ['と', 'とうきょ', 'とうきょう']) { await cdp.send('Input.imeSetComposition', { text, selectionStart: text.length, selectionEnd: text.length }); seen.push(await dest.inputValue()) }
  await cdp.send('Input.insertText', { text: '東京' })
  for (const text of ['た', 'たわー ', 'たわー れこーど']) { await cdp.send('Input.imeSetComposition', { text, selectionStart: text.length, selectionEnd: text.length }); seen.push(await dest.inputValue()) }
  await cdp.send('Input.insertText', { text: 'タワー レコード' })
  ok('A3 輸入法組字（CDP IME，含組字中的空白）不丟字、不重複', (await dest.inputValue()) === '東京タワー レコード', { composing: seen, got: await dest.inputValue(), savedIntent: (await saved()).intent.destination })
}
await shot('input-dest')
await dest.press('Enter')
ok('A4 目的地按 Enter 收起選單', await page.getByTestId('daily-sheet').isHidden(), {})
await page.getByTestId('daily-chip-dest').click(); await dest.fill(''); await page.getByTestId('daily-sheet-close').click()

const card = page.locator('.dd-stop:has([data-testid="daily-move-up-meal"])')
await card.locator('.dd-change-place summary').click()
const stopInput = card.locator('.dd-change-place input')
await stopInput.click()
const y0 = (await stopInput.boundingBox()).y + await page.evaluate(() => scrollY)
await page.keyboard.type('Fuglen Tokyo', { delay: 30 })
const y1 = (await stopInput.boundingBox()).y + await page.evaluate(() => scrollY)
ok('A5 逐站指定：打字時卡片不跳動、不失焦、字不丟', Math.round(y1 - y0) === 0 && (await stopInput.inputValue()) === 'Fuglen Tokyo' && await stopInput.evaluate((el) => document.activeElement === el), { jumpPx: Math.round(y1 - y0), got: await stopInput.inputValue() })
const before = sent.length
await page.keyboard.press('Enter'); await idle()
const sp = sent[sent.length - 1]
ok('A6 逐站指定按 Enter 送出：只重找這一站，文字原樣當地點名稱', sent.length === before + 1 && sp.shuffle === 'meal' && sp.stops.find((s) => s.id === 'meal').place === 'Fuglen Tokyo' && sp.stops.find((s) => s.id === 'meal').specified === true, { shuffle: sp.shuffle, stop: (({ id, place, specified }) => ({ id, place, specified }))(sp.stops.find((s) => s.id === 'meal')) })

const add = page.getByTestId('daily-add-place')
ok('A7 行程畫面上直接有「加一個我想去的地方」輸入框（不用點開任何東西）', await add.isVisible(), { box: await add.boundingBox() })
await add.click()
await page.keyboard.type('下北沢 本屋 B&B', { delay: 20 })
await shot('input-add')
const before2 = sent.length
await page.keyboard.press('Enter'); await idle()
const ap = sent[sent.length - 1]
const want = ap.stops.find((s) => s.id.startsWith('want-'))
ok('A8 加地點按 Enter：加進行程並查這一站', sent.length === before2 + 1 && !!want && want.place === '下北沢 本屋 B&B' && want.custom === true && want.specified === true && ap.shuffle === want.id && await page.getByRole('heading', { name: '假店・下北沢 本屋 B&B' }).isVisible(), { want: want && { id: 'want-…', place: want.place, custom: want.custom, specified: want.specified }, inputAfter: await add.inputValue() })
await add.click(); await page.keyboard.type('代々木公園'); const before3 = sent.length
await page.getByTestId('daily-add-place-submit').click(); await idle()
ok('A9 加地點按按鈕也能送出', sent.length === before3 + 1 && sent[sent.length - 1].stops.some((s) => s.place === '代々木公園'), {})

// ── B. 手動排序 ──
const order0 = await cardIds()
const up = page.getByTestId('daily-move-down-meal')
const bb = await up.boundingBox()
ok('B1 上移／下移按鈕 ≥44×44px，固定行程沒有按鈕', bb.width >= 44 && bb.height >= 44 && await page.getByTestId('daily-move-up-fixed-1').count() === 0, { w: bb.width, h: bb.height })
await up.click()
const order1 = await cardIds()
ok('B2 按下移：這一站往下一格，出現順序列', order1.indexOf('meal') > order1.indexOf(order0[order0.indexOf('meal') + 1] === '(fixed)' ? order0[order0.indexOf('meal') + 2] : order0[order0.indexOf('meal') + 1]) && await page.getByTestId('daily-order-bar').isVisible(), { before: order0, after: order1 })
await page.getByTestId('daily-order-bar').evaluate((el) => el.scrollIntoView({ block: 'start' })); await shot('order-moved')
// 把關 R1-C：還沒重算就重開頁面，按鈕要還在。
await page.reload(); await page.getByTestId('daily-entry').click(); await page.locator('[data-screen="daily-decision"]').waitFor()
ok('B2c 改了順序還沒重算就重開頁面：「照這個順序更新時間」還在、順序還在', await page.getByTestId('daily-order-apply').isVisible() && JSON.stringify(await cardIds()) === JSON.stringify(order1) && (await saved()).orderDirty === true, { orderDirty: (await saved()).orderDirty })
// 把關 R1-E：連按 3 次 ↑，同一顆按鈕每次都還在畫面內（沒被底部按鍵列蓋住）、焦點還在它身上。
const lastId = order1[order1.length - 1]
const upBtn = page.getByTestId('daily-move-up-' + lastId)
await upBtn.evaluate((el) => el.scrollIntoView({ block: 'center' }))
const hops = []
for (let i = 0; i < 3; i++) {
  await upBtn.click()
  await page.waitForTimeout(150)
  const box = await upBtn.boundingBox()
  const dockY = (await page.locator('.dd-dock').boundingBox()).y
  hops.push({ y: Math.round(box.y), inView: box.y >= 0 && box.y + box.height <= dockY, focused: await upBtn.evaluate((el) => document.activeElement === el), order: (await cardIds()).map((x) => x.replace(/want-\d+/, 'want')) })
  if (i === 0) await shot('order-arrows')
}
ok('B2e 連按 3 次 ↑：按鈕每次都在畫面內、焦點留在同一顆、每次往上一格', hops.every((h) => h.inView && h.focused) && (await cardIds()).filter((x) => x !== '(fixed)').indexOf(lastId) === order1.filter((x) => x !== '(fixed)').length - 4, { hops })
const order2 = await cardIds()
await page.getByTestId('daily-order-apply').click(); await idle()
const rp = sent[sent.length - 1]
const movableOf = (ids) => ids.filter((x) => x !== '(fixed)' && x !== 'fixed-1')
ok('B3 「照這個順序更新時間」：請求帶 manualOrder:true＋reorderOnly:true，站的順序＝畫面順序，不換店', rp.manualOrder === true && rp.reorderOnly === true && rp.shuffle === undefined && JSON.stringify(movableOf(rp.stops.map((s) => s.id))) === JSON.stringify(movableOf(order2)), { manualOrder: rp.manualOrder, reorderOnly: rp.reorderOnly, sentOrder: rp.stops.map((s) => s.id.replace(/want-\d+/, 'want')) })
ok('B4 回應後畫面順序仍是使用者的順序', JSON.stringify(movableOf(await cardIds())) === JSON.stringify(movableOf(order2)), { after: (await cardIds()).map((x) => x.replace(/want-\d+/, 'want')) })
await page.reload(); await page.getByTestId('daily-entry').click(); await page.locator('[data-screen="daily-decision"]').waitFor()
ok('B5 重開頁面順序還在（存檔有 manualOrder）', JSON.stringify(movableOf(await cardIds())) === JSON.stringify(movableOf(order2)) && (await saved()).manualOrder === true, { manualOrder: (await saved()).manualOrder })
await page.getByTestId('daily-generate').click(); await idle()
const gp = sent[sent.length - 1]
ok('B6 重新產生不打亂：請求仍帶 manualOrder、順序相同；畫面順序相同', gp.manualOrder === true && gp.reorderOnly === undefined && JSON.stringify(movableOf(gp.stops.map((s) => s.id))) === JSON.stringify(movableOf(order2)) && JSON.stringify(movableOf(await cardIds())) === JSON.stringify(movableOf(order2)), { sentOrder: gp.stops.map((s) => s.id.replace(/want-\d+/, 'want')) })
await page.getByText('↻ 換這一站').first().click(); await idle()
ok('B7 換一站不打亂順序', sent[sent.length - 1].manualOrder === true && JSON.stringify(movableOf(await cardIds())) === JSON.stringify(movableOf(order2)), { shuffle: sent[sent.length - 1].shuffle })
await page.getByTestId('daily-order-auto').click(); await idle()
const au = sent[sent.length - 1]
ok('B8 恢復自動排序：請求不再帶 manualOrder（帶 reorderOnly，不換店），順序列消失', au.manualOrder === undefined && au.reorderOnly === true && await page.getByTestId('daily-order-bar').count() === 0 && (await saved()).manualOrder === undefined, { manualOrder: au.manualOrder, reorderOnly: au.reorderOnly })

// ── C. 探索主題 ──
const chip = page.getByTestId('daily-theme-creative')
await chip.scrollIntoViewIfNeeded()
await chip.click()
const opts = await page.locator('[data-testid^="daily-theme-opt-"]').evaluateAll((els) => els.filter((e) => e.offsetParent).map((e) => e.dataset.testid.replace('daily-theme-opt-', '') + '=' + e.querySelector('b').textContent))
await page.waitForTimeout(400); await shot('theme-sheet')
ok('C1 探索站可換主題：選單有「讓導遊決定」＋7 個主題', opts.length === 8, { opts })
await page.getByTestId('daily-theme-opt-park').click(); await idle()
const tp = sent[sent.length - 1]
ok('C2 選「漂亮的公園」：只重找探索站，請求逐站帶 theme', tp.shuffle === 'creative' && tp.stops.find((s) => s.id === 'creative').theme === 'park', { shuffle: tp.shuffle, theme: tp.stops.find((s) => s.id === 'creative').theme })
const reason = await page.getByTestId('daily-reason-creative').textContent()
ok('C3 卡片有理由行（主題、評分、評論數、步行分鐘都來自回應）', reason.includes('主題「漂亮的公園」') && reason.includes('★4.3') && reason.includes('321 則評論') && /步行 \d+ 分鐘/.test(reason), { reason })
await page.getByTestId('daily-reason-creative').evaluate((el) => el.scrollIntoView({ block: 'center' })); await shot('theme-card')
await page.getByTestId('daily-generate').click(); await idle()
ok('C4 自己選的主題重新產生時不被換掉', sent[sent.length - 1].stops.find((s) => s.id === 'creative').theme === 'park', {})
const usedBefore = (await saved()).themesToday ?? []
await chip.click(); await page.getByTestId('daily-theme-opt-auto').click(); await idle()
const pickOf = () => sent[sent.length - 1].stops.find((s) => s.id === 'creative')
const picks = [pickOf()]
for (let i = 0; i < 5; i++) { await page.getByTestId('daily-generate').click(); await idle(); picks.push(pickOf()) }
const seq = picks.map((p) => p.theme)
// 行程裡有午餐站與咖啡站：導遊只在 有趣／公園／藝文／沒去過的區域 之間輪（把關 R1-B、F），不連續重複；輪到沒去過的區域一定帶區域。
ok('C5 讓導遊決定：每次重新產生都換主題；不跟午餐站／咖啡站重複；會輪到「沒去過的區域」（開著只在這一帶也會）', seq.every((x, i) => ['fun', 'park', 'art', 'new_area'].includes(x) && (i === 0 || x !== seq[i - 1])) && seq.includes('new_area') && new Set(seq).size >= 3 && picks.every((p) => (p.theme === 'new_area') === !!p.themeArea), { usedBefore, seq, areas: picks.map((p) => p.themeArea ?? null) })
await chip.click(); await page.getByTestId('daily-theme-opt-new_area').click(); await idle()
const na = sent[sent.length - 1].stops.find((s) => s.id === 'creative')
ok('C6 選「沒去過的區域」：請求帶 themeArea（地區清單裡、不是自己的生活圈）', na.theme === 'new_area' && ['新宿', '原宿', '表参道', '恵比寿', '代官山'].includes(na.themeArea), { theme: na.theme, themeArea: na.themeArea, reason: await page.getByTestId('daily-reason-creative').textContent() })
await page.getByTestId('daily-theme-coffee').click()
const copts = await page.locator('[data-testid^="daily-theme-opt-"]').evaluateAll((els) => els.filter((e) => e.offsetParent).map((e) => e.dataset.testid.replace('daily-theme-opt-', '')))
await page.getByTestId('daily-theme-opt-view_cafe').click(); await idle()
ok('C7 咖啡站可選景觀好／好喝兩種', JSON.stringify(copts) === JSON.stringify(['auto', 'view_cafe', 'good_coffee']) && sent[sent.length - 1].stops.find((s) => s.id === 'coffee').theme === 'view_cafe', { copts })
// 把關 R1-D：加到 9 站後再加，打的字要留著。
const addBox = page.getByTestId('daily-add-place')
while ((await saved()).tasks.length < 9) { await addBox.fill('補滿用的地點' + (await saved()).tasks.length); await addBox.press('Enter'); await idle() }
const callsFull = sent.length
await addBox.fill('第十個想去的地方'); await addBox.press('Enter'); await page.waitForTimeout(200)
ok('D0 已有 9 站再按 Enter：打的字還在、有提示、沒有送請求', (await addBox.inputValue()) === '第十個想去的地方' && sent.length === callsFull && await page.getByText('一天最多排 9 站').isVisible() && (await saved()).tasks.length === 9, { inputAfterEnter: await addBox.inputValue(), calls: sent.length - callsFull })
const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
ok('D1 沒有橫向捲動', overflow <= 0, { overflow })
await page.evaluate(() => scrollTo(0, 0)); await shot('final-top')
out.requests = sent.length
out.allPass = Object.values(out.checks).every((c) => c.pass)
writeFileSync(DIR + 'verify-' + which + '.json', JSON.stringify(out, null, 1))
console.log('ALL ' + (out.allPass ? 'PASS' : 'FAIL') + ' (' + Object.keys(out.checks).length + ' checks, ' + which + ')')
await browser.close()
