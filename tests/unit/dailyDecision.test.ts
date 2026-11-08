import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildDaily, replanDaily, withSeen, excludeFor, excludeForInfo, othersFor, catalogTitle, mergeExclude, mergeExcludeInfo, loadDaily, addFixedTask, mapsNavigationUrl, originKey, routeProposal, clearStaleCandidate, noCandidateText, type DailyState, type DailyTask } from '../../src/dailyDecision.tsx'

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
 it('excludeFor（round 8 K1）：只含「使用者不要的店」——不喜歡的店、該站換掉過的；其他站目前的候選不再進 exclude（另外走 othersFor）',()=>{
  const tasks=buildDaily(state()).map(t=>({...t,candidate:cand('c-'+t.id)}))
  const s={...state(),tasks,disliked:['d1'],seen:{meal:['m1','m2']}}
  expect(excludeFor(s,'meal')).toEqual(['d1','m1','m2'])
 })
 it('othersFor（round 8 K1）：其他站目前的候選另外送——只在新搜尋防重複，不進 retention 重驗',()=>{
  const tasks=buildDaily(state()).map(t=>({...t,candidate:cand('c-'+t.id)}))
  const s={...state(),tasks,disliked:['d1'],seen:{meal:['m1','m2']}}
  expect(othersFor(s,'meal')).toEqual(['c-gym','c-creative','c-coffee','c-shopping','c-rest'])
  // 被換的那一站自己的候選不在 others 裡（它已經在 seen 裡了）
  expect(othersFor(s,'meal')).not.toContain('c-meal')
  // 沒有候選的站不會進 others
  const noCand={...s,tasks:s.tasks.map(t=>t.id==='coffee'?{...t,candidate:undefined}:t)}
  expect(othersFor(noCand,'meal')).toEqual(['c-gym','c-creative','c-shopping','c-rest'])
 })
 it('excludeFor：placeMem 封鎖排在最前，再來是不喜歡的店、該站換掉過的（其他站候選另外走 othersFor）',()=>{
  const tasks=buildDaily(state()).map(t=>({...t,candidate:cand('c-'+t.id)}))
  const s={...state(),tasks,disliked:['d1'],seen:{meal:['m1']}}
  expect(excludeFor(s,'meal',['p1','p2'])).toEqual(['p1','p2','d1','m1'])
  expect(othersFor(s,'meal')).toEqual(['c-gym','c-creative','c-coffee','c-shopping','c-rest'])
 })
 it('excludeFor：不喜歡 100＋placeMem 封鎖 30（不重疊）→ 30 家封鎖全在排除清單裡',()=>{
  const disliked=Array.from({length:100},(_,i)=>'d'+i)
  const blocked=Array.from({length:30},(_,i)=>'m'+i)
  const tasks=buildDaily(state()).map(t=>({...t,candidate:cand('c-'+t.id)}))
  const s={...state(),tasks,disliked,seen:{meal:['s1','s2','s3','s4','s5']}}
  const out=excludeFor(s,'meal',blocked)
  expect(out).toHaveLength(135)
  expect(blocked.every(id=>out.includes(id))).toBe(true)
  expect(out.slice(0,30)).toEqual(blocked)
  expect(out.slice(30,130)).toEqual(disliked)
 })
 it('excludeFor：截斷時先保 placeMem 封鎖與不喜歡的店，最後才截換掉過的',()=>{
  const blocked=Array.from({length:100},(_,i)=>'p'+i)
  const disliked=Array.from({length:100},(_,i)=>'d'+i)
  const tasks=buildDaily(state()).map(t=>({...t,candidate:cand('c-'+t.id)}))
  const s={...state(),tasks,disliked,seen:{meal:Array.from({length:20},(_,i)=>'s'+i)}}
  const out=excludeFor(s,'meal',blocked)
  expect(out).toHaveLength(200)
  expect(out.slice(0,100)).toEqual(blocked)
  expect(out.slice(100,200)).toEqual(disliked)
  expect(out).not.toContain('s0')
  expect(excludeForInfo(s,'meal',blocked).dropped).toBe(20)
 })
 it('excludeFor：不喜歡滿 100＋換掉過 5，全都塞得下（上限 200），一個都不截；其他站候選另外走 othersFor，不佔額度',()=>{
  const disliked=Array.from({length:100},(_,i)=>'d'+i)
  const tasks=buildDaily(state()).map(t=>({...t,candidate:cand('c-'+t.id)}))
  const s={...state(),tasks,disliked,seen:{meal:['m1','m2','m3','m4','m5']}}
  const out=excludeFor(s,'meal')
  expect(out).toHaveLength(105)
  expect(out.slice(0,100)).toEqual(disliked)
  expect(out.slice(100,105)).toEqual(['m1','m2','m3','m4','m5'])
  expect(othersFor(s,'meal')).toHaveLength(5)
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
  const meal={id:'meal',title:'定食',minutes:45,kind:'meal',done:false,candidate:{id:'m1',name:'d47食堂',address:'渋谷',mapUrl:'https://maps.google.com/?cid=m1',lat:35.66,lng:139.70,userRatingCount:120}}
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
  const coffee={id:'coffee',title:'咖啡',minutes:60,kind:'creative',done:false,candidate:{id:'c1',name:'某咖啡店',address:'渋谷',mapUrl:'https://maps.google.com/?cid=c1',lat:35.66,lng:139.70,userRatingCount:200,types:['cafe'],primaryType:'cafe'}}
  seed([meal,coffee],[],[])
  const out=loadDaily()
  expect(out.tasks.find(t=>t.id==='meal')?.candidate).toBeUndefined()
  expect(out.tasks.find(t=>t.id==='coffee')?.candidate?.id).toBe('c1')
 })
 it('round 8 N3：rest 純文字站（沒候選、沒 noCandidate 標記）重進頁面還在，不再被過濾器濾掉（live round 7 N3）',()=>{
  const meal={id:'meal',title:'定食',minutes:45,kind:'meal',done:false,candidate:{id:'m1',name:'d47食堂',address:'渋谷',mapUrl:'https://maps.google.com/?cid=m1',lat:35.66,lng:139.70,userRatingCount:120}}
  const rest={id:'rest',title:'散步回家、休息與晚餐',minutes:75,kind:'rest',done:false}
  seed([meal,rest],[],[])
  const out=loadDaily()
  expect(out.tasks.map(t=>t.id)).toEqual(['meal','rest'])
  expect(out.tasks.find(t=>t.id==='rest')?.kind).toBe('rest')
 })
 it('round 9 標題還原只在不喜歡／種類排除時做（F1a）：DENY 清掉時 title 不動；被不喜歡的候選清掉時才還原成目錄標題——round 8 不分原因一律還原是錯的',()=>{
  const meal={id:'meal',title:'麺喜やしま',minutes:45,kind:'meal',done:false,place:'渋谷駅地下 1F',candidate:stationCand}
  const specified={id:'meal',title:'我指定的店',minutes:45,kind:'meal',done:false,specified:true,place:'某定食店',candidate:stationCand}
  // DENY（車站候選）清掉：候選沒了，title 照留
  expect(clearStaleCandidate(meal as DailyTask).candidate).toBeUndefined()
  expect(clearStaleCandidate(meal as DailyTask).title).toBe('麺喜やしま')
  // 被不喜歡的候選清掉：title 還原成目錄標題（紅隊 round 7 §3 第 9 項的原意）
  const dislikedMeal={id:'meal',title:'麺喜やしま',minutes:45,kind:'meal',done:false,candidate:{id:'y1',name:'麺喜やしま',address:'渋谷',mapUrl:'https://maps.google.com/?cid=y1',lat:35.66,lng:139.70,userRatingCount:808}}
  expect(clearStaleCandidate(dislikedMeal as DailyTask,{disliked:['y1'],dislikedKinds:[],area:'澀谷',areaOnly:false}).title).toBe('澀谷｜一人友善的日式定食')
  // 種類排除清掉：title 也還原
  const udonMeal={id:'meal',title:'麺処讃岐うどん',minutes:45,kind:'meal',done:false,candidate:{id:'u1',name:'麺処讃岐うどん',address:'渋谷',mapUrl:'https://maps.google.com/?cid=u1',lat:35.66,lng:139.70,userRatingCount:300}}
  expect(clearStaleCandidate(udonMeal as DailyTask,{disliked:[],dislikedKinds:['udon'],area:'澀谷',areaOnly:false}).title).toBe('澀谷｜一人友善的日式定食')
  // 指定站的 title 不動
  expect(clearStaleCandidate(specified as DailyTask).title).toBe('我指定的店')
  // catalogTitle 跟伺服器端 CATALOG_TITLES 同步（改一邊要改另一邊）
  expect(catalogTitle('meal')).toBe('澀谷｜一人友善的日式定食')
  expect(catalogTitle('rest')).toBe('散步回家、休息與晚餐')
  expect(catalogTitle('gym')).toBe('FIT-EASY｜80 分鐘力量訓練')
  expect(catalogTitle('fixed-1')).toBeUndefined()
  // 經 loadDaily 走一遍：DENY 的 meal title 照留；被不喜歡的 meal title 還原
  seed([meal],[],[])
  expect(loadDaily().tasks.find(t=>t.id==='meal')?.title).toBe('麺喜やしま')
  seed([dislikedMeal],['y1'],[])
  expect(loadDaily().tasks.find(t=>t.id==='meal')?.title).toBe('澀谷｜一人友善的日式定食')
 })
 it('round 9：rest 帶車站候選重進頁面——候選清掉，站還在，title 不動（F1a：標題還原只在不喜歡／種類排除時做）',()=>{
  const rest={id:'rest',title:'散步回家',minutes:75,kind:'rest',done:false,candidate:stationCand}
  seed([rest],[],[])
  const out=loadDaily()
  const loadedRest=out.tasks.find(t=>t.id==='rest')!
  expect(loadedRest.candidate).toBeUndefined()
  expect(loadedRest.title).toBe('散步回家')
 })
})
describe('round 9 F1b：缺評論數＝未知，不清掉（e2e daily-location.spec.ts:69 迴歸）',()=>{
 beforeEach(()=>{localStorage.clear()})
 afterEach(()=>{localStorage.clear()})
 const seed=(tasks:unknown[],disliked:string[],dislikedKinds:string[])=>{
  localStorage.setItem(KEY,JSON.stringify({day:todayTokyo(),area:'澀谷',currentPlace:'渋谷駅',mode:'creative',tasks,notes:[],avoid:[],seen:{},disliked,dislikedKinds}))
 }
 it('e2e seed 形狀：候選沒有 userRatingCount、沒有 types——loadDaily 後候選與標題都還在（不是被清掉＋換成目錄標題）',()=>{
  const coffee={id:'coffee',kind:'creative',title:'原本的咖啡店',minutes:60,done:false,candidate:{id:'old1',name:'原本的咖啡店',address:'渋谷',mapUrl:'https://maps.google.com/?cid=old1',lat:35.66,lng:139.70}}
  seed([coffee],[],[])
  const out=loadDaily().tasks.find(t=>t.id==='coffee')!
  expect(out.candidate?.id).toBe('old1')
  expect(out.title).toBe('原本的咖啡店')
 })
 it('評論數欄位存在且 < 50 才清：12 則清掉（title 不動）、120 則留著；gym 不受門檻影響',()=>{
  const low={id:'meal',title:'新開的小店',minutes:45,kind:'meal',done:false,candidate:{id:'n1',name:'新開的小店',address:'渋谷',mapUrl:'https://maps.google.com/?cid=n1',lat:35.66,lng:139.70,userRatingCount:12}}
  const ok={id:'coffee',title:'某咖啡店',minutes:60,kind:'creative',done:false,candidate:{id:'c1',name:'某咖啡店',address:'渋谷',mapUrl:'https://maps.google.com/?cid=c1',lat:35.66,lng:139.70,userRatingCount:120}}
  const gym={id:'gym',title:'FIT-EASY',minutes:80,kind:'gym',done:false,candidate:{id:'g1',name:'FIT-EASY 渋谷店',address:'渋谷',mapUrl:'https://maps.google.com/?cid=g1',lat:35.66,lng:139.70,userRatingCount:12}}
  seed([low,ok,gym],[],[])
  const out=loadDaily()
  expect(out.tasks.find(t=>t.id==='meal')?.candidate).toBeUndefined()
  expect(out.tasks.find(t=>t.id==='meal')?.title).toBe('新開的小店')
  expect(out.tasks.find(t=>t.id==='coffee')?.candidate?.id).toBe('c1')
  expect(out.tasks.find(t=>t.id==='gym')?.candidate?.id).toBe('g1')
 })
 it('跨區清掉時 title 也不動（F1a：只有不喜歡／種類排除才還原標題）',()=>{
  const far={id:'meal',title:'原宿的定食店',minutes:45,kind:'meal',done:false,candidate:{id:'h1',name:'原宿的定食店',address:'原宿',mapUrl:'https://maps.google.com/?cid=h1',lat:35.67,lng:139.70,userRatingCount:200}}
  seed([far],[],[])
  const out=loadDaily().tasks.find(t=>t.id==='meal')!
  expect(out.candidate).toBeUndefined()
  expect(out.title).toBe('原宿的定食店')
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

describe('loadDaily：既有候選重驗（round 7 L1／L2）', () => {
  beforeEach(() => { localStorage.clear() })
  afterEach(() => { localStorage.clear() })
  const seed = (tasks: unknown[], disliked: string[] = [], dislikedKinds: string[] = [], extra: Record<string, unknown> = {}) => {
    localStorage.setItem(KEY, JSON.stringify({ day: todayTokyo(), area: '澀谷', areaOnly: true, currentPlace: '渋谷駅', mode: 'creative', tasks, notes: [], avoid: [], seen: {}, disliked, dislikedKinds, ...extra }))
  }
  /** 澀谷店候選（距中心約 72 公尺）、原宿店候選（約 1233 公尺）。 */
  const shibuyaCand = { id: 'sundrug-shibuya', name: 'サンドラッグ 渋谷店', address: '渋谷', mapUrl: 'https://maps.google.com/?cid=sundrug-shibuya', lat: 35.6590, lng: 139.7010, rating: 4.1, userRatingCount: 200, types: ['drugstore'], primaryType: 'drugstore' }
  const harajukuCand = { id: 'sugi-harajuku', name: 'スギ薬局 原宿店', address: '原宿', mapUrl: 'https://maps.google.com/?cid=sugi-harajuku', lat: 35.6704, lng: 139.7030, rating: 4.0, userRatingCount: 150, types: ['drugstore'], primaryType: 'drugstore' }
  const task = (id: string, candidate: unknown, extra: Record<string, unknown> = {}) => ({ id, title: id, minutes: 30, kind: id === 'shopping' ? 'shopping' : 'meal', done: false, candidate, ...extra })
  it('自動站的既有原宿候選：地區偏好開啟時清掉（L1 前端版）', () => {
    seed([task('shopping', harajukuCand)])
    expect(loadDaily().tasks.find((t) => t.id === 'shopping')?.candidate).toBeUndefined()
  })
  it('自動站的既有澀谷候選：地區內，留著', () => {
    seed([task('shopping', shibuyaCand)])
    expect(loadDaily().tasks.find((t) => t.id === 'shopping')?.candidate?.id).toBe('sundrug-shibuya')
  })
  it('既有候選在 disliked 裡：自動站清掉；已完成站也清掉（id 排除對所有站生效）', () => {
    seed([task('shopping', shibuyaCand), task('meal', { ...shibuyaCand, id: 'maruya-1', name: '讃岐うどん まるや' }, { done: true })], ['sundrug-shibuya', 'maruya-1'])
    const out = loadDaily()
    expect(out.tasks.find((t) => t.id === 'shopping')?.candidate).toBeUndefined()
    expect(out.tasks.find((t) => t.id === 'meal')?.candidate).toBeUndefined()
  })
  it('既有候選的種類在 dislikedKinds 裡：自動站清掉；固定安排的站也清掉（種類排除對所有站生效）', () => {
    const maruyaCand = { id: 'maruya-1', name: '讃岐うどん まるや', address: '渋谷', mapUrl: 'https://maps.google.com/?cid=maruya-1', lat: 35.6590, lng: 139.7010, rating: 4.2, userRatingCount: 300, types: ['restaurant'], primaryType: 'restaurant' }
    const fixedMeal = { id: 'fixed-meal', title: '午餐約會', minutes: 60, kind: 'meal', done: false, locked: true, custom: true, candidate: maruyaCand }
    seed([task('meal', maruyaCand), fixedMeal], [], ['udon'])
    const out = loadDaily()
    expect(out.tasks.find((t) => t.id === 'meal')?.candidate).toBeUndefined()
    expect(out.tasks.find((t) => t.id === 'fixed-meal')?.candidate).toBeUndefined()
  })
  it('既有候選評論只有 12 則：自動站清掉；固定安排的站不動（評論門檻只對自動站）', () => {
    const lowCand = { ...shibuyaCand, userRatingCount: 12 }
    const fixed = { id: 'fixed-1', title: '藥局', minutes: 30, kind: 'shopping', done: false, locked: true, custom: true, candidate: lowCand }
    seed([task('shopping', lowCand), fixed])
    const out = loadDaily()
    expect(out.tasks.find((t) => t.id === 'shopping')?.candidate).toBeUndefined()
    expect(out.tasks.find((t) => t.id === 'fixed-1')?.candidate?.id).toBe('sundrug-shibuya')
  })
  it('無候選站重開頁面還在（noCandidate 標記＋原因留著，不會被過濾掉）', () => {
    seed([{ id: 'shopping', title: '藥局', minutes: 30, kind: 'shopping', done: false, noCandidate: true, noCandidateReason: 'area' }])
    const out = loadDaily()
    const stop = out.tasks.find((t) => t.id === 'shopping')!
    expect(stop.noCandidate).toBe(true)
    expect(stop.noCandidateReason).toBe('area')
  })
  it('clearStaleCandidate：指定地點的車站候選照留（item 7），但 id 在 disliked 裡就清掉（place 留著）', () => {
    const stationCand = { id: 'shibuya-station', name: '渋谷駅', address: '渋谷駅地下 1F', mapUrl: 'https://maps.google.com/?cid=shibuya-station', lat: 35.6595, lng: 139.7005, rating: 4.2, userRatingCount: 9000, types: ['transit_station'], primaryType: 'transit_station' }
    const specified = { id: 'meal', title: '定食', minutes: 45, kind: 'meal' as const, done: false, specified: true, place: '渋谷駅', candidate: stationCand }
    expect(clearStaleCandidate(specified).candidate?.id).toBe('shibuya-station')
    const cleared = clearStaleCandidate(specified, { disliked: ['shibuya-station'], dislikedKinds: [], area: '澀谷', areaOnly: true })
    expect(cleared.candidate).toBeUndefined()
    expect(cleared.place).toBe('渋谷駅')
  })
  it('noCandidateText：area 原因要寫明地區偏好是原因、怎麼解除', () => {
    expect(noCandidateText({ id: 'shopping', title: '藥局', minutes: 30, kind: 'shopping', done: false, noCandidate: true, noCandidateReason: 'area' }, '澀谷')).toContain('地區偏好（澀谷，1 公里內）')
    expect(noCandidateText({ id: 'shopping', title: '藥局', minutes: 30, kind: 'shopping', done: false, noCandidate: true, noCandidateReason: 'filtered' }, '澀谷')).toContain('都被排除了')
  })
})

describe('排除清單截斷通知（round 7）', () => {
  it('mergeExcludeInfo：150 封鎖＋100 不喜歡 → 截掉 50 家並回報 dropped', () => {
    const blocked = Array.from({ length: 150 }, (_, i) => 'p' + i)
    const disliked = Array.from({ length: 100 }, (_, i) => 'd' + i)
    const info = mergeExcludeInfo(blocked, disliked)
    expect(info.list).toHaveLength(200)
    expect(info.dropped).toBe(50)
    expect(info.list.slice(0, 150)).toEqual(blocked)
    expect(mergeExclude(blocked, disliked)).toEqual(info.list)
  })
  it('excludeForInfo：同樣回報 dropped；沒截斷時 dropped 是 0', () => {
    const s = { ...state(), tasks: buildDaily(state()), disliked: ['d1'], seen: { meal: ['m1'] } }
    expect(excludeForInfo(s, 'meal', ['p1']).dropped).toBe(0)
    expect(excludeFor(s, 'meal', ['p1'])).toEqual(excludeForInfo(s, 'meal', ['p1']).list)
  })
})

describe('round 10：R9-F1a-load——載入時清掉候選要說原因（不是只留舊店名）', () => {
  beforeEach(() => { localStorage.clear() })
  afterEach(() => { localStorage.clear() })
  const stationCand = { id: 'shibuya-station', name: '渋谷駅', address: '渋谷駅地下 1F', mapUrl: 'https://maps.google.com/?cid=shibuya-station', lat: 35.6595, lng: 139.7005, rating: 4.2, userRatingCount: 9000, types: ['transit_station', 'train_station'], primaryType: 'transit_station' }
  const harajukuCand = { id: 'sugi-harajuku', name: 'スギ薬局 原宿店', address: '原宿', mapUrl: 'https://maps.google.com/?cid=sugi-harajuku', lat: 35.6704, lng: 139.7030, rating: 4.0, userRatingCount: 150, types: ['drugstore'], primaryType: 'drugstore' }
  const seed = (tasks: unknown[], disliked: string[] = [], dislikedKinds: string[] = [], extra: Record<string, unknown> = {}) => {
    localStorage.setItem(KEY, JSON.stringify({ day: todayTokyo(), area: '澀谷', areaOnly: true, currentPlace: '渋谷駅', mode: 'creative', tasks, notes: [], avoid: [], seen: {}, disliked, dislikedKinds, ...extra }))
  }
  it('DENY 清掉：候選沒了、title 照留（round 9 F1a 不動），但該站標成 noCandidate 原因 denied（不再只剩舊店名加一句「地點尚未確認」）', () => {
    const meal = { id: 'meal', title: '麺喜やしま', minutes: 45, kind: 'meal', done: false, place: '渋谷駅地下 1F', candidate: stationCand }
    const out = clearStaleCandidate(meal as DailyTask)
    expect(out.candidate).toBeUndefined()
    expect(out.title).toBe('麺喜やしま')
    expect(out.noCandidate).toBe(true)
    expect(out.noCandidateReason).toBe('denied')
  })
  it('評論數 12 則清掉：noCandidate 原因 filtered、title 照留', () => {
    const lowCand = { id: 'sundrug-shibuya', name: 'サンドラッグ 渋谷店', address: '渋谷', mapUrl: 'https://maps.google.com/?cid=sundrug-shibuya', lat: 35.6590, lng: 139.7010, rating: 4.1, userRatingCount: 12, types: ['drugstore'], primaryType: 'drugstore' }
    const shopping = { id: 'shopping', title: '藥局', minutes: 30, kind: 'shopping', done: false, candidate: lowCand }
    const out = clearStaleCandidate(shopping as DailyTask, { disliked: [], dislikedKinds: [], area: '澀谷', areaOnly: false })
    expect(out.candidate).toBeUndefined()
    expect(out.title).toBe('藥局')
    expect(out.noCandidate).toBe(true)
    expect(out.noCandidateReason).toBe('filtered')
  })
  it('跨區清掉：noCandidate 原因 area、title 照留', () => {
    const shopping = { id: 'shopping', title: '藥局', minutes: 30, kind: 'shopping', done: false, candidate: harajukuCand }
    const out = clearStaleCandidate(shopping as DailyTask, { disliked: [], dislikedKinds: [], area: '澀谷', areaOnly: true })
    expect(out.candidate).toBeUndefined()
    expect(out.title).toBe('藥局')
    expect(out.noCandidate).toBe(true)
    expect(out.noCandidateReason).toBe('area')
  })
  it('rest 帶車站候選：候選清掉、不標 noCandidate（rest 是純文字站，顯示「散步回家，不用找店家。」就好）', () => {
    const rest = { id: 'rest', title: '散步回家', minutes: 75, kind: 'rest', done: false, candidate: stationCand }
    const out = clearStaleCandidate(rest as DailyTask)
    expect(out.candidate).toBeUndefined()
    expect(out.title).toBe('散步回家')
    expect(out.noCandidate).toBeUndefined()
  })
  it('被不喜歡清掉：title 照還原成目錄標題、不標 noCandidate——F1a 的範圍不動（原因在伺服器端已經是無候選卡片，標題還原是該路徑的行為）', () => {
    const dislikedMeal = { id: 'meal', title: '麺喜やしま', minutes: 45, kind: 'meal', done: false, candidate: { id: 'y1', name: '麺喜やしま', address: '渋谷', mapUrl: 'https://maps.google.com/?cid=y1', lat: 35.66, lng: 139.70, userRatingCount: 808 } }
    const out = clearStaleCandidate(dislikedMeal as DailyTask, { disliked: ['y1'], dislikedKinds: [], area: '澀谷', areaOnly: false })
    expect(out.candidate).toBeUndefined()
    expect(out.title).toBe('澀谷｜一人友善的日式定食')
    expect(out.noCandidate).toBeUndefined()
  })
  it('noCandidateText：denied 原因寫明是車站或地標、叫使用者按「換這一站」', () => {
    const t = { id: 'meal', title: '麺喜やしま', minutes: 45, kind: 'meal' as const, done: false, noCandidate: true, noCandidateReason: 'denied' as const }
    expect(noCandidateText(t, '澀谷')).toContain('車站或地標')
    expect(noCandidateText(t, '澀谷')).toContain('換這一站')
  })
  it('經 loadDaily 走一遍：DENY 的 meal 載入後就是 noCandidate denied、title 照留；跨區的 shopping 載入後是 noCandidate area', () => {
    const meal = { id: 'meal', title: '麺喜やしま', minutes: 45, kind: 'meal', done: false, place: '渋谷駅地下 1F', candidate: stationCand }
    const shopping = { id: 'shopping', title: '藥局', minutes: 30, kind: 'shopping', done: false, candidate: harajukuCand }
    seed([meal, shopping])
    const out = loadDaily()
    const loadedMeal = out.tasks.find((t) => t.id === 'meal')!
    expect(loadedMeal.candidate).toBeUndefined()
    expect(loadedMeal.title).toBe('麺喜やしま')
    expect(loadedMeal.noCandidate).toBe(true)
    expect(loadedMeal.noCandidateReason).toBe('denied')
    const loadedShopping = out.tasks.find((t) => t.id === 'shopping')!
    expect(loadedShopping.noCandidate).toBe(true)
    expect(loadedShopping.noCandidateReason).toBe('area')
  })
})
