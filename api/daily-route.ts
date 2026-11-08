import { travelMatrix, scheduleRoute, validPoint } from '../src/dailyRouting.ts'
import { kindOfCandidate, normalizeKind } from '../src/placeKind.ts'
import { isDeniedCandidate, MIN_REVIEWS } from '../src/venueCheck.ts'
import { areaCenter, AREA_RADIUS_M, distanceKm } from '../src/areas.ts'
// Daily Decision: real Google Places results and approximate geographic route ordering.
// Does not claim live traffic, transit ETAs, reservations or confirmed stock.
export const config = { runtime:'nodejs' }
const BASE=process.env.PLACES_BASE_URL??'https://places.googleapis.com'
const MASK='places.id,places.displayName,places.formattedAddress,places.location,places.googleMapsUri,places.currentOpeningHours,places.rating,places.userRatingCount,places.types,places.primaryType'
const respond=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}})
type Coord={lat:number;lng:number}
type Candidate={id:string;name:string;address:string;mapUrl:string;lat:number;lng:number;rating?:number;openNow?:boolean;types:string[];primaryType?:string;userRatingCount?:number}
type Stop={id:string;kind:string;place?:string;title?:string;locked?:boolean;done?:boolean;custom?:boolean;specified?:boolean;start?:string;minutes?:number;candidate?:Candidate;noCandidate?:boolean;noCandidateReason?:'area'|'filtered'|'empty'}
const queries:Record<string,string>={gym:'FIT-EASY Shibuya Sakura Stage',meal:'Japanese set meal restaurant',creative:'art gallery exhibition',coffee:'quiet specialty coffee cafe',shopping:'sports goods drugstore'}
/** 每一站的 Places includedType（Table A）。沒有這一層，通用查詢字串回什麼全憑 Google 相關度，車站／地標／商場都會混進來。 */
const includedTypes:Record<string,string>={gym:'gym',meal:'restaurant',creative:'art_gallery',coffee:'cafe',shopping:'drugstore'}
// 評論數門檻 MIN_REVIEWS（50）在 src/venueCheck.ts（單一真相來源），伺服器與前端共用。
// 距離公式 distanceKm 在 src/areas.ts（單一真相來源），伺服器與前端共用。
const safe=(s:unknown,n=120)=>typeof s==='string'?s.slice(0,n).trim():''
/** 0 ≤ i < n 的均勻隨機整數。排序固定時，隨機是為了不讓每天開局永遠是同一間最近的店。 */
function randomIndex(n:number):number{
 if(n<=1)return 0
 const buf=new Uint32Array(1)
 crypto.getRandomValues(buf)
 return buf[0]!%n
}
/** 「散步回家」不是要拜訪的店家：不帶 candidate 的純文字站，不發 Places 查詢、不參與未解決檢查。固定安排／指定地點的不算。已完成也不算——rest 從來沒有可拜訪的店家，已完成與否都不帶候選；否則標記完成後整單 422（item 7：已完成 rest 無候選時，舊版 isTextOnlyRest 排除 done，會被未解決檢查擋下）。 */
const isTextOnlyRest=(s:Stop)=>s.id==='rest'&&!s.locked&&!s.custom&&!s.specified
type SearchPage={places:Candidate[];nextPageToken?:string}
async function search(key:string,q:string,center?:Coord,count=20,opts:{includedType?:string;pageToken?:string;biasRadiusM?:number}={}):Promise<SearchPage>{
 const body:Record<string,unknown>={textQuery:q,pageSize:count,languageCode:'ja'}
 if(opts.includedType)body.includedType=opts.includedType
 if(opts.pageToken)body.pageToken=opts.pageToken
 if(center)body.locationBias={circle:{center:{latitude:center.lat,longitude:center.lng},radius:opts.biasRadiusM??3500}}
 const r=await fetch(BASE+'/v1/places:searchText',{method:'POST',headers:{'content-type':'application/json','X-Goog-Api-Key':key,'X-Goog-FieldMask':MASK},body:JSON.stringify(body),signal:AbortSignal.timeout(9000)})
 if(!r.ok)throw new Error(r.status===429?'搜尋額度暫時用完':'店家搜尋暫時無法使用')
 const data=await r.json() as {places?:Array<{id?:string;displayName?:{text?:string};formattedAddress?:string;location?:{latitude?:number;longitude?:number};googleMapsUri?:string;currentOpeningHours?:{openNow?:boolean};rating?:number;userRatingCount?:number;types?:string[];primaryType?:string}>;nextPageToken?:string}
 return {places:(data.places??[]).filter(p=>p.id&&p.location&&Number.isFinite(p.location.latitude)&&Number.isFinite(p.location.longitude)).map(p=>({id:p.id!,name:p.displayName?.text??'未命名店家',address:p.formattedAddress??'',mapUrl:p.googleMapsUri??'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(p.displayName?.text??''),lat:p.location!.latitude!,lng:p.location!.longitude!,rating:p.rating,openNow:p.currentOpeningHours?.openNow,types:Array.isArray(p.types)?p.types.filter(t=>typeof t==='string'):[],primaryType:typeof p.primaryType==='string'?p.primaryType:undefined,userRatingCount:typeof p.userRatingCount==='number'?p.userRatingCount:undefined})),nextPageToken:typeof data.nextPageToken==='string'?data.nextPageToken:undefined}
}
/**
 * 新解析候選的過濾條件。id 排除與種類排除對所有站生效；DENY 檢查（車站／地標
 * 不是可拜訪的店家）也對所有新解析的候選生效——使用者指定／固定安排的地名
 * 查回來的第一名也可能是車站，不能原樣當成店家（紅隊 round 4 Finding 4：
 * meal 指定「渋谷駅」查回只有車站，舊版直接回傳車站當候選）。
 * 只有評論數門檻還只對「系統自動挑」的站生效：使用者明確指定／固定安排
 * 的地點是他的選擇，不套評論門檻（固定健身房 FIT-EASY 也不套）。
 * 注意：這裡只擋「新查到的」候選；既有候選由 retentionOk 重驗（同一份規則，
 * 見下方），兩邊必須一致，否則新候選擋得住、舊候選擋不住。
 */
function venueOk(p:Candidate,s:Stop,excludeKinds:string[]):boolean{
 if(excludeKinds.length){const k=kindOfCandidate(p);if(k&&excludeKinds.includes(k))return false}
 if(isDeniedCandidate(p))return false
 const auto=!s.done&&!s.locked&&!s.custom&&!s.specified
 if(!auto)return true
 // 固定健身房 FIT-EASY 是使用者指定的店，不是探索發現：不套評論數門檻（類型 gym 照樣過濾）。
 if(s.id!=='gym'&&s.kind!=='gym'&&(p.userRatingCount??0)<MIN_REVIEWS)return false
 return true
}
/**
 * 地區偏好（F7）：開啟時，自動挑的站只派地區中心半徑內的店。硬過濾——Google
 * 的 locationBias 只是提示，真正的保證是這裡的距離檢查（mock 層級也可驗）。
 * 指定／固定／已完成的地點是使用者的選擇，不套地區限制（跟評論門檻同一原則）。
 */
function areaOk(p:Candidate,s:Stop,pref:{lat:number;lng:number}|null):boolean{
 if(!pref)return true
 const auto=!s.done&&!s.locked&&!s.custom&&!s.specified
 if(!auto)return true
 // distanceKm 回公里，AREA_RADIUS_M 是公尺：先換算。
 return distanceKm(pref,p)*1000<=AREA_RADIUS_M
}
/**
 * 既有候選重驗（round 7 結構性修復，L1／L2）。舊版保留分支一看到既有候選
 * 就原樣推回，exclude／excludeKinds／areaOk／MIN_REVIEWS 一概不讀——地區
 * 偏好打開後原宿店照留（L1）、不喜歡的店清不掉（L2），都是同一個根因。
 * 規則：
 * - id 排除（不喜歡／封鎖）與種類排除對所有站生效——明確的「不要」永遠贏。
 * - 評論門檻／地區限制／DENY 只對自動挑的站生效：指定／固定／已完成的地點
 *   是使用者的選擇（item 7 既有規則，車站候選照留）。
 * 注意：venueOk 不能直接拿來重驗——它對指定／固定站的候選也跑 DENY 檢查，
 * 會把 item 7 的車站候選清掉；這裡只對自動站跑 DENY／評論／地區。
 */
function retentionOk(c:Candidate,s:Stop,opts:{excluded:string[];excludeKinds:string[];areaPref:{lat:number;lng:number}|null}):boolean{
 if(opts.excluded.includes(c.id))return false
 const k=kindOfCandidate(c)
 if(k&&opts.excludeKinds.includes(k))return false
 const auto=!s.done&&!s.locked&&!s.custom&&!s.specified
 if(!auto)return true
 if(isDeniedCandidate(c))return false
 if(s.id!=='gym'&&s.kind!=='gym'&&(c.userRatingCount??0)<MIN_REVIEWS)return false
 if(opts.areaPref&&distanceKm(opts.areaPref,c)*1000>AREA_RADIUS_M)return false
 return true
}
function order(stops:Stop[],origin:Coord):{stops:Stop[];distanceKm:number;warning?:string}{
 // Preserve fixed appointments and completed tasks in their relative slots; optimize only movable segments.
 let at=origin,km=0
 const result:Stop[]=[]
 const pending:Stop[]=[]
 const flush=()=>{while(pending.length){let best=0,score=Infinity;pending.forEach((s,i)=>{if(!s.candidate)return;const d=distanceKm(at,s.candidate);if(d<score){score=d;best=i}});const next=pending.splice(best,1)[0];if(next.candidate){km+=distanceKm(at,next.candidate);at={lat:next.candidate.lat,lng:next.candidate.lng}}result.push(next)}}
 for(const s of stops){if(s.locked||s.done||s.custom){flush();if(s.candidate){km+=distanceKm(at,s.candidate);at={lat:s.candidate.lat,lng:s.candidate.lng}}result.push(s)}else pending.push(s)}
 flush()
 return {stops:result,distanceKm:Math.round(km*10)/10,warning:'路線按地理距離估算，非 Google Maps 實際步行／大眾運輸時間；固定行程時段衝突尚未自動驗證。'}
}
/**
 * 把排程結果（只有有候選的站）與 ordered 全單合併：沒地點的站（rest 純文字站、
 * 無候選站）放回 ordered 順序裡它後面第一個有候選的站之前；有候選的站維持
 * schedule 的順序（eta 是按那個順序算的，不能重排）。
 */
function mergeScheduled(ordered:Stop[],scheduled:Stop[]):Stop[]{
 const byId=new Map(scheduled.map(x=>[x.id,x]))
 const idx=new Map(ordered.map((x,i)=>[x.id,i]))
 const pending=ordered.filter(x=>!byId.has(x.id))
 const merged:Stop[]=[]
 for(const x of scheduled){
  const pos=idx.get(x.id)??0
  while(pending.length&&(idx.get(pending[0]!.id)??0)<pos)merged.push(pending.shift()!)
  merged.push(x)
 }
 merged.push(...pending)
 return merged
}
async function handler(req:Request):Promise<Response>{
 if(req.method!=='POST')return respond({error:'method_not_allowed'},405)
 const key=process.env.GOOGLE_PLACES_KEY
 if(!key)return respond({error:'missing_places_key',message:'Google Places 尚未設定，無法提供可查證店家。'},503)
 let raw:unknown;try{raw=await req.json()}catch{return respond({error:'bad_json'},400)}
 if(!raw||typeof raw!=='object')return respond({error:'bad_request'},400)
 const input=raw as Record<string,unknown>
 // 目前位置（GPS）：有帶 origin 就必須是合法座標，否則 400（不猜、不改用文字出發地）。
 // 合法就直接當中心點，不再用文字查出發地。座標不寫進 log。
 const hasGps=input.origin!==undefined&&input.origin!==null
 const gps=hasGps?validPoint(input.origin):null
 if(hasGps&&!gps)return respond({error:'bad_origin',message:'目前位置的座標不正確，無法排路線。原行程保留。'},400)
 const location=gps?'':safe(input.location,100)
 if(!gps&&!location)return respond({error:'location_required',message:'請先指定出發地。'},400)
 const list=Array.isArray(input.stops)?input.stops.slice(0,9):[]
 const stops:Stop[]=list.filter(x=>x&&typeof x==='object'&&typeof x.id==='string').map(x=>({id:safe(x.id,90),kind:safe(x.kind,20),title:safe(x.title,100),place:safe(x.place,100),locked:x.locked===true,done:x.done===true,custom:x.custom===true,specified:x.specified===true,start:safe(x.start,10),minutes:Number.isFinite(x.minutes)?Math.max(5,Math.min(720,x.minutes)):45,candidate:x.candidate&&typeof x.candidate==='object'&&typeof x.candidate.id==='string'&&Number.isFinite(x.candidate.lat)&&Number.isFinite(x.candidate.lng)?x.candidate:undefined}))
 const shuffle=safe(input.shuffle,90),excluded=Array.isArray(input.exclude)?input.exclude.filter(x=>typeof x==='string').slice(0,200):[]
 // 排除清單上限 200（跟前端 mergeExclude 同步）：不喜歡 100＋placeMem 封鎖＋每站換掉過的 20＋其他站候選；舊版種類鍵（'ramen_restaurant'）先轉新鍵，舊的不喜歡才不會失效。
 const excludeKinds=Array.isArray(input.excludeKinds)?[...new Set(input.excludeKinds.filter(x=>typeof x==='string').map(normalizeKind))].slice(0,20):[]
 // 地區偏好（F7）：開啟才生效；未知地區名退回澀谷（src/areas.ts areaCenter），
 // 不再 fail-open——未知地區名＋開啟時全站都過，跟沒開偏好一樣（紅隊 round 6 F7 註記）。
 const areaPref=input.areaOnly===true&&typeof input.area==='string'?areaCenter(input.area):null
 try{
  let origin:Record<string,unknown>,center:Coord
  if(gps){center=gps;origin={name:'目前位置',current:true,lat:gps.lat,lng:gps.lng}}
  else{
   const page=await search(key,location+' Japan',undefined,1)
   const origins=page.places
   if(!origins.length)return respond({error:'origin_not_found',message:'無法確認出發地，請輸入更具體的車站或地址。'},404)
   center={lat:origins[0].lat,lng:origins[0].lng};origin=origins[0]
  }
  const result:Stop[]=[]
  for(const s of stops){
   // 「散步回家」不查店：只是一段文字提醒。舊資料裡殘留的車站候選也在這裡清掉。
   if(isTextOnlyRest(s)){result.push({...s,candidate:undefined});continue}
   // 既有候選先重驗（round 7，L1／L2）：通過才保留；不通過就清掉重找，不再原樣推回。
   // 規則見 retentionOk：id／種類排除對所有站生效，DENY／評論／地區只對自動站。
   const auto=!s.done&&!s.locked&&!s.custom&&!s.specified
   const retained=!!s.candidate&&retentionOk(s.candidate,s,{excluded,excludeKinds,areaPref})
   if(retained&&(!shuffle||s.id!==shuffle)){result.push(s);continue}
   // 候選沒通過重驗（或本來就沒有、或是要換的站）：清掉再重找。自動站的 place
   // 是候選帶來的地名，一起丟掉；指定／固定站的 place 是使用者輸入的，留著
   // （重找失敗時該站顯示無候選，地點文字還在）。
   const stop=s.candidate&&!retained?{...s,candidate:undefined,noCandidate:undefined,noCandidateReason:undefined,...(auto?{place:undefined}:{})}:s
   // Explicitly named or fixed locations are resolved, never replaced by another business.
   const preserve=s.done||s.locked||s.custom
   const named=stop.place&&stop.place!== '澀谷站周邊'&&!stop.place.includes('周邊')&&!stop.place.includes('／')&&!stop.place.includes('（')
   const q=s.specified?stop.place:(preserve||(named&&shuffle!==s.id)?stop.place:queries[stop.id]??queries[stop.kind]??stop.title)
   if(!q){result.push({...stop,candidate:undefined,noCandidate:true,noCandidateReason:'empty'});continue}
   // 自動挑店才送 includedType：指定／固定地點的類型由使用者決定，不由系統收窄。
   const stopType=preserve||s.specified?undefined:(includedTypes[stop.id]??includedTypes[stop.kind])
   // 目前位置模式沒有地名可附加：只靠 locationBias（中心＝目前位置）找附近的店。
   const queryText=q+(preserve||s.specified||!location?'':' '+location)
   // 排除清單一長就可能一頁翻完都沒得選：eligible 為空時用 pageToken 往下一頁翻，最多 3 頁。
   // 地區偏好開啟時，查詢的 locationBias 半徑也縮到地區半徑，讓 Google 先回附近的店；真正的保證是 areaOk 的硬過濾。
   let eligible:Candidate[]=[]
   let sawAny=false
   let sawAreaBlocked=false
   let pageToken:string|undefined
   for(let page=0;page<3;page++){
    const found=await search(key,queryText,center,20,{includedType:stopType,pageToken,biasRadiusM:areaPref?AREA_RADIUS_M:undefined})
    sawAny=sawAny||found.places.length>0
    // 翻頁時也要記錄「有店回來但被地區擋掉」：那是無候選的原因（area），不是「什麼都沒有」（empty）。
    if(areaPref&&found.places.some(p=>!excluded.includes(p.id)&&venueOk(p,s,excludeKinds)&&!areaOk(p,s,areaPref)))sawAreaBlocked=true
    eligible=found.places.filter(p=>!excluded.includes(p.id)&&venueOk(p,s,excludeKinds)&&areaOk(p,s,areaPref)&&(preserve||shuffle!==s.id||p.id!==stop.candidate?.id))
    if(eligible.length||!found.nextPageToken)break
    pageToken=found.nextPageToken
   }
   if(!eligible.length){
    // 無候選：該站顯示「無候選」，路線繼續——整單不再為了一站回 422
    // （no_more_options 已刪除），也不再把被排除的店留著當候選（L2）。
    // 原因寫進回應，前端照原因顯示提示（地區偏好擋住時寫明要關偏好或換地區）。
    result.push({...stop,candidate:undefined,place:auto?undefined:stop.place,noCandidate:true,noCandidateReason:sawAreaBlocked?'area':sawAny?'filtered':'empty'})
    continue
   }
   const ranked=eligible.sort((a,b)=>distanceKm(center,a)-distanceKm(center,b)+((b.rating??0)-(a.rating??0))*.18)
   // 打破確定性排序：不在固定取第一名，改在前 5 名裡隨機挑。seen-list 存在時，
   // 每次 shuffle 排除掉已出現的，本來就會往下走；隨機是為了每天開局不永遠是同一間。
   const top=ranked.slice(0,5)
   const selected=top[randomIndex(top.length)]!
   result.push({...stop,title:preserve?stop.title:selected.name,place:selected.address,candidate:selected,noCandidate:undefined,noCandidateReason:undefined})
  }
  const ordered=order(result,center)
  const now=new Date().toLocaleTimeString('en-GB',{timeZone:'Asia/Tokyo',hour:'2-digit',minute:'2-digit'})
  const located=ordered.stops.filter(s=>s.candidate)
  // 無候選站不是未解決：它已有 noCandidate 標記與原因，前端照原因顯示；只有
  // 「沒候選又沒標記」的站才算未解決（防禦檢查，正常流程走不到）。
  const unresolved=ordered.stops.filter(s=>!s.candidate&&!isTextOnlyRest(s)&&!s.noCandidate)
  if(unresolved.length)return respond({error:'unresolved_stops',message:'部分行程尚未找到真實地點，無法計算可靠交通時間。原行程保留。'},422)
  try{
   const {matrix,distances}=await travelMatrix(key,center,located)
   const schedule=scheduleRoute(located,matrix,distances,now)
   // 成功路徑也要把沒地點的站合併回來：舊版只回 schedule.stops（只有有候選的
   // 站），rest 純文字站與無候選站在 Routes 成功時會整站消失（實測確認；這
   // 也是 live 三輪從沒看到休息站的原因）。失敗路徑本來就回 ordered 全單，不用改。
   const merged=mergeScheduled(ordered.stops,schedule.stops)
   return respond({origin,...schedule,stops:merged,routeVerified:true,travelMode:'WALK',verifiedSource:'Google Places + Google Routes',searchedAt:new Date().toISOString(),warning:'步行時間為 Google Routes 預估；交通狀況與營業資訊可能變動。固定行程衝突會顯示警告。'})
  }catch(e){
   console.warn('[daily-route] Routes matrix unavailable:', e instanceof Error?e.message:'unknown')
   // Keep verified names, photos and navigation functional even if the separate Routes API is not enabled.
   // Do NOT label these geographically grouped stops as verified walking ETAs.
   return respond({origin,stops:ordered.stops.map(({candidate,...rest})=>({...rest,candidate})),routeVerified:false,travelMode:null,verifiedSource:'Google Places',searchedAt:new Date().toISOString(),conflicts:[],warning:'Google Routes 暫時無法驗證；僅依地理接近程度排順序。每站請開啟 Google Maps 取得實際導航時間。'})
  }
 }catch(e){return respond({error:'places_unavailable',message:e instanceof Error?e.message:'店家搜尋失敗'},502)}
}
export function POST(req:Request){return handler(req)}
export function GET(req:Request){return handler(req)}
export default {fetch:handler}
