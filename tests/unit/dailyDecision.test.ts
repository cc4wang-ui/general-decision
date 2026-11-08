import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildDaily, replanDaily, withSeen, excludeFor, mergeExclude, loadDaily, addFixedTask, mapsNavigationUrl, originKey, routeProposal, type DailyState, type DailyTask } from '../../src/dailyDecision.tsx'

const KEY = 'decide.daily.v1'
const todayTokyo = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())

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

describe('shuffle 排除清單（seen／disliked）',()=>{
 const cand=(id:string)=>({id,name:id,address:'渋谷',mapUrl:'https://maps.google.com/?cid='+id,lat:35.66,lng:139.70})
 it('withSeen：換掉的店記進該站，同一間重複記只留一筆',()=>{
  const s={...state(),tasks:buildDaily(state())}
  const once=withSeen(s,'meal','m1')
  expect(once.seen?.meal).toEqual(['m1'])
  expect(withSeen(once,'meal','m1').seen?.meal).toEqual(['m1'])
  expect(withSeen(once,'meal','m2').seen?.meal).toEqual(['m1','m2'])
 })
 it('excludeFor：不喜歡的店優先，其次該站換掉過的，再來是其他站目前的候選',()=>{
  const tasks=buildDaily(state()).map(t=>({...t,candidate:cand('c-'+t.id)}))
  const s={...state(),tasks,disliked:['d1'],seen:{meal:['m1','m2']}}
  expect(excludeFor(s,'meal')).toEqual(['d1','m1','m2','c-gym','c-creative','c-coffee','c-shopping','c-rest'])
 })
 it('excludeFor：placeMem 封鎖排在不喜歡的店之後、換掉過的之前',()=>{
  const tasks=buildDaily(state()).map(t=>({...t,candidate:cand('c-'+t.id)}))
  const s={...state(),tasks,disliked:['d1'],seen:{meal:['m1']}}
  expect(excludeFor(s,'meal',['p1','p2'])).toEqual(['d1','p1','p2','m1','c-gym','c-creative','c-coffee','c-shopping','c-rest'])
 })
 it('excludeFor：截斷時先保不喜歡的店與換掉過的，最後才截其他站候選',()=>{
  const disliked=Array.from({length:115},(_,i)=>'d'+i)
  const tasks=buildDaily(state()).map(t=>({...t,candidate:cand('c-'+t.id)}))
  const s={...state(),tasks,disliked,seen:{meal:['m1','m2','m3','m4','m5']}}
  const out=excludeFor(s,'meal')
  expect(out).toHaveLength(120)
  expect(out.slice(0,115)).toEqual(disliked)
  expect(out.slice(115)).toEqual(['m1','m2','m3','m4','m5'])
  expect(out).not.toContain('c-gym')
 })
 it('excludeFor：不喜歡滿 100＋換掉過 5＋其他站 5，全都塞得下（上限 120），一個都不截',()=>{
  const disliked=Array.from({length:100},(_,i)=>'d'+i)
  const tasks=buildDaily(state()).map(t=>({...t,candidate:cand('c-'+t.id)}))
  const s={...state(),tasks,disliked,seen:{meal:['m1','m2','m3','m4','m5']}}
  const out=excludeFor(s,'meal')
  expect(out).toHaveLength(110)
  expect(out.slice(0,100)).toEqual(disliked)
  expect(out.slice(100,105)).toEqual(['m1','m2','m3','m4','m5'])
  expect(out).toContain('c-gym')
 })
})

describe('mergeExclude：合併排除清單',()=>{
 it('去重、保順序、上限 120',()=>{
  expect(mergeExclude(['a','b'],['b','c'])).toEqual(['a','b','c'])
  const big=Array.from({length:130},(_,i)=>'x'+i)
  expect(mergeExclude(big)).toHaveLength(120)
  expect(mergeExclude(big)[119]).toBe('x119')
 })
})

