import { describe, expect, it } from 'vitest'
import { buildDaily, replanDaily, shuffleTask, addFixedTask, mapsNavigationUrl, type DailyState } from '../../src/dailyDecision.tsx'

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

describe('Daily itinerary controls',()=>{
 it('shuffles only one stop and retains another stop',()=>{
  const initial={...state(),tasks:buildDaily(state())}
  const changed=shuffleTask(initial,'meal')
  expect(changed.tasks.find(t=>t.id==='meal')?.title).not.toBe(initial.tasks.find(t=>t.id==='meal')?.title)
  expect(changed.tasks.find(t=>t.id==='gym')).toEqual(initial.tasks.find(t=>t.id==='gym'))
 })
 it('preserves user-defined place after replanning',()=>{
  const initial={...state(),tasks:buildDaily(state()).map(t=>t.id==='coffee'?{...t,place:'代官山'}:t)}
  expect(replanDaily(initial).tasks.find(t=>t.id==='coffee')?.place).toBe('代官山')
 })
 it('keeps fixed existing commitments across replan and shuffle',()=>{
  const withFixed=addFixedTask(state(),'與朋友見面','吉祥寺','15:00',60)
  const fixed=withFixed.tasks[0]
  expect(fixed.locked).toBe(true)
  const result=replanDaily(withFixed)
  expect(result.tasks.find(t=>t.id===fixed.id)).toEqual(fixed)
  expect(shuffleTask(result,fixed.id).tasks.find(t=>t.id===fixed.id)).toEqual(fixed)
 })
 it('rejects incomplete fixed commitments',()=>{
  expect(addFixedTask(state(),'','吉祥寺','15:00',60).tasks).toHaveLength(0)
 })
})

describe('Google Maps direct navigation',()=>{
 it('opens walking navigation for the exact verified place ID',()=>{
  const url=new URL(mapsNavigationUrl({id:'ChIJABC_123',lat:35.6595,lng:139.7005}))
  expect(url.hostname).toBe('www.google.com')
  expect(url.pathname).toBe('/maps/dir/')
  expect(url.searchParams.get('api')).toBe('1')
  expect(url.searchParams.get('destination')).toBe('35.6595,139.7005')
  expect(url.searchParams.get('destination_place_id')).toBe('ChIJABC_123')
  expect(url.searchParams.get('travelmode')).toBe('walking')
  expect(url.searchParams.get('dir_action')).toBe('navigate')
 })
})
