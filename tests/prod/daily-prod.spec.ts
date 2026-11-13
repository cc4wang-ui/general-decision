// pending-tests（2026-11-13）：正式站真 API 的今日行程瀏覽器 E2E。不攔截、不 mock 任何 API。
// 證據：截圖 runs/pending-tests/shots/、每次 /api/daily-route 回應 runs/pending-tests/snapshots/、錄影 test-results/。
import { expect, test, type Locator, type Page } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'

const OUT = 'runs/pending-tests'
mkdirSync(`${OUT}/shots`, { recursive: true })
mkdirSync(`${OUT}/snapshots`, { recursive: true })

type Stop = { id: string; kind?: string; title?: string; locked?: boolean; done?: boolean; specified?: boolean; start?: string
  candidate?: { id: string; name: string; address?: string }; eta?: string; departure?: string; travelMin?: number; conflict?: string }
type RouteBody = { stops: Stop[]; routeVerified?: boolean; conflicts?: string[]; travelMinutes?: number; message?: string }

/** 東京今天現在 +N 分鐘，取整到 5 分鐘，回 HH:MM。 */
function tokyoPlus(min: number): string {
  const now = new Date(Date.now() + min * 60_000)
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now)
  const h = Number(p.find(x => x.type === 'hour')!.value), m = Number(p.find(x => x.type === 'minute')!.value)
  const r = Math.ceil(m / 5) * 5
  const t = h * 60 + r
  return `${String(Math.floor(t / 60) % 24).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`
}

async function prime(page: Page) {
  await page.addInitScript(() => { try { localStorage.setItem('decide.consent', 'v1') } catch { /* */ } })
}

/** 點一下：有觸控的裝置用 tap（真的觸控事件），桌機用 click。 */
async function press(loc: Locator, touch: boolean) {
  if (touch) await loc.tap(); else await loc.click()
}

async function save(name: string, data: unknown) {
  writeFileSync(`${OUT}/snapshots/${name}.json`, JSON.stringify(data, null, 2))
}

/** 按下 trigger，等 /api/daily-route 回來，回傳 JSON。 */
async function routeCall(page: Page, trigger: () => Promise<void>): Promise<RouteBody> {
  const [resp] = await Promise.all([
    page.waitForResponse(r => r.url().includes('/api/daily-route') && r.request().method() === 'POST', { timeout: 120_000 }),
    trigger(),
  ])
  expect(resp.status(), 'daily-route HTTP').toBe(200)
  const body = await resp.json() as RouteBody
  ;(body as Record<string, unknown>)._request = resp.request().postDataJSON()
  return body
}

async function noHorizontalScroll(page: Page) {
  const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }))
  expect(m.sw, `scrollWidth ${m.sw} ≤ innerWidth ${m.iw}`).toBeLessThanOrEqual(m.iw)
  return m
}

/** 畫面上第 i 張卡片的資料。 */
async function cards(page: Page) {
  return page.locator('article.dd-stop').evaluateAll(els => els.map(e => ({
    name: e.querySelector('h3')?.textContent?.trim() ?? '',
    eta: e.querySelector('.dd-eta')?.textContent?.trim() ?? '',
    kind: e.querySelector('.dd-kind')?.textContent?.trim() ?? '',
    duration: e.querySelector('.dd-duration')?.textContent?.trim() ?? '',
    done: e.classList.contains('is-done'),
  })))
}

/** 畫面與 API 回應一致：順序、店名、ETA、步行分鐘；ETA 遞增（同日）。 */
async function expectUiMatches(page: Page, body: RouteBody) {
  const ui = await cards(page)
  expect(ui.length).toBe(body.stops.length)
  body.stops.forEach((s, i) => {
    expect(ui[i]!.name, `第 ${i + 1} 站店名`).toBe(s.candidate?.name ?? s.title)
    if (s.eta) {
      expect(ui[i]!.eta, `第 ${i + 1} 站 ETA`).toContain(`${s.eta} 抵達`)
      expect(ui[i]!.eta).toContain(`${s.departure} 離開`)
      expect(ui[i]!.eta).toContain(`步行 ${s.travelMin} 分鐘`)
    }
  })
  return ui
}

