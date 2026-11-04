/**
 * 直傳 Vercel 用（Round 4，Cross 2026-10-31 拍板）：把 deploy/bundle-*.json.gz 解開成檔案，逐檔驗 SHA1。
 *
 * 為什麼：GitHub 推送被擋，改從容器直接上傳到 cc4wang 的 Vercel。原始碼一個一個傳太大，
 * 改成壓縮包；npm install 完（postinstall）就解開，所有 build 步驟都在這之後，看得到完整的 src/。
 * 一般 git 部署與本機：沒有 deploy/ 目錄 → 什麼都不做。
 * 檔名排序後依序解開，後面的覆蓋前面的（bundle-0-common 之後才是 bundle-1-*）。
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, normalize, resolve } from 'node:path'
import { gunzipSync } from 'node:zlib'

const ROOT = resolve(import.meta.dirname, '..')
const DIR = join(ROOT, 'deploy')
if (!existsSync(DIR)) process.exit(0)

const sha1 = (s) => createHash('sha1').update(s).digest('hex')
for (const name of readdirSync(DIR).filter((n) => /^bundle-.+\.json\.gz$/.test(n)).sort()) {
  const files = JSON.parse(gunzipSync(readFileSync(join(DIR, name))).toString('utf8'))
  for (const [p, { sha1: want, text }] of Object.entries(files)) {
    if (isAbsolute(p) || normalize(p).startsWith('..')) throw new Error(`${name}：不合法的路徑 ${p}`)
    if (sha1(text) !== want) throw new Error(`${name}：${p} 的 SHA1 對不上`)
    mkdirSync(dirname(join(ROOT, p)), { recursive: true })
    writeFileSync(join(ROOT, p), text)
  }
  console.log(`unpack：${name} → ${Object.keys(files).length} 個檔`)
}
