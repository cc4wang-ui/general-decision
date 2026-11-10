// @vitest-environment node
// DEV-PLAN-2 A-4 守門測試：index.html 與 manifest 的色值必須落在 NES 色盤內。
// 階段 3b 漏掉這三個色，根本原因是沒有測試覆蓋它們；有了這條，色盤第三次改就不會第三次漏。
// 白名單唯一真相來源：design/hwpalette.mjs 的 nesPalette()（55 格，見 DEV-PLAN-2 A-2.1 的「54 vs 55」說明）。
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
// @ts-expect-error design/ 是 .mjs 沒有型別
import { nesPalette } from '../../design/hwpalette.mjs'

const NES = new Set<string>(((nesPalette as unknown as () => string[])()).map((h) => h.toUpperCase()))
const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8')
const hexes = (s: string) => [...s.matchAll(/#([0-9a-fA-F]{6})\b/g)].map((m) => `#${m[1]!.toUpperCase()}`)

describe('色盤守門（A-4）', () => {
  it('nesPalette() 有 55 格相異值（文件說 54 是硬體慣用說法，白名單以函式回傳為準）', () => {
    expect(NES.size).toBe(55)
  })

  it('index.html 的 theme-color 在 NES 色盤內', () => {
    const html = read('index.html')
    const m = html.match(/name="theme-color"\s+content="(#[0-9a-fA-F]{6})"/)
    expect(m, 'index.html 要有 theme-color').not.toBeNull()
    expect(NES.has(m![1]!.toUpperCase()), m![1]).toBe(true)
  })

  it('manifest 的 background_color 與 theme_color 在 NES 色盤內', () => {
    const manifest = JSON.parse(read('public/manifest.webmanifest')) as { background_color: string; theme_color: string }
    expect(NES.has(manifest.background_color.toUpperCase()), manifest.background_color).toBe(true)
    expect(NES.has(manifest.theme_color.toUpperCase()), manifest.theme_color).toBe(true)
  })

  it('styles.css 的每一個 6 位 hex 都在 NES 色盤內', () => {
    const bad = [...new Set(hexes(read('src/styles.css')))].filter((h) => !NES.has(h))
    expect(bad).toEqual([])
  })

  it('src/avatar.tsx 的硬編色全部在 NES 色盤內（階段 A 已換色稿）', () => {
    const bad = [...new Set(hexes(read('src/avatar.tsx')))].filter((h) => !NES.has(h))
    expect(bad).toEqual([])
  })
})
