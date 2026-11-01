// Round 5（Cross 2026-11-01）：吃／歇第一步先選情境（預設＋「其他」手動輸入）；「沒做」先問原因，不符合情境不罰站。
import { expect, test, type Page } from '@playwright/test'
import { FIXED_ORDER, SECOND_ORDER, captureOrders, openCard, pickScene, prime } from './fixtures.ts'

test.beforeEach(async ({ page }) => { await prime(page) })
test.use({ geolocation: { latitude: 25.033, longitude: 121.5654 }, permissions: ['geolocation'] })

type Trial = { module: string; ok: boolean; placeId?: string; outcome?: string; choices?: Record<string, string> }
const trialOf = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('decide.trial.v1') ?? '[]') as Trial[])
const sceneChips = (page: Page) => page.locator('[data-screen="scene"] [data-field="scene"] .chip')
const submit = (page: Page) => page.getByRole('button', { name: '是！班長' })

test('R5 吃：點卡片先到情境頁（必選、沒有預選、≥ 5 種＋其他）；點「外帶」直接進原本的選單，送出帶 scene', async ({ page }) => {
  const sent = await captureOrders(page)
  await page.goto('/')
  await page.locator('[data-card="eat"]').click()
  await expect(page.locator('[data-screen="scene"]')).toBeVisible()
  await expect(page.locator('[data-screen="intake"]')).toHaveCount(0)
  await expect(sceneChips(page)).toHaveText(['一個人快吃', '外帶', '朋友聚餐', '約會吃好一點', '宵夜', '其他'])
  for (const c of await sceneChips(page).all()) await expect(c).toHaveAttribute('aria-pressed', 'false')

  await page.getByRole('button', { name: '外帶', exact: true }).click()
  await expect(page.locator('[data-screen="intake"]')).toBeVisible()
  await expect(page.getByTestId('scene-change')).toContainText('情境：外帶')
  await expect(page.locator('[data-field="diet"]')).toBeVisible()
  await submit(page).click()
  await expect(page.locator('[data-screen="cmd"]')).toBeVisible()
  expect(sent[0]?.choices).toMatchObject({ scene: '外帶' })
  expect((sent[0]?.choices as Record<string, unknown>).sceneText).toBeUndefined()
})

test('R5 吃「其他」：沒寫字不能下一步；超過 20 字截掉；寫了才進選單，送出帶 sceneText', async ({ page }) => {
  const sent = await captureOrders(page)
  await page.goto('/')
  await openCard(page, 'eat', '其他')
  const input = page.getByTestId('scene-text')
  await expect(input).toBeVisible()
  await expect(page.getByTestId('scene-next')).toBeDisabled()
  await expect(page.getByTestId('scene-required')).toBeVisible()
  await input.fill('   ')
  await expect(page.getByTestId('scene-next')).toBeDisabled()
  await input.fill('想吃有冷氣的、安靜的、可以久坐的地方吃到飽')
  expect([...(await input.inputValue())].length).toBeLessThanOrEqual(20)
  await page.getByTestId('scene-next').click()
  await expect(page.locator('[data-screen="intake"]')).toBeVisible()
  await submit(page).click()
  await expect(page.locator('[data-screen="cmd"]')).toBeVisible()
  const ch = sent[0]?.choices as Record<string, string>
  expect(ch.scene).toBe('其他')
  expect(ch.sceneText.length).toBeGreaterThan(0)
  expect([...ch.sceneText].length).toBeLessThanOrEqual(20)
})

test('R5 上次選的排第一個，但不預選；「改」回情境頁，換情境後其他選項保留', async ({ page }) => {
  const sent = await captureOrders(page, [FIXED_ORDER, SECOND_ORDER])
  await page.goto('/')
  await openCard(page, 'eat', '宵夜')
  await page.locator('[data-field="diet"]').getByRole('button', { name: '不吃牛' }).click()
  await page.getByTestId('scene-change').click()
  await expect(page.locator('[data-screen="scene"]')).toBeVisible()
  await expect(sceneChips(page).filter({ hasText: /^宵夜$/ })).toHaveAttribute('aria-pressed', 'true')
  await pickScene(page, '一個人快吃')
  await expect(page.locator('[data-field="diet"]').getByRole('button', { name: '不吃牛' })).toHaveAttribute('aria-pressed', 'true')
  await submit(page).click()
  await expect(page.locator('[data-screen="cmd"]')).toBeVisible()
  expect(sent[0]?.choices).toMatchObject({ scene: '一個人快吃', diet: '不吃牛' })

  await page.goto('/')
  await page.locator('[data-card="eat"]').click()
  await expect(sceneChips(page).first()).toHaveText('一個人快吃')
  await expect(sceneChips(page).first()).toHaveAttribute('aria-pressed', 'false')
  await expect(submit(page)).toHaveCount(0) // 還在第一步
})

