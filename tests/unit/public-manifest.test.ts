// @vitest-environment node
// Round 4：scripts/public-manifest.json 必須跟 public/ 一模一樣（直傳 Vercel 時 build 靠它從正式站補圖檔、逐檔驗 SHA1）。
// 改了 public/ 就跑 `node scripts/fetch-public.mjs --write`。
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('public-manifest', () => {
  it('每個 public/ 檔都在 manifest，SHA1 與大小一致；沒有多餘的項目', () => {
    const manifest = JSON.parse(readFileSync('scripts/public-manifest.json', 'utf8')) as Record<string, { sha1: string; size: number }>
    const files = execFileSync('git', ['ls-files', 'public'], { encoding: 'utf8' }).split('\n').filter(Boolean).sort()
    expect(Object.keys(manifest).sort()).toEqual(files)
    for (const f of files) {
      const b = readFileSync(f)
      expect(manifest[f], f).toEqual({ sha1: createHash('sha1').update(b).digest('hex'), size: b.length })
    }
  })
})
