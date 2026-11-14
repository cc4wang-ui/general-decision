// 2.4｜正式站真 POST（真 Google，不攔截）。合併 PR #79 後確認 /api/daily-route 載得起來、prefer 生效、壞輸入被忽略。
// 用法：node runs/finish-1114/snapshots/prod-prefer.mjs
import { writeFileSync } from 'node:fs'
const base = 'https://general-decision.vercel.app'
const stops = [{ id: 'meal', title: '澀谷｜一人友善的日式定食', minutes: 45, kind: 'meal', done: false }]
const call = async extra => {
  const r = await fetch(base + '/api/daily-route', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ location: '渋谷駅', area: '澀谷', areaOnly: true, startTime: '', stops, exclude: [], excludeKinds: [], seen: [], ...extra }) })
  const j = await r.json().catch(() => ({}))
  const s = (j.stops || [])[0] || {}
  return { status: r.status, routeVerified: j.routeVerified, name: s.candidate?.name, primaryType: s.candidate?.primaryType, preferHit: s.preferHit }
}
const out = { base, at: new Date().toISOString(), none: [], prefer: [], bad: [] }
for (let i = 0; i < 3; i++) out.none.push(await call({}))
for (let i = 0; i < 6; i++) out.prefer.push(await call({ prefer: ['cafe', 'yakitori', 'sushi', 'izakaya'] }))
out.bad.push(await call({ prefer: 'cafe', demote: [1, null, 'x'.repeat(500)] }))
const html = await (await fetch(base + '/')).text()
const js = html.match(/assets\/index-[\w-]+\.js/)?.[0]
const bundle = js ? await (await fetch(base + '/' + js)).text() : ''
out.summary = { all200: [...out.none, ...out.prefer, ...out.bad].every(r => r.status === 200), nonePreferHit: out.none.filter(r => r.preferHit).length, preferHit: out.prefer.filter(r => r.preferHit).length, badPreferHit: out.bad.filter(r => r.preferHit).length, bundle: js, bundleHasAffinityKey: bundle.includes('decide.daily.affinity.v1'), bundleHasReason: bundle.includes('你常選這類') }
writeFileSync(new URL('./prod-prefer.out.json', import.meta.url), JSON.stringify(out, null, 1))
console.log(JSON.stringify(out.summary, null, 1))
