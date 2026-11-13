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
 // daily-fixed-ontime（P0）：貪婪排法報晚到時，再找一次晚到站數最少的排法（目標 0）；嚴格比貪婪少才改用。
 // 把關第 1 輪：不能「全有或全無」——一個怎樣都趕不上的固定行程（例：時間已過）不能害其他行程失去救援。
 const replay=(seq:T[])=>{ordered.length=0;conflicts.length=0;position=originIndex;at=anchorMin;travelMinutes=0;distanceKm=0;for(const s of seq)visit(s)}
 if(conflicts.length){
  const seq=fewestLateOrder(stops,idx,matrix,anchorMin,deadlineAbs,conflicts.length)
  if(seq)replay(seq)
 }
 // daily-walk-shortest（P0）：上面的結果當參考排法。固定站、已完成站的位置不動；每個可移動站留在原本那段
 // （兩個固定站之間），只在段內改成步行最短。段內的站沒有開始時間、不會等待，所以步行變短＝到下一個固定站更早：
 // 晚到不會變多、結束不會變晚。不跨段移動，因為預覽站與把關第 1 輪實測：跨段會先去晚上的固定行程空等，
 // 把店排到半夜打烊後（runs/daily-walk-shortest/snapshots/preview-v1-pinned.json）。
 const shorter=shortestWithinSegments(ordered.map(o=>stops.find(s=>s.id===o.id)!),idx,matrix)
 if(shorter)replay(shorter)
 return {stops:ordered,distanceKm:Math.round(distanceKm*10)/10,travelMinutes,conflicts}
}
/** 搜尋節點上限：站多又趕不上時不卡住請求；用完就停，回目前找到的最好排法（沒有就 null，呼叫端保留貪婪結果與警告）。 */
export const ONTIME_SEARCH_NODES=20000
/**
 * 分支定界：找晚到站數比 greedyLate 少的排法，越少越好；找到 0 就停。每一步先試準時的站，再按步行由近到遠。
 * 剪枝：已晚到數＋「一定晚到」的站數 ≥ 目前最好 → 剪掉。「一定晚到」＝現在時間＋任何站走到該站的最短
 * 步行分鐘數 > 期限。不用「直走」當下界，因為 Google 步行矩陣不保證三角不等式（繞經別站可能比直走快）。
 * 晚到與等待的算法跟 visit 一致（早到等到開始時間；到達 > 期限才算晚到）。
 * 有時間的站都排完後，其餘站照貪婪的收尾規則：可移動站由近到遠，再接沒有時間的固定站。
 */
function fewestLateOrder<T extends ScheduledStop>(stops:T[],idx:Map<string,number>,matrix:number[][],anchorMin:number,deadlineAbs:(start?:string)=>number|null,greedyLate:number):T[]|null{
 const n=stops.length
 const node=stops.map(s=>idx.get(s.id)??-1)
 if(node.some(p=>p<0||!matrix[p]))return null
 const deadline=stops.map(s=>deadlineAbs(s.start))
 const stay=stops.map(s=>s.minutes??45)
 const fixed=stops.map(s=>!!(s.locked||s.custom||s.done))
 const leg=(from:number,to:number)=>{const v=matrix[from]?.[to];return v!==undefined&&Number.isFinite(v)?v:Infinity}
 const minIn=node.map(p=>Math.min(...matrix.map((row,i)=>i===p?Infinity:(Number.isFinite(row[p]??NaN)?row[p]!:Infinity))))
 const used=new Array<boolean>(n).fill(false)
 const seq:number[]=[]
 let budget=ONTIME_SEARCH_NODES,best=greedyLate,bestSeq:number[]|null=null
 const tail=(pos:number):number[]=>{
  const rest=stops.map((_,i)=>i).filter(i=>!used[i])
  const flex=rest.filter(i=>!fixed[i]),late=rest.filter(i=>fixed[i])
  const out:number[]=[]
  let p=pos
  while(flex.length){let k=0;flex.forEach((i,j)=>{if(leg(p,node[i]!)<leg(p,node[flex[k]!]!))k=j});const i=flex.splice(k,1)[0]!;out.push(i);p=node[i]!}
  return [...out,...late]
 }
 const dfs=(pos:number,at:number,late:number):void=>{
  if(--budget<0)return
  const open=stops.map((_,i)=>i).filter(i=>!used[i]&&deadline[i]!==null)
  if(!open.length){if(late<best){best=late;bestSeq=[...seq,...tail(pos)]}return}
  if(late+open.filter(i=>at+minIn[i]!>deadline[i]!).length>=best)return
  const next=stops.map((_,i)=>i).filter(i=>!used[i]).map(i=>{const l=leg(pos,node[i]!),dl=deadline[i]??null;return {i,l,dl,isLate:dl!==null&&at+l>dl}})
   .filter(x=>Number.isFinite(x.l)).sort((a,b)=>Number(a.isLate)-Number(b.isLate)||a.l-b.l)
  for(const {i,l,dl,isLate} of next){
   const nl=late+(isLate?1:0)
   if(nl>=best)continue
   const arrival=at+l
   used[i]=true;seq.push(i)
   dfs(node[i]!,(dl!==null&&arrival<dl?dl:arrival)+stay[i]!,nl)
   used[i]=false;seq.pop()
   if(best===0||budget<0)return
  }
 }
 dfs(0,anchorMin,0)
 const found=bestSeq as number[]|null // dfs 閉包內會改寫；TS 的流程分析看不到，所以要標型別
 return found?found.map(i=>stops[i]!):null
}
/** 一段最多幾個可移動站做精確最短（Held-Karp：2^k×k² 次運算；API 上限 9 站＝約 4 萬次）。超過就保留原順序。 */
export const WALK_SEGMENT_MAX=12
/**
 * daily-walk-shortest：參考排法依固定站（locked／custom／done）切段。每段＝前一個固定站（或出發點）→段內可移動站→
 * 下一個固定站（最後一段沒有終點）。每段用 Held-Karp 求步行分鐘最小的順序，嚴格比原順序短才換。
 * 都沒有變短就回 null（保留參考排法，不無故改順序）。
 */
