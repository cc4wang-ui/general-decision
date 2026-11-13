import { travelMatrix, scheduleRoute, validPoint, effectiveStartTime } from '../src/dailyRouting.ts'
import { openAtEta, dispatchableAt, type HoursPeriod, type OpenAtEta } from '../src/openAtEta.ts'
import { kindOfCandidate, normalizeKind } from '../src/placeKind.ts'
import { isDeniedCandidate, isDeniedName, MIN_REVIEWS } from '../src/venueCheck.ts'
import { areaCenter, AREA_RADIUS_M, distanceKm } from '../src/areas.ts'
// Daily Decision: real Google Places results and approximate geographic route ordering.
// Does not claim live traffic, transit ETAs, reservations or confirmed stock.
export const config = { runtime:'nodejs' }
const BASE=process.env.PLACES_BASE_URL??'https://places.googleapis.com'
const MASK='places.id,places.displayName,places.formattedAddress,places.location,places.googleMapsUri,places.currentOpeningHours,places.rating,places.userRatingCount,places.types,places.primaryType'
const respond=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}})
type Coord={lat:number;lng:number}
/** hours：Google currentOpeningHours.periods（已在 MASK 裡，不加費用），到店營業判斷用。 */
type Candidate={id:string;name:string;address:string;mapUrl:string;lat:number;lng:number;rating?:number;openNow?:boolean;types:string[];primaryType?:string;userRatingCount?:number;hours?:HoursPeriod[]}
type Stop={id:string;kind:string;place?:string;title?:string;locked?:boolean;done?:boolean;custom?:boolean;specified?:boolean;start?:string;minutes?:number;candidate?:Candidate;noCandidate?:boolean;noCandidateReason?:'area'|'filtered'|'empty'|'closed';eta?:string;etaDayOffset?:number;travelMin?:number;openAtEta?:OpenAtEta}
const queries:Record<string,string>={gym:'FIT-EASY Shibuya Sakura Stage',meal:'Japanese set meal restaurant',creative:'art gallery exhibition',coffee:'quiet specialty coffee cafe',shopping:'sports goods drugstore'}
/** 每一站的 Places includedType（Table A）。沒有這一層，通用查詢字串回什麼全憑 Google 相關度，車站／地標／商場都會混進來。 */
const includedTypes:Record<string,string>={gym:'gym',meal:'restaurant',creative:'art_gallery',coffee:'cafe',shopping:'drugstore'}
/** 目錄標題（跟 src/dailyDecision.tsx 的 catalog 同步，改一邊要改另一邊）：
 * 站變成無候選時，title 還原成目錄標題，不能留著被不喜歡店家的店名
 * （紅隊 round 7 §3 第 9 項／live N5：卡片標題仍是被不喜歡的店名，嚴格標準下是
 * 殘留；狀態列點名無候選站時也會點到那間店名）。固定安排（id 不是目錄裡的站）
 * 不在表裡，title 照留——那是使用者自己寫的。 */
