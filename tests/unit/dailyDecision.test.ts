import { describe, expect, it } from 'vitest'
import { buildDaily, replanDaily, type DailyState } from '../../src/dailyDecision.tsx'

const state = (): DailyState => ({ day:'2026-11-03', area:'澀谷', currentPlace:'宮下公園', mode:'creative', tasks:[], notes:[], avoid:[] })

describe('Daily Decision replan',()=>{
  it('always uses FIT-EASY rather than another gym',()=>{
    const tasks=buildDaily(state())
    expect(tasks.find(t=>t.kind==='gym')?.title).toContain('FIT-EASY')
  })
  it('preserves completed tasks and only replans pending',()=>{
    const s=state()
    s.tasks=buildDaily(s).map(t=>t.id==='gym'?{...t,done:true}:t)
    const result=replanDaily({...s,currentPlace:'宮下公園',mode:'practical'})
    expect(result.tasks.filter(t=>t.id==='gym')).toHaveLength(1)
    expect(result.tasks.find(t=>t.id==='gym')?.done).toBe(true)
    expect(result.tasks.some(t=>t.id==='creative')).toBe(false)
  })
  it('honors explicit skip',()=>{
    const result=replanDaily({...state(),avoid:['shopping']})
    expect(result.tasks.some(t=>t.id==='shopping')).toBe(false)
  })
})
