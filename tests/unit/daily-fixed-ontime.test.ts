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
/** 窮舉：所有排法中，是否有一種讓每個有時間的固定行程都準時（同一天，錨點 09:30）。 */
function onTimeExists(stops:ScheduledStop[],m:number[][],anchor:number):boolean{
 return perms(stops.length).some(p=>{
  let pos=0,at=anchor
  for(const i of p){
   const s=stops[i]!,arr=at+m[pos]![i+1]!,dl=s.start?toMin(s.start):null
   if(dl!==null&&arr>dl)return false
   at=(dl!==null&&arr<dl?dl:arr)+(s.minutes??45);pos=i+1
  }
  return true
 })
}
function randomCase(r:()=>number,metric:boolean){
 const n=3+Math.floor(r()*4)
 const pts=Array.from({length:n+1},()=>[r()*30,r()*30] as const)
 const m=pts.map((a,i)=>pts.map((b,j)=>i===j?0:metric?Math.ceil(Math.hypot(a[0]-b[0],a[1]-b[1])):(r()<0.5?1+Math.floor(r()*5):5+Math.floor(r()*60))))
 const tight=r()<0.7,nfix=1+Math.floor(r()*Math.min(4,n))
 const stops:ScheduledStop[]=Array.from({length:n},(_,i)=>{
  const fixed=i<nfix,st=575+Math.floor(r()*(tight?90:240))
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
 it('真的趕不上：照舊報晚到，不丟站',()=>{
  const out=scheduleRoute(stops,m,zeros(m),'09:58')
  expect(out.conflicts.some(c=>c.startsWith('會議：預計晚到'))).toBe(true)
  expect(out.stops.map(s=>s.id).sort()).toEqual(['A','F','G'])
 })
 it('隨機比對窮舉：「找得到準時排法、程式卻報晚到」＝0（含違反三角不等式的矩陣）',()=>{
  let bad=0,lateCases=0
  for(const metric of [true,false]){
   const r=rng(metric?2026:1113)
   for(let t=0;t<3000;t++){
    const {stops:s,m:mm}=randomCase(r,metric)
    const out=scheduleRoute(s,mm,zeros(mm),'09:30')
    expect(out.stops).toHaveLength(s.length)
    if(out.conflicts.length){lateCases++;if(onTimeExists(s,mm,570))bad++}
    else expect(onTimeExists(s,mm,570)).toBe(true)
   }
  }
  expect(lateCases).toBeGreaterThan(100) // 確認有測到「真的趕不上」的情況
  expect(bad).toBe(0)
 })
 it('原本沒有衝突的排法：輸出完全不變（指紋與修正前相同）',()=>{
  const h=createHash('sha256')
  let kept=0
  for(const metric of [true,false]){
   const r=rng(metric?7:11)
   for(let t=0;t<3000;t++){
    const {stops:s,m:mm}=randomCase(r,metric)
    const out=scheduleRoute(s,mm,zeros(mm),'09:30')
    if(out.conflicts.length)continue
    // 隨機比對已證實：這 6000 組裡沒有「修正前晚到、修正後變準時」的案例，所以 kept 也不變。
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
// 修正前（main 99984a1）實跑記下的指紋：6000 組隨機案例中，貪婪排法沒有衝突的 1950 組。
const PRE_FIX={kept:1950,digest:'0025f4d55d2ab4e0'}
