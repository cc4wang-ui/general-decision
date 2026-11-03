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
export type ScheduledStop={id:string;title?:string;minutes?:number;start?:string;locked?:boolean;custom?:boolean;done?:boolean;candidate?:Point;eta?:string;departure?:string;travelMin?:number;conflict?:string}
const clock=(m:number)=>String(Math.floor(m/60)%24).padStart(2,'0')+':'+String(Math.round(m%60)).padStart(2,'0')
const minute=(t:string)=>/^([01]\d|2[0-3]):[0-5]\d$/.test(t)?Number(t.slice(0,2))*60+Number(t.slice(3)):null
export async function travelMatrix(key:string,origin:Point,stops:ScheduledStop[]):Promise<{matrix:number[][];distances:number[][]}>{
 const points=[origin,...stops.map(s=>s.candidate).filter((p):p is Point=>!!p)]
 const waypoints=points.map(p=>({waypoint:{location:{latLng:{latitude:p.lat,longitude:p.lng}}}}))
 const response=await fetch((process.env.ROUTES_BASE_URL??'https://routes.googleapis.com')+'/distanceMatrix/v2:computeRouteMatrix',{
  method:'POST',headers:{'content-type':'application/json','X-Goog-Api-Key':key,'X-Goog-FieldMask':'originIndex,destinationIndex,duration,distanceMeters,status,condition'},
  body:JSON.stringify({origins:waypoints,destinations:waypoints,travelMode:'WALK',routingPreference:'ROUTING_PREFERENCE_UNSPECIFIED'}),signal:AbortSignal.timeout(14000)})
 if(!response.ok)throw new Error('Google Routes 步行路線服務未啟用或暫時不可用（'+response.status+'）')
 const body=await response.text()
 let elements:Array<{originIndex:number;destinationIndex:number;duration?:string;distanceMeters?:number;condition?:string;status?:{code?:number}}>=[] 
 try{const data=JSON.parse(body);elements=Array.isArray(data)?data:[data]}catch{elements=body.split('\n').filter(Boolean).map(line=>JSON.parse(line))}
 const matrix=points.map((_,i)=>points.map((__,j)=>i===j?0:Infinity))
 const distances=points.map((_,i)=>points.map((__,j)=>i===j?0:Infinity))
 for(const e of elements){if(e.status?.code||e.condition==='ROUTE_NOT_FOUND')continue
  const seconds=Number(e.duration?.replace('s',''))
  if(Number.isFinite(seconds)&&e.originIndex<points.length&&e.destinationIndex<points.length){matrix[e.originIndex][e.destinationIndex]=Math.ceil(seconds/60);distances[e.originIndex][e.destinationIndex]=(e.distanceMeters??0)/1000}
 }
 if(matrix.some(row=>row.some(v=>!Number.isFinite(v))))throw new Error('部分站點沒有可用步行路線；不會以直線距離冒充實際路線')
 return {matrix,distances}
}
export function scheduleRoute<T extends ScheduledStop>(stops:T[],matrix:number[][],distances:number[][],now:string):{stops:T[];distanceKm:number;travelMinutes:number;conflicts:string[]}{
 const originIndex=0,idx=new Map(stops.map((s,i)=>[s.id,i+1]))
 const appointments=stops.filter(s=>s.locked||s.custom||s.done).sort((a,b)=>(a.start??'99:99').localeCompare(b.start??'99:99'))
 const flexible=stops.filter(s=>!appointments.includes(s))
 const ordered:T[]=[]
 let position=originIndex,at=minute(now)??9*60,travelMinutes=0,distanceKm=0
 const conflicts:string[]=[]
 const visit=(s:T)=>{
  const next=idx.get(s.id)!,duration=matrix[position][next],distance=distances[position][next]
  if(!Number.isFinite(duration))throw new Error('部分站點無法步行抵達')
  const arrival=at+duration,deadline=s.start?minute(s.start):null
  const eta=deadline!==null&&arrival<deadline?deadline:arrival
  const conflict=deadline!==null&&arrival>deadline?'預計晚到 '+(arrival-deadline)+' 分鐘':undefined
  if(conflict)conflicts.push((s.title??s.id)+'：'+conflict)
  ordered.push({...s,eta:clock(eta),departure:clock(eta+(s.minutes??45)),travelMin:duration,conflict} as T)
  travelMinutes+=duration;distanceKm+=distance;at=eta+(s.minutes??45);position=next
 }
 for(const fixed of [...appointments,{id:'__end__'} as T]){
  const target=fixed.id==='__end__'?null:fixed
  const deadline=target?.start?minute(target.start):null
  while(flexible.length){
   const possible=flexible.map((s,i)=>{
    const p=idx.get(s.id)!,leg=matrix[position][p],toFixed=target?matrix[p][idx.get(target.id)!]:0
    const feasible=deadline===null||at+leg+(s.minutes??45)+toFixed<=deadline
    return {i,leg,feasible}
   }).filter(x=>x.feasible&&Number.isFinite(x.leg)).sort((a,b)=>a.leg-b.leg)
   if(!possible.length)break
   visit(flexible.splice(possible[0].i,1)[0])
  }
  if(target)visit(target)
 }
 // If a fixed appointment cannot be met, surface the conflict, never silently discard stops.
 while(flexible.length){const ranked=flexible.map((s,i)=>({i,leg:matrix[position][idx.get(s.id)!]})).sort((a,b)=>a.leg-b.leg);visit(flexible.splice(ranked[0].i,1)[0])}
 return {stops:ordered,distanceKm:Math.round(distanceKm*10)/10,travelMinutes,conflicts}
}
