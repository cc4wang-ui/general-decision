// daily-fixed-ontime（P0）：只要存在一種排法能準時趕上所有固定行程，就要選那種排法；
// 真的趕不上才顯示晚到警告。契約：runs/daily-fixed-ontime/contract.md。
import {describe,it,expect} from 'vitest'
import {createHash} from 'node:crypto'
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
/** 窮舉：所有排法中，晚到站數的最小值（錨點 09:30，同一天；跟 visit 同規則：早到等、到達 > 期限算晚到）。 */
function minLate(stops:ScheduledStop[],m:number[][],anchor:number):number{
 let best=Infinity
 for(const p of perms(stops.length)){
  let pos=0,at=anchor,late=0
  for(const i of p){
   const s=stops[i]!,arr=at+m[pos]![i+1]!,dl=s.start?toMin(s.start):null
   if(dl!==null&&arr>dl)late++
   at=(dl!==null&&arr<dl?dl:arr)+(s.minutes??45);pos=i+1
  }
  best=Math.min(best,late)
 }
 return best
}
function randomCase(r:()=>number,metric:boolean,past=false){
 const n=3+Math.floor(r()*4)
 const pts=Array.from({length:n+1},()=>[r()*30,r()*30] as const)
 const m=pts.map((a,i)=>pts.map((b,j)=>i===j?0:metric?Math.ceil(Math.hypot(a[0]-b[0],a[1]-b[1])):(r()<0.5?1+Math.floor(r()*5):5+Math.floor(r()*60))))
 const tight=r()<0.7,nfix=1+Math.floor(r()*Math.min(4,n))
 const stops:ScheduledStop[]=Array.from({length:n},(_,i)=>{
  const fixed=i<nfix,st=past&&r()<0.15?480+Math.floor(r()*80):575+Math.floor(r()*(tight?90:240))
  return {id:'s'+i,title:'S'+i,minutes:5+Math.floor(r()*50),locked:fixed,start:fixed?hhmm(st):undefined,candidate:P}
 })
 return {stops,m}
}

