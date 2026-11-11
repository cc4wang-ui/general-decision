// X7：3 天連勝 → 首頁看得到連勝與階級章，第一屏版面不破；日記頁有連勝卡。
import { expect, test, type Locator, type Page } from '@playwright/test'
import { prime } from './fixtures.ts'

test.beforeEach(async ({ page }) => { await prime(page) })

/** 寫入「今天往前 n 天」各一筆完成的日記（用手機本機日期，跟 app 用的 Asia/Taipei 在測試機 TZ=Asia/Taipei 下一致）。 */
async function seedDone(page: Page, daysBack: number[]) {
  await page.goto('/')
  await expect(page.locator('[data-screen="home"]')).toBeVisible()
  await page.evaluate((offsets) => new Promise<void>((resolve, reject) => {
    const list = offsets.map((n) => {
      const t = new Date(Date.now() - n * 24 * 3600 * 1000)
      t.setHours(12, 0, 0, 0)
      const ts = t.toISOString()
      return { id: `${ts}-eat`, ts, module: 'eat', level: 1, big: '魯肉飯', outcome: 'done' }
    })
    const r = indexedDB.open('keyval-store')
    r.onerror = () => reject(r.error)
    r.onsuccess = () => {
      const tx = r.result.transaction('keyval', 'readwrite')
      tx.objectStore('keyval').put(list, 'decide.entries')
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    }
  }), daysBack)
  await page.reload()
  await expect(page.locator('[data-screen="home"]')).toBeVisible()
}

/**
 * 格子在整頁上的位置（viewport 座標＋scrollY）：動畫跑完、字型與圖片載完，再量到連續兩次一樣（最多等 3 秒）。
 * 重新載入後瀏覽器有時把頁面捲動 1–2 px（scrollY=1／2，頁高 761 > 視窗 664），viewport 座標會跟著差，格子本身沒動。
 */
async function stableBox(page: Page, loc: Locator) {
  await page.evaluate(async () => {
    await document.fonts.ready
    await Promise.all([...document.images].filter((i) => !i.complete).map((i) => new Promise((r) => { i.onload = i.onerror = r })))
    // 無限循環的動畫（班長頭像的呼吸）永遠不會 finished，也不影響版面，不等它。
    await Promise.all(document.getAnimations()
      .filter((a) => a.effect?.getComputedTiming().iterations !== Infinity)
      .map((a) => a.finished.catch(() => undefined)))
  })
  let prev = await loc.boundingBox()
  for (let i = 0; i < 30; i++) {
    await page.waitForTimeout(100)
    const cur = await loc.boundingBox()
    if (cur && prev && cur.y === prev.y && cur.height === prev.height) break
    prev = cur
  }
  const box = await loc.boundingBox()
  return box && { ...box, y: box.y + (await page.evaluate(() => window.scrollY)) }
}

test('3 天連勝：首頁有連勝與階級章，格子位置不被擠動；日記頁有連勝卡', async ({ page }) => {
  await page.goto('/')
  const grid = page.locator('[data-screen="home"] .grid')
  await expect(grid).toBeVisible()
  // Round 12（checker 2026-11-05 全套量到 2.77 px，重跑約 1／10 失敗）：兩個原因——`.screen` 0.18 秒 translateY(6px) 進場動畫中途量到；
  // 重新載入後頁面被捲動 1–2 px。改成等版面停住、用整頁座標比。容許值 2 px 不放寬。
  const before = await stableBox(page, grid)
  await expect(page.getByTestId('streak-chip')).toHaveCount(0)

  await seedDone(page, [0, 1, 2])
  const chip = page.getByTestId('streak-chip')
  await expect(chip).toContainText('連勝 3 天')
  await expect(chip.locator('svg.insignia')).toBeVisible()

  const after = await stableBox(page, grid)
  expect(Math.abs(after!.y - before!.y)).toBeLessThan(2) // 容許字型載入造成的次像素差
  expect(Math.abs(after!.height - before!.height)).toBeLessThan(2)
  const vh = page.viewportSize()!.height
  const last = await page.locator('[data-screen="home"] .minor').boundingBox()
  expect(last!.y + last!.height).toBeLessThanOrEqual(vh)

  await page.getByRole('button', { name: '新兵日記' }).click()
  const card = page.getByTestId('streak-card')
  await expect(card).toContainText('出勤連勝 3 天')
  await expect(card).toContainText('下士')
  await expect(card.locator('svg.insignia')).toBeVisible()
})
