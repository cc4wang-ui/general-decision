// 產出各畫面截圖（npm run e2e:shots → shots/*.png），供人工看版面。2026-11 改版後共 11 張。
import { expect, test } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { openCard, prime, refuseOrder } from '../e2e/fixtures.ts'

const DIR = 'shots'
const WEEKLY = {
  weekStart: '2026-09-07T00:00:00.000Z',
  level: 1,
  stats: { orders: 11, complianceRate: 82, punishments: 2, weakestModule: 'rest' },
  body: '本週十一道口令，九道完成，兩次罰則。\n\n發現規律了沒？你只在「不用出門」的事情上偷懶。餐廳你去了，飯局你去了，象山你也爬了。\n\n下週歇的口令改成「站起來再說」。',
  verdict: '本週講評：合格。屁股記過一次。',
}
const EAT = {
  verdict: 'do',
  meme: { top: '去吃熱的', big: '阿財魯肉飯', bot: '這週兩天超商了' },
  steps: ['步行 6 分鐘，營業到 21:00。', '魯肉飯、滷蛋、燙青菜。', '12 分鐘吃完，手機收起來。'],
  place: { id: 'p1', name: '阿財魯肉飯', walkMin: 6, openUntil: '21:00' },
  log: '12:41 魯肉飯，12:58 完成。',
}
const BUY = {
  verdict: 'stop',
  meme: { top: '本週第二次猶豫', big: '不買。', bot: '72 小時後再來報告' },
  steps: ['關掉頁面。', '72 小時後還想要，再來報告。'],
  log: '不買，頁面已關。',
}

test.use({ geolocation: { latitude: 25.033, longitude: 121.5654 }, permissions: ['geolocation'] })

test.beforeAll(() => mkdirSync(DIR, { recursive: true }))
test.beforeEach(async ({ page }) => { await prime(page) })

const shot = async (page: import('@playwright/test').Page, name: string) => {
  await page.waitForTimeout(250) // 等字體與 SVG 落定
  await page.screenshot({ path: `${DIR}/${name}.png`, fullPage: true })
}

async function route(page: import('@playwright/test').Page, order: unknown) {
  await page.route('**/api/order', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(order) }))
  await page.route('**/api/weekly', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(WEEKLY) }))
}

test('01-home', async ({ page }) => {
  await route(page, EAT)
  await page.goto('/')
  await expect(page.locator('[data-screen="home"]')).toBeVisible()
  await shot(page, '01-home')
})

test('02-intake-attend', async ({ page }) => {
  await route(page, EAT)
  await page.goto('/')
  await page.locator('[data-card="attend"]').click()
  await expect(page.locator('[data-screen="intake"]')).toBeVisible()
  await shot(page, '02-intake-attend')
})

test('03-cmd-eat', async ({ page }) => {
  await route(page, EAT)
  await page.goto('/')
  await openCard(page, 'eat')
  await page.getByRole('button', { name: '是！班長' }).click()
  await expect(page.getByTestId('meme-big')).toHaveText('阿財魯肉飯')
  await shot(page, '03-cmd-eat')
})

test('04-cmd-buy', async ({ page }) => {
  await route(page, BUY)
  await page.goto('/')
  await page.locator('[data-card="buy"]').click()
  await page.getByRole('button', { name: '是！班長' }).click()
  await expect(page.getByTestId('meme')).toHaveClass(/red/)
  await shot(page, '04-cmd-buy')
})

test('05-log', async ({ page }) => {
  await route(page, EAT)
  await page.goto('/')
  await openCard(page, 'eat')
  await page.getByRole('button', { name: '是！班長' }).click()
  await page.getByRole('button', { name: '報告班長，完成' }).click()
  await expect(page.locator('[data-screen="log"]')).toBeVisible()
  await shot(page, '05-log')
})

test('06-stand', async ({ page }) => {
  await route(page, EAT)
  await page.goto('/')
  await openCard(page, 'eat')
  await page.getByRole('button', { name: '是！班長' }).click()
  await refuseOrder(page)
  await expect(page.locator('[data-screen="stand"]')).toBeVisible()
  await shot(page, '06-stand')
})

test('07-weekly', async ({ page }) => {
  await route(page, EAT)
  await page.goto('/')
  await page.getByRole('button', { name: '新兵日記' }).click()
  await page.getByRole('button', { name: '看本週莒光園地' }).click()
  await expect(page.getByTestId('weekly-body')).toBeVisible()
  await shot(page, '07-weekly')
})

test('08-diary', async ({ page }) => {
  await route(page, EAT)
  await page.goto('/')
  await page.getByRole('button', { name: '新兵日記' }).click()
  await expect(page.locator('[data-screen="diary"]')).toBeVisible()
  await shot(page, '08-diary')
})

test('09-daily', async ({ page }) => {
  await route(page, EAT)
  await page.goto('/')
  await page.getByTestId('daily-entry').click()
  await expect(page.locator('.dd')).toBeVisible()
  await shot(page, '09-daily')
})

test('10-privacy', async ({ page }) => {
  await route(page, EAT)
  await page.goto('/')
  await page.getByTestId('privacy-link').click()
  await expect(page.locator('[data-screen="privacy"]')).toBeVisible()
  await shot(page, '10-privacy')
})

test('11-consent', async ({ page }) => {
  await page.addInitScript(() => localStorage.removeItem('decide.consent'))
  await page.goto('/')
  await expect(page.getByTestId('consent')).toBeVisible()
  await shot(page, '11-consent')
})

test.describe('深色', () => {
  test.use({ colorScheme: 'dark' })
  test('12-home-dark', async ({ page }) => {
    await route(page, EAT)
    await page.goto('/')
    await expect(page.locator('[data-screen="home"]')).toBeVisible()
    await shot(page, '12-home-dark')
  })
})
