// @vitest-environment node
// W3 步驟 4：manifest 與 index.html 的上架欄位。色票由 palette-guard.test.ts 守，這裡只管語言、分類、描述同步。
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8')
const manifest = JSON.parse(read('public/manifest.webmanifest')) as Record<string, unknown>
const html = read('index.html')

describe('manifest／index.html（上架欄位）', () => {
  it('manifest：lang／dir／id／categories', () => {
    expect(manifest.lang).toBe('zh-TW')
    expect(manifest.dir).toBe('ltr')
    expect(manifest.id).toBe('/')
    expect(manifest.categories).toEqual(['food', 'lifestyle'])
  })

  it('manifest：start_url 與 scope 仍是 "/"（Capacitor-ready 檢查表引用）', () => {
    expect(manifest.start_url).toBe('/')
    expect(manifest.scope).toBe('/')
  })

  it('index.html：lang 是 zh-Hant-TW', () => {
    expect(html).toMatch(/<html lang="zh-Hant-TW">/)
  })

  it('description 在 manifest 與 index.html 一致，且就是商店副標', () => {
    const m = html.match(/<meta name="description" content="([^"]+)"/)
    expect(m).not.toBeNull()
    expect(m![1]).toBe(manifest.description)
    const md = read('docs/round3/STORE-LISTING.md')
    expect(md).toContain(`\n${manifest.description as string}\n`)
  })

  it('manifest 與 index.html 指到的圖示檔都存在；favicon.svg 的根元素屬性不重複', () => {
    const icons = (manifest.icons as { src: string }[]).map((i) => i.src)
    const linked = [...html.matchAll(/<link rel="(?:icon|alternate icon|apple-touch-icon)"[^>]*href="([^"]+)"/g)].map((m) => m[1]!)
    expect(linked).toContain('/favicon.svg')
    for (const src of [...icons, ...linked]) expect(() => read(`public${src}`), src).not.toThrow()
    // 重複屬性會讓整張 SVG 解析失敗、瀏覽器畫不出來（2026-11-11 checker 抓到 width／height 各出現兩次）。
    const root = read('public/favicon.svg').match(/^<svg\b[^>]*>/)![0]
    const names = [...root.matchAll(/\s([\w:-]+)=/g)].map((m) => m[1]!)
    expect(new Set(names).size, names.join(' ')).toBe(names.length)
  })
})
