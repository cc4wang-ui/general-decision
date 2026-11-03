import { describe, expect, it } from 'vitest'
import { buildDaily, replanDaily, shuffleTask, addFixedTask, mapsNavigationUrl, originKey, routeProposal, type DailyState, type DailyTask } from '../../src/dailyDecision.tsx'

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

describe('出發地換成目前位置',()=>{
 const shibuya={id:'shibuya-cafe',name:'澀谷的店',address:'渋谷',mapUrl:'https://maps.google.com/?cid=1',lat:35.66,lng:139.70}
 const routed=():DailyState=>{
  const s={...state(),currentPlace:'渋谷駅'}
  const tasks:DailyTask[]=buildDaily(s).map(t=>({...t,candidate:{...shibuya,id:'c-'+t.id}}))
  tasks[0]={...tasks[0],done:true}
  tasks[1]={...tasks[1],specified:true,place:'Fuglen Tokyo'}
  return {...s,tasks,routedFrom:originKey(s)}
 }
 it('originKey 分得出目前位置與輸入的地名',()=>{
  expect(originKey({...state(),useHere:true})).toBe('here')
  expect(originKey({...state(),currentPlace:' 渋谷駅 '})).toBe('text:渋谷駅')
 })
 it('出發地沒換：保留已選的店，只重排',()=>{
  const s=routed()
  expect(routeProposal(s).tasks.every(t=>t.candidate)).toBe(true)
 })
 it('換成目前位置：自動挑的店丟掉重找；已完成、指定地點照留',()=>{
  const s=routed()
  const out=routeProposal({...s,useHere:true})
  const byId=new Map(out.tasks.map(t=>[t.id,t]))
  expect(byId.get(s.tasks[0].id)?.candidate?.id).toBe('c-'+s.tasks[0].id) // 已完成
  expect(byId.get(s.tasks[1].id)?.place).toBe('Fuglen Tokyo') // 你指定的地點
  expect(byId.get(s.tasks[1].id)?.specified).toBe(true)
  const auto=out.tasks.filter(t=>!t.done&&!t.specified)
  expect(auto.length).toBeGreaterThan(0)
  expect(auto.every(t=>!t.candidate)).toBe(true) // 讓伺服器在目前位置附近重找
 })
 it('固定安排換出發地也照留',()=>{
  const s=addFixedTask(routed(),'與朋友見面','吉祥寺','15:00',60)
  const fixed=s.tasks.find(t=>t.locked)!
  expect(routeProposal({...s,useHere:true}).tasks.find(t=>t.id===fixed.id)).toEqual(fixed)
 })
 it('舊資料沒有 routedFrom：文字出發地當作沒換；切到目前位置算換了',()=>{
  const {routedFrom:_drop,...legacy}=routed()
  expect(routeProposal(legacy).tasks.every(t=>t.candidate)).toBe(true)
  expect(routeProposal({...legacy,useHere:true}).tasks.some(t=>!t.candidate)).toBe(true)
 })
})
