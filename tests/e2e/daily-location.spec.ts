// Round 10 D：今日行程用目前位置當出發點。拿到座標就送 origin；定位被拒 → 顯示原因、原行程不動、不改用澀谷。
import { expect, test, type Page } from '@playwright/test'
import { prime } from './fixtures.ts'

const SHINJUKU = { latitude: 35.6896, longitude: 139.7006 }
const cand = (id: string, name: string) => ({ id, name, address: name + ' 地址', mapUrl: 'https://maps.google.com/?cid=' + id, lat: 35.69, lng: 139.70 })

/** 記下每次 /api/daily-route 的 body，回固定兩站。照片 API 一律回不可用（不打真的 Google）。 */
async function captureRoute(page: Page) {
  const sent: Record<string, unknown>[] = []
  await page.route('**/api/daily-route', async (route) => {
    sent.push(route.request().postDataJSON())
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      origin: { name: '目前位置', current: true, lat: SHINJUKU.latitude, lng: SHINJUKU.longitude },
      stops: [
        { id: 'meal', kind: 'meal', title: '新宿的定食', minutes: 45, done: false, candidate: cand('m1', '新宿的定食') },
        { id: 'rest', kind: 'rest', title: '新宿駅', minutes: 75, done: false, candidate: cand('r1', '新宿駅') },
      ],
      routeVerified: false, conflicts: [],
    }) })
  })
  await page.route('**/api/place-photo**', (route) => route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"photo_unavailable"}' }))
  return sent
}

async function openDaily(page: Page) {
  await page.goto('/')
  await page.getByTestId('daily-entry').click()
  await expect(page.locator('[data-screen="daily-decision"]')).toBeVisible()
}

test.describe('允許定位', () => {
  test.use({ geolocation: SHINJUKU, permissions: ['geolocation'] })

  test('按「用目前位置」→ 送出座標（不送地名）→ 出發地顯示「目前位置」、行程是回來的店', async ({ page }) => {
    await prime(page)
    const sent = await captureRoute(page)
    await openDaily(page)
    // 2026-11 版面重排：出發地收在膠囊裡，先點開底部選單再操作。
    await expect(page.getByTestId('daily-origin-here')).toBeHidden()
    await page.getByTestId('daily-chip-origin').click()
    await page.getByTestId('daily-origin-here').click()
    // 選了目前位置就直接搜尋：選單自己收起來，行程露出來。
    await expect(page.getByTestId('daily-sheet')).toBeHidden()
    await expect(page.getByRole('heading', { name: '新宿的定食' })).toBeVisible()
    expect(sent).toHaveLength(1)
    expect(sent[0]!.origin).toEqual({ lat: SHINJUKU.latitude, lng: SHINJUKU.longitude })
    expect(sent[0]!.location).toBeUndefined()
    await expect(page.getByTestId('daily-chip-origin')).toContainText('📍 目前位置')
    await expect(page.getByTestId('daily-origin')).toHaveText('📍 目前位置')
    await expect(page.locator('#daily-location')).toHaveCount(0)

    // 重新整理：只記得「用目前位置」這個選擇（不存座標），再搜尋會重新定位、照樣送座標。
    const saved = await page.evaluate(() => localStorage.getItem('decide.daily.v1'))
    expect(saved).toContain('"useHere":true')
    expect(saved).not.toContain(String(SHINJUKU.latitude))
    expect(saved).not.toContain(String(SHINJUKU.longitude))
    await page.reload()
    await page.getByTestId('daily-entry').click()
    await expect(page.getByTestId('daily-chip-origin')).toContainText('📍 目前位置')
    await page.getByTestId('daily-generate').click()
    await expect.poll(() => sent.length).toBe(2)
    expect(sent[1]!.origin).toEqual({ lat: SHINJUKU.latitude, lng: SHINJUKU.longitude })

    // 改回輸入地點：輸入框回來，送地名、不送座標。
    await page.getByTestId('daily-chip-origin').click()
    await page.getByTestId('daily-origin-typed').click()
    await page.locator('#daily-location').fill('吉祥寺駅')
    await page.getByTestId('daily-sheet-close').click()
    await expect(page.getByTestId('daily-chip-origin')).toContainText('吉祥寺駅')
    await page.getByTestId('daily-generate').click()
    await expect.poll(() => sent.length).toBe(3)
    expect(sent[2]!.location).toBe('吉祥寺駅')
    expect(sent[2]!.origin).toBeUndefined()
  })
})