function shortestWithinSegments<T extends ScheduledStop>(ref:T[],idx:Map<string,number>,matrix:number[][]):T[]|null{
 const leg=(from:number,to:number)=>{const v=matrix[from]?.[to];return v!==undefined&&Number.isFinite(v)?v:Infinity}
 const isFixed=(s:T)=>!!(s.locked||s.custom||s.done)
 const out:T[]=[]
 let changed=false,start=0,seg:T[]=[]
 const flush=(end:number|null)=>{
  const k=seg.length
  if(k>=2&&k<=WALK_SEGMENT_MAX){
   const nodes=seg.map(s=>idx.get(s.id)??-1)
   if(nodes.every(p=>p>=0)){
    const pathWalk=(order:number[])=>{let p=start,w=0;for(const i of order){w+=leg(p,nodes[i]!);p=nodes[i]!}return w+(end===null?0:leg(p,end))}
    const full=(1<<k)-1
    const dp=Array.from({length:1<<k},()=>new Array<number>(k).fill(Infinity))
    const parent=Array.from({length:1<<k},()=>new Array<number>(k).fill(-1))
    for(let i=0;i<k;i++)dp[1<<i]![i]=leg(start,nodes[i]!)
    for(let mask=1;mask<=full;mask++)for(let i=0;i<k;i++){
     const cur=dp[mask]![i]!
     if(!(mask&(1<<i))||!Number.isFinite(cur))continue
     for(let j=0;j<k;j++){
      if(mask&(1<<j))continue
      const nm=mask|(1<<j),v=cur+leg(nodes[i]!,nodes[j]!)
      if(v<dp[nm]![j]!){dp[nm]![j]=v;parent[nm]![j]=i}
     }
    }
    let bestI=-1,best=Infinity
    for(let i=0;i<k;i++){const v=dp[full]![i]!+(end===null?0:leg(nodes[i]!,end));if(v<best){best=v;bestI=i}}
    if(bestI>=0&&best<pathWalk(seg.map((_,i)=>i))){
     const order:number[]=[]
     for(let mask=full,i=bestI;i>=0;){order.push(i);const pi=parent[mask]![i]!;mask&=~(1<<i);i=pi}
     order.reverse()
     seg=order.map(i=>seg[i]!);changed=true
    }
   }
  }
  out.push(...seg);seg=[]
 }
 for(const s of ref){
  if(isFixed(s)){const p=idx.get(s.id);if(p===undefined)return null;flush(p);out.push(s);start=p}
  else seg.push(s)
 }
 flush(null)
 return changed?out:null
}
