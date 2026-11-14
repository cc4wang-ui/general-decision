// 2.4 行為回饋迴圈｜真瀏覽器驗證（Chromium＋本機 vite）。
// 用法：先 `npx vite --port 5199 --strictPort`，再 `node runs/finish-1114/snapshots/feedback-loop-browser.cjs`
// /api/daily-route 被攔截、回固定 JSON（不打 Google）。回應裡的 preferHit 是這支腳本模擬的：
// 請求帶 prefer 含 ramen 時，未完成的 shopping 站才帶旗標。伺服器真的怎麼挑店由單元測試與預覽站驗證負責。
const { chromium } = require('playwright')
const path = require('path')
const BASE = process.env.BASE_URL || 'http://localhost:5199'
const OUT = __dirname
const AFF = 'decide.daily.affinity.v1'
const DAILY = 'decide.daily.v1'
const cand = (id, name) => ({ id, name, address: name + ' 地址', mapUrl: 'https://maps.google.com/?cid=' + id, lat: 35.66, lng: 139.7, rating: 4.3, userRatingCount: 500, types: ['ramen_restaurant', 'restaurant'], primaryType: 'ramen_restaurant', openNow: true })
const FIXED = [
  { id: 'meal', kind: 'meal', title: '拉麵一號', minutes: 45, candidate: cand('r1', '拉麵一號') },
  { id: 'coffee', kind: 'creative', title: '拉麵二號', minutes: 60, candidate: cand('r2', '拉麵二號') },
  { id: 'shopping', kind: 'shopping', title: '拉麵三號', minutes: 55, candidate: cand('r3', '拉麵三號') },
]
const results = []
let failed = 0
const check = (name, ok, detail) => { if (!ok) failed++; const line = (ok ? 'PASS ' : 'FAIL ') + name + (detail !== undefined ? ' ｜ ' + JSON.stringify(detail) : ''); results.push(line); console.log(line) }

