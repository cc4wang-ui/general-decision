// Round 10 X2：「去」卡查真地點。前端：要定位才送、送交通與可接受、搭車不顯示步行、「路封了」直接換（不開吃／歇的原因選單）並排除剛派的地點。
import { expect, test } from '@playwright/test'
import { FIXED_ORDER, captureOrders, prime } from './fixtures.ts'

test.beforeEach(async ({ page }) => { await prime(page) })

const TAIPEI = { latitude: 25.033, longitude: 121.5654 }
const map = (id: string) => `https://www.google.com/maps/search/?api=1&query=x&query_place_id=${id}`
const PARK = {
  ...FIXED_ORDER,
  meme: { top: '偵察任務，目標這家', big: '大安森林公園', bot: '動作快' },
  steps: ['搭捷運過去，單程 30 分內。', '到了走一圈，手機收起來。', '21:00 前回家。'],
  place: { id: 'g1', name: '大安森林公園', mapUrl: map('g1'), openUntil: '23:59', mode: 'wildcard', visits: 1, band: null, country: 'TW', cuisine: 'other' },
}
const MUSEUM = { ...PARK, meme: { ...PARK.meme, big: '台北市立美術館' }, place: { ...PARK.place, id: 'g2', name: '台北市立美術館', mapUrl: map('g2') } }

test.describe('定位在台北', () => {
  test.use({ geolocation: TAIPEI, permissions: ['geolocation'] })

  test('送出定位、交通、可接受；搭車的地點列不寫步行；「路封了」直接換、排除剛派的地點', async ({ page }) => {
    const sent = await captureOrders(page, [PARK, MUSEUM])
    await page.goto('/')
    await page.locator('[data-card="go"]').click()
    await page.locator('[data-field="transport"] .chip').filter({ hasText: /^捷運$/ }).click()
    await page.locator('[data-field="minutes"] .chip').filter({ hasText: /^30 分$/ }).click()
    await page.getByRole('button', { name: '是！班長' }).click()

    await expect(page.locator('[data-screen="cmd"]')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByTestId('place-link')).toHaveText('大安森林公園')
    await expect(page.getByTestId('place-link')).toHaveAttribute('href', map('g1'))
    await expect(page.getByTestId('place-meta')).not.toContainText('步行')
    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({ module: 'go', choices: { transport: '捷運', minutes: '30 分' }, loc: { lat: TAIPEI.latitude, lng: TAIPEI.longitude } })

    await page.getByTestId('reissue').click()
    await expect(page.getByTestId('reason-sheet')).toHaveCount(0)
    await expect(page.getByTestId('place-link')).toHaveText('台北市立美術館')
    expect(sent).toHaveLength(2)
    expect(sent[1]!.exclude).toEqual(['g1'])
  })
})

test('定位被拒 → 去也要座標，不打 API', async ({ page, context }) => {
  await context.clearPermissions()
  const sent = await captureOrders(page, [PARK])
  await page.goto('/')
  await page.locator('[data-card="go"]').click()
  await page.getByRole('button', { name: '是！班長' }).click()
  await expect(page.locator('[data-screen="error"]')).toBeVisible({ timeout: 15_000 })
  await expect(page.getByTestId('error-line')).toContainText('不報座標')
  expect(sent).toHaveLength(0)
})