describe('daily-fixed-ontime：能準時就要準時',()=>{
 // 0＝出發點、1＝固定行程 A（10:00）、2＝F、3＝G。直走 0→A 要 100 分鐘；
 // 0→F→G→A 只要 5+5+5 分鐘＋停留（步行矩陣違反三角不等式：繞路比直走快）。
 const m=[[0,100,5,100],[100,0,100,5],[5,100,0,5],[100,5,5,0]]
 const stops:ScheduledStop[]=[
  {id:'A',title:'會議',locked:true,start:'10:00',minutes:30,candidate:P},
  {id:'F',title:'咖啡',minutes:5,candidate:P},
  {id:'G',title:'書店',minutes:5,candidate:P},
 ]
 it('存在準時排法：選它，不報晚到',()=>{
  const out=scheduleRoute(stops,m,zeros(m),'09:30')
  expect(out.conflicts).toEqual([])
  expect(out.stops.map(s=>s.id)).toEqual(['F','G','A'])
  expect(out.stops.find(s=>s.id==='A')?.eta).toBe('10:00')
  expect(out.stops.every(s=>!s.conflict)).toBe(true)
 })
 it('兩個固定行程：中間要繞路才趕得上第二個，也要選準時排法',()=>{
  // 0 出發、1＝A 09:40、2＝B 11:00、3＝F、4＝G。A→B 直走 200；A→F→G→B 只要 15＋停留。
  const m2=[[0,5,300,300,300],[5,0,200,5,300],[300,200,0,300,5],[300,5,300,0,5],[300,300,5,5,0]]
  const s2:ScheduledStop[]=[
   {id:'A',locked:true,start:'09:40',minutes:30,candidate:P},
   {id:'B',custom:true,start:'11:00',minutes:30,candidate:P},
   {id:'F',minutes:10,candidate:P},
   {id:'G',minutes:10,candidate:P},
  ]
  const out=scheduleRoute(s2,m2,zeros(m2),'09:30')
  expect(out.conflicts).toEqual([])
  expect(out.stops.map(s=>s.id)).toEqual(['A','F','G','B'])
 })
 it('把關第 1 輪：已過時間的行程趕不上，不能害其他行程失去救援',()=>{
  // 錨點 15:30。D＝已完成、09:00（怎樣都趕不上）。A＝16:00，直走 100 分鐘；繞 F→G 只要 5+5+5＋停留。
  const m3=[[0,100,5,100,3],[100,0,100,5,100],[5,100,0,5,100],[100,5,5,0,100],[3,100,100,100,0]]
  const s3:ScheduledStop[]=[
   {id:'A',title:'A',locked:true,start:'16:00',minutes:30,candidate:P},
   {id:'F',minutes:5,candidate:P},
   {id:'G',minutes:5,candidate:P},
   {id:'D',title:'D',done:true,start:'09:00',minutes:10,candidate:P},
  ]
  const out=scheduleRoute(s3,m3,zeros(m3),'15:30')
  expect(out.conflicts).toHaveLength(1)
  expect(out.conflicts[0]).toMatch(/^D：預計晚到/)
  expect(out.stops.find(s=>s.id==='A')?.eta).toBe('16:00')
  expect(out.stops.find(s=>s.id==='A')?.conflict).toBeUndefined()
  expect(out.stops).toHaveLength(4)
 })
 it('真的趕不上：照舊報晚到，不丟站',()=>{
  const out=scheduleRoute(stops,m,zeros(m),'09:58')
  expect(out.conflicts.some(c=>c.startsWith('會議：預計晚到'))).toBe(true)
  expect(out.stops.map(s=>s.id).sort()).toEqual(['A','F','G'])
 })
 it('隨機比對窮舉：晚到站數＝所有排法中的最小值（含違反三角不等式的矩陣、已過時間的行程）',()=>{
  let bad=0,lateCases=0,partial=0
  for(const metric of [true,false]){
   const r=rng(metric?2026:1113)
   for(let t=0;t<3000;t++){
    const {stops:s,m:mm}=randomCase(r,metric,true)
    const out=scheduleRoute(s,mm,zeros(mm),'09:30')
    expect(out.stops).toHaveLength(s.length)
    const best=minLate(s,mm,570)
    if(best>0)lateCases++
    if(best>0&&out.conflicts.length===best)partial++
    if(out.conflicts.length!==best)bad++
   }
  }
  expect(lateCases).toBeGreaterThan(100) // 確認有測到「真的趕不上」的情況
  expect(partial).toBeGreaterThan(50) // 確認有測到「部分趕不上、其他要救」的情況
  expect(bad).toBe(0)
 })
 it('沒有衝突的排法：輸出指紋固定（daily-walk-shortest 起依「段內步行最短」新規則）',()=>{
  const h=createHash('sha256')
  let kept=0
  for(const metric of [true,false]){
   const r=rng(metric?7:11)
   for(let t=0;t<3000;t++){
    const {stops:s,m:mm}=randomCase(r,metric)
    const out=scheduleRoute(s,mm,zeros(mm),'09:30')
    if(out.conflicts.length)continue
    // kept 不變：晚到站數本來就是最小值；改的只有固定站之間各段的順序（段內步行最短）。
    h.update(JSON.stringify(out));kept++
   }
  }
  expect({kept,digest:h.digest('hex').slice(0,16)}).toEqual(PRE_FIX)
 })
 it('站多又趕不上：搜尋有上限，不會卡住請求',()=>{
  const n=14
  const big=Array.from({length:n+1},(_,i)=>Array.from({length:n+1},(_,j)=>i===j?0:1+((i*7+j*3)%9)))
  const s:ScheduledStop[]=Array.from({length:n},(_,i)=>({id:'x'+i,minutes:20,locked:i===n-1,start:i===n-1?'09:31':undefined,candidate:P}))
  big[0]![n]=50
  const t0=Date.now()
  const out=scheduleRoute(s,big,zeros(big),'09:30')
  expect(Date.now()-t0).toBeLessThan(1000)
  expect(out.stops).toHaveLength(n)
  expect(out.conflicts.length).toBe(1)
 })
})
// 指紋：6000 組隨機案例中沒有衝突的 1950 組。
// daily-fixed-ontime 時（main 99984a1）是 '0025f4d55d2ab4e0'，保證「沒有衝突時輸出不變」。
// daily-walk-shortest（2026-11-13）刻意改變：沒有衝突時也改成「固定站不動、每段內步行最短」的排法，所以依新規則重算。
// 新規則的正確性由 tests/unit/daily-walk-shortest.test.ts 的窮舉比對保證。
const PRE_FIX={kept:1950,digest:'d4a5e0f87884a976'}
