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
 it('excludeFor：placeMem 封鎖排在最前，再來是不喜歡的店、該站換掉過的、其他站目前的候選',()=>{
  const tasks=buildDaily(state()).map(t=>({...t,candidate:cand('c-'+t.id)}))
  const s={...state(),tasks,disliked:['d1'],seen:{meal:['m1']}}
  expect(excludeFor(s,'meal',['p1','p2'])).toEqual(['p1','p2','d1','m1','c-gym','c-creative','c-coffee','c-shopping','c-rest'])
 })
 it('excludeFor：不喜歡 100＋placeMem 封鎖 30（不重疊）→ 30 家封鎖全在排除清單裡',()=>{
  const disliked=Array.from({length:100},(_,i)=>'d'+i)
  const blocked=Array.from({length:30},(_,i)=>'m'+i)
  const tasks=buildDaily(state()).map(t=>({...t,candidate:cand('c-'+t.id)}))
  const s={...state(),tasks,disliked,seen:{meal:['s1','s2','s3','s4','s5']}}
  const out=excludeFor(s,'meal',blocked)
  expect(out).toHaveLength(140)
  expect(blocked.every(id=>out.includes(id))).toBe(true)
  expect(out.slice(0,30)).toEqual(blocked)
  expect(out.slice(30,130)).toEqual(disliked)
 })
 it('excludeFor：截斷時先保 placeMem 封鎖與不喜歡的店，最後才截換掉過的與其他站候選',()=>{
  const blocked=Array.from({length:100},(_,i)=>'p'+i)
  const disliked=Array.from({length:100},(_,i)=>'d'+i)
  const tasks=buildDaily(state()).map(t=>({...t,candidate:cand('c-'+t.id)}))
  const s={...state(),tasks,disliked,seen:{meal:Array.from({length:20},(_,i)=>'s'+i)}}
  const out=excludeFor(s,'meal',blocked)
  expect(out).toHaveLength(200)
  expect(out.slice(0,100)).toEqual(blocked)
  expect(out.slice(100,200)).toEqual(disliked)
  expect(out).not.toContain('s0')
  expect(out).not.toContain('c-gym')
 })
 it('excludeFor：不喜歡滿 100＋換掉過 5＋其他站 5，全都塞得下（上限 200），一個都不截',()=>{
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
 it('去重、保順序、上限 200',()=>{
  expect(mergeExclude(['a','b'],['b','c'])).toEqual(['a','b','c'])
  const big=Array.from({length:210},(_,i)=>'x'+i)
  expect(mergeExclude(big)).toHaveLength(200)
  expect(mergeExclude(big)[199]).toBe('x199')
 })
 it('生成路徑：placeMem 封鎖 30＋不喜歡 100，全都塞得下，一家都不截',()=>{
  const blocked=Array.from({length:30},(_,i)=>'m'+i)
  const disliked=Array.from({length:100},(_,i)=>'d'+i)
  const out=mergeExclude(blocked,disliked)
  expect(out).toHaveLength(130)
  expect(blocked.every(id=>out.includes(id))).toBe(true)
  expect(disliked.every(id=>out.includes(id))).toBe(true)
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
 it('當天 meal 任務帶車站候選：候選與路線資訊清掉（紅隊 round 2 Finding 4）；固定安排的 meal 候選不動',()=>{
  const meal={id:'meal',title:'定食',minutes:45,kind:'meal',done:false,place:'渋谷駅地下 1F',candidate:stationCand,eta:'12:00 抵達',departure:'11:30 離開',travelMin:30,conflict:'時間衝突'}
  const fixedMeal={id:'fixed-meal',title:'午餐約會',minutes:60,kind:'meal',done:false,locked:true,custom:true,candidate:stationCand}
  seed([meal,fixedMeal],[],[])
  const out=loadDaily()
  const loadedMeal=out.tasks.find(t=>t.id==='meal')!
  expect(loadedMeal.candidate).toBeUndefined()
  expect(loadedMeal.place).toBeUndefined()
  expect(loadedMeal.eta).toBeUndefined()
  expect(loadedMeal.departure).toBeUndefined()
  expect(loadedMeal.travelMin).toBeUndefined()
  expect(loadedMeal.conflict).toBeUndefined()
  expect(out.tasks.find(t=>t.id==='fixed-meal')?.candidate?.id).toBe('shibuya-station')
 })
 it('當天 meal 任務帶地標候選：同樣清掉；一般餐廳候選不動',()=>{
  const landmarkCand={id:'landmark-1',name:'澀谷十字路口',address:'渋谷',mapUrl:'https://maps.google.com/?cid=landmark-1',lat:35.6595,lng:139.7005,rating:4.5,userRatingCount:5000,types:['tourist_attraction'],primaryType:'tourist_attraction'}
  const meal={id:'meal',title:'定食',minutes:45,kind:'meal',done:false,candidate:landmarkCand}
  const coffee={id:'coffee',title:'咖啡',minutes:60,kind:'creative',done:false,candidate:{id:'c1',name:'某咖啡店',address:'渋谷',mapUrl:'https://maps.google.com/?cid=c1',lat:35.66,lng:139.70,types:['cafe'],primaryType:'cafe'}}
  seed([meal,coffee],[],[])
  const out=loadDaily()
  expect(out.tasks.find(t=>t.id==='meal')?.candidate).toBeUndefined()
  expect(out.tasks.find(t=>t.id==='coffee')?.candidate?.id).toBe('c1')
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

describe('loadDaily：既有候選保留規則統一（紅隊 round 5 item 7，round 6）',()=>{
 beforeEach(()=>{localStorage.clear()})
 afterEach(()=>{localStorage.clear()})
 const stationCand={id:'shibuya-station',name:'渋谷駅',address:'渋谷駅地下 1F',mapUrl:'https://maps.google.com/?cid=shibuya-station',lat:35.6595,lng:139.7005,rating:4.1,userRatingCount:9000,types:['transit_station'],primaryType:'transit_station'}
 const seedRaw=(raw:Record<string,unknown>)=>{
  localStorage.setItem(KEY,JSON.stringify({day:todayTokyo(),area:'澀谷',currentPlace:'渋谷駅',mode:'creative',notes:[],avoid:[],seen:{},disliked:[],dislikedKinds:[],...raw}))
 }
 it('已完成 meal 的車站候選保留（使用者的選擇；伺服器端同一規則）',()=>{
  const meal={id:'meal',title:'定食',minutes:45,kind:'meal',done:true,candidate:stationCand}
  seedRaw({tasks:[meal]})
  expect(loadDaily().tasks.find(t=>t.id==='meal')?.candidate?.id).toBe('shibuya-station')
 })
 it('已完成 rest 的車站候選清掉：rest 從來沒有可拜訪的店家，已完成與否都不帶候選',()=>{
  const rest={id:'rest',title:'散步回家',minutes:75,kind:'rest',done:true,candidate:stationCand,eta:'18:00 抵達',departure:'17:00 離開',travelMin:30}
  seedRaw({tasks:[rest]})
  const out=loadDaily().tasks.find(t=>t.id==='rest')!
  expect(out.candidate).toBeUndefined()
  expect(out.eta).toBeUndefined()
  expect(out.travelMin).toBeUndefined()
 })
 it('未完成 meal 的車站候選照樣清掉（item 7 只改已完成站）',()=>{
  const meal={id:'meal',title:'定食',minutes:45,kind:'meal',done:false,candidate:stationCand}
  seedRaw({tasks:[meal]})
  expect(loadDaily().tasks.find(t=>t.id==='meal')?.candidate).toBeUndefined()
 })
})

describe('loadDaily：地區偏好移轉（紅隊 round 5 F7，round 6）',()=>{
 beforeEach(()=>{localStorage.clear()})
 afterEach(()=>{localStorage.clear()})
 const seedRaw=(raw:Record<string,unknown>)=>{
  localStorage.setItem(KEY,JSON.stringify({day:todayTokyo(),area:'澀谷',currentPlace:'渋谷駅',mode:'creative',tasks:[],notes:[],avoid:[],seen:{},disliked:[],dislikedKinds:[],...raw}))
 }
 it('舊資料的跨區自由文字偏好轉成結構化偏好：notes 移除那一行，area 澀谷、areaOnly 開啟',()=>{
  seedRaw({notes:['固定健身房：FIT-EASY；不推薦其他付費健身房','以澀谷為生活基地，避免不必要跨區','偏好安靜咖啡廳、日式定食、藝術與日本 IP']})
  const out=loadDaily()
  expect(out.notes).not.toContain('以澀谷為生活基地，避免不必要跨區')
  expect(out.notes).toContain('固定健身房：FIT-EASY；不推薦其他付費健身房')
  expect(out.notes).toContain('偏好安靜咖啡廳、日式定食、藝術與日本 IP')
  expect(out.area).toBe('澀谷')
  expect(out.areaOnly).toBe(true)
 })
 it('舊資料沒有 areaOnly 欄位時預設開啟（當時沒有關掉的辦法，開啟才是忠實轉換）',()=>{
  seedRaw({area:'新宿'})
  const out=loadDaily()
  expect(out.area).toBe('新宿')
  expect(out.areaOnly).toBe(true)
 })
 it('舊資料 areaOnly 明確關掉時保持關掉',()=>{
  seedRaw({area:'新宿',areaOnly:false})
  const out=loadDaily()
  expect(out.area).toBe('新宿')
  expect(out.areaOnly).toBe(false)
 })
 it('舊資料 area 是未知地區時退回澀谷（防禦：打錯字不該整單失敗）',()=>{
  seedRaw({area:'吉祥寺',areaOnly:true})
  expect(loadDaily().area).toBe('澀谷')
 })
})
