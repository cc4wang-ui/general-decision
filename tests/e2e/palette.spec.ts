// 階段 A 驗收標準 1、2：在瀏覽器裡量「渲染後的實際值」，不是讀 CSS 原始碼。
// 階段 3b 的 28 項 WCAG 檢查是人工跑的，換一次色盤就全部作廢；這支把它變成會自己跑的守門。
import { expect, test, type Page } from '@playwright/test'
import { PALETTE_HEX } from '../../src/palette.ts'
import { FIXED_ORDER, mockOrder, mockOrderFailure, prime, openCard, refuseOrder } from './fixtures.ts'

const NES: string[] = PALETTE_HEX.map((h) => h.toUpperCase())

test.beforeEach(async ({ page }) => { await prime(page) })

const WEEKLY = {
  weekStart: '2026-09-07T00:00:00.000Z',
  level: 1,
  stats: { orders: 11, complianceRate: 82, punishments: 2, weakestModule: 'rest' },
  body: '本週十一道口令，九道完成，兩次罰則。',
  verdict: '本週講評：合格。屁股記過一次。',
}

/**
 * 在頁面裡掃每一個可見元素（含 ::before / ::after）的渲染後顏色。
 * 回傳：不在色盤內的實色、以及文字對比不足的元素。
 */
async function audit(page: Page, palette: string[]) {
  return page.evaluate((pal) => {
    const allowed = new Set(pal)

    const parse = (c: string): [number, number, number, number] | null => {
      const m = c.match(/^rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)$/)
      if (!m) return null
      return [Number(m[1]), Number(m[2]), Number(m[3]), m[4] === undefined ? 1 : Number(m[4])]
    }
    const hex = (r: number, g: number, b: number) =>
      '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0').toUpperCase()).join('')
    const lin = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }
    const lum = ([r, g, b]: number[]) => 0.2126 * lin(r!) + 0.7152 * lin(g!) + 0.0722 * lin(b!)
    const ratio = (a: number[], b: number[]) => {
      const [x, y] = [lum(a), lum(b)]
      return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
    }

    const offPalette = new Set<string>()
    const contrast: { where: string; color: string; bg: string; ratio: number; need: number; text: string }[] = []

    /** 實色才驗色盤；半透明（虛線分隔、遮罩）是刻意的疊色，另外統計。 */
    const translucent = new Set<string>()
    const check = (raw: string, where: string) => {
      const c = parse(raw)
      if (!c || c[3] === 0) return
      const h = hex(c[0], c[1], c[2])
      if (c[3] < 1) { translucent.add(`${h}@${c[3]} ${where}`); return }
      if (!allowed.has(h)) offPalette.add(`${h} ${where}`)
    }

    /** 往上找第一個不透明底色，作為文字的有效背景。 */
    const effectiveBg = (el: Element): number[] => {
      let n: Element | null = el
      while (n) {
        const c = parse(getComputedStyle(n).backgroundColor)
        if (c && c[3] === 1) return [c[0], c[1], c[2]]
        n = n.parentElement
      }
      return [255, 255, 255]
    }

    const label = (el: Element) => {
      const cls = (el.className && typeof el.className === 'string') ? '.' + el.className.trim().split(/\s+/).join('.') : ''
      return `${el.tagName.toLowerCase()}${cls}`.slice(0, 60)
    }

    for (const el of Array.from(document.querySelectorAll('*'))) {
      if (!el.getClientRects().length) continue
      const where = label(el)
      for (const pseudo of [null, '::before', '::after'] as const) {
        const st = getComputedStyle(el, pseudo ?? undefined)
        if (pseudo && (st.content === 'none' || st.content === 'normal')) continue
        const tag = pseudo ? `${where}${pseudo}` : where
        check(st.backgroundColor, tag)
        for (const side of ['Top', 'Right', 'Bottom', 'Left'] as const) {
          if (parseFloat(st[`border${side}Width` as 'borderTopWidth']) > 0 && st[`border${side}Style` as 'borderTopStyle'] !== 'none') {
            check(st[`border${side}Color` as 'borderTopColor'], `${tag} border-${side.toLowerCase()}`)
          }
        }
        // ::before/::after 的 content 是可見的字或色塊，顏色一併驗
        if (pseudo) check(st.color, `${tag} color`)
      }

      // 只驗直接持有文字的元素，避免把容器的繼承色重複算
      const own = Array.from(el.childNodes)
        .filter((n) => n.nodeType === Node.TEXT_NODE)
        .map((n) => n.textContent ?? '')
        .join('')
        .trim()
      if (!own) continue
      const st = getComputedStyle(el)
      check(st.color, `${where} color`)
      const fg = parse(st.color)
      if (!fg || fg[3] < 1) continue
      const size = parseFloat(st.fontSize)
      const weight = Number(st.fontWeight) || 400
      const large = size >= 24 || (size >= 18.66 && weight >= 700)
      const need = large ? 3 : 4.5
      const bg = effectiveBg(el)
      const r = ratio([fg[0], fg[1], fg[2]], bg)
      if (r < need) {
        contrast.push({ where, color: hex(fg[0], fg[1], fg[2]), bg: hex(bg[0]!, bg[1]!, bg[2]!), ratio: Math.round(r * 100) / 100, need, text: own.slice(0, 20) })
      }
    }
    return { offPalette: [...offPalette], contrast, translucent: [...translucent] }
  }, palette)
}

