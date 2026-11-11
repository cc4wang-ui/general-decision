/**
 * App 圖示產生器：把 public/icons/*.png 與 public/favicon.svg 從班長插畫重新輸出。
 *
 * 構圖（2026-11 改版）：黃底＋值星班長黑面下口令的臉。插畫直接取自 src/avatarSvg.ts，
 * 所以人物改版後重跑這支，圖示就跟著換。
 *
 *   node scripts/build-icons.mjs
 *
 * 需要 Node 22.18 以上（直接 import .ts）與 Playwright 的 Chromium。
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { chromium } from '@playwright/test'
import { avatarSvg } from '../src/avatarSvg.ts'

const ROOT = resolve(import.meta.dirname, '..')
const OUT = join(ROOT, 'public', 'icons')

const BG = '#FFC93C'
/** 把 120×120 的頭像放大、往下推，讓臉佔滿圖示。zoom 越大臉越大。 */
/** cx 往右偏一點，讓右邊的吼叫線不貼邊。size 是輸出的 width／height 屬性。 */
const art = (zoom, size = '100%') => avatarSvg(1, 'bark')
  .replace('viewBox="0 0 120 120"', `viewBox="${66 - 60 / zoom} ${58 - 60 / zoom} ${120 / zoom} ${120 / zoom}" width="${size}" height="${size}"`)

/** @param {number} size @param {number} inset 可遮罩版要把圖縮進安全區 */
const page = (size, inset) => `<!doctype html><meta charset="utf-8"><style>
  *{margin:0;padding:0}html,body{width:${size}px;height:${size}px;overflow:hidden;background:${BG}}
  svg{display:block}
</style>${art(inset > 0.1 ? 1.05 : 1.2)}`

const TARGETS = [
  { file: 'icon-192.png', size: 192, inset: 0.04 },
  { file: 'icon-512.png', size: 512, inset: 0.04 },
  { file: 'apple-touch-icon.png', size: 180, inset: 0.04 },
  // maskable：作業系統會裁切外圈，圖必須縮進中央 80% 的安全區。
  { file: 'icon-512-maskable.png', size: 512, inset: 0.14 },
]

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
})
try {
  mkdirSync(OUT, { recursive: true })
  for (const t of TARGETS) {
    const p = await browser.newPage({ viewport: { width: t.size, height: t.size }, deviceScaleFactor: 1 })
    await p.setContent(page(t.size, t.inset))
    const buf = await p.screenshot({ type: 'png' })
    const dest = join(OUT, t.file)
    mkdirSync(dirname(dest), { recursive: true })
    writeFileSync(dest, buf)
    await p.close()
    console.log(`  ok   ${t.file} (${t.size}×${t.size})`)
  }
} finally {
  await browser.close()
}

// favicon：同一張圖的向量版，圓角方形。
writeFileSync(join(ROOT, 'public', 'favicon.svg'), art(1.2, '64') + '\n')
console.log('  ok   favicon.svg')
