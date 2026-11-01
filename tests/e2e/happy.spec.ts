// 第 13.2 節 Happy ×7：每卡 home→intake→「是！班長」→cmd 出現 .meme .big 非空。
import { expect, test } from '@playwright/test'
import { mockOrder, prime, openCard } from './fixtures.ts'

// Round 3：先設好同意旗標，免得被首次同意畫面擋住。
test.beforeEach(async ({ page }) => { await prime(page) })

const CARDS = ['eat', 'go', 'attend', 'rest', 'sleep', 'reply', 'buy', 'travel'] as const

test.use({ geolocation: { latitude: 25.033, longitude: 121.5654 }, permissions: ['geolocation'] })

for (const id of CARDS) {
  test(`happy：${id} 可從首頁走到口令畫面`, async ({ page }) => {
    await mockOrder(page)
    await page.goto('/')
    await expect(page.locator('[data-screen="home"]')).toBeVisible()

    await openCard(page, id)
    await expect(page.locator('[data-screen="intake"]')).toBeVisible()

    await page.getByRole('button', { name: '是！班長' }).click()
    await expect(page.locator('[data-screen="cmd"]')).toBeVisible()

    const big = page.getByTestId('meme-big')
    await expect(big).toBeVisible()
    expect((await big.textContent())?.trim().length).toBeGreaterThan(0)

    await expect(page.getByTestId('steps').locator('p').first()).toBeVisible()
  })
}

test('首頁：班長在最上面、4 磁貼 + 4 小鍵', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.officer')).toBeVisible()
  await expect(page.locator('.grid .tile')).toHaveCount(4)
  await expect(page.locator('.minor button')).toHaveCount(4)
})

test('點頭像換班長，三段火力循環', async ({ page }) => {
  await page.goto('/')
  const name = page.getByTestId('officer-name')
  await expect(name).toHaveText('黑面') // 預設中檔
  await page.locator('.officer .av').click()
  await expect(name).toHaveText('老郭')
  await page.locator('.officer .av').click()
  await expect(name).toHaveText('阿良')
  await page.locator('.officer .av').click()
  await expect(name).toHaveText('黑面')
})

test('attend 的星星可以點，選擇會送進 API', async ({ page }) => {
  let sent: Record<string, unknown> | undefined
  await page.route('**/api/order', async (route) => {
    sent = route.request().postDataJSON()
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      verdict: 'stop', meme: { top: 'a', big: '不去。', bot: 'c' }, steps: ['傳一句話給他。'], log: 'x',
    }) })
  })
  await page.goto('/')
  await page.locator('[data-card="attend"]').click()
  await page.locator('[data-field="stars"] button').nth(1).click() // ★2
  await page.locator('[data-field="occasion"] button', { hasText: '飯局' }).click()
  await page.getByRole('button', { name: '是！班長' }).click()
  await expect(page.locator('[data-screen="cmd"]')).toBeVisible()
  expect(sent?.choices).toMatchObject({ stars: 2, occasion: '飯局' })
  await expect(page.getByTestId('meme')).toHaveClass(/red/) // stop = 紅卡
})
