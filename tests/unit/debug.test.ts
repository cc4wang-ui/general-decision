// @vitest-environment jsdom
// 除錯紀錄環狀緩衝（src/debug.ts）——Vercel log 保存期太短，這份存在手機上。
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEBUG_MAX, clearDebug, formatCandidate, formatDebug, readDebug, recordDebug } from '../../src/debug.ts'
import type { OrderDebug } from '../../src/types.ts'

const entry = (module: OrderDebug['module'] = 'eat'): OrderDebug => ({ module, level: 1 })

beforeEach(() => { localStorage.clear() })

describe('除錯紀錄環狀緩衝', () => {
  it('沒有紀錄時回空陣列', () => {
    expect(readDebug()).toEqual([])
  })

  it('最新的排在最前面', () => {
    recordDebug(entry('eat'))
    recordDebug(entry('rest'))
    expect(readDebug().map((e) => e.module)).toEqual(['rest', 'eat'])
  })

  it(`只留最近 ${DEBUG_MAX} 筆，更舊的被擠掉`, () => {
    for (let i = 0; i < DEBUG_MAX + 5; i++) recordDebug({ ...entry(), outTokens: i })
    const got = readDebug()
    expect(got).toHaveLength(DEBUG_MAX)
    expect(got[0]!.outTokens).toBe(DEBUG_MAX + 4) // 最後寫的那筆
    expect(got.at(-1)!.outTokens).toBe(5) // 前 5 筆被擠掉
  })

  it('沒給 at 就自己補時間戳', () => {
    recordDebug(entry())
    expect(Number.isNaN(new Date(readDebug()[0]!.at).getTime())).toBe(false)
  })

  it('localStorage 壞掉或內容不是陣列都不會炸，回空陣列', () => {
    localStorage.setItem('decide.debug', '{壞掉的 JSON')
    expect(readDebug()).toEqual([])
    localStorage.setItem('decide.debug', '{"not":"array"}')
    expect(readDebug()).toEqual([])
  })

  it('localStorage 丟例外（無痕模式）時 recordDebug 不會往外拋', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('QuotaExceeded') })
    expect(() => recordDebug(entry())).not.toThrow()
    spy.mockRestore()
  })

  it('清掉之後就空了', () => {
    recordDebug(entry())
    clearDebug()
    expect(readDebug()).toEqual([])
  })
})

describe('轉成純文字（給「複製」用）', () => {
  it('候選店一行帶評分、則數、步行、營業時間', () => {
    expect(formatCandidate({ name: '阿財魯肉飯', rating: 4.4, count: 812, walkMin: 6, openUntil: '21:00' }))
      .toBe('阿財魯肉飯 4.4★(812) 走6分 到21:00')
    expect(formatCandidate({ name: '還沒開的店', opensAt: '17:00' })).toBe('還沒開的店 無評分 17:00開')
  })

  it('沒有紀錄時給一句話，不是空字串', () => {
    expect(formatDebug([])).toBe('（沒有紀錄）')
  })

  it('一筆完整紀錄該出現的欄位都在', () => {
    const text = formatDebug([{
      at: '2026-09-18T12:00:00+08:00',
      module: 'rest', level: 2, model: 'claude-haiku-4-5',
      ms: { places: 254, claude: 2877, total: 3131 }, outTokens: 194,
      places: {
        how: 'text="居酒屋"',
        tries: [{ r: 800, raw: 0, kept: 0 }, { r: 2000, raw: 15, kept: 8 }],
        candidates: [{ name: '一番地', rating: 4.3, count: 520, walkMin: 4 }],
      },
      retry: 'noplace', forced: '一番地', picked: '一番地',
    }])
    expect(text).toContain('rest lv2')
    expect(text).toContain('claude=2877ms')
    expect(text).toContain('text="居酒屋"')
    expect(text).toContain('r=800 raw=0 留=0')
    expect(text).toContain('r=2000 raw=15 留=8')
    expect(text).toContain('一番地 4.3★(520) 走4分')
    expect(text).toContain('模型沒挑真店')
    expect(text).toContain('強制指定 一番地')
  })

  it('失敗的紀錄看得出錯在哪', () => {
    expect(formatDebug([{ at: '2026-09-18T12:00:00+08:00', module: 'eat', level: 1, error: 'no_places' }]))
      .toContain('失敗:no_places')
  })
})

describe('requestOrder 把 debug 從 Order 剝掉（不能汙染日記）', () => {
  const ORDER = {
    verdict: 'do', meme: { top: 'a', big: '阿財魯肉飯', bot: 'c' },
    steps: ['去。'], place: { id: 'p1', name: '阿財魯肉飯' }, log: 'x',
  }
  const req = { module: 'eat' as const, level: 1 as const, choices: {}, now: '2026-09-18T12:00:00+08:00', recentOrders: [] }

  it('成功：回傳的 Order 沒有 debug 欄位，但紀錄裡有一筆', async () => {
    const { requestOrder } = await import('../../src/api.ts')
    vi.stubGlobal('fetch', vi.fn(() => new Response(
      JSON.stringify({ ...ORDER, debug: { module: 'eat', level: 1, picked: '阿財魯肉飯' } }),
      { status: 200, headers: { 'x-places-calls': '1' } },
    )))
    const order = await requestOrder(req)
    expect('debug' in order).toBe(false)
    expect(order.meme.big).toBe('阿財魯肉飯')
    expect(readDebug()[0]!.picked).toBe('阿財魯肉飯')
    vi.unstubAllGlobals()
  })

  it('失敗：錯誤回應裡的 debug 也會被記下來——沒出口令才是最該查的', async () => {
    const { requestOrder, ApiError } = await import('../../src/api.ts')
    vi.stubGlobal('fetch', vi.fn(() => new Response(
      JSON.stringify({ error: 'no_places', message: '附近查不到營業中的店。換個地方再報告。', debug: { module: 'eat', level: 1, error: 'no_places' } }),
      { status: 502 },
    )))
    await expect(requestOrder(req)).rejects.toBeInstanceOf(ApiError)
    expect(readDebug()[0]!.error).toBe('no_places')
    vi.unstubAllGlobals()
  })

  it('失敗且伺服器沒附 debug（例如離線）時，前端自己補一筆', async () => {
    const { requestOrder } = await import('../../src/api.ts')
    vi.stubGlobal('fetch', vi.fn(() => { throw new Error('network down') }))
    await expect(requestOrder(req)).rejects.toThrow()
    expect(readDebug()[0]).toMatchObject({ module: 'eat', error: 'offline' })
    vi.unstubAllGlobals()
  })
})
