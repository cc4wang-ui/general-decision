// guide-1115｜預覽站／正式站真 POST（真 Google，不攔截）。
// 用法：[SHARE_URL=<含 _vercel_share 的連結>] [BASE=https://general-decision.vercel.app] [OUT=preview-guide.out.json] node runs/guide-1115/snapshots/preview-guide.mjs
import { chromium } from 'playwright'
import { writeFileSync } from 'node:fs'
const share = process.env.SHARE_URL
const base = process.env.BASE || new URL(share).origin
const browser = await chromium.launch()
const ctx = await browser.newContext()
if (share) await (await ctx.newPage()).goto(share)
const post = async body => {
  const r = await ctx.request.post(base + '/api/daily-route', { data: { location: '渋谷駅', area: '澀谷', areaOnly: true, startTime: '', exclude: [], excludeKinds: [], seen: [], ...body } })
  const j = await r.json().catch(() => ({}))
  return { status: r.status(), routeVerified: j.routeVerified, conflicts: j.conflicts, stops: (j.stops || []).map(s => ({ id: s.id, theme: s.theme, themeArea: s.themeArea, name: s.candidate?.name, pid: s.candidate?.id, primaryType: s.candidate?.primaryType, rating: s.candidate?.rating, n: s.candidate?.userRatingCount, address: s.candidate?.address, eta: s.eta, start: s.start, noCandidate: s.noCandidate, reason: s.noCandidateReason, title: s.title })) }
}
const explore = (theme, extra = {}) => ({ id: 'creative', title: '探索', minutes: 65, kind: 'creative', done: false, ...(theme ? { theme } : {}), ...extra })
const out = { base, at: new Date().toISOString(), themes: {}, order: {} }
// 1. 七個主題各打 2 次
for (const t of ['view_cafe', 'good_coffee', 'fun', 'park', 'new_area', 'destination_meal', 'art']) {
  out.themes[t] = []
  for (let i = 0; i < 2; i++) out.themes[t].push(await post({ stops: [explore(t, t === 'new_area' ? { themeArea: i ? '恵比寿' : '原宿' } : {})], ...(t === 'new_area' ? {} : {}) }))
}
out.themes.invalid = [await post({ stops: [explore('hack_me')] })]
out.themes.coffee = [await post({ stops: [{ id: 'coffee', title: '咖啡', minutes: 60, kind: 'creative', done: false, theme: 'view_cafe' }] })]
// 2. 手動順序：先自動排一次拿到店，再把順序反過來用 manualOrder＋reorderOnly 送
const base3 = [{ id: 'meal', title: '澀谷｜一人友善的日式定食', minutes: 45, kind: 'meal', done: false }, explore('good_coffee'), { id: 'shopping', title: '澀谷｜生活用品', minutes: 55, kind: 'shopping', done: false }]
const fixed = { id: 'fixed-1', title: '看唱片', place: 'タワーレコード渋谷店', start: '23:30', minutes: 30, kind: 'rest', done: false, locked: true, custom: true }
const auto = await ctx.request.post(base + '/api/daily-route', { data: { location: '渋谷駅', area: '澀谷', areaOnly: true, startTime: '', exclude: [], excludeKinds: [], seen: [], stops: [...base3, fixed] } }).then(r => r.json())
const autoOrder = auto.stops.map(s => s.id)
const movable = auto.stops.filter(s => !s.locked)
const reversed = [...movable].reverse()
const sent = [...reversed, ...auto.stops.filter(s => s.locked)]
const manual = await ctx.request.post(base + '/api/daily-route', { data: { location: '渋谷駅', area: '澀谷', areaOnly: true, startTime: '', exclude: [], excludeKinds: [], seen: [], stops: sent, manualOrder: true, reorderOnly: true } }).then(async r => ({ status: r.status(), j: await r.json() }))
const pid = s => s.candidate?.id
out.order = {
  autoOrder, sentMovable: reversed.map(s => s.id),
  gotMovable: manual.j.stops.filter(s => !s.locked).map(s => s.id), status: manual.status,
  samePlaces: movable.every(s => pid(s) && pid(manual.j.stops.find(x => x.id === s.id)) === pid(s)),
  fixedStartKept: manual.j.stops.find(s => s.id === 'fixed-1')?.start, routeVerified: manual.j.routeVerified,
  etas: manual.j.stops.map(s => [s.id, s.eta ?? null]), conflicts: manual.j.conflicts,
}
const T = out.themes
out.summary = {
  all200: Object.values(T).flat().every(r => r.status === 200) && manual.status === 200,
  themesWithRealPlace: Object.fromEntries(Object.entries(T).map(([k, v]) => [k, v.map(r => r.stops[0]?.name ?? `(無：${r.stops[0]?.reason})`)])),
  themeTypes: Object.fromEntries(Object.entries(T).map(([k, v]) => [k, v.map(r => r.stops[0]?.primaryType ?? null)])),
  invalidThemeEchoed: T.invalid[0].stops[0]?.theme ?? null,
  manualOrderHonoured: JSON.stringify(out.order.sentMovable) === JSON.stringify(out.order.gotMovable),
  manualKeptPlaces: out.order.samePlaces, fixedStartKept: out.order.fixedStartKept,
}
writeFileSync(new URL('./' + (process.env.OUT || 'preview-guide.out.json'), import.meta.url), JSON.stringify(out, null, 1))
console.log(JSON.stringify({ ...out.summary, order: out.order }, null, 1))
await browser.close()
