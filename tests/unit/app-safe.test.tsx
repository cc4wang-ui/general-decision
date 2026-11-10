// @vitest-environment jsdom
// R2-05：IndexedDB 卡住（get 永不 resolve）時，safe() 最多等 800ms 就用 fallback，口令照出。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SAFE_TIMEOUT_MS, safe } from '../../src/app.tsx'

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers() })

describe('safe()：逾時與吞錯', () => {
  it('預設逾時 800ms', () => {
    expect(SAFE_TIMEOUT_MS).toBe(800)
  })

  it('原 promise 永不 resolve：799ms 還在等，800ms 用 fallback', async () => {
    const never = () => new Promise<string>(() => {})
    let got: string | undefined
    void safe(never, 'fallback').then((v) => { got = v })
    await vi.advanceTimersByTimeAsync(799)
    expect(got).toBeUndefined()
    await vi.advanceTimersByTimeAsync(1)
    expect(got).toBe('fallback')
  })

  it('正常完成：回原值，不等逾時', async () => {
    await expect(safe(() => Promise.resolve('ok'), 'fallback')).resolves.toBe('ok')
  })

  it('丟錯（同步或非同步）：回 fallback', async () => {
    await expect(safe(() => Promise.reject(new Error('x')), 'fb')).resolves.toBe('fb')
    await expect(safe(() => { throw new Error('y') }, 'fb')).resolves.toBe('fb')
  })
})
