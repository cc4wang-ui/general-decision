// daily-walk-shortest（P0）：晚到站數最少的排法中，選總步行分鐘最短的。
// 契約：runs/daily-walk-shortest/contract.md。
import {describe,it,expect} from 'vitest'
import {scheduleRoute,type ScheduledStop} from '../../src/dailyRouting.ts'

const P={lat:0,lng:0}
const hhmm=(m:number)=>String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0')
const toMin=(t:string)=>Number(t.slice(0,2))*60+Number(t.slice(3))
const zeros=(m:number[][])=>m.map(r=>r.map(()=>0))
function rng(seed:number){return()=>{seed=(seed*1103515245+12345)%2147483648;return seed/2147483648}}
function perms(n:number):number[][]{
 const out:number[][]=[]
 const go=(p:number[],rest:number[])=>{if(!rest.length){out.push(p);return}rest.forEach((x,i)=>go([...p,x],[...rest.slice(0,i),...rest.slice(i+1)]))}
 go([],Array.from({length:n},(_,i)=>i))
 return out
}
/** 窮舉：依序比 (晚到站數, 步行分鐘) 的最小值（錨點同一天；跟 visit 同規則）。 */
function best(stops:ScheduledStop[],m:number[][],anchor:number){
 let bl=Infinity,bw=Infinity
 for(const p of perms(stops.length)){
  let pos=0,at=anchor,late=0,walk=0
  for(const i of p){
   const s=stops[i]!,leg=m[pos]![i+1]!,arr=at+leg,dl=s.start?toMin(s.start):null
   if(dl!==null&&arr>dl)late++
   walk+=leg;at=(dl!==null&&arr<dl?dl:arr)+(s.minutes??45);pos=i+1
  }
  if(late<bl||(late===bl&&walk<bw)){bl=late;bw=walk}
 }
 return {late:bl,walk:bw}
}
function randomCase(r:()=>number,metric:boolean,n=3+Math.floor(r()*4)){
 const pts=Array.from({length:n+1},()=>[r()*30,r()*30] as const)
 const m=pts.map((a,i)=>pts.map((b,j)=>i===j?0:metric?Math.ceil(Math.hypot(a[0]-b[0],a[1]-b[1])):(r()<0.5?1+Math.floor(r()*5):5+Math.floor(r()*60))))
 const nfix=Math.floor(r()*Math.min(4,n+1))
 const stops:ScheduledStop[]=Array.from({length:n},(_,i)=>{
  const fixed=i<nfix,timed=fixed&&r()<0.85
  const st=r()<0.1?480+Math.floor(r()*80):575+Math.floor(r()*(r()<0.7?90:240))
  return {id:'s'+i,title:'S'+i,minutes:5+Math.floor(r()*50),locked:fixed,done:fixed&&r()<0.1,start:timed?hhmm(st):undefined,candidate:P}
 })
 return {stops,m}
}

describe('daily-walk-shortest：總步行最短',()=>{
 it('貪婪的步行比最短多、晚到站數相同：要改用最短排法',()=>{
  // 0 出發。貪婪：A 最近（1）；接著最近是 B（2）；最後只剩 C，B→C 要 30。總 33。
  // 最短（窮舉）：0→B(3)→A(2)→C(5)=10。
  //      0  A  B  C
  const m=[[0,1,3,5],[1,0,2,5],[3,2,0,30],[5,5,30,0]]
  const stops:ScheduledStop[]=[{id:'A',minutes:10,candidate:P},{id:'B',minutes:10,candidate:P},{id:'C',minutes:10,candidate:P}]
  const out=scheduleRoute(stops,m,zeros(m),'09:30')
  expect(out.conflicts).toEqual([])
  expect(out.travelMinutes).toBe(10)
  expect(out.stops.map(s=>s.id)).toEqual(['B','A','C'])
 })
 it('有固定行程：不能為了少走路而晚到',()=>{
  // F 在 10:00 有約。最短步行是 0→C→A→B→F，但那樣 F 會晚到；要選準時排法中最短的。
  //      0  A  B  C  F
  const m=[[0,1,3,5,4],[1,0,2,5,4],[3,2,0,30,4],[5,5,30,0,40],[4,4,4,40,0]]
  const stops:ScheduledStop[]=[{id:'A',minutes:10,candidate:P},{id:'B',minutes:10,candidate:P},{id:'C',minutes:10,candidate:P},{id:'F',locked:true,start:'09:40',minutes:30,candidate:P}]
  const out=scheduleRoute(stops,m,zeros(m),'09:30')
  const b=best(stops,m,570)
  expect(out.conflicts.length).toBe(b.late)
  expect(out.conflicts).toEqual([])
  expect(out.travelMinutes).toBe(b.walk)
 })
 it('隨機比對窮舉：晚到站數最少，其中步行最短（含違反三角不等式的矩陣、已過時間的行程）',()=>{
  let bad=0,late=0
  for(const metric of [true,false]){
   const r=rng(metric?4242:1311)
   for(let t=0;t<3000;t++){
    const {stops:s,m:mm}=randomCase(r,metric)
    const out=scheduleRoute(s,mm,zeros(mm),'09:30')
    expect(out.stops).toHaveLength(s.length)
    expect(new Set(out.stops.map(x=>x.id)).size).toBe(s.length)
    const b=best(s,mm,570)
    if(b.late>0)late++
    if(out.conflicts.length!==b.late||out.travelMinutes!==b.walk)bad++
   }
  }
  expect(late).toBeGreaterThan(100)
  expect(bad).toBe(0)
 })
 it('API 上限 9 站：最壞情況也不卡住請求',()=>{
  const r=rng(99)
  let worst=0
  for(let t=0;t<200;t++){
   const {stops:s,m:mm}=randomCase(r,t%2===0,9)
   const t0=performance.now()
   const out=scheduleRoute(s,mm,zeros(mm),'09:30')
   worst=Math.max(worst,performance.now()-t0)
   expect(out.stops).toHaveLength(9)
  }
  expect(worst).toBeLessThan(200)
 })
})