test('R5 沒做 →「不符合我現在的情境」：不罰站、回情境頁重選、這家這次排除；日記標「不符情境」、服從率不扣', async ({ page }) => {
  const sent = await captureOrders(page, [FIXED_ORDER, SECOND_ORDER])
  await page.goto('/')
  await openCard(page, 'eat', '朋友聚餐')
  await submit(page).click()
  await expect(page.locator('[data-screen="cmd"]')).toBeVisible()
  await page.getByRole('button', { name: '沒做' }).click()
  await expect(page.getByTestId('skip-sheet')).toBeVisible()
  await page.getByTestId('skip-mismatch').click()

  await expect(page.locator('[data-screen="stand"]')).toHaveCount(0)
  await expect(page.locator('[data-screen="scene"]')).toBeVisible()
  for (const c of await sceneChips(page).all()) await expect(c).toHaveAttribute('aria-pressed', 'false')
  const trial = await trialOf(page)
  expect(trial.find((e) => e.placeId === 'p1')).toMatchObject({ outcome: 'mismatch', choices: { scene: '朋友聚餐' } })

  await pickScene(page, '一個人快吃')
  await submit(page).click()
  await expect(page.getByTestId('meme-big')).toHaveText('巷口牛肉麵')
  expect(sent[1]?.choices).toMatchObject({ scene: '一個人快吃' })
  expect(sent[1]?.exclude).toEqual(['p1'])
  await page.getByRole('button', { name: '報告班長，完成' }).click()
  await expect(page.locator('[data-screen="log"]')).toBeVisible()
  await page.getByRole('button', { name: '解散' }).click()

  await page.getByRole('button', { name: '新兵日記' }).click()
  await expect(page.getByTestId('entry')).toHaveCount(2)
  await expect(page.getByTestId('entry').filter({ hasText: '不符情境' })).toHaveCount(1)
  await expect(page.getByTestId('stat-orders')).toHaveText('2')
  await expect(page.getByTestId('stat-rate')).toHaveText('100%') // 不符情境不算進分母
  await expect(page.getByTestId('stat-punish')).toHaveText('0')
})

test('R5 沒做 →「我就是不想做」：照舊罰站、記罰則', async ({ page }) => {
  await captureOrders(page)
  await page.goto('/')
  await openCard(page, 'rest', '工作讀書')
  await submit(page).click()
  await expect(page.locator('[data-screen="cmd"]')).toBeVisible()
  await page.getByRole('button', { name: '沒做' }).click()
  await page.getByTestId('skip-refuse').click()
  await expect(page.locator('[data-screen="stand"]')).toBeVisible()
  expect((await trialOf(page)).find((e) => e.placeId === 'p1')?.outcome).toBe('punished')
})

test('R5 沒做 →「我再想想」：收起選單，口令還在', async ({ page }) => {
  await captureOrders(page)
  await page.goto('/')
  await openCard(page, 'eat')
  await submit(page).click()
  await page.getByRole('button', { name: '沒做' }).click()
  await page.getByTestId('skip-cancel').click()
  await expect(page.getByTestId('skip-sheet')).toHaveCount(0)
  await expect(page.locator('[data-screen="cmd"]')).toBeVisible()
})

test('R5 其他卡片不問情境、沒做直接罰站（行為不變）', async ({ page }) => {
  await captureOrders(page)
  await page.goto('/')
  await page.locator('[data-card="sleep"]').click()
  await expect(page.locator('[data-screen="intake"]')).toBeVisible()
  await expect(page.getByTestId('scene-change')).toHaveCount(0)
  await submit(page).click()
  await page.getByRole('button', { name: '沒做' }).click()
  await expect(page.locator('[data-screen="stand"]')).toBeVisible()
})

test('R5 歇：情境有「等人」等 5 種＋其他；375×667 情境頁一屏放得下、按鈕夠大', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 })
  await page.goto('/')
  await page.locator('[data-card="rest"]').click()
  await expect(sceneChips(page)).toHaveText(['一個人放空', '工作讀書', '朋友聊天', '談事情', '等人', '其他'])
  for (const c of await sceneChips(page).all()) {
    await expect(c).toBeInViewport({ ratio: 1 })
    const box = (await c.boundingBox())!
    expect(box.height).toBeGreaterThanOrEqual(47.5)
  }
  await page.getByRole('button', { name: '其他', exact: true }).click()
  await expect(page.getByTestId('scene-next')).toBeInViewport({ ratio: 1 })
})
