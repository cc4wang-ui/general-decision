// Google Routes matrix: walking travel durations, fixed appointment feasibility and leg-by-leg ETAs.
// Fail closed: never present straight-line distances as travel time.
export type Point={lat:number;lng:number}
/** 目前位置（GPS）：只收有限數字、緯度 -90～90、經度 -180～180；其他一律 null（呼叫端回 400，不猜）。 */
export function validPoint(v:unknown):Point|null{
 if(!v||typeof v!=='object'||Array.isArray(v))return null
 const {lat,lng}=v as Record<string,unknown>
 if(typeof lat!=='number'||typeof lng!=='number'||!Number.isFinite(lat)||!Number.isFinite(lng))return null
 if(lat<-90||lat>90||lng<-180||lng>180)return null
 return {lat,lng}
}
export type ScheduledStop={id:string;title?:string;minutes?:number;start?:string;locked?:boolean;custom?:boolean;done?:boolean;candidate?:Point;eta?:string;departure?:string;travelMin?:number;conflict?:string
/** 跨日偏移（PR-4 修正輪）：錨點當日為第 0 天；ETA／離開時間跨過午夜為 1，依此類推。
 * 與 eta／departure 同一束：清掉 ETA 時一起清。舊回應／舊存檔沒有此欄位時視為 0（當天）。 */
etaDayOffset?:number;departureDayOffset?:number}
const clock=(m:number)=>String(Math.floor(m/60)%24).padStart(2,'0')+':'+String(Math.round(m%60)).padStart(2,'0')
const minute=(t:string)=>/^([01]\d|2[0-3]):[0-5]\d$/.test(t)?Number(t.slice(0,2))*60+Number(t.slice(3)):null
/** 有效開始時間（PR-4）：使用者開始時間合法（HH:MM）且比伺服器當下時間晚 → 用
 * 使用者的；其餘情況（未指定、不合法、等於或早於當下）→ 用伺服器當下時間。
 * 錨點不能在過去（過去的 ETA 是假資訊）；比較只比同一天的 HH:MM 分鐘數。
 * 伺服器值本身不合法時回它本身（防禦；呼叫端傳的一定是合法值）——本函式
 * 不知道 09:00 的存在，09:00 fallback 只在 scheduleRoute 的 minute(now) ?? 9*60。 */
export function effectiveStartTime(userStart: unknown, serverNow: string): string {
  if (typeof userStart !== 'string') return serverNow
  const userMin = minute(userStart)
  const nowMin = minute(serverNow)
  if (userMin === null || nowMin === null) return serverNow
  return userMin > nowMin ? userStart : serverNow
}
/**
 * Round 11：403 要分得出「API 沒開」（SERVICE_DISABLED）還是「金鑰限制擋了」（API_KEY_SERVICE_BLOCKED），Cross 要做的事不一樣。
 * 只取 Google 錯誤的狀態、原因、專案編號、啟用網址；不含金鑰。只進伺服器 log，不回給使用者。
 */
