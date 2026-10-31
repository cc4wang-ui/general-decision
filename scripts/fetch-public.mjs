/**
 * build 前補齊 public/（Round 4）。
 *
 * 為什麼：GitHub 推送被擋時，改從容器直接上傳到 Vercel（Cross 2026-10-31 拍板）。38 個圖檔不重傳，
 * 改在 build 時從正式站下載，逐檔比對 SHA1（scripts/public-manifest.json），對不上就讓 build 失敗。
 * 一般 git 部署與本機 build：檔案都在、SHA1 都對 → 什麼都不做，也不連網路。
 *
 *   node scripts/fetch-public.mjs            # 只補缺的
 *   node scripts/fetch-public.mjs --write    # 重寫 manifest（改了 public/ 之後要跑）
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const MANIFEST = join(ROOT, 'scripts', 'public-manifest.json')
const ORIGIN = process.env.PUBLIC_ASSET_ORIGIN ?? 'https://general-decision.vercel.app'
const sha1 = (buf) => createHash('sha1').update(buf).digest('hex')

if (process.argv.includes('--write')) {
  const files = execFileSync('git', ['ls-files', 'public'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean)
  const m = Object.fromEntries(files.map((f) => { const b = readFileSync(join(ROOT, f)); return [f, { sha1: sha1(b), size: b.length }] }))
  writeFileSync(MANIFEST, JSON.stringify(m, null, 1) + '\n')
  console.log(`public-manifest：${files.length} 個檔`)
  process.exit(0)
}

const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'))
const missing = Object.entries(manifest).filter(([f, { sha1: want }]) => {
  const p = join(ROOT, f)
  return !existsSync(p) || sha1(readFileSync(p)) !== want
})
if (missing.length === 0) process.exit(0)

console.log(`public/ 缺 ${missing.length} 個檔，從 ${ORIGIN} 補`)
let failed = 0
for (const [f, { sha1: want, size }] of missing) {
  const url = `${ORIGIN}/${f.replace(/^public\//, '')}`
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20_000) })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.length !== size || sha1(buf) !== want) throw new Error(`內容對不上（${buf.length} bytes，sha1 ${sha1(buf)}）`)
    mkdirSync(dirname(join(ROOT, f)), { recursive: true })
    writeFileSync(join(ROOT, f), buf)
  } catch (e) {
    console.error(`  FAIL ${f}：${e.message}`)
    failed++
  }
}
if (failed) {
  console.error(`public/ 有 ${failed} 個檔補不齊，停止 build。`)
  process.exit(1)
}
console.log('public/ 補齊。')