async function openDaily(page: Page, touch: boolean) {
  await page.goto('/')
  await press(page.getByTestId('daily-entry'), touch)
  await expect(page.locator('[data-screen="daily-decision"]')).toBeVisible()
}

async function closeSheet(page: Page, touch: boolean) {
  await press(page.getByTestId('daily-sheet-close'), touch)
  await expect(page.getByTestId('daily-sheet')).toBeHidden()
}

async function setup(page: Page, touch: boolean, fixed: { title: string; place: string; time: string; min: number }[]) {
  // 出發地：渋谷駅
  await press(page.getByTestId('daily-chip-origin'), touch)
  const typed = page.getByTestId('daily-origin-typed')
  if (await typed.isVisible()) await press(typed, touch)
  await page.locator('#daily-location').fill('渋谷駅')
  await closeSheet(page, touch)
  // 想做什麼：吃飯、咖啡、逛街（晚上還開的種類）
  await press(page.getByTestId('daily-chip-acts'), touch)
  const want = ['meal', 'coffee', 'shopping']
  for (const id of ['gym', 'meal', 'creative', 'coffee', 'shopping']) {
    const box = page.getByTestId(`daily-intent-activity-${id}`)
    if ((await box.isChecked()) !== want.includes(id)) await press(box, touch)
    if (want.includes(id)) await expect(box).toBeChecked(); else await expect(box).not.toBeChecked()
  }
  await closeSheet(page, touch)
  // 固定行程
  for (const f of fixed) {
    await press(page.getByTestId('daily-chip-fixed'), touch)
    await page.getByLabel('既有行程名稱').fill(f.title)
    await page.getByLabel('既有行程地點').fill(f.place)
    await press(page.getByTestId('daily-fixed-next'), touch)
    await page.getByLabel('開始時間', { exact: true }).fill(f.time)
    await page.getByLabel('行程長度分鐘').fill(String(f.min))
    await press(page.getByRole('button', { name: '加入固定行程' }), touch)
    await expect(page.getByTestId('daily-sheet')).toBeHidden()
  }
}

test('P0／P1 裝置：正式站真 API 生成今日行程（2 個固定行程），畫面與回應一致', async ({ page }, info) => {
  const touch = !!info.project.use.hasTouch
  const dev = info.project.name
  await prime(page)
  const consoleErrors: string[] = []
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()) })
  await openDaily(page, touch)
  await page.screenshot({ path: `${OUT}/shots/${dev}-1-empty.png` })
  const fixed = [
    { title: '看唱片', place: 'タワーレコード渋谷店', time: tokyoPlus(120), min: 30 },
    { title: '宵夜', place: '一蘭 渋谷店', time: tokyoPlus(180), min: 40 },
  ]
  await setup(page, touch, fixed)
  await page.screenshot({ path: `${OUT}/shots/${dev}-2-settings.png` })

  const body = await routeCall(page, () => press(page.getByTestId('daily-generate'), touch))
  await save(`${dev}-generate`, body)
  await expect(page.getByTestId('daily-generate')).toBeEnabled({ timeout: 30_000 })

  expect(body.routeVerified, 'Google Routes 步行時間已驗證').toBe(true)
  await expect(page.locator('.dd-live-status').first()).toContainText('已更新 Google Routes 步行路線')
  const ui = await expectUiMatches(page, body)

  // 兩個固定行程都在，時間照填的
  const locked = body.stops.filter(s => s.locked)
  expect(locked.map(s => s.start).sort()).toEqual(fixed.map(f => f.time).sort())
  for (const f of fixed) expect(ui.some(c => c.kind.includes('固定安排') && c.duration.startsWith(f.time))).toBe(true)
  // 每站都有真店名與地址（固定行程也解析到地點）
  // 沒店的站必須誠實標原因（例如晚上咖啡店打烊＝closed），畫面上有警告；至少 3 站有真店
  for (const s of body.stops.filter(s => s.kind !== 'rest')) {
    const x = s as Stop & { noCandidate?: boolean; noCandidateReason?: string }
    expect(!!x.candidate?.name || (x.noCandidate === true && !!x.noCandidateReason), `${s.id} 有店或標明原因`).toBe(true)
  }
  expect(body.stops.filter(s => s.candidate?.name).length).toBeGreaterThanOrEqual(3)
  const missing = body.stops.filter(s => !s.candidate && s.kind !== 'rest')
  for (const s of missing) await expect(page.locator('article.dd-stop').nth(body.stops.indexOf(s)).locator('.dd-place-unresolved')).toBeVisible()
  // ETA 遞增（跨夜用 etaDayOffset 加 24 小時）
  const etas = body.stops.filter(s => s.eta).map(s => {
    const [h, m] = s.eta!.split(':').map(Number)
    return h! * 60 + m! + 1440 * (((s as Record<string, unknown>).etaDayOffset as number) || 0)
  })
  for (let i = 1; i < etas.length; i++) expect(etas[i]! >= etas[i - 1]!, `ETA 遞增 ${body.stops.map(s => s.eta).join(' → ')}`).toBe(true)

  await noHorizontalScroll(page)
  await page.screenshot({ path: `${OUT}/shots/${dev}-3-itinerary.png`, fullPage: true })
  // 照片：至少一張真的載入
  await expect(page.locator('article.dd-stop img').first()).toBeVisible({ timeout: 30_000 })
  await page.screenshot({ path: `${OUT}/shots/${dev}-4-itinerary-photos.png`, fullPage: true })
  await save(`${dev}-console-errors`, consoleErrors)
})

