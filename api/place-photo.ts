// Ephemeral, on-demand Google Places photos. No photo names or URLs are cached.
// Return image attribution alongside a short-lived Google photo URI; never expose API keys.
declare const process: {env: Record<string,string|undefined>}
export const config = { runtime: 'nodejs' }

const json = (body:unknown,status=200) => new Response(JSON.stringify(body),{
  status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'private, no-store','x-content-type-options':'nosniff'}
})
const BASE=process.env.PLACES_BASE_URL??'https://places.googleapis.com'
type Attribution={displayName?:string;uri?:string}
type Photo={name?:string;authorAttributions?:Attribution[]}

async function handler(request:Request):Promise<Response>{
 if(request.method!=='GET')return json({error:'method_not_allowed'},405)
 const id=new URL(request.url).searchParams.get('placeId')??''
 if(!/^[A-Za-z0-9_-]{5,220}$/.test(id))return json({error:'invalid_place_id'},400)
 const key=process.env.GOOGLE_PLACES_KEY
 if(!key)return json({error:'photo_service_unavailable'},503)
 try{
  const details=await fetch(`${BASE}/v1/places/${encodeURIComponent(id)}`,{
   headers:{'X-Goog-Api-Key':key,'X-Goog-FieldMask':'photos'},
   signal:AbortSignal.timeout(9000)
  })
  if(!details.ok)return json({error:'photo_lookup_failed'},502)
  const found=await details.json() as {photos?:Photo[]}
  const photo=found.photos?.find(p=>typeof p.name==='string'&&p.name.startsWith(`places/${id}/photos/`))
  if(!photo?.name)return json({error:'photo_unavailable'},404)
  const media=await fetch(`${BASE}/v1/${photo.name}/media?maxWidthPx=960&skipHttpRedirect=true`,{
   headers:{'X-Goog-Api-Key':key},signal:AbortSignal.timeout(9000)
  })
  if(!media.ok)return json({error:'photo_unavailable'},502)
  const result=await media.json() as {photoUri?:string}
  if(!result.photoUri || !/^https:\/\//i.test(result.photoUri))return json({error:'photo_unavailable'},404)
  const attributions=(photo.authorAttributions??[]).filter(a=>a&&typeof a.displayName==='string').slice(0,3).map(a=>({
   name:a.displayName!.slice(0,100),
   url:typeof a.uri==='string'&&/^https:\/\//i.test(a.uri)?a.uri:null
  }))
  return json({photoUrl:result.photoUri,attributions,source:'Google Places'})
 }catch{
  return json({error:'photo_service_unavailable'},502)
 }
}
export function GET(request:Request){return handler(request)}
export function POST(request:Request){return handler(request)}
export default {fetch:handler}