export async function routesErrorDetail(response:Response):Promise<string>{
 let text=''
 try{text=await response.text()}catch{return ''}
 const scrub=(t:string)=>t.replace(/key=[^&\s"]+/gi,'key=…').replace(/AIza[0-9A-Za-z_-]{20,}/g,'AIza…').replace(/\s+/g,' ').trim()
 try{
  // computeRouteMatrix 是串流 API：錯誤可能包在陣列裡（[{error:{…}}]）。
  type GErr={error?:{status?:string;message?:string;details?:Array<{reason?:string;metadata?:Record<string,string>}>}}
  const raw=JSON.parse(text) as GErr|GErr[]
  const err=(Array.isArray(raw)?raw.find(x=>x&&x.error):raw)?.error
  const info=err?.details?.find(d=>d.reason)
  const meta=info?.metadata??{}
  // 沒有結構化原因時退回 Google 的說明文字（不含金鑰：Google 不回傳金鑰；保險起見把 key= 後面遮掉）。
  const fallback=info||!err?.message?undefined:scrub(err.message).slice(0,200)
  const parts=[err?.status,info?.reason,meta.consumer,meta.activationUrl,fallback].filter((x):x is string=>typeof x==='string'&&x.length>0)
  if(parts.length)return ' '+parts.join(' ').slice(0,400)
 }catch{/* 不是 JSON（例：代理的 HTML 錯誤頁）→ 下面留原文 */}
 // 解不出原因：留前 160 字，遮掉金鑰樣式的字串。
 const t=scrub(text).slice(0,160)
 return t?' '+t:''
}
type RouteElement={originIndex:number;destinationIndex:number;duration?:string;distanceMeters?:number;condition?:string;status?:{code?:number}}
export async function travelMatrix(key:string,origin:Point,stops:ScheduledStop[]):Promise<{matrix:number[][];distances:number[][]}>{
 const points=[origin,...stops.map(s=>s.candidate).filter((p):p is Point=>!!p)]
 const waypoints=points.map(p=>({waypoint:{location:{latLng:{latitude:p.lat,longitude:p.lng}}}}))
 const response=await fetch((process.env.ROUTES_BASE_URL??'https://routes.googleapis.com')+'/distanceMatrix/v2:computeRouteMatrix',{
  method:'POST',headers:{'content-type':'application/json','X-Goog-Api-Key':key,'X-Goog-FieldMask':'originIndex,destinationIndex,duration,distanceMeters,status,condition'},
  body:JSON.stringify({origins:waypoints,destinations:waypoints,travelMode:'WALK',routingPreference:'ROUTING_PREFERENCE_UNSPECIFIED'}),signal:AbortSignal.timeout(14000)})
 if(!response.ok)throw new Error('Google Routes 步行路線服務未啟用或暫時不可用（'+response.status+'）'+(await routesErrorDetail(response)))
 const body=await response.text()
 let elements:RouteElement[]=[]
 try{const data=JSON.parse(body) as RouteElement|RouteElement[];elements=Array.isArray(data)?data:[data]}catch{elements=body.split('\n').filter(Boolean).map(line=>JSON.parse(line) as RouteElement)}
 const matrix=points.map((_,i)=>points.map((__,j)=>i===j?0:Infinity))
 const distances=points.map((_,i)=>points.map((__,j)=>i===j?0:Infinity))
 for(const e of elements){if(e.status?.code||e.condition==='ROUTE_NOT_FOUND')continue
  const seconds=Number(e.duration?.replace('s',''))
  if(Number.isFinite(seconds)&&e.originIndex<points.length&&e.destinationIndex<points.length){
   const mRow=matrix[e.originIndex],dRow=distances[e.originIndex]
   // 兩行都存在：matrix/distances 都是 points.length 列，originIndex 已驗證 < points.length。
   if(mRow&&dRow){mRow[e.destinationIndex]=Math.ceil(seconds/60);dRow[e.destinationIndex]=(e.distanceMeters??0)/1000}
  }
 }
 if(matrix.some(row=>row.some(v=>!Number.isFinite(v))))throw new Error('部分站點沒有可用步行路線；不會以直線距離冒充實際路線')
 return {matrix,distances}
}
export function scheduleRoute<T extends ScheduledStop>(stops:T[],matrix:number[][],distances:number[][],now:string):{stops:T[];distanceKm:number;travelMinutes:number;conflicts:string[]}{
 const originIndex=0,idx=new Map(stops.map((s,i)=>[s.id,i+1]))
 const anchorMin=minute(now)??9*60
 /** 固定安排只有 HH:MM、沒有日期（PR-4 修正輪，午夜規則，見 DESIGN §8）：
  * 對到同一條時間線時，取「當天」與「隔天」兩次出現中離錨點最近的一次；
  * 距離相等時取當天。昨天那一次永遠不考慮——行程從今天往後排，固定安排
  * 不可能是昨天。例：錨點 23:59＋00:30 → 隔天 00:30（31 分鐘後）；
  * 錨點 15:00＋10:00 → 當天 10:00（已過去 5 小時，照舊標晚到 310 分鐘）；
  * 錨點 00:00＋23:59 → 當天 23:59（不早於錨點，一律當天）。
  * 不合法／缺 start → null（無 deadline，既有行為）。 */
 const deadlineAbs=(start?:string):number|null=>{
  if(!start)return null
  const m=minute(start)
  if(m===null)return null
  return m>=anchorMin-720?m:m+1440
 }
 /** 絕對分鐘轉跨日偏移：錨點當日 0，跨過午夜 1，依此類推（clock() 只管 HH:MM 顯示）。 */
 const dayOffset=(abs:number)=>Math.floor(abs/1440)
 const appointments=stops.filter(s=>s.locked||s.custom||s.done).sort((a,b)=>(deadlineAbs(a.start)??Infinity)-(deadlineAbs(b.start)??Infinity))
 const flexible=stops.filter(s=>!appointments.includes(s))
 const ordered:T[]=[]
 let position=originIndex,at=anchorMin,travelMinutes=0,distanceKm=0
 const conflicts:string[]=[]
 const visit=(s:T)=>{
  const next=idx.get(s.id)
  const mRow=matrix[position],dRow=distances[position]
  // next 缺失或矩陣列缺失＝呼叫端給的 stops/matrix 對不上：無法算步行時間，fail closed（與下方
  // Number.isFinite 檢查同一原則：部分站點無法步行抵達，不以直線距離冒充）。
  if(next===undefined||!mRow||!dRow)throw new Error('部分站點無法步行抵達')
  const duration=mRow[next],distance=dRow[next]
  if(duration===undefined||distance===undefined||!Number.isFinite(duration))throw new Error('部分站點無法步行抵達')
  const arrival=at+duration,deadline=deadlineAbs(s.start)
  const eta=deadline!==null&&arrival<deadline?deadline:arrival
  const conflict=deadline!==null&&arrival>deadline?'預計晚到 '+(arrival-deadline)+' 分鐘':undefined
  if(conflict)conflicts.push((s.title??s.id)+'：'+conflict)
  ordered.push({...s,eta:clock(eta),departure:clock(eta+(s.minutes??45)),etaDayOffset:dayOffset(eta),departureDayOffset:dayOffset(eta+(s.minutes??45)),travelMin:duration,conflict})
  travelMinutes+=duration;distanceKm+=distance;at=eta+(s.minutes??45);position=next
 }
 for(const fixed of [...appointments,{id:'__end__'} as T]){
  const target=fixed.id==='__end__'?null:fixed
  const deadline=target?.start?deadlineAbs(target.start):null
  while(flexible.length){
   const possible=flexible.map((s,i)=>{
    const p=idx.get(s.id)
    const row=matrix[position]
    const leg=p===undefined?undefined:row?.[p]
    const targetIdx=target?idx.get(target.id):undefined
    const toFixed=target?(p===undefined||targetIdx===undefined?undefined:matrix[p]?.[targetIdx]):0
    // leg/toFixed 任一未知＝到不了或回不來：不可行，不參與排序（下方 filter 用型別守衛收窄 leg 為 number）。
    const feasible=deadline===null||(leg!==undefined&&toFixed!==undefined&&at+leg+(s.minutes??45)+toFixed<=deadline)
    return {i,leg,feasible}
   }).filter((x):x is {i:number;leg:number;feasible:boolean}=>x.feasible&&x.leg!==undefined&&Number.isFinite(x.leg)).sort((a,b)=>a.leg-b.leg)
   if(!possible.length)break
   const first=possible[0]
   if(!first)break
   const removed=flexible.splice(first.i,1)[0]
   if(!removed)break
   visit(removed)
  }
  if(target)visit(target)
 }
 // If a fixed appointment cannot be met, surface the conflict, never silently discard stops.
 // leg 未知（矩陣缺列）時以 Infinity 計：排到最後，visit 會因非有限時間而 throw，不靜默丟站。
 while(flexible.length){const row=matrix[position];const ranked=flexible.map((s,i)=>({i,leg:row?.[idx.get(s.id)??-1]??Infinity})).sort((a,b)=>a.leg-b.leg);const first=ranked[0];if(!first)break;const removed=flexible.splice(first.i,1)[0];if(!removed)break;visit(removed)}
 return {stops:ordered,distanceKm:Math.round(distanceKm*10)/10,travelMinutes,conflicts}
}
