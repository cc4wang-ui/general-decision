// Round 3 B18、T10：口令畫面 375×667 不捲動就看得到
// 店名連結、步行分鐘、營業到幾點（或幾點開）、價位文字（或「價位未知」）、Google Maps 歸屬。
import { expect, test, type Page } from '@playwright/test'
import { FIXED_ORDER, mockOrder, prime, openCard } from './fixtures.ts'

test.beforeEach(async ({ page }) => {
  await prime(page)
  await page.setViewportSize({ width: 375, height: 667 })
})
test.use({ geolocation: { latitude: 25.033, longitude: 121.5654 }, permissions: ['geolocation'] })

const MAP = 'https://www.google.com/maps/search/?api=1&query=x&query_place_id=ChIJxxx'
const withPlace = (place: Record<string, unknown>) => ({ ...FIXED_ORDER, place: { ...FIXED_ORDER.place, mapUrl: MAP, ...place } })

async function toCmd(page: Page, level = 1) {
  if (level !== 1) await page.addInitScript((l) => localStorage.setItem('decide.level', String(l)), level)
  await page.goto('/')
  await openCard(page, 'eat')
  await page.getByRole('button', { name: '是！班長' }).click()
  await expect(page.locator('[data-screen="cmd"]')).toBeVisible()
}

async function expectAllInView(page: Page) {
  for (const id of ['place-link', 'place-meta', 'attribution']) {
    await expect(page.getByTestId(id), id).toBeInViewport({ ratio: 1 })
  }
}

test('B18 有價位：店名連結、步行、營業到、價位、Google Maps 都在第一屏', async ({ page }) => {
  await mockOrder(page, [withPlace({})])
  await toCmd(page)
  await expect(page.getByTestId('place-link')).toHaveText('阿財魯肉飯')
  await expect(page.getByTestId('place-link')).toHaveAttribute('href', MAP)
  await expect(page.getByTestId('place-meta')).toHaveText('步行 6 分 · 營業到 21:00 · ≈NT$150–400')
  await expect(page.getByTestId('attribution')).toHaveText('Google Maps')
  await expect(page.getByTestId('attribution')).toHaveAttribute('translate', 'no')
  await expectAllInView(page)
})

test('B18 價位沒資料 → 寫「價位未知」；還沒開門 → 「HH:MM 開」', async ({ page }) => {
  await mockOrder(page, [withPlace({ priceText: undefined, band: null, openUntil: undefined, opensAt: '11:30' })])
  await toCmd(page)
  await expect(page.getByTestId('place-meta')).toHaveText('步行 6 分 · 11:30 開 · 價位未知')
  await expectAllInView(page)
})

test('B18 只有 Google 的價位描述時，照抄不換算', async ({ page }) => {
  await mockOrder(page, [withPlace({ priceText: '平價' })])
  await toCmd(page)
  await expect(page.getByTestId('place-meta')).toHaveText('步行 6 分 · 營業到 21:00 · 平價')
})

for (const level of [0, 2]) {
  test(`B18 另外兩位班長（lv${level}，邊框與字重不同）版面一樣放得下`, async ({ page }) => {
    await mockOrder(page, [withPlace({})])
    await toCmd(page, level)
    await expectAllInView(page)
  })
}

test('回報這道口令是小連結（信箱未填 → GitHub issue），不是第二個動作鍵', async ({ page }) => {
  await mockOrder(page, [withPlace({})])
  await toCmd(page)
  const a = page.getByTestId('report-link')
  await expect(a).toHaveText('回報這道口令')
  const href = (await a.getAttribute('href'))!
  expect(href.startsWith('https://github.com/crosswang-collab/general-decision/issues/new?title=')).toBe(true)
  expect(href).not.toContain('ChIJ') // 不含店家代碼
})
