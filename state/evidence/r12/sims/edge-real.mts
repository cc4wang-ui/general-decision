// 第 2 輪：用 07:50 第 3 次的真候選（評分、步行、類型），一蘭（唯一 4.3★）被「又是這家」擋掉時派到哪。
import { readFileSync } from 'node:fs'
const api = (await import('/home/user/general-decision/api/order.ts')).default
process.env.ANTHROPIC_API_KEY = 'x'; process.env.GOOGLE_PLACES_KEY = 'y'
const O = { lat: 35.6896, lng: 139.7006 }
const d = JSON.parse(readFileSync('/home/user/general-decision/state/evidence/r11/morning-0750-run3/scene-shinjuku.json', 'utf8'))
const cands = d.rows.find((r: any) => r.id === 'eat:約會吃好一點').cands
const RAW = cands.map((c: any, i: number) => ({ id: 'id' + i, displayName: { text: c.name }, location: { latitude: O.lat + (80 * c.walkMin - 40) / 111000, longitude: O.lng }, currentOpeningHours: { openNow: true }, rating: c.rating, userRatingCount: 300, primaryType: c.type, types: [c.type] }))
const ichiran = RAW.find((r: any) => r.displayName.text.startsWith('一蘭')).id
const ORDER = JSON.stringify({ verdict: 'do', meme: { top: 'a', big: 'b', bot: 'c' }, steps: ['步行。', '點招牌。', '慢慢吃 90 分鐘。'], place: { id: 'x', name: 'x' }, log: 'x' })
globalThis.fetch = (async (url: any) => {
  const u = String(typeof url === 'object' && 'url' in url ? url.url : url)
  if (u.includes('anthropic')) return new Response(JSON.stringify({ content: [{ type: 'text', text: ORDER }] }), { status: 200 })
  return new Response(JSON.stringify({ places: RAW }), { status: 200 })
}) as any
const t: Record<string, number> = {}
let below = 0, n = 60
for (let seed = 1; seed <= n; seed++) {
  const res = await api.fetch(new Request('http://localhost/api/order', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
    module: 'eat', level: 1, choices: { diet: '都可以', scene: '約會吃好一點' }, loc: { ...O, label: '新宿' }, now: '2026-11-05T07:50:00+09:00', recentOrders: [], seed,
    mem: [{ id: ichiran, sh: [], dn: [], x: Date.now() + 14 * 864e5 }],
  }) }))
  const j: any = await res.json()
  const c = cands.find((x: any) => x.name === j.place?.name)
  const k = `${j.place?.name} ${c?.rating}★ 走${j.place?.walkMin} ${c?.type}`
  t[k] = (t[k] ?? 0) + 1
  if ((c?.rating ?? 0) < 4.0) below++
}
console.log(JSON.stringify(t, null, 1))
console.log(`低於「剩下的 15 分內最高 4.2★ − 0.2 = 4.0★」：${below}/${n}`)
