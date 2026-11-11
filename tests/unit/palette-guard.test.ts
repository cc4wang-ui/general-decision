// @vitest-environment node
// 色盤守門：index.html、manifest、樣式與插畫的色值必須落在色盤內。
// 白名單唯一真相來源：src/palette.ts（2026-11 改版；之前是 NES 55 色）。
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { PALETTE_HEX } from '../../src/palette.ts'

const ALLOWED = new Set<string>(PALETTE_HEX.map((h) => h.toUpperCase()))
const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8')
const hexes = (s: string) => [...s.matchAll(/#([0-9a-fA-F]{6})\b/g)].map((m) => `#${m[1]!.toUpperCase()}`)

describe('色盤守門（A-4）', () => {
  it('色盤沒有重複值，全部是 6 位大寫 hex', () => {
    expect(ALLOWED.size).toBe(PALETTE_HEX.length)
    for (const h of PALETTE_HEX) expect(h).toMatch(/^#[0-9A-F]{6}$/)
  })

  it('index.html 的 theme-color 在 色盤內', () => {
    const html = read('index.html')
    const m = html.match(/name="theme-color"\s+content="(#[0-9a-fA-F]{6})"/)
    expect(m, 'index.html 要有 theme-color').not.toBeNull()
    expect(ALLOWED.has(m![1]!.toUpperCase()), m![1]).toBe(true)
  })

  it('manifest 的 background_color 與 theme_color 在 色盤內', () => {
    const manifest = JSON.parse(read('public/manifest.webmanifest')) as { background_color: string; theme_color: string }
    expect(ALLOWED.has(manifest.background_color.toUpperCase()), manifest.background_color).toBe(true)
    expect(ALLOWED.has(manifest.theme_color.toUpperCase()), manifest.theme_color).toBe(true)
  })

  it('styles.css 的每一個 6 位 hex 都在 色盤內', () => {
    const bad = [...new Set(hexes(read('src/styles.css')))].filter((h) => !ALLOWED.has(h))
    expect(bad).toEqual([])
  })

  it.each(['src/avatarSvg.ts', 'src/icons.tsx', 'src/dailyDecision.css'])('%s 的硬編色全部在色盤內', (file) => {
    const bad = [...new Set(hexes(read(file)))].filter((h) => !ALLOWED.has(h))
    expect(bad).toEqual([])
  })
})