test('P1 Shuffle：手動指定、已完成、換一站、重新搜尋（正式站真 API）', async ({ page }, info) => {
  test.skip(info.project.name !== 'iphone' && info.project.name !== 'webkit-iphone', '只在 iPhone 跑一次，省 Places 呼叫')
  const touch = !!info.project.use.hasTouch
  const dev = info.project.name
  await prime(page)
  await openDaily(page, touch)
  const fixed = [
    { title: '看唱片', place: 'タワーレコード渋谷店', time: tokyoPlus(120), min: 30 },
    { title: '宵夜', place: '一蘭 渋谷店', time: tokyoPlus(180), min: 40 },
  ]
  await setup(page, touch, fixed)
  const b0 = await routeCall(page, () => press(page.getByTestId('daily-generate'), touch))
  await save(`${dev}-shuffle-0-generate`, b0)
  await expect(page.getByTestId('daily-generate')).toBeEnabled({ timeout: 30_000 })
  expect(b0.routeVerified).toBe(true)

  const art = (name: string) => page.locator('article.dd-stop').filter({ has: page.locator('h3', { hasText: name }) })
  const movable = b0.stops.filter(s => !s.locked && s.kind !== 'rest' && s.candidate)
  expect(movable.length, '至少 3 個可移動站').toBeGreaterThanOrEqual(3)
  // 已完成＝meal；換店＝非健身的自動站（健身房附近通常只有一間，換了會變無候選）；指定＝剩下的一站
  const mealStop = movable.find(s => s.kind === 'meal') ?? movable[0]!
  const rest = movable.filter(s => s !== mealStop)
  const shuffleStop = rest.find(s => s.kind !== 'gym') ?? rest[0]
  const specStop = rest.find(s => s !== shuffleStop)
  expect(specStop && shuffleStop).toBeTruthy()

  // b. 手動指定地點：把 specStop 改成 Fuglen Tokyo
  const specCard = art(specStop!.candidate!.name)
  await press(specCard.locator('summary', { hasText: '指定／修改這一站的地點' }), touch)
  await specCard.getByLabel(`${specStop!.title} 指定地點`).fill('Fuglen Tokyo')
  const b1 = await routeCall(page, () => press(page.getByRole('button', { name: '確認這個地點並更新路線' }).first(), touch))
  await save(`${dev}-shuffle-1-specified`, b1)
  await expect(page.getByTestId('daily-generate')).toBeEnabled({ timeout: 30_000 })
  const spec1 = b1.stops.find(s => s.id === specStop!.id)!
  expect(spec1.specified).toBe(true)
  expect(spec1.candidate?.name ?? '', '指定店').toMatch(/fuglen/i)
  await expectUiMatches(page, b1)
  await page.screenshot({ path: `${OUT}/shots/${dev}-5-specified.png`, fullPage: true })

  // c. 已完成：meal 標記完成
  const mealName = b1.stops.find(s => s.id === mealStop.id)!.candidate!.name
  const mealCard = art(mealName)
  await press(mealCard.locator('label.dd-done'), touch)
  await expect(mealCard).toHaveClass(/is-done/)
  await expect(mealCard.locator('label.dd-done')).toContainText('已完成')

  // a. 換這一站：只換 shuffleStop；按下時有即時回饋
  const shufName = b1.stops.find(s => s.id === shuffleStop!.id)!.candidate!.name
  const shufCard = art(shufName)
  const shufBtn = shufCard.getByRole('button', { name: '↻ 換這一站' })
  const [resp2] = await Promise.all([
    page.waitForResponse(r => r.url().includes('/api/daily-route') && r.request().method() === 'POST', { timeout: 120_000 }),
    (async () => {
      await press(shufBtn, touch)
      // 即時回饋：按鈕變「找替代地點中…」，主按鍵變「正在換這一站…」並停用
      await expect(page.getByRole('button', { name: '找替代地點中…' })).toBeVisible({ timeout: 5_000 })
      await expect(page.getByTestId('daily-generate')).toHaveText('正在換這一站…')
      await expect(page.getByTestId('daily-generate')).toBeDisabled()
      await page.screenshot({ path: `${OUT}/shots/${dev}-6-shuffle-busy.png` })
    })(),
  ])
  const b2 = await resp2.json() as RouteBody
  ;(b2 as Record<string, unknown>)._request = resp2.request().postDataJSON()
  await save(`${dev}-shuffle-2-swap`, b2)
  await expect(page.getByTestId('daily-generate')).toBeEnabled({ timeout: 30_000 })
  const byId = (b: RouteBody) => Object.fromEntries(b.stops.map(s => [s.id, s.candidate?.id ?? null]))
  const before = byId(b1), after = byId(b2)
  expect(after[shuffleStop!.id], '目標站換了店').not.toBe(before[shuffleStop!.id])
  // 換之前已有店的其他站一律不變；換之前沒店（無候選）的站被補上店不算違規
  for (const id of Object.keys(before)) if (id !== shuffleStop!.id && before[id]) expect(after[id], `${id} 不變`).toBe(before[id])
  expect(b2.stops.find(s => s.id === mealStop.id)!.done).toBe(true)
  // 已完成站不該有未來 ETA（PR 修正後才成立；舊版排到最後並給 ETA）。EXPECT_DONE_FIX=1 時嚴格檢查。
  const doneEta = b2.stops.find(s => s.id === mealStop.id)!.eta
  info.annotations.push({ type: 'done-stop-eta', description: doneEta ?? '(none)' })
  if (process.env.EXPECT_DONE_FIX) expect(doneEta, '已完成站沒有 ETA').toBeUndefined()
  expect(b2.stops.filter(s => s.locked).map(s => s.start).sort()).toEqual(fixed.map(f => f.time).sort())
  await expectUiMatches(page, b2)
  await page.screenshot({ path: `${OUT}/shots/${dev}-7-after-shuffle.png`, fullPage: true })

  // 重新搜尋整份：已完成與指定店保留，固定行程時間不變
  const b3 = await routeCall(page, () => press(page.getByTestId('daily-generate'), touch))
  await save(`${dev}-shuffle-3-regenerate`, b3)
  await expect(page.getByTestId('daily-generate')).toBeEnabled({ timeout: 30_000 })
  const after3 = byId(b3)
  expect(after3[mealStop.id], '已完成站保留同一間').toBe(after[mealStop.id])
  expect(b3.stops.find(s => s.id === mealStop.id)!.done).toBe(true)
  expect(after3[specStop!.id], '指定店保留').toBe(after[specStop!.id])
  expect(b3.stops.filter(s => s.locked).map(s => s.start).sort()).toEqual(fixed.map(f => f.time).sort())
  for (const s of b3.stops.filter(s => s.locked)) expect(after3[s.id], `固定 ${s.id} 地點不變`).toBe(after[s.id])
  await expect(page.locator('article.dd-stop.is-done h3')).toHaveText(b3.stops.find(s => s.id === mealStop.id)!.candidate!.name)
  await expectUiMatches(page, b3)
  await noHorizontalScroll(page)
  await page.screenshot({ path: `${OUT}/shots/${dev}-8-regenerate.png`, fullPage: true })
})