describe('loadDaily：上限留最新、rest 殘留清除（紅隊 §3.3／§3.4）',()=>{
 beforeEach(()=>{localStorage.clear()})
 afterEach(()=>{localStorage.clear()})
 const stationCand={id:'shibuya-station',name:'渋谷駅',address:'渋谷駅地下 1F',mapUrl:'https://maps.google.com/?cid=shibuya-station',lat:35.6595,lng:139.7005,rating:4.1,userRatingCount:9000,types:['transit_station'],primaryType:'transit_station'}
 const seed=(tasks:unknown[],disliked:string[],dislikedKinds:string[])=>{
  localStorage.setItem(KEY,JSON.stringify({day:todayTokyo(),area:'澀谷',currentPlace:'渋谷駅',mode:'creative',tasks,notes:[],avoid:[],seen:{},disliked,dislikedKinds}))
 }
 it('不喜歡 101 家：留最新的 100 家（第 101 家＝最新的一家還在，最舊的一家被清掉）',()=>{
  const disliked=Array.from({length:101},(_,i)=>'d'+i)
  seed([],disliked,[])
  const out=loadDaily()
  expect(out.disliked).toHaveLength(100)
  expect(out.disliked![0]).toBe('d1')
  expect(out.disliked![99]).toBe('d100')
  expect(out.disliked).not.toContain('d0')
 })
 it('舊版種類鍵 ramen_restaurant 讀進來就轉成 ramen',()=>{
  seed([],[],['ramen_restaurant'])
  expect(loadDaily().dislikedKinds).toEqual(['ramen'])
 })
 it('當天 rest 任務帶車站候選：候選與路線資訊清掉，變回純文字站；其他站候選不動',()=>{
  const meal={id:'meal',title:'定食',minutes:45,kind:'meal',done:false,candidate:{id:'m1',name:'d47食堂',address:'渋谷',mapUrl:'https://maps.google.com/?cid=m1',lat:35.66,lng:139.70}}
  const rest={id:'rest',title:'散步回家',minutes:75,kind:'rest',done:false,candidate:stationCand,eta:'18:00 抵達',departure:'17:00 離開',travelMin:30}
  seed([meal,rest],[],[])
  const out=loadDaily()
  const loadedRest=out.tasks.find(t=>t.id==='rest')!
  expect(loadedRest.candidate).toBeUndefined()
  expect(loadedRest.eta).toBeUndefined()
  expect(loadedRest.travelMin).toBeUndefined()
  expect(out.tasks.find(t=>t.id==='meal')?.candidate?.id).toBe('m1')
 })
 it('固定安排的 rest 候選不動（那是使用者的選擇，不是舊版殘留）',()=>{
  const fixed={id:'fixed-1',title:'與朋友見面',minutes:60,kind:'rest',done:false,locked:true,custom:true,candidate:{id:'c1',name:'某咖啡店',address:'渋谷',mapUrl:'https://maps.google.com/?cid=c1',lat:35.66,lng:139.70}}
  seed([fixed],[],[])
  expect(loadDaily().tasks.find(t=>t.id==='fixed-1')?.candidate?.id).toBe('c1')
 })
})
describe('Daily itinerary controls',()=>{
 it('preserves user-defined place after replanning',()=>{
  const initial={...state(),tasks:buildDaily(state()).map(t=>t.id==='coffee'?{...t,place:'代官山'}:t)}
  expect(replanDaily(initial).tasks.find(t=>t.id==='coffee')?.place).toBe('代官山')
 })
 it('keeps fixed existing commitments across replan',()=>{
  const withFixed=addFixedTask(state(),'與朋友見面','吉祥寺','15:00',60)
  const fixed=withFixed.tasks[0]
  expect(fixed.locked).toBe(true)
  const result=replanDaily(withFixed)
  expect(result.tasks.find(t=>t.id===fixed.id)).toEqual(fixed)
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
