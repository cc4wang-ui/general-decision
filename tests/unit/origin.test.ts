// Round 6：使用者自己報的「下車的站」站名（loc.label）→ 伺服器清乾淨 → 只進 prompt，不進 log。
import { describe, expect, it } from 'vitest'
import { sanitizeRequest } from '../../src/orderHandler.ts'
import { buildOrderPrompt } from '../../src/prompt.ts'
import type { OrderRequest } from '../../src/types.ts'

const base: OrderRequest = {
  module: 'eat', level: 1, choices: { diet: '都可以', scene: '一個人快吃' }, now: '2026-11-01T12:00:00.000Z', recentOrders: [], novelty: 'balanced',
  loc: { lat: 35.6896, lng: 139.7006, label: '新宿駅' },
}

describe('sanitizeRequest：loc.label', () => {
  it('保留站名；去控制字元、壓空白、截 40 字', () => {
    expect(sanitizeRequest(base).loc).toEqual({ lat: 35.6896, lng: 139.7006, label: '新宿駅' })
    const dirty = sanitizeRequest({ ...base, loc: { lat: 1, lng: 2, label: ' 新宿\u0000駅   南口\n' } }).loc
    expect(dirty).toEqual({ lat: 1, lng: 2, label: '新宿 駅 南口' })
    const long = sanitizeRequest({ ...base, loc: { lat: 1, lng: 2, label: 'あ'.repeat(60) } }).loc
    expect(long?.label).toHaveLength(40)
  })
  it('沒有 label／不是字串／空白 → loc 沒有 label 這個鍵', () => {
    expect(sanitizeRequest({ ...base, loc: { lat: 1, lng: 2 } }).loc).toEqual({ lat: 1, lng: 2 })
    expect(sanitizeRequest({ ...base, loc: { lat: 1, lng: 2, label: 7 as unknown as string } }).loc).toEqual({ lat: 1, lng: 2 })
    expect(sanitizeRequest({ ...base, loc: { lat: 1, lng: 2, label: '   ' } }).loc).toEqual({ lat: 1, lng: 2 })
  })
})

describe('prompt：從車站出發', () => {
  it('有 label → 寫「剛在「新宿駅」下車」、要求 steps 從出站寫起；沒有 → 不提車站', () => {
    const withLabel = buildOrderPrompt(base, null, 'JP').user
    expect(withLabel).toContain('剛在「新宿駅」下車')
    expect(withLabel).toContain('出站')
    const without = buildOrderPrompt({ ...base, loc: { lat: 35.6896, lng: 139.7006 } }, null, 'JP').user
    expect(without).not.toContain('下車')
    expect(without).not.toContain('新宿')
  })
})
