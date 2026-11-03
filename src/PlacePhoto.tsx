import { useEffect, useState } from 'react'

type Attribution={name:string;url:string|null}
type PhotoResult={photoUrl:string;attributions:Attribution[]}
export function PlacePhoto({placeId,placeName,mapUrl}:{placeId:string;placeName:string;mapUrl:string}){
 const [image,setImage]=useState<PhotoResult|null>(null)
 const [status,setStatus]=useState<'loading'|'ready'|'missing'>('loading')
 useEffect(()=>{
  const abort=new AbortController()
  setImage(null);setStatus('loading')
  fetch('/api/place-photo?placeId='+encodeURIComponent(placeId),{signal:abort.signal,cache:'no-store'})
   .then(async r=>{if(!r.ok)throw new Error('No photo');return r.json() as Promise<PhotoResult>})
   .then(r=>{if(!abort.signal.aborted&&r.photoUrl){setImage(r);setStatus('ready')}})
   .catch(()=>{if(!abort.signal.aborted)setStatus('missing')})
  return ()=>abort.abort()
 },[placeId])
 return <figure className="dd-photo">
  {status==='loading'&&<div className="dd-photo-placeholder" role="status"><span>▧</span><small>正在取得現場照片…</small></div>}
  {status==='missing'&&<div className="dd-photo-placeholder"><span>▧</span><small>此地點暫無可顯示的實景照片</small><a href={mapUrl} target="_blank" rel="noopener noreferrer">到 Google Maps 看照片 ↗</a></div>}
  {status==='ready'&&image&&<>
   <img src={image.photoUrl} alt={placeName+'－Google Places 地點實景照片'} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={()=>{setStatus('missing');setImage(null)}}/>
   <figcaption>照片：Google Places{image.attributions.length>0&&<> · {image.attributions.map((a,i)=><span key={i}>{i>0?'、':''}{a.url?<a href={a.url} target="_blank" rel="noopener noreferrer">{a.name}</a>:a.name}</span>)}</>}</figcaption>
  </>}
 </figure>
}