const CATALOG_TITLES:Record<string,string>={gym:'FIT-EASY｜80 分鐘力量訓練',meal:'澀谷｜一人友善的日式定食',creative:'澀谷｜藝術展／日本 IP 快閃探索（出發前查活動與營業）',coffee:'安靜咖啡廳｜閱讀、寫下 3 個新觀察',shopping:'澀谷｜運動長袖、純單水肌酸或生活用品（先查庫存）',rest:'散步回家、休息與晚餐'}
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
/** Places 搜尋的 locationBias 半徑（公尺）。只是偏好，Google 仍可能回很遠的店。 */
const SEARCH_BIAS_M=3500
async function search(key:string,q:string,center?:Coord,count=20,opts:{includedType?:string;pageToken?:string;biasRadiusM?:number}={}):Promise<SearchPage>{
 const body:Record<string,unknown>={textQuery:q,pageSize:count,languageCode:'ja'}
 if(opts.includedType)body.includedType=opts.includedType
 if(opts.pageToken)body.pageToken=opts.pageToken
 if(center)body.locationBias={circle:{center:{latitude:center.lat,longitude:center.lng},radius:opts.biasRadiusM??SEARCH_BIAS_M}}
 const r=await fetch(BASE+'/v1/places:searchText',{method:'POST',headers:{'content-type':'application/json','X-Goog-Api-Key':key,'X-Goog-FieldMask':MASK},body:JSON.stringify(body),signal:AbortSignal.timeout(9000)})
 if(!r.ok)throw new Error(r.status===429?'搜尋額度暫時用完':'店家搜尋暫時無法使用')
 const data=await r.json() as {places?:Array<{id?:string;displayName?:{text?:string};formattedAddress?:string;location?:{latitude?:number;longitude?:number};googleMapsUri?:string;currentOpeningHours?:{openNow?:boolean;periods?:HoursPeriod[]};rating?:number;userRatingCount?:number;types?:string[];primaryType?:string}>;nextPageToken?:string}
 return {places:(data.places??[]).filter(p=>p.id&&p.location&&Number.isFinite(p.location.latitude)&&Number.isFinite(p.location.longitude)).map(p=>({id:p.id!,name:p.displayName?.text??'未命名店家',address:p.formattedAddress??'',mapUrl:p.googleMapsUri??'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(p.displayName?.text??''),lat:p.location!.latitude!,lng:p.location!.longitude!,rating:p.rating,openNow:p.currentOpeningHours?.openNow,hours:Array.isArray(p.currentOpeningHours?.periods)?p.currentOpeningHours.periods:undefined,types:Array.isArray(p.types)?p.types.filter(t=>typeof t==='string'):[],primaryType:typeof p.primaryType==='string'?p.primaryType:undefined,userRatingCount:typeof p.userRatingCount==='number'?p.userRatingCount:undefined})),nextPageToken:typeof data.nextPageToken==='string'?data.nextPageToken:undefined}
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
 if(isDeniedCandidate(p)||isDeniedName(p.name))return false
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
 * - 評論數缺欄位＝未知，不清掉（round 9 F1b）：舊存檔候選本來就可能沒有
 *   userRatingCount，缺欄位當成 0 會把舊行程的候選在重驗時清掉。只在欄位
 *   存在且 < 50 時不保留。前端 clearStaleCandidate 同一規則。新查到的候選
 *   是另一條規則（venueOk：拿不到＝無法驗證＝不派，那是新派發的門檻，不動）。
 * 注意：venueOk 不能直接拿來重驗——它對指定／固定站的候選也跑 DENY 檢查，
 * 會把 item 7 的車站候選清掉；這裡只對自動站跑 DENY／評論／地區。
 */
function retentionOk(c:Candidate,s:Stop,opts:{excluded:string[];excludeKinds:string[];areaPref:{lat:number;lng:number}|null}):boolean{
 if(opts.excluded.includes(c.id))return false
 const k=kindOfCandidate(c)
 if(k&&opts.excludeKinds.includes(k))return false
 const auto=!s.done&&!s.locked&&!s.custom&&!s.specified
 if(!auto)return true
 if(isDeniedCandidate(c)||isDeniedName(c.name))return false
 if(s.id!=='gym'&&s.kind!=='gym'&&c.userRatingCount!==undefined&&c.userRatingCount<MIN_REVIEWS)return false
 if(opts.areaPref&&distanceKm(opts.areaPref,c)*1000>AREA_RADIUS_M)return false
 return true
}
function order(stops:Stop[],origin:Coord):{stops:Stop[];distanceKm:number;warning?:string}{
 // Preserve fixed appointments and completed tasks in their relative slots; optimize only movable segments.
 // Round 8：沒有候選的站（無候選站、rest 純文字站）也是錨點，留在原位——舊版只把
 // locked／done／custom 當錨點，沒候選的站會沉到同段落最後（紅隊 round 7 G：
 // meal→shopping（無候選）→coffee 變成 meal→coffee→shopping；站的順序就是行程
 // 本身，無候選站被往後移，使用者看到的先後跟他排的先後不一樣）。
 let at=origin,km=0
 const result:Stop[]=[]
 const pending:Stop[]=[]
 const flush=()=>{while(pending.length){let best=0,score=Infinity;pending.forEach((s,i)=>{if(!s.candidate)return;const d=distanceKm(at,s.candidate);if(d<score){score=d;best=i}});const next=pending.splice(best,1)[0];if(!next)break;if(next.candidate){km+=distanceKm(at,next.candidate);at={lat:next.candidate.lat,lng:next.candidate.lng}}result.push(next)}}
 for(const s of stops){if(s.locked||s.done||s.custom||!s.candidate){flush();if(s.candidate){km+=distanceKm(at,s.candidate);at={lat:s.candidate.lat,lng:s.candidate.lng}}result.push(s)}else pending.push(s)}
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
 const list:unknown[]=Array.isArray(input.stops)?input.stops.slice(0,9):[]
 // 客戶端送來的 stops 是未驗證 JSON：先以型別守衛收進 Record，再逐欄位以 safe()/typeof 驗證；
 // candidate 原樣透傳（與舊版 any 行為一致：形狀由 retentionOk／venueOk 在使用時重驗）。
 const isStopInput=(x:unknown):x is Record<string,unknown>=>!!x&&typeof x==='object'&&typeof (x as Record<string,unknown>).id==='string'
 const stops:Stop[]=list.filter(isStopInput).map(x=>{
  const rawCandidate=x.candidate&&typeof x.candidate==='object'?x.candidate as Candidate:undefined
  const candidate=rawCandidate&&typeof rawCandidate.id==='string'&&Number.isFinite(rawCandidate.lat)&&Number.isFinite(rawCandidate.lng)?rawCandidate:undefined
  return {id:safe(x.id,90),kind:safe(x.kind,20),title:safe(x.title,100),place:safe(x.place,100),locked:x.locked===true,done:x.done===true,custom:x.custom===true,specified:x.specified===true,start:safe(x.start,10),minutes:typeof x.minutes==='number'&&Number.isFinite(x.minutes)?Math.max(5,Math.min(720,x.minutes)):45,candidate}
 })
 const shuffle=safe(input.shuffle,90),excluded=Array.isArray(input.exclude)?input.exclude.filter(x=>typeof x==='string').slice(0,200):[]
 // 排除清單上限 200（跟前端 mergeExclude 同步）：不喜歡 100＋placeMem 封鎖＋每站換掉過的 20；其他站現任候選另外走 `others`（見下方），不再佔這 200 的額度。舊版種類鍵（'ramen_restaurant'）先轉新鍵，舊的不喜歡才不會失效。
 const excludeKinds=Array.isArray(input.excludeKinds)?[...new Set(input.excludeKinds.filter(x=>typeof x==='string').map(normalizeKind))].slice(0,20):[]
 /**
  * 兩份排除清單（round 8，K1／live N1）：`exclude` 是「使用者不要的店」
  * （不喜歡／placeMem 封鎖／該站換掉過的），retention 重驗與新搜尋都讀它；
  * `others` 是「其他站現任候選」，只在新搜尋的 eligible 過濾裡用（防止新店
  * 跟別站重複），絕對不進 retentionOk。round 7 把兩份混在同一份 `exclude`
  * 裡，前端單站 shuffle 時其他站的候選 id 全在清單裡，retentionOk 全部判
  * 不通過、全部清掉重找——「換這一站」變成整條路線重排，池子不夠時其他站
  * 還變成無候選。前端（src/dailyDecision.tsx othersFor）分開送，伺服器分開讀。
  */
 const others=Array.isArray(input.others)?input.others.filter(x=>typeof x==='string').slice(0,9):[]
 /**
  * seen（round 11；用戶 2026-11-08 21:22 決定：完整重新生成也要送 seen）。
  * 前端在完整重新生成時把各站換掉過的店全部合併成一份 seen 送來（單站 shuffle 時
  * seen 照舊走 exclude——那是該站自己的 seen，不影響別站）。seen 只擋「自動挑的站
  * 的新搜尋」（見下方 eligible 過濾），不進 retentionOk：固定／指定／已完成站的候選
  * 本來就可能在 seen 裡（例如先被換掉、後來被指定成固定地點），進 retention 會把
  * 使用者自己的選擇清掉。跟 `others` 同一原則：防重複的清單不進 retention 重驗。
  * 上限 200，跟 exclude 同步（每站最多 20 筆，9 站最多 180，200 蓋得住）。
  */
 const seen=Array.isArray(input.seen)?input.seen.filter(x=>typeof x==='string').slice(0,200):[]
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
   const firstOrigin=origins[0]
   if(!firstOrigin)return respond({error:'origin_not_found',message:'無法確認出發地，請輸入更具體的車站或地址。'},404)
   center={lat:firstOrigin.lat,lng:firstOrigin.lng};origin=firstOrigin
  }
  const result:Stop[]=[]
  /**
   * 本請求已挑出的店（round 10，紅隊 round 9 R9-K1）：`others` 是請求開始時的
   * 快照，只防「請求前已存在」的重複——迴圈內新挑的店、以及保留下來的既有候選，
   * 要即時加進這份集合，後面站的 eligible 過濾同時排除它。否則同一請求內兩站
   * 同時重找會挑到同一家店（meal shuffle＋coffee 候選被排除，兩站池子都只有
   * 同一間 `dup-1` → 回應裡兩站的 candidate 都是 `dup-1`；完整重新生成連
   * `others` 都不送，防重複機制完全缺席——地區偏好開啟後兩站舊候選都在地區外，
   * 一起重找就是現實觸發條件）。
   * 注意：不能直接拿 `others` 當這份集合——others 含其他站「自己的」現任候選
   * （othersFor 送的是除了被換那站以外所有站的候選），保留重驗時自己的候選也
   * 在裡面，會把全部站都判成不保留（round 8 K1 的反面）。所以 `picked` 從空集
   * 合開始，只在迴圈內累積：保留的站加進去、新挑的站加進去。
   */
  const picked = new Set<string>()
  /**
   * 查一站的候選池（daily-open-on-arrival 起搬成函式：第一次挑店與「到店時沒開」換店共用）。
   * 回傳依距離＋評分排好的全部合格候選；沒有查詢字串時回 null。
   */
  const searchStop=async(s:Stop,stop:Stop):Promise<{ranked:Candidate[];sawAny:boolean;sawAreaBlocked:boolean;sawFar:boolean}|null>=>{
   const auto=!s.done&&!s.locked&&!s.custom&&!s.specified
   // Explicitly named or fixed locations are resolved, never replaced by another business.
   const preserve=s.done||s.locked||s.custom
   const named=stop.place&&stop.place!== '澀谷站周邊'&&!stop.place.includes('周邊')&&!stop.place.includes('／')&&!stop.place.includes('（')
   const q=s.specified?stop.place:(preserve||(named&&shuffle!==s.id)?stop.place:queries[stop.id]??queries[stop.kind]??stop.title)
   if(!q)return null
   // 自動挑店才送 includedType：指定／固定地點的類型由使用者決定，不由系統收窄。
   const stopType=preserve||s.specified?undefined:(includedTypes[stop.id]??includedTypes[stop.kind])
   // 目前位置模式沒有地名可附加：只靠 locationBias（中心＝目前位置）找附近的店。
   // 地區偏好開啟時（A，daily-area-radius）：自動站的搜尋中心改地區中心，也不附加出發地名——
   // 出發點離地區很遠時，以出發點為中心或帶出發地名，Google 只回出發點附近的店，全被 areaOk 擋成 area。
   // 指定／固定站不改：查的是使用者自己的地名，中心照舊。
   const inArea=!!areaPref&&auto
   const queryText=q+(preserve||s.specified||!location||inArea?'':' '+location)
   const searchCenter=inArea&&areaPref?areaPref:center
   // 排除清單一長就可能一頁翻完都沒得選：eligible 為空時用 pageToken 往下一頁翻，最多 3 頁。
   // 地區偏好開啟時，查詢的 locationBias 半徑也縮到地區半徑，讓 Google 先回附近的店；真正的保證是 areaOk 的硬過濾。
   let eligible:Candidate[]=[]
   let sawAny=false
   let sawAreaBlocked=false
   let sawFar=false
   // B（daily-area-radius）：自動站只收搜尋半徑內的店——第一次挑店（前 5 名隨機）與換店池共用這一份。
   // locationBias 只是偏好，Google 仍會回很遠的店（預覽站曾派到阿曼）；池子不到 5 家時隨機可能抽到它。
   // 中心：開地區偏好用地區中心（池子已被 areaOk 限在地區內），否則用出發點。指定／固定站不套。
   const nearOk=(p:Candidate)=>distanceKm(areaPref??center,p)*1000<=SEARCH_BIAS_M
   let pageToken:string|undefined
   for(let page=0;page<3;page++){
    const found=await search(key,queryText,searchCenter,20,{includedType:stopType,pageToken,biasRadiusM:areaPref?AREA_RADIUS_M:undefined})
    sawAny=sawAny||found.places.length>0
    // 翻頁時也要記錄「有店回來但被地區擋掉」：那是無候選的原因（area），不是「什麼都沒有」（empty）。
    if(areaPref&&found.places.some(p=>!excluded.includes(p.id)&&venueOk(p,s,excludeKinds)&&!areaOk(p,s,areaPref)))sawAreaBlocked=true
    // eligible 過濾：exclude（使用者不要的店）＋others（其他站現任候選，防重複）
    // ＋picked（本請求前面站已經挑走／保留的店，round 10 R9-K1：同一請求內
    // 後處理的站不能再挑同一間）＋seen（各站換掉過的店，round 11：完整重新生成
    // 也要排除，剛被換掉的店不能立刻回來；只對自動站生效——固定／指定站重找時
    // 查的是使用者自己的地名，seen 不能把那間店擋掉）。
    // others 只在這裡用，絕對不進 retentionOk（round 8 K1：否則單站 shuffle
    // 會連帶清掉其他站的候選）；seen 也一樣不進 retentionOk（見上方 seen 的說明）。
    const usableHere=(p:Candidate)=>!excluded.includes(p.id)&&!others.includes(p.id)&&!picked.has(p.id)&&(!auto||!seen.includes(p.id))&&venueOk(p,s,excludeKinds)&&areaOk(p,s,areaPref)&&(preserve||shuffle!==s.id||p.id!==stop.candidate?.id)
    eligible=found.places.filter(p=>usableHere(p)&&(!auto||nearOk(p)))
    // 只有遠店（B）：本來會被挑、只因太遠被擋的店。原因寫 empty（附近找不到），不寫 filtered（那是被不喜歡／評論數擋掉）。
    // 用跟 eligible 同一份條件判斷（把關第 1 輪：已被其他站挑走／換掉過的遠店不算，否則會少翻一頁、誤標找不到店）。
    if(auto&&found.places.some(p=>usableHere(p)&&!nearOk(p)))sawFar=true
    // 只剩遠店就不往下翻：下一頁只會更遠，而且修正前這種情況也只查 1 頁（Places 次數不增加，契約 STOP 8）。
    if(eligible.length||!found.nextPageToken||sawFar)break
    pageToken=found.nextPageToken
   }
   const ranked=eligible.sort((a,b)=>distanceKm(center,a)-distanceKm(center,b)+((b.rating??0)-(a.rating??0))*.18)
   return {ranked,sawAny,sawAreaBlocked,sawFar}
  }
  /** 每個自動站第一次搜尋剩下的候選（已排序、不含已挑的那間）：到店時沒開就從這裡換，不多打 Places（契約 STOP 7）。 */
  const pools=new Map<string,Candidate[]>()
  for(const s of stops){
   // 「散步回家」不查店：只是一段文字提醒。舊資料裡殘留的車站候選也在這裡清掉。
   if(isTextOnlyRest(s)){result.push({...s,candidate:undefined});continue}
   // 既有候選先重驗（round 7，L1／L2）：通過才保留；不通過就清掉重找，不再原樣推回。
   // 規則見 retentionOk：id／種類排除對所有站生效，DENY／評論／地區只對自動站。
   // round 10：已經被本請求前面站挑走（或保留）的店不能再保留——否則同一家店
   // 出現在行程兩站（R9-K1：兩站舊候選本來就是同一間，或前面站剛挑了這間）。
   // round 11（用戶 2026-11-08 21:22 決定：完整重新生成必須隨機化）：沒有帶 shuffle
   // 就是完整重新生成，自動挑的站不保留既有候選、全部重找——舊版不管按幾次重新產生，
   // 通過重驗的候選都原樣留著，整條路線完全一樣（live round 7 N4）。隨機挑選在
   // 下方的新搜尋（前 5 名裡隨機挑）本來就有，確定性只來自這一層保留；跳過保留，
   // 重新生成才會真的換店。指定／固定／已完成站照樣保留（item 7：那是使用者的選擇，
   // 不是系統自動挑的）。rest 純文字站前面已經處理過，不走這裡。
   const auto=!s.done&&!s.locked&&!s.custom&&!s.specified
   const fullRegen=!shuffle
   const retained=!!s.candidate&&!picked.has(s.candidate.id)&&retentionOk(s.candidate,s,{excluded,excludeKinds,areaPref})&&(!fullRegen||!auto)
   if(retained&&(!shuffle||s.id!==shuffle)){picked.add(s.candidate!.id);result.push(s);continue}
   // 候選沒通過重驗（或本來就沒有、或是要換的站）：清掉再重找。自動站的 place
   // 是候選帶來的地名，一起丟掉；指定／固定站的 place 是使用者輸入的，留著
   // （重找失敗時該站顯示無候選，地點文字還在）。
   const stop=s.candidate&&!retained?{...s,candidate:undefined,noCandidate:undefined,noCandidateReason:undefined,...(auto?{place:undefined}:{})}:s
   const preserve=s.done||s.locked||s.custom
   const found=await searchStop(s,stop)
   if(!found){result.push({...stop,candidate:undefined,title:CATALOG_TITLES[stop.id]??stop.title,noCandidate:true,noCandidateReason:'empty'});continue}
   if(!found.ranked.length){
    // 無候選：該站顯示「無候選」，路線繼續——整單不再為了一站回 422
    // （no_more_options 已刪除），也不再把被排除的店留著當候選（L2）。
    // 原因寫進回應，前端照原因顯示提示（地區偏好擋住時寫明要關偏好或換地區）。
    // title 還原成目錄標題：被不喜歡店家的店名不能留在卡片標題上（紅隊 round 7 §3 第 9 項）。
    result.push({...stop,candidate:undefined,place:auto?undefined:stop.place,title:CATALOG_TITLES[stop.id]??stop.title,noCandidate:true,noCandidateReason:found.sawAreaBlocked?'area':found.sawFar?'empty':found.sawAny?'filtered':'empty'})
    continue
   }
   // 打破確定性排序：不在固定取第一名，改在前 5 名裡隨機挑。seen-list 存在時，
   // 每次 shuffle 排除掉已出現的，本來就會往下走；隨機是為了每天開局不永遠是同一間。
   const top=found.ranked.slice(0,5)
   const selected=top[randomIndex(top.length)]!
   // 本請求已挑出：後面站的 eligible 過濾與保留重驗都要排除這間（round 10 R9-K1）。
   picked.add(selected.id)
   if(auto)pools.set(s.id,found.ranked.filter(p=>p.id!==selected.id))
   result.push({...stop,title:preserve?stop.title:selected.name,place:selected.address,candidate:selected,noCandidate:undefined,noCandidateReason:undefined})
  }
  // 開始時間（PR-4）：使用者開始時間合法且比當下晚才取代伺服器當下時間；
  // 未指定／不合法／已過去時就是伺服器當下時間——跟今天完全相同。
  // 09:00 不是這裡的預設值（見 src/dailyRouting.ts scheduleRoute 的防禦 fallback）。
  // anchorDate：錨點當天的東京日期，到店營業判斷用（ETA＋etaDayOffset 換成實際日期與星期幾）。
  // 時刻與日期取自同一個 Date，午夜前後不會一個算今天、一個算明天。
  const clockAt=new Date()
  const serverNow=clockAt.toLocaleTimeString('en-GB',{timeZone:'Asia/Tokyo',hour:'2-digit',minute:'2-digit'})
  const anchorDate=clockAt.toLocaleDateString('en-CA',{timeZone:'Asia/Tokyo'})
  const now=effectiveStartTime(input.startTime,serverNow)
  let current=result
  let ordered=order(current,center)
  // 無候選站不是未解決：它已有 noCandidate 標記與原因，前端照原因顯示；只有
  // 「沒候選又沒標記」的站才算未解決（防禦檢查，正常流程走不到）。
  const unresolved=ordered.stops.filter(s=>!s.candidate&&!isTextOnlyRest(s)&&!s.noCandidate)
  if(unresolved.length)return respond({error:'unresolved_stops',message:'部分行程尚未找到真實地點，無法計算可靠交通時間。原行程保留。'},422)
  // 2.1 O1（使用者 2026-11-10 已裁定：回傳部分行程並標示缺站）：逐站 noCandidate
  // 早已存在（round 7 起，薄池時 200＋逐站標示、不整單 422）；這裡再加頂層契約欄位
  // partial＋missingStops，讓呼叫端不用掃描 stops 就知道缺了哪幾站、為什麼缺。
  // rest 純文字站從來不是缺站，不列入。到店營業判斷可能新增缺站（closed），所以最後才算。
  const missingOf=(list:Stop[])=>list.filter(s=>!s.candidate&&!isTextOnlyRest(s)&&s.noCandidate).map(s=>({id:s.id,reason:s.noCandidateReason??'empty'}))
  try{
   /**
    * 到店時要開著（daily-open-on-arrival）：排完路線才知道 ETA，所以先排、再檢查。
    * 自動站的店在 ETA 已打烊／未開門／剩不到 10 分鐘 → 從同一池候選換下一個，重新排路線
    * 再檢查；最多 MAX_ROUTE_ROUNDS 次 Routes 呼叫。換哪一間：先估新店的到店時間（同一段
    * 路的實際步行速度 × 上一站到新店的直線距離），優先選估計時營業的；其次沒有營業時間
    * 資料的；最後才選舊 ETA 時營業的（把關第 1 輪：只看舊 ETA 會一間一間往遠處換、把輪數
    * 用完）。估計都不營業時，仍先派池裡第一個沒試過的候選（把關第 2 輪 R3：估計可能偏快）。
    * 估計只用來挑順序，派不派一律以重排後 Routes 的實際 ETA 判斷。池子用完就標無候選（closed）。最後一輪還不合格的站直接標 closed，
    * 用同一份步行矩陣的子矩陣重排（不再打 API），重排後新的不合格站也一樣處理，直到沒有。
    * 指定／固定／已完成站不換店，只回 openAtEta 讓卡片警告。沒有營業時間資料＝unknown，不擋。
    */
   const MAX_ROUTE_ROUNDS=5
   const isAuto=(s:Stop)=>!s.done&&!s.locked&&!s.custom&&!s.specified
   const stateOf=(s:Stop)=>openAtEta(s.candidate?.hours,anchorDate,s.eta,s.etaDayOffset??0)
   const badOf=(list:Stop[])=>list.filter(s=>isAuto(s)&&!!s.candidate&&!dispatchableAt(stateOf(s)))
   const closedStop=(s:Stop):Stop=>({...s,candidate:undefined,place:undefined,title:CATALOG_TITLES[s.id]??s.title,noCandidate:true,noCandidateReason:'closed'})
   const banned=new Map<string,Set<string>>()
   let located=ordered.stops.filter(s=>s.candidate)
   let {matrix,distances}=await travelMatrix(key,center,located)
   let schedule=scheduleRoute(located,matrix,distances,now)
   for(let round=1;round<MAX_ROUTE_ROUNDS;round++){
    const bad=badOf(schedule.stops)
    if(!bad.length)break
    for(const b of bad){
     const s=current.find(x=>x.id===b.id)
     if(!s?.candidate)continue
     const ban=banned.get(s.id)??new Set<string>()
     ban.add(s.candidate.id);banned.set(s.id,ban)
     const taken=new Set(current.filter(x=>x.id!==s.id&&x.candidate).map(x=>x.candidate!.id))
     let pool=pools.get(s.id)
     if(!pool){
      // 保留下來的既有候選（單站 shuffle 時的其他站）沒有池子：這一站重查一次。
      picked.clear();taken.forEach(id=>picked.add(id));ban.forEach(id=>picked.add(id))
      pool=(await searchStop(s,{...s,candidate:undefined,place:undefined}))?.ranked??[]
      pools.set(s.id,pool)
     }
     // 預覽站實測：池裡可能有很遠的店（locationBias 只是偏好；曾派到阿曼的咖啡廳）。換店只用搜尋半徑內的店。
     // 開地區偏好時以地區中心為準（把關第 2 輪：出發點離地區很遠時，不能把地區內的店丟掉）。
     const usable=pool.filter(p=>!ban.has(p.id)&&!taken.has(p.id)&&distanceKm(areaPref??center,p)*1000<=SEARCH_BIAS_M)
     const at=(p:Candidate)=>openAtEta(p.hours,anchorDate,b.eta,b.etaDayOffset??0)
     // 估新店的到店時間：上一站（或出發點）→舊店的實際步行分鐘數／直線距離＝步速，套到上一站→新店。
     const i=schedule.stops.findIndex(x=>x.id===b.id)
     const prev:Coord=(i>0?schedule.stops[i-1]?.candidate:undefined)??center
     const oldKm=Math.max(distanceKm(prev,s.candidate),0.01)
     const [eh,em]=(b.eta??'00:00').split(':').map(Number)
     const oldAbs=(b.etaDayOffset??0)*1440+eh!*60+em!
     const estAt=(p:Candidate)=>{
      const abs=Math.max(0,Math.round(oldAbs-(b.travelMin??0)+(b.travelMin??0)*distanceKm(prev,p)/oldKm))
      return openAtEta(p.hours,anchorDate,String(Math.floor(abs/60)%24).padStart(2,'0')+':'+String(abs%60).padStart(2,'0'),Math.floor(abs/1440))
     }
     // 把關第 2 輪 R3：估計只是排順序。估計挑不到（例如繞路使估計偏快，店還沒開）不直接標 closed，
     // 改派池裡第一個還沒試過的候選，交給下一輪 Routes 實算 ETA 驗證；不合格會進 banned。輪數上限不變。
     const next=usable.find(p=>estAt(p)==='open')??usable.find(p=>estAt(p)==='unknown')??usable.find(p=>at(p)==='open')??usable[0]
     current=current.map(x=>x.id!==s.id?x:next?{...x,title:next.name,place:next.address,candidate:next,noCandidate:undefined,noCandidateReason:undefined}:closedStop(x))
    }
    ordered=order(current,center)
    located=ordered.stops.filter(s=>s.candidate);
    ({matrix,distances}=await travelMatrix(key,center,located))
    schedule=scheduleRoute(located,matrix,distances,now)
   }
   // 最後一輪：還不合格的站標 closed，用子矩陣重排（不打 API），直到沒有不合格的站。
   const base=new Map(located.map((s,i)=>[s.id,i+1]))
   for(let bad=badOf(schedule.stops);bad.length;bad=badOf(schedule.stops)){
    const ids=new Set(bad.map(s=>s.id))
    current=current.map(x=>ids.has(x.id)?closedStop(x):x)
    ordered=order(current,center)
    const sub=ordered.stops.filter(s=>s.candidate)
    const ix=[0,...sub.map(s=>base.get(s.id)!)]
    schedule=scheduleRoute(sub,ix.map(i=>ix.map(j=>matrix[i]![j]!)),ix.map(i=>ix.map(j=>distances[i]![j]!)),now)
   }
   const withState=schedule.stops.map(s=>s.candidate?{...s,openAtEta:stateOf(s)}:s)
   // 成功路徑也要把沒地點的站合併回來：舊版只回 schedule.stops（只有有候選的
   // 站），rest 純文字站與無候選站在 Routes 成功時會整站消失（實測確認；這
   // 也是 live 三輪從沒看到休息站的原因）。失敗路徑本來就回 ordered 全單，不用改。
   const merged=mergeScheduled(ordered.stops,withState)
   const missingStops=missingOf(ordered.stops)
   // anchorTime（PR-4 修正輪，O2）：回傳實際用的錨點——過去時間被 clamp 時，
   // 前端才能在狀態列寫明「已以現在 HH:MM 開始排」。新欄位，舊客戶端不讀就忽略。
   return respond({origin,...schedule,stops:merged,partial:missingStops.length>0,missingStops,anchorTime:now,routeVerified:true,travelMode:'WALK',verifiedSource:'Google Places + Google Routes',searchedAt:new Date().toISOString(),warning:'步行時間為 Google Routes 預估；到店營業判斷依 Google 營業時間，交通狀況與營業資訊可能變動。固定行程衝突會顯示警告。'})
  }catch(e){
   console.warn('[daily-route] Routes matrix unavailable:', e instanceof Error?e.message:'unknown')
   // Keep verified names, photos and navigation functional even if the separate Routes API is not enabled.
   // Do NOT label these geographically grouped stops as verified walking ETAs.
   // 沒有 ETA 就無法做到店營業判斷：維持搜尋當下的營業狀態（openNow）顯示，不擋。
   const missingStops=missingOf(ordered.stops)
   return respond({origin,stops:ordered.stops.map(({candidate,...rest})=>({...rest,candidate})),partial:missingStops.length>0,missingStops,routeVerified:false,travelMode:null,verifiedSource:'Google Places',searchedAt:new Date().toISOString(),conflicts:[],warning:'Google Routes 暫時無法驗證；僅依地理接近程度排順序。每站請開啟 Google Maps 取得實際導航時間。'})
  }
 }catch(e){return respond({error:'places_unavailable',message:e instanceof Error?e.message:'店家搜尋失敗'},502)}
}
export function POST(req:Request){return handler(req)}
export function GET(req:Request){return handler(req)}
export default {fetch:handler}
