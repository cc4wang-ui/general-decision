// TEMPORARY QA ONLY. Must delete before merging to main.
// Exercise the real production handler with non-personal test places.
import { POST } from './daily-route.ts'
export const config={runtime:'nodejs'}
async function handler(_request:Request):Promise<Response>{
 const sample={location:'渋谷駅',stops:[
  {id:'coffee',title:'咖啡探索',kind:'creative',minutes:30,done:false},
  {id:'meal',title:'日式定食',kind:'meal',minutes:45,done:false},
  {id:'fixed-test',title:'渋谷 PARCO 測試行程',kind:'rest',place:'渋谷 PARCO',start:'20:00',minutes:20,locked:true,custom:true,done:false}
 ]}
 const start=Date.now()
 const upstream=await POST(new Request('https://example.invalid/api/daily-route',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(sample)}))
 const raw=await upstream.text()
 let obj:any;try{obj=JSON.parse(raw)}catch{obj={error:'invalid_json'}}
 return new Response(JSON.stringify({test:true,apiStatus:upstream.status,ms:Date.now()-start,routeVerified:obj.routeVerified,warning:obj.warning,error:obj.error,message:obj.message,stops:(obj.stops??[]).map((s:any)=>({id:s.id,name:s.candidate?.name,address:s.candidate?.address,hasMapUrl:!!s.candidate?.mapUrl,eta:s.eta,travelMin:s.travelMin,conflict:s.conflict})),conflicts:obj.conflicts}),{headers:{'content-type':'application/json','cache-control':'no-store'}})
}
export function GET(r:Request){return handler(r)}
export default {fetch:handler}