;(async () => {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
  const pageErrors = []
  page.on('pageerror', (e) => pageErrors.push(String(e)))
  await page.addInitScript(() => { try { localStorage.setItem('decide.consent', 'v1') } catch { /* ignore */ } })
  const sent = []
  await page.route('**/api/daily-route', async (route) => {
    const body = route.request().postDataJSON()
    sent.push(body)
    const prefers = Array.isArray(body.prefer) && body.prefer.includes('ramen')
    const stops = FIXED.map((s) => {
      const done = (body.stops || []).find((x) => x.id === s.id)?.done === true
      return { ...s, done, ...(prefers && !done && s.id === 'shopping' ? { preferHit: true } : {}) }
    })
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ origin: { name: '渋谷駅' }, stops, routeVerified: false, conflicts: [] }) })
  })
  await page.route('**/api/place-photo**', (route) => route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"photo_unavailable"}' }))
  const generate = async () => {
    const n = sent.length
    const done = page.waitForResponse('**/api/daily-route')
    await page.getByTestId('daily-generate').click()
    await done
    await page.waitForFunction(() => !document.querySelector('[data-testid="daily-generate"]').disabled)
    if (sent.length !== n + 1) throw new Error('預期多一個請求，實際 ' + (sent.length - n))
    return sent[sent.length - 1]
  }
  const ls = (key) => page.evaluate((k) => localStorage.getItem(k), key)

  await page.goto(BASE + '/')
  await page.getByTestId('daily-entry').click()
  await page.locator('[data-screen="daily-decision"]').waitFor()

  // 1. 沒有任何行為紀錄：請求不帶 prefer／demote
  const b1 = await generate()
  check('1 第一次請求不帶 prefer／demote', !('prefer' in b1) && !('demote' in b1), { keys: Object.keys(b1) })
  check('1 還沒有偏好紀錄', (await ls(AFF)) === null, { affinity: await ls(AFF) })
  check('1 沒有原因行', (await page.getByTestId('daily-prefer-reason').count()) === 0)

  // 2. 標完成兩站拉麵 → localStorage 有紀錄
  await page.locator('article.dd-stop', { hasText: '拉麵一號' }).locator('.dd-done input').check()
  await page.locator('article.dd-stop', { hasText: '拉麵二號' }).locator('.dd-done input').check()
  const aff2 = JSON.parse((await ls(AFF)) || 'null')
  check('2 標完成後 localStorage 有紀錄（兩筆 ramen +2）', Array.isArray(aff2) && aff2.length === 2 && aff2.every((e) => e.k === 'ramen' && e.w === 2), aff2)

  // 3. 下一次請求帶 prefer
  const b3 = await generate()
  check('3 下一次請求 body 帶 prefer:["ramen"]', JSON.stringify(b3.prefer) === '["ramen"]' && !('demote' in b3), { prefer: b3.prefer, demote: b3.demote })
  const reason = page.getByTestId('daily-prefer-reason')
  check('3 回應帶旗標的站顯示原因行', (await reason.count()) === 1 && (await reason.first().textContent()) === '你常選這類，優先挑了這間', { count: await reason.count(), text: (await reason.count()) ? await reason.first().textContent() : null })
  await page.locator('article.dd-stop', { hasText: '拉麵三號' }).scrollIntoViewIfNeeded()
  await page.screenshot({ path: path.join(OUT, 'feedback-loop-01-prefer-reason.png') })

  // 4. 清除按鈕 → 紀錄清掉、seen／disliked 不動、下一次請求不帶
  await page.getByTestId('daily-chip-notes').click()
  await page.getByTestId('daily-clear-affinity').waitFor()
  await page.waitForTimeout(600)
  await page.screenshot({ path: path.join(OUT, 'feedback-loop-02-clear-button.png') })
  const dailyBefore = JSON.parse(await ls(DAILY))
  await page.getByTestId('daily-clear-affinity').click()
  check('4 清除後 localStorage 偏好紀錄不存在', (await ls(AFF)) === null, { affinity: await ls(AFF) })
  const dailyAfter = JSON.parse(await ls(DAILY))
  check('4 seen／disliked／dislikedKinds 沒被清除動到', JSON.stringify([dailyBefore.seen, dailyBefore.disliked, dailyBefore.dislikedKinds]) === JSON.stringify([dailyAfter.seen, dailyAfter.disliked, dailyAfter.dislikedKinds]), { before: [dailyBefore.seen, dailyBefore.disliked, dailyBefore.dislikedKinds], after: [dailyAfter.seen, dailyAfter.disliked, dailyAfter.dislikedKinds] })
  check('4 清除後原因行消失', (await page.getByTestId('daily-prefer-reason').count()) === 0)
  await page.getByTestId('daily-sheet-close').click()
  const b4 = await generate()
  check('4 清除後下一次請求不帶 prefer／demote', !('prefer' in b4) && !('demote' in b4), { keys: Object.keys(b4) })
  await page.screenshot({ path: path.join(OUT, 'feedback-loop-03-after-clear.png') })

  // 5. 壞的 localStorage 內容：重新載入頁面不壞
  await page.evaluate((k) => localStorage.setItem(k, '{bad json'), AFF)
  await page.reload()
  await page.getByTestId('daily-entry').click()
  await page.locator('[data-screen="daily-decision"]').waitFor()
  const b5 = await generate()
  check('5 偏好紀錄是壞 JSON：頁面照常、請求不帶 prefer', !('prefer' in b5) && (await page.locator('article.dd-stop').count()) === 3, { stops: await page.locator('article.dd-stop').count() })
  check('頁面沒有未捕捉的錯誤', pageErrors.length === 0, pageErrors)

  console.log('請求數：' + sent.length + '；失敗檢查數：' + failed)
  await browser.close()
  process.exit(failed ? 1 : 0)
})().catch((e) => { console.error('SCRIPT ERROR', e); process.exit(2) })
