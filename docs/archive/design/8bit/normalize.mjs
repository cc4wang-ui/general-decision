// 把 AI 算出來的「像素風」圖拉回真正的 48×48 像素格線。
//
//   node design/8bit/normalize.mjs <輸入圖> <lv 0|1|2> [輸出路徑]
//   node design/8bit/normalize.mjs ~/Downloads/heimian-bark.png 1
//
// 做三件事：
//   1. 用最近鄰縮到 48×48（消掉 AI 的抗鋸齒與歪掉的格線）
//   2. 每一格吸附到該角色調色盤最近的顏色（消掉多餘色）
//   3. 去背：把接近背景色的格子變透明
//
// 需要 chromium（專案已裝 @playwright/test）。輸出 PNG，48×48，透明背景。
import { chromium } from '@playwright/test'
import { readFileSync, writeFileSync } from 'node:fs'
import { basename, extname } from 'node:path'
import { PALETTES } from '../sprites.mjs'

const [input, lvArg, outArg] = process.argv.slice(2)
if (!input || lvArg === undefined) {
  console.error('用法：node design/8bit/normalize.mjs <輸入圖> <lv 0|1|2> [輸出路徑]')
  process.exit(1)
}
const lv = Number(lvArg)
if (![0, 1, 2].includes(lv)) { console.error('lv 必須是 0、1 或 2'); process.exit(1) }

const P = PALETTES[lv]
const ALLOWED = [...new Set(['#000000', ...Object.values(P)])]
const out = outArg ?? basename(input, extname(input)) + '-48.png'

const dataUrl = `data:image/png;base64,${readFileSync(input).toString('base64')}`

const browser = await chromium.launch()
const page = await browser.newPage()
const png = await page.evaluate(async ({ dataUrl, allowed }) => {
  const img = new Image()
  img.src = dataUrl
  await img.decode()

  // ── 1. 最近鄰縮到 48×48 ──────────────────────────────────────
  // 先把來源裁成正方形（取中央），避免比例失真。
  const side = Math.min(img.width, img.height)
  const sx = (img.width - side) / 2, sy = (img.height - side) / 2
  const c = document.createElement('canvas')
  c.width = c.height = 48
  const ctx = c.getContext('2d', { willReadFrequently: true })
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(img, sx, sy, side, side, 0, 0, 48, 48)
  const d = ctx.getImageData(0, 0, 48, 48)

  const hex2rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
  const pal = allowed.map(hex2rgb)

  // 背景色 = 四個角落的眾數，用來去背
  const corner = [[0, 0], [47, 0], [0, 47], [47, 47]].map(([x, y]) => {
    const i = (y * 48 + x) * 4
    return [d.data[i], d.data[i + 1], d.data[i + 2]]
  })
  const bg = corner[0]
  const hasTransparentCorner = [[0,0],[47,0],[0,47],[47,47]].some(([x,y])=>d.data[(y*48+x)*4+3]<128)

  for (let i = 0; i < d.data.length; i += 4) {
    const r = d.data[i], g = d.data[i + 1], b = d.data[i + 2], a = d.data[i + 3]
    // ── 3. 去背 ──
    const dBg = (r - bg[0]) ** 2 + (g - bg[1]) ** 2 + (b - bg[2]) ** 2
    if (a < 128 || (!hasTransparentCorner && dBg < 900)) { d.data[i + 3] = 0; continue }
    // ── 2. 吸附到調色盤 ──
    let best = 0, bestD = Infinity
    pal.forEach(([pr, pg, pb], k) => {
      const dd = (r - pr) ** 2 + (g - pg) ** 2 + (b - pb) ** 2
      if (dd < bestD) { bestD = dd; best = k }
    })
    d.data[i] = pal[best][0]; d.data[i + 1] = pal[best][1]; d.data[i + 2] = pal[best][2]
    d.data[i + 3] = 255
  }
  ctx.putImageData(d, 0, 0)
  return c.toDataURL('image/png').split(',')[1]
}, { dataUrl, allowed: ALLOWED })

await browser.close()
writeFileSync(out, Buffer.from(png, 'base64'))
console.log(`→ ${out}（48×48，調色盤鎖到 ${ALLOWED.length} 色，已去背）`)
console.log('  下一步：目視檢查。AI 圖縮完通常需要人工補幾格，尤其是眼睛與帽徽。')
