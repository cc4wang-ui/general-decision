// @vitest-environment jsdom
// T10、T6：口令卡的店家資訊列與 Google Maps 歸屬。
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { StepsCard, formatPlaceMeta } from '../../src/meme.tsx'

describe('口令卡 place-meta', () => {
  it('步行、營業到、價位文字照 API 值組合', () => {
    expect(formatPlaceMeta({ name: 'x', walkMin: 6, openUntil: '21:00', priceText: '≈NT$150–400' }))
      .toBe('步行 6 分 · 營業到 21:00 · ≈NT$150–400')
  })
  it('價位沒資料寫價位未知；還沒開門寫 HH:MM 開（opensAt 優先）', () => {
    expect(formatPlaceMeta({ name: 'x', walkMin: 3, opensAt: '11:30', openUntil: '21:00' })).toBe('步行 3 分 · 11:30 開 · 價位未知')
  })
  it('沒有的欄位就不寫；步行 0 分也要寫', () => {
    expect(formatPlaceMeta({ name: 'x' })).toBe('價位未知')
    expect(formatPlaceMeta({ name: 'x', walkMin: 0 })).toBe('步行 0 分 · 價位未知')
  })
  it('有店就畫 place-meta 與歸屬（translate=no）；沒有店都不畫', () => {
    const a = render(<StepsCard steps={['一。']} place={{ name: '阿財魯肉飯', mapUrl: 'https://www.google.com/maps/search/?api=1&query=x', walkMin: 6, priceText: '平價' }} />)
    expect(a.getByTestId('place-meta').textContent).toBe('步行 6 分 · 平價')
    const attr = a.getByTestId('attribution')
    expect(attr.textContent).toBe('Google Maps')
    expect(attr.getAttribute('translate')).toBe('no')
    a.unmount()
    const b = render(<StepsCard steps={['一。']} />)
    expect(b.queryByTestId('place-meta')).toBeNull()
    expect(b.queryByTestId('attribution')).toBeNull()
  })

  // R2-01：沒有 mapUrl 的 place 可能是模型編的（伺服器沒查 Places）→ 整個店家區都不准畫。
  it('R2-01 沒有 mapUrl 的 place：不畫 place-head、印章、店名、meta、歸屬；步驟照畫', () => {
    const fake = { name: '模型編的店', walkMin: 5, mode: 'new' as const, visits: 1 }
    const { queryByTestId, container, getByTestId } = render(<StepsCard steps={['一。', '二。']} place={fake} />)
    expect(container.querySelector('.place-head')).toBeNull()
    for (const id of ['mode-stamp', 'place-link', 'place-meta', 'attribution']) expect(queryByTestId(id)).toBeNull()
    expect(container.textContent).not.toContain('模型編的店')
    expect(getByTestId('steps').querySelectorAll('p')).toHaveLength(2)
  })
  it('R2-01 有 mapUrl：place-head、印章、店名連結、meta、歸屬都畫', () => {
    const real = { name: '阿財魯肉飯', mapUrl: 'https://www.google.com/maps/search/?api=1&query=x', walkMin: 6, mode: 'new' as const }
    const { queryByTestId, container } = render(<StepsCard steps={['一。']} place={real} />)
    expect(container.querySelector('.place-head')).not.toBeNull()
    for (const id of ['mode-stamp', 'place-link', 'place-meta', 'attribution']) expect(queryByTestId(id)).not.toBeNull()
    // Round 10（T10）：歸屬緊跟在 place-meta 後面（店家區裡），不在步驟之後——放最後一行在 375×667 會掉出第一屏。
    expect(queryByTestId('place-meta')!.nextElementSibling).toBe(queryByTestId('attribution'))
  })
})
