import { describe, expect, it } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { avatarSvg, Avatar, MOODS } from '../../src/avatar.tsx'
import { MemeCard, StepsCard } from '../../src/meme.tsx'
import type { Level } from '../../src/types.ts'

const LEVELS: Level[] = [0, 1, 2]

describe('avatar（第 12 節 S3：3×5 表情不拋錯）', () => {
  it('avatarSvg 對 3 階 × 5 表情都回傳合法 SVG', () => {
    for (const lv of LEVELS) {
      for (const mood of MOODS) {
        const svg = avatarSvg(lv, mood)
        expect(svg.startsWith('<svg'), `${lv}/${mood}`).toBe(true)
        expect(svg.endsWith('</svg>'), `${lv}/${mood}`).toBe(true)
        expect(svg).toContain('viewBox="0 0 120 120"')
        expect(svg).not.toContain('undefined')
        expect(svg).not.toContain('NaN')
      }
    }
  })

  it('<Avatar> 渲染 3×5 共 15 種組合都不拋錯', () => {
    for (const lv of LEVELS) {
      for (const mood of MOODS) {
        const { container } = render(<Avatar level={lv} mood={mood} />)
        expect(container.querySelector('svg'), `${lv}/${mood}`).not.toBeNull()
        cleanup()
      }
    }
  })

  // 2026-11 改版：點陣圖資產退場，頭像一律由 avatarSvg() 的零件組成。
  it('onDark（放在口令卡上）只畫圓形底，四角透明；一般頭像槽畫滿版底', () => {
    expect(avatarSvg(1, 'bark', true)).toContain('<circle cx="60" cy="62" r="56"')
    expect(avatarSvg(1, 'bark', true)).not.toContain('<rect width="120" height="120"')
    expect(avatarSvg(1, 'bark', false)).toContain('<rect width="120" height="120" fill="#FFC93C"/>')
  })

  it('扁平填色，不用漸層', () => {
    for (const lv of LEVELS) {
      expect(avatarSvg(lv, 'idle')).not.toContain('Gradient')
    }
  })

  it('三人各有專屬零件：歪帽與冒汗（lv0）、值星帶（lv1）、白鬍與墨鏡（lv2）', () => {
    expect(avatarSvg(0, 'idle')).toContain('rotate(-8 60 38)') // 歪帽
    expect(avatarSvg(0, 'idle')).toContain('#4DB8FF') // 冒汗
    expect(avatarSvg(1, 'idle')).toContain('#C7361A') // 值星帶
    expect(avatarSvg(2, 'idle')).toContain('#E6E6E6') // 白鬍、白鬢角
    expect(avatarSvg(1, 'idle')).not.toContain('#E6E6E6')
  })

  it('同一位班長的五種表情兩兩不同；三位班長的同一表情也兩兩不同', () => {
    for (const lv of LEVELS) expect(new Set(MOODS.map((m) => avatarSvg(lv, m))).size).toBe(5)
    for (const m of MOODS) expect(new Set(LEVELS.map((lv) => avatarSvg(lv, m))).size).toBe(3)
  })

  it('<Avatar> 帶 data-avatar，供樣式與 e2e 定位', () => {
    const { container } = render(<Avatar level={2} mood="soft" />)
    expect(container.querySelector('[data-avatar="2-soft"] svg')).not.toBeNull()
  })
})

describe('meme 卡（第 9 節版面規則）', () => {
  it('渲染 top / big / bot 三段文字與角色', () => {
    const { getByTestId, container } = render(
      <MemeCard tag="決斷連" top="去吃熱的" big="阿財魯肉飯" bot="這週兩天超商了" level={1} mood="bark" />,
    )
    expect(getByTestId('meme-top').textContent).toBe('去吃熱的')
    expect(getByTestId('meme-big').textContent).toBe('阿財魯肉飯')
    expect(getByTestId('meme-bot').textContent).toBe('這週兩天超商了')
    expect(container.querySelector('.face svg')).not.toBeNull()
  })

  it('角色在文字之後、同一層 grid，不是絕對定位壓字（v4 的錯）', () => {
    const { getByTestId } = render(
      <MemeCard tag="t" top="a" big="b" bot="c" level={1} mood="bark" />,
    )
    const meme = getByTestId('meme')
    const kids = [...meme.children].map((c) => c.className)
    expect(kids).toEqual(['tag', 'txt', 'face'])
  })

  it('number 取代 big（罰則倒數畫面）', () => {
    const { getByTestId, queryByTestId } = render(
      <MemeCard tone="red" tag="違紀登記" top="罰站" number={10} bot="想清楚" level={1} mood="punish" />,
    )
    expect(getByTestId('meme-num').textContent).toBe('10')
    expect(queryByTestId('meme-big')).toBeNull()
    expect(getByTestId('meme').className).toContain('red')
  })

  it('steps 卡逐條渲染', () => {
    const { getByTestId } = render(<StepsCard steps={['步行 6 分鐘。', '魯肉飯、滷蛋。']} />)
    expect(getByTestId('steps').querySelectorAll('p')).toHaveLength(2)
  })

  it('階段 B：有 mapUrl 時店名是新分頁的 Google Maps 連結', () => {
    const { getByTestId } = render(
      <StepsCard steps={['步行 6 分鐘。']} place={{ name: '阿財魯肉飯', mapUrl: 'https://www.google.com/maps/search/?api=1&query=x&query_place_id=ChIJxxx' }} />,
    )
    const a = getByTestId('place-link') as HTMLAnchorElement
    expect(a.textContent).toBe('阿財魯肉飯')
    expect(a.getAttribute('href')).toContain('query_place_id=ChIJxxx')
    expect(a.getAttribute('target')).toBe('_blank')
    expect(a.getAttribute('rel')).toBe('noopener noreferrer')
  })

  it('階段 B：沒有 mapUrl（Places 降級／比不中）→ 不畫任何連結', () => {
    const { queryByTestId, container } = render(<StepsCard steps={['步行 6 分鐘。']} place={{ name: '阿財魯肉飯' }} />)
    expect(queryByTestId('place-link')).toBeNull()
    expect(container.querySelector('a')).toBeNull()
  })
})