test('定位被拒 → 顯示原因、原行程不動、不送請求（不改用澀谷）', async ({ page }) => {
  await prime(page)
  await page.addInitScript(() => {
    const w = window as unknown as { geoCalls: number }
    w.geoCalls = 0
    navigator.geolocation.getCurrentPosition = (_ok, err) => { w.geoCalls++; err?.({ code: 1, message: 'denied', PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 }) }
    const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
    const c = { id: 'old1', name: '原本的咖啡店', address: '渋谷', mapUrl: 'https://maps.google.com/?cid=old1', lat: 35.66, lng: 139.70 }
    localStorage.setItem('decide.daily.v1', JSON.stringify({
      day, area: '澀谷', currentPlace: '渋谷駅', notes: [], avoid: [], routedFrom: 'text:渋谷駅',
      tasks: [{ id: 'coffee', kind: 'creative', title: '原本的咖啡店', minutes: 60, done: false, candidate: c }],
    }))
  })
  const sent = await captureRoute(page)
  await openDaily(page)
  await expect(page.getByRole('heading', { name: '原本的咖啡店' })).toBeVisible()
  await page.getByTestId('daily-chip-origin').click()
  await page.getByTestId('daily-origin-here').click()
  await expect(page.getByRole('status').filter({ hasText: '無法使用目前位置' })).toContainText('你沒有允許定位')
  await expect(page.getByRole('status').filter({ hasText: '無法使用目前位置' })).toContainText('原行程已保留')
  await expect(page.getByRole('heading', { name: '原本的咖啡店' })).toBeVisible()
  await expect(page.getByTestId('daily-chip-origin')).toContainText('📍 目前位置') // 你選的是目前位置，不偷換成澀谷站
  expect(sent).toHaveLength(0)

  // 再按搜尋：一樣先定位、一樣失敗、一樣不送。
  await page.getByTestId('daily-generate').click()
  await expect.poll(() => page.evaluate(() => (window as unknown as { geoCalls: number }).geoCalls)).toBe(2)
  await expect(page.getByTestId('daily-generate')).toBeEnabled()
  await expect(page.getByRole('status').filter({ hasText: '無法使用目前位置' })).toBeVisible()
  await expect(page.getByRole('heading', { name: '原本的咖啡店' })).toBeVisible()
  expect(sent).toHaveLength(0)
})

test('版面：設定是膠囊不是長表單；主按鍵固定在底部；第一屏看得到行程', async ({ page }) => {
  await prime(page)
  await captureRoute(page)
  await openDaily(page)
  const vh = page.viewportSize()!.height
  // 空行程：整張說明卡都在第一屏、在底部按鍵上方，沒有被遮住任何一行。
  const empty = (await page.locator('.dd-empty').boundingBox())!
  const dock0 = (await page.locator('.dd-dock').boundingBox())!
  expect(await page.evaluate(() => window.scrollY)).toBe(0)
  expect(empty.y + empty.height).toBeLessThanOrEqual(dock0.y)
  // 進來時所有設定欄位都收著，畫面上只有膠囊。
  for (const id of ['daily-start-time', 'daily-intent-destination', 'daily-intent-destination-station', 'daily-intent-activity-meal']) await expect(page.getByTestId(id)).toBeHidden()
  await expect(page.locator('#daily-area')).toBeHidden()
  for (const id of ['origin', 'time', 'dest', 'acts', 'area', 'fixed', 'notes']) await expect(page.getByTestId('daily-chip-' + id)).toBeVisible()
  // 一次只開一項：開「想做什麼」時，其他項的欄位還是收著。
  await page.getByTestId('daily-chip-acts').click()
  await expect(page.getByRole('dialog', { name: '想做什麼' })).toBeVisible()
  await expect(page.getByTestId('daily-start-time')).toBeHidden()
  // 開選單不能把背後的頁面捲走。
  await page.waitForTimeout(300)
  expect(await page.evaluate(() => window.scrollY)).toBe(0)
  await page.getByTestId('daily-intent-activity-meal').check()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('daily-sheet')).toBeHidden()
  await expect(page.getByTestId('daily-chip-acts')).toContainText('吃飯')
  // 每一張選單打開後，看得到的欄位最多兩個（「想做什麼」那組多選算一個）。已安排的行程分兩步。
  const shown = () => page.locator('.dd-sheet-body:not([hidden])').evaluateAll((bs) => bs.map((b) => b.querySelector('.dd-intent-activities') ? 1 : b.querySelectorAll('input,select,textarea').length))
  for (const id of ['origin', 'time', 'dest', 'acts', 'area', 'fixed', 'notes']) {
    await page.getByTestId('daily-chip-' + id).click()
    const n = await shown()
    expect(n, id).toHaveLength(1)
    expect(n[0], id).toBeLessThanOrEqual(2)
    if (id === 'fixed') {
      await page.getByLabel('既有行程名稱').fill('與朋友見面')
      await page.getByLabel('既有行程地點').fill('吉祥寺')
      await page.getByTestId('daily-fixed-next').click()
      const n2 = await shown()
      expect(n2).toEqual([2])
      await expect(page.getByLabel('行程長度分鐘')).toBeVisible()
      await expect(page.getByLabel('既有行程名稱')).toBeHidden()
    }
    await page.getByTestId('daily-sheet-close').click()
  }
  // 第一屏：行程清單的開頭在主按鍵上方。
  const dock = (await page.locator('.dd-dock').boundingBox())!
  const list = (await page.locator('.dd-itinerary').boundingBox())!
  expect(list.y).toBeLessThan(dock.y - 80)
  // 產生路線後捲到底：主按鍵還貼在畫面底部，最後一張卡片在它上方、沒被蓋住。
  await page.getByTestId('daily-generate').click()
  await expect(page.getByRole('heading', { name: '新宿的定食' })).toBeVisible()
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight / 2))
  const mid = (await page.getByTestId('daily-generate').boundingBox())!
  expect(mid.y + mid.height).toBeLessThanOrEqual(vh)
  expect(mid.y).toBeGreaterThan(vh - 140)
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
  const last = (await page.locator('.dd-stop').last().boundingBox())!
  const end = (await page.locator('.dd-dock').boundingBox())!
  expect(last.y + last.height).toBeLessThanOrEqual(end.y + 1)
})