/** 8 個畫面各自的到達路徑。 */
const SCREENS: { name: string; go: (page: Page) => Promise<void> }[] = [
  { name: 'home', go: async (p) => { await p.goto('/') } },
  { name: 'intake', go: async (p) => { await p.goto('/'); await openCard(p, 'eat') } },
  { name: 'cmd', go: async (p) => { await p.goto('/'); await openCard(p, 'eat'); await p.getByRole('button', { name: '是！班長' }).click() } },
  {
    name: 'log',
    go: async (p) => {
      await p.goto('/'); await openCard(p, 'eat')
      await p.getByRole('button', { name: '是！班長' }).click()
      await p.getByRole('button', { name: '報告班長，完成' }).click()
    },
  },
  {
    name: 'stand',
    go: async (p) => {
      await p.goto('/'); await openCard(p, 'eat')
      await p.getByRole('button', { name: '是！班長' }).click()
      await refuseOrder(p)
    },
  },
  { name: 'diary', go: async (p) => { await p.goto('/'); await p.getByRole('button', { name: '新兵日記' }).click() } },
  {
    name: 'weekly',
    go: async (p) => {
      await p.goto('/'); await p.getByRole('button', { name: '新兵日記' }).click()
      await p.getByRole('button', { name: '看本週莒光園地' }).click()
    },
  },
]

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`色盤驗收 · ${scheme}`, () => {
    test.use({ colorScheme: scheme, geolocation: { latitude: 25.033, longitude: 121.5654 }, permissions: ['geolocation'] })

    for (const screen of SCREENS) {
      test(`${screen.name}：渲染後每個實色都在 色盤內、文字對比過 WCAG AA`, async ({ page }) => {
        await mockOrder(page, [FIXED_ORDER])
        await page.route('**/api/weekly', (r) =>
          r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(WEEKLY) }))
        await screen.go(page)
        await expect(page.locator(`[data-screen="${screen.name}"]`)).toBeVisible()

        const r = await audit(page, NES)
        expect(r.offPalette, `${screen.name}/${scheme} 有色值落在 色盤外`).toEqual([])
        expect(r.contrast, `${screen.name}/${scheme} 文字對比不足`).toEqual([])
      })
    }

    test(`error：渲染後每個實色都在 色盤內、文字對比過 WCAG AA`, async ({ page }) => {
      await mockOrderFailure(page, 502)
      await page.goto('/')
      await openCard(page, 'eat')
      await page.getByRole('button', { name: '是！班長' }).click()
      await expect(page.locator('[data-screen="error"]')).toBeVisible()

      const r = await audit(page, NES)
      expect(r.offPalette, `error/${scheme} 有色值落在 色盤外`).toEqual([])
      expect(r.contrast, `error/${scheme} 文字對比不足`).toEqual([])
    })

    // 三段火力的綠移到邊框之後，每一層的邊框都要對卡底與頁底過 3:1（WCAG 1.4.11 非文字）。
    // 邊框色寫死預期值：光靠 3:1 抓不到「深色吃到淺色的值」——#007800 在黑底剛好也過 3.69。
    const EDGE = { light: { 0: '#1F7A4D', 1: '#14573A', 2: '#1D2B24' }, dark: { 0: '#3DBE7B', 1: '#FFC93C', 2: '#FF6B4A' } }
    for (const [level, clicks] of [[0, 2], [1, 0], [2, 1]] as const) {
      test(`lv${level} 梗圖卡邊框：色盤內且對卡底、頁底都過 3:1`, async ({ page }) => {
        await mockOrder(page, [FIXED_ORDER])
        await page.goto('/')
        for (let i = 0; i < clicks; i++) await page.locator('.officer .av').click()
        await expect(page.locator(`main[data-level="${level}"]`)).toBeVisible()

        // 階段 C：名牌上的階級章。SVG 的 stroke 不在 audit() 的文字／邊框掃描範圍內，這裡另外量：
        // 每條槓的實色都要在色盤內，且對名牌底過 3:1（非文字）。lv2 名牌是反白的，銅金色要跟著反過來。
        const mark = await page.evaluate((pal) => {
          const allowed = new Set(pal)
          const lin = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }
          const rgb = (c: string) => c.match(/\d+/g)!.slice(0, 3).map(Number)
          const hex = (c: string) => '#' + rgb(c).map((v) => v.toString(16).padStart(2, '0').toUpperCase()).join('')
          const lum = (c: number[]) => 0.2126 * lin(c[0]!) + 0.7152 * lin(c[1]!) + 0.0722 * lin(c[2]!)
          const cr = (a: number[], b: number[]) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05)
          const badge = document.querySelector('.plate .rank')!
          // 名牌底：自己有不透明底就用自己的，否則往上找（lv0/lv2 有底、lv1 透明）
          let n: Element | null = badge
          let bg = 'rgb(255, 255, 255)'
          while (n) { const c = getComputedStyle(n).backgroundColor; if (!/rgba\(.*,\s*0\)$/.test(c) && c !== 'transparent') { bg = c; break } n = n.parentElement }
          const bars = [...badge.querySelectorAll('svg polyline')].map((el) => {
            const s = getComputedStyle(el).stroke
            return { hex: hex(s), inPalette: allowed.has(hex(s)), ratio: Math.round(cr(rgb(s), rgb(bg)) * 100) / 100 }
          })
          return { key: badge.querySelector('svg')?.getAttribute('data-insignia'), bg: hex(bg), bars }
        }, NES)
        expect(mark.bars.length, `lv${level}/${scheme} 名牌上要有階級章`).toBeGreaterThan(0)
        for (const b of mark.bars) {
          expect(b.inPalette, `lv${level}/${scheme} 徽章色 ${b.hex} 不在色盤內`).toBe(true)
          expect(b.ratio, `lv${level}/${scheme} 徽章色 ${b.hex} 對名牌底 ${mark.bg}`).toBeGreaterThanOrEqual(3)
        }
        expect(mark.key, `lv${level} 徽章`).toBe(['1-1', '1-2', '2-1'][level])
        await openCard(page, 'eat')
        await page.getByRole('button', { name: '是！班長' }).click()
        await expect(page.locator('[data-screen="cmd"]')).toBeVisible()

        const r = await audit(page, NES)
        expect(r.offPalette, `lv${level}/${scheme} 有色值落在 色盤外`).toEqual([])
        expect(r.contrast, `lv${level}/${scheme} 文字對比不足`).toEqual([])

        const edge = await page.evaluate(() => {
          const lin = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }
          const rgb = (c: string) => c.match(/\d+/g)!.slice(0, 3).map(Number)
          const lum = (c: number[]) => 0.2126 * lin(c[0]!) + 0.7152 * lin(c[1]!) + 0.0722 * lin(c[2]!)
          const cr = (a: number[], b: number[]) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05)
          const hex = (c: string) => '#' + rgb(c).map((v) => v.toString(16).padStart(2, '0').toUpperCase()).join('')
          const meme = document.querySelector('.meme')!
          const s = getComputedStyle(meme)
          return {
            color: hex(s.borderTopColor),
            vsCard: cr(rgb(s.borderTopColor), rgb(s.backgroundColor)),
            vsPage: cr(rgb(s.borderTopColor), rgb(getComputedStyle(document.body).backgroundColor)),
          }
        })
        expect(edge.color, `lv${level}/${scheme} 邊框色`).toBe(EDGE[scheme][level])
        expect(edge.vsCard, `lv${level}/${scheme} 邊框對卡底`).toBeGreaterThanOrEqual(3)
        expect(edge.vsPage, `lv${level}/${scheme} 邊框對頁底`).toBeGreaterThanOrEqual(3)
      })
    }
  })
}
