import { travelMatrix, scheduleRoute } from '../src/dailyRouting.ts'
// Daily Decision: real Google Places results and approximate geographic route ordering.
// Does not claim live traffic, transit ETAs, reservations or confirmed stock.
export const config = { runtime:'nodejs' }
const BASE=process.env.PLACES_BASE_URL??'https://places.googleapis.com'
const MASK='places.id,places.displayName,places.formattedAddress,places.location,places.googleMapsUri,places.currentOpeningHours,places.rating,places.userRatingCount'
const respond=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}})
type Coord={lat:number;lng:number}
type Candidate={id:string;name:string;address:string;mapUrl:string;lat:number;lng:number;rating?:number;openNow?:boolean}
type Stop={id:string;kind:string;place?:string;title?:string;locked?:boolean;done?:boolean;custom?:boolean;start?:string;minutes?:number;candidate?:Candidate}
const queries:Record<string,string>={gym:'FIT-EASY gym',meal:'Japanese set meal restaurant',creative:'art gallery exhibition',coffee:'quiet specialty coffee cafe',shopping:'sports goods drugstore',rest:'Japanese restaurant'}
const dist=(a:Coord,b:Coord)=>{const rad=Math.PI/180,dLat=(b.lat-a.lat)*rad,dLon=(b.lng-a.lng)*rad,v=Math.sin(dLat/2)**2+Math.cos(a.lat*rad)*Math.cos(b.lat*rad)*Math.sin(dLon/2)**2;return 12742*Math.asin(Math.sqrt(v))}
const safe=(s:unknown,n=120)=>typeof s==='string'?s.slice(0,n).trim():''
async function search(key:string,q:string,center?:Coord,count=8):Promise<Candidate[]>{
 const body:Record<string,unknown>={textQuery:q,pageSize:count,languageCode:'ja'}
 if(center)body.locationBias={circle:{center:{latitude:center.lat,longitude:center.lng},radius:3500}}
 const r=await fetch(BASE+'/v1/places:searchText',{method:'POST',headers:{'content-type':'application/json','X-Goog-Api-Key':key,'X-Goog-FieldMask':MASK},body:JSON.stringify(body),signal:AbortSignal.timeout(9000)})
 if(!r.ok)throw new Error(r.status===429?'搜尋額度暫時用完':'店家搜尋暫時無法使用')
 const data=await r.json() as {places?:Array<{id?:string;displayName?:{text?:string};formattedAddress?:string;location?:{latitude?:number;longitude?:number};googleMapsUri?:string;currentOpeningHours?:{openNow?:boolean};rating?:number}>}
 return (data.places??[]).filter(p=>p.id&&p.location&&Number.isFinite(p.location.latitude)&&Number.isFinite(p.location.longitude)).map(p=>({id:p.id!,name:p.displayName?.text??'未命名店家',address:p.formattedAddress??'',mapUrl:p.googleMapsUri??'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(p.displayName?.text??''),lat:p.location!.latitude!,lng:p.location!.longitude!,rating:p.rating,openNow:p.currentOpeningHours?.openNow}))
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
 const location=safe(input.location,100)
 if(!location)return respond({error:'location_required',message:'請先指定出發地。'},400)
 const list=Array.isArray(input.stops)?input.stops.slice(0,9):[]
 const stops:Stop[]=list.filter(x=>x&&typeof x==='object'&&typeof x.id==='string').map(x=>({id:safe(x.id,90),kind:safe(x.kind,20),title:safe(x.title,100),place:safe(x.place,100),locked:x.locked===true,done:x.done===true,custom:x.custom===true,start:safe(x.start,10),minutes:Number.isFinite(x.minutes)?Math.max(5,Math.min(720,x.minutes)):45,candidate:x.candidate&&typeof x.candidate==='object'&&typeof x.candidate.id==='string'&&Number.isFinite(x.candidate.lat)&&Number.isFinite(x.candidate.lng)?x.candidate:undefined}))
 const shuffle=safe(input.shuffle,90),excluded=Array.isArray(input.exclude)?input.exclude.filter(x=>typeof x==='string').slice(0,30):[]
 try{
  const origins=await search(key,location+' Japan',undefined,1)
  if(!origins.length)return respond({error:'origin_not_found',message:'無法確認出發地，請輸入更具體的車站或地址。'},404)
  const center={lat:origins[0].lat,lng:origins[0].lng}
  const result:Stop[]=[]
  for(const s of stops){
   if(shuffle&&s.id!==shuffle&&s.candidate){result.push(s);continue}
   // Explicitly named or fixed locations are resolved, never replaced by another business.
   const preserve=s.done||s.locked||s.custom
   const named=s.place&&s.place!== '澀谷站周邊'&&!s.place.includes('周邊')&&!s.place.includes('／')&&!s.place.includes('（')
   const q=preserve||(named&&shuffle!==s.id)?s.place:queries[s.id]??queries[s.kind]??s.title
   if(!q){result.push(s);continue}
   const found=await search(key,q+' '+(preserve?'':location),center,8)
   const eligible=found.filter(p=>!excluded.includes(p.id)&& (preserve||shuffle!==s.id||p.id!==s.candidate?.id))
   const ranked=eligible.sort((a,b)=>dist(center,a)-dist(center,b)+((b.rating??0)-(a.rating??0))*.18)
   const selected=ranked[0]
   result.push(selected?{...s,title:preserve?s.title:selected.name,place:selected.address,candidate:selected}:s)
  }
  const ordered=order(result,center)
  const now=new Date().toLocaleTimeString('en-GB',{timeZone:'Asia/Tokyo',hour:'2-digit',minute:'2-digit'})
  const located=ordered.stops.filter(s=>s.candidate)
  if(located.length!==ordered.stops.length)return respond({error:'unresolved_stops',message:'部分行程尚未找到真實地點，無法計算可靠交通時間。原行程保留。'},422)
  const {matrix,distances}=await travelMatrix(key,center,located)
  const schedule=scheduleRoute(located,matrix,distances,now)
  return respond({origin:origins[0],...schedule,travelMode:'WALK',verifiedSource:'Google Places + Google Routes',searchedAt:new Date().toISOString(),warning:'步行時間為 Google Routes 預估；交通狀況與營業資訊可能變動。固定行程衝突會顯示警告。'})
 }catch(e){return respond({error:'places_unavailable',message:e instanceof Error?e.message:'店家搜尋失敗'},502)}
}
export function POST(req:Request){return handler(req)}
export default {fetch:handler}
