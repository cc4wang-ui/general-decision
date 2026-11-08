import { travelMatrix, scheduleRoute, validPoint } from '../src/dailyRouting.ts'
import { kindOfCandidate, normalizeKind } from '../src/placeKind.ts'
// Daily Decision: real Google Places results and approximate geographic route ordering.
// Does not claim live traffic, transit ETAs, reservations or confirmed stock.
export const config = { runtime:'nodejs' }
const BASE=process.env.PLACES_BASE_URL??'https://places.googleapis.com'
const MASK='places.id,places.displayName,places.formattedAddress,places.location,places.googleMapsUri,places.currentOpeningHours,places.rating,places.userRatingCount,places.types,places.primaryType'
const respond=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}})
type Coord={lat:number;lng:number}
type Candidate={id:string;name:string;address:string;mapUrl:string;lat:number;lng:number;rating?:number;openNow?:boolean;types:string[];primaryType?:string;userRatingCount?:number}
type Stop={id:string;kind:string;place?:string;title?:string;locked?:boolean;done?:boolean;custom?:boolean;specified?:boolean;start?:string;minutes?:number;candidate?:Candidate}
const queries:Record<string,string>={gym:'FIT-EASY Shibuya Sakura Stage',meal:'Japanese set meal restaurant',creative:'art gallery exhibition',coffee:'quiet specialty coffee cafe',shopping:'sports goods drugstore'}
/** 每一站的 Places includedType（Table A）。沒有這一層，通用查詢字串回什麼全憑 Google 相關度，車站／地標／商場都會混進來。 */
const includedTypes:Record<string,string>={gym:'gym',meal:'restaurant',creative:'art_gallery',coffee:'cafe',shopping:'drugstore'}
/** primaryType 在這裡面的，一律不是可拜訪的店家。 */
const DENY_PRIMARY=new Set(['transit_station','train_station','subway_station','bus_station','tourist_attraction','shopping_mall','department_store','lodging','hospital','university','school','place_of_worship','church','mosque','synagogue','hindu_temple','city_hall','courthouse','embassy','police','fire_station','post_office','atm','bank','gas_station','parking','airport'])
/** types 陣列裡出現任一個，就不是店家（車站／地標即使 primaryType 不是，也擋）。 */
const DENY_ANY=new Set(['transit_station','train_station','subway_station','bus_station','tourist_attraction'])
/** 使用者開的條件：評論數 50 則以上才派。userRatingCount 拿不到＝無法驗證＝不派。 */
const MIN_REVIEWS=50
const dist=(a:Coord,b:Coord)=>{const rad=Math.PI/180,dLat=(b.lat-a.lat)*rad,dLon=(b.lng-a.lng)*rad,v=Math.sin(dLat/2)**2+Math.cos(a.lat*rad)*Math.cos(b.lat*rad)*Math.sin(dLon/2)**2;return 12742*Math.asin(Math.sqrt(v))}
const safe=(s:unknown,n=120)=>typeof s==='string'?s.slice(0,n).trim():''
/** 0 ≤ i < n 的均勻隨機整數。排序固定時，隨機是為了不讓每天開局永遠是同一間最近的店。 */
function randomIndex(n:number):number{
 if(n<=1)return 0
 const buf=new Uint32Array(1)
 crypto.getRandomValues(buf)
 return buf[0]!%n
}
/** 「散步回家」不是要拜訪的店家：不帶 candidate 的純文字站，不發 Places 查詢、不參與未解決檢查。固定安排／指定地點／已完成的不算。 */
const isTextOnlyRest=(s:Stop)=>s.id==='rest'&&!s.locked&&!s.custom&&!s.done&&!s.specified
type SearchPage={places:Candidate[];nextPageToken?:string}
async function search(key:string,q:string,center?:Coord,count=20,opts:{includedType?:string;pageToken?:string}={}):Promise<SearchPage>{
 const body:Record<string,unknown>={textQuery:q,pageSize:count,languageCode:'ja'}
 if(opts.includedType)body.includedType=opts.includedType
 if(opts.pageToken)body.pageToken=opts.pageToken
 if(center)body.locationBias={circle:{center:{latitude:center.lat,longitude:center.lng},radius:3500}}
 const r=await fetch(BASE+'/v1/places:searchText',{method:'POST',headers:{'content-type':'application/json','X-Goog-Api-Key':key,'X-Goog-FieldMask':MASK},body:JSON.stringify(body),signal:AbortSignal.timeout(9000)})
 if(!r.ok)throw new Error(r.status===429?'搜尋額度暫時用完':'店家搜尋暫時無法使用')
 const data=await r.json() as {places?:Array<{id?:string;displayName?:{text?:string};formattedAddress?:string;location?:{latitude?:number;longitude?:number};googleMapsUri?:string;currentOpeningHours?:{openNow?:boolean};rating?:number;userRatingCount?:number;types?:string[];primaryType?:string}>;nextPageToken?:string}
 return {places:(data.places??[]).filter(p=>p.id&&p.location&&Number.isFinite(p.location.latitude)&&Number.isFinite(p.location.longitude)).map(p=>({id:p.id!,name:p.displayName?.text??'未命名店家',address:p.formattedAddress??'',mapUrl:p.googleMapsUri??'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(p.displayName?.text??''),lat:p.location!.latitude!,lng:p.location!.longitude!,rating:p.rating,openNow:p.currentOpeningHours?.openNow,types:Array.isArray(p.types)?p.types.filter(t=>typeof t==='string'):[],primaryType:typeof p.primaryType==='string'?p.primaryType:undefined,userRatingCount:typeof p.userRatingCount==='number'?p.userRatingCount:undefined})),nextPageToken:typeof data.nextPageToken==='string'?data.nextPageToken:undefined}
}
/**
 * 自動挑店的過濾條件。只對「系統自動挑」的站生效：使用者明確指定／固定安排
 * 的地點是他的選擇，不套類型與評論門檻（但 id 排除與種類排除照樣生效，
 * 否則「不喜歡」按了也沒用）。
 */
function venueOk(p:Candidate,s:Stop,excludeKinds:string[]):boolean{
 if(excludeKinds.length){const k=kindOfCandidate(p);if(k&&excludeKinds.includes(k))return false}
 const auto=!s.done&&!s.locked&&!s.custom&&!s.specified
 if(!auto)return true
 if(p.primaryType&&DENY_PRIMARY.has(p.primaryType))return false
 if(p.types.some(t=>DENY_ANY.has(t)))return false
 // 固定健身房 FIT-EASY 是使用者指定的店，不是探索發現：不套評論數門檻（類型 gym 照樣過濾）。
 if(s.id!=='gym'&&s.kind!=='gym'&&(p.userRatingCount??0)<MIN_REVIEWS)return false
 return true
}
function order(stops:Stop[],origin:Coord):{stops:Stop[];distanceKm:number;warning?:string}{
 // Preserve fixed appointments and completed tasks in their relative slots; optimize only movable segments.
 let at=origin,km=0
 const result:Stop[]=[]
 const pending:Stop[]=[]
 const flush=()=>{while(pending.length){let best=0,score=Infinity;pending.forEach((s,i)=>{if(!s.candidate)return;const d=dist(at,s.candidate);if(d<score){score=d;best=i}});const next=pending.splice(best,1)[0];if(next.candidate){km+=dist(at,next.candidate);at={lat:next.candidate.lat,lng:next.candidate.lng}}result.push(next)}}
 for(const s of stops){if(s.locked||s.done||s.custom){flush();if(s.candidate){km+=dist(at,s.candidate);at={lat:s.candidate.lat,lng:s.candidate.lng}}result.push(s)}else pending.push(s)}
 flush()
 return {stops:result,distanceKm:Math.round(km*10)/10,warning:'路線按地理距離估算，非 Google Maps 實際步行／大眾運輸時間；固定行程時段衝突尚未自動驗證。'}
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
 const shuffle=safe(input.shuffle,90),excluded=Array.isArray(input.exclude)?input.exclude.filter(x=>typeof x==='string').slice(0,120):[]
 // 排除清單上限 120（跟前端 mergeExclude 同步）：不喜歡 100＋每站換掉過的 20；舊版種類鍵（'ramen_restaurant'）先轉新鍵，舊的不喜歡才不會失效。
 const excludeKinds=Array.isArray(input.excludeKinds)?[...new Set(input.excludeKinds.filter(x=>typeof x==='string').map(normalizeKind))].slice(0,20):[]
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
   if(s.candidate && (!shuffle || s.id!==shuffle)){result.push(s);continue}
   if(shuffle&&s.id!==shuffle){result.push(s);continue}
   // Explicitly named or fixed locations are resolved, never replaced by another business.
   const preserve=s.done||s.locked||s.custom
   const named=s.place&&s.place!== '澀谷站周邊'&&!s.place.includes('周邊')&&!s.place.includes('／')&&!s.place.includes('（')
   const q=s.specified?s.place:(preserve||(named&&shuffle!==s.id)?s.place:queries[s.id]??queries[s.kind]??s.title)
   if(!q){result.push(s);continue}
   // 自動挑店才送 includedType：指定／固定地點的類型由使用者決定，不由系統收窄。
   const stopType=preserve||s.specified?undefined:(includedTypes[s.id]??includedTypes[s.kind])
   // 目前位置模式沒有地名可附加：只靠 locationBias（中心＝目前位置）找附近的店。
   const queryText=q+(preserve||s.specified||!location?'':' '+location)
   // 排除清單一長就可能一頁翻完都沒得選：eligible 為空時用 pageToken 往下一頁翻，最多 3 頁。
   let eligible:Candidate[]=[]
   let pageToken:string|undefined
   for(let page=0;page<3;page++){
    const found=await search(key,queryText,center,20,{includedType:stopType,pageToken})
    eligible=found.places.filter(p=>!excluded.includes(p.id)&&venueOk(p,s,excludeKinds)&&(preserve||shuffle!==s.id||p.id!==s.candidate?.id))
    if(eligible.length||!found.nextPageToken)break
    pageToken=found.nextPageToken
   }
   if(!eligible.length){
    if(preserve){result.push(s);continue}
    return respond({error:'no_more_options',message:`「${s.title||s.id}」沒有更多選擇了：候選店家都已排除或不符合條件。請清除「不喜歡」的紀錄，或換個出發地再試。原行程保留。`},422)
   }
   const ranked=eligible.sort((a,b)=>dist(center,a)-dist(center,b)+((b.rating??0)-(a.rating??0))*.18)
   // 打破確定性排序：不在固定取第一名，改在前 5 名裡隨機挑。seen-list 存在時，
   // 每次 shuffle 排除掉已出現的，本來就會往下走；隨機是為了每天開局不永遠是同一間。
   const top=ranked.slice(0,5)
   const selected=top[randomIndex(top.length)]!
   result.push({...s,title:preserve?s.title:selected.name,place:selected.address,candidate:selected})
  }
  const ordered=order(result,center)
  const now=new Date().toLocaleTimeString('en-GB',{timeZone:'Asia/Tokyo',hour:'2-digit',minute:'2-digit'})
  const located=ordered.stops.filter(s=>s.candidate)
  const unresolved=ordered.stops.filter(s=>!s.candidate&&!isTextOnlyRest(s))
  if(unresolved.length)return respond({error:'unresolved_stops',message:'部分行程尚未找到真實地點，無法計算可靠交通時間。原行程保留。'},422)
  try{
   const {matrix,distances}=await travelMatrix(key,center,located)
   const schedule=scheduleRoute(located,matrix,distances,now)
   return respond({origin,...schedule,routeVerified:true,travelMode:'WALK',verifiedSource:'Google Places + Google Routes',searchedAt:new Date().toISOString(),warning:'步行時間為 Google Routes 預估；交通狀況與營業資訊可能變動。固定行程衝突會顯示警告。'})
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
