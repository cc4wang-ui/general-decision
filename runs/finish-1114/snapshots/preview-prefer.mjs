// 2.4｜預覽站真 POST（真 Google Places／Routes，不攔截）。
// 用法：SHARE_URL=<含 _vercel_share 的連結> node --experimental-strip-types runs/finish-1114/snapshots/preview-prefer.mjs
import { chromium } from 'playwright'
import { writeFileSync } from 'node:fs'
import { kindOfCandidate } from '../../../src/placeKind.ts'
const share = process.env.SHARE_URL
const base = new URL(share).origin
const browser = await chromium.launch()
const ctx = await browser.newContext()
const page = await ctx.newPage()
await page.goto(share)
const stops = [
  { id: 'meal', title: '澀谷｜一人友善的日式定食', minutes: 45, kind: 'meal', done: false },
  { id: 'coffee', title: '安靜咖啡廳｜閱讀、寫下 3 個新觀察', minutes: 60, kind: 'creative', done: false },
]
const call = async extra => {
  const r = await ctx.request.post(base + '/api/daily-route', { data: { location: '渋谷駅', area: '澀谷', areaOnly: true, startTime: '', stops, exclude: [], excludeKinds: [], seen: [], ...extra } })
  const j = await r.json().catch(() => ({}))
  return { status: r.status(), routeVerified: j.routeVerified, stops: (j.stops || []).map(s => ({ id: s.id, name: s.candidate?.name, pid: s.candidate?.id, kind: s.candidate ? kindOfCandidate(s.candidate) : undefined, preferHit: s.preferHit, noCandidate: s.noCandidate })) }
}
const out = { base, at: new Date().toISOString(), A: [], B: [], C: [] }
for (let i = 0; i < 6; i++) out.A.push(await call({}))
const mealKinds = out.A.map(r => r.stops.find(s => s.id === 'meal')?.kind).filter(Boolean)
const count = {}; for (const k of mealKinds) count[k] = (count[k] || 0) + 1
// 挑「出現過、但最少見」的種類當偏好，效果最容易看出來
out.K = Object.entries(count).sort((a, b) => a[1] - b[1])[0]?.[0]
out.kindCountA = count
if (out.K) for (let i = 0; i < 8; i++) out.B.push(await call({ prefer: [out.K] }))
out.C.push(await call({ prefer: 'ramen', demote: [1, null, { a: 1 }, 'x'.repeat(500)] }))
const meal = rs => rs.map(r => r.stops.find(s => s.id === 'meal'))
out.summary = {
  allStatus200: [...out.A, ...out.B, ...out.C].every(r => r.status === 200),
  A_mealKshare: `${meal(out.A).filter(s => s?.kind === out.K).length}/${out.A.length}`,
  B_mealKshare: `${meal(out.B).filter(s => s?.kind === out.K).length}/${out.B.length}`,
  A_preferHitCount: out.A.flatMap(r => r.stops).filter(s => s.preferHit).length,
  B_preferHitCount: out.B.flatMap(r => r.stops).filter(s => s.preferHit).length,
  B_preferHitOnlyOnK: out.B.flatMap(r => r.stops).filter(s => s.preferHit).every(s => s.kind === out.K),
  B_distinctMeal: new Set(meal(out.B).map(s => s?.pid)).size,
  B_mealNotInK: meal(out.B).filter(s => s?.kind !== out.K).map(s => s?.name),
  C_badInputStatus: out.C[0].status, C_preferHit: out.C[0].stops.filter(s => s.preferHit).length,
}
writeFileSync(new URL('./preview-prefer.out.json', import.meta.url), JSON.stringify(out, null, 1))
console.log(JSON.stringify({ K: out.K, kindCountA: out.kindCountA, ...out.summary }, null, 1))
await browser.close()
