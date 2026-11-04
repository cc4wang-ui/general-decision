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
    await page.getByTestId('daily-origin-here').click()
    await expect(page.getByRole('heading', { name: '新宿的定食' })).toBeVisible()
    expect(sent).toHaveLength(1)
    expect(sent[0]!.origin).toEqual({ lat: SHINJUKU.latitude, lng: SHINJUKU.longitude })
    expect(sent[0]!.location).toBeUndefined()
    await expect(page.getByTestId('daily-origin')).toHaveText('📍 目前位置')
    await expect(page.locator('#daily-location')).toHaveCount(0)

    // 重新整理：只記得「用目前位置」這個選擇（不存座標），再搜尋會重新定位、照樣送座標。
    const saved = await page.evaluate(() => localStorage.getItem('decide.daily.v1'))
    expect(saved).toContain('"useHere":true')
    expect(saved).not.toContain(String(SHINJUKU.latitude))
    expect(saved).not.toContain(String(SHINJUKU.longitude))
    await page.reload()
    await page.getByTestId('daily-entry').click()
    await expect(page.getByTestId('daily-origin')).toHaveText('📍 目前位置')
    await page.getByTestId('daily-generate').click()
    await expect.poll(() => sent.length).toBe(2)
    expect(sent[1]!.origin).toEqual({ lat: SHINJUKU.latitude, lng: SHINJUKU.longitude })

    // 改回輸入地點：輸入框回來，送地名、不送座標。
    await page.getByTestId('daily-origin-typed').click()
    await page.locator('#daily-location').fill('吉祥寺駅')
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
      day, area: '澀谷', currentPlace: '渋谷駅', mode: 'creative', notes: [], avoid: [], routedFrom: 'text:渋谷駅',
      tasks: [{ id: 'coffee', kind: 'creative', title: '原本的咖啡店', minutes: 60, done: false, candidate: c }],
    }))
  })
  const sent = await captureRoute(page)
  await openDaily(page)
  await expect(page.getByRole('heading', { name: '原本的咖啡店' })).toBeVisible()
  await page.getByTestId('daily-origin-here').click()
  await expect(page.getByRole('status').filter({ hasText: '無法使用目前位置' })).toContainText('你沒有允許定位')
  await expect(page.getByRole('status').filter({ hasText: '無法使用目前位置' })).toContainText('原行程已保留')
  await expect(page.getByRole('heading', { name: '原本的咖啡店' })).toBeVisible()
  await expect(page.getByTestId('daily-origin')).toHaveText('📍 目前位置') // 你選的是目前位置，不偷換成澀谷站
  expect(sent).toHaveLength(0)

  // 再按搜尋：一樣先定位、一樣失敗、一樣不送。
  await page.getByTestId('daily-generate').click()
  await expect.poll(() => page.evaluate(() => (window as unknown as { geoCalls: number }).geoCalls)).toBe(2)
  await expect(page.getByTestId('daily-generate')).toBeEnabled()
  await expect(page.getByRole('status').filter({ hasText: '無法使用目前位置' })).toBeVisible()
  await expect(page.getByRole('heading', { name: '原本的咖啡店' })).toBeVisible()
  expect(sent).toHaveLength(0)
})
