// 失敗路徑：約會的 15 分內最高分被記憶擋掉（又是這家 14 天／不要再來），15 分內還有別家可派，會不會派到走 30 分的店？
const api = (await import('/home/user/general-decision/api/order.ts')).default
process.env.ANTHROPIC_API_KEY = 'x'; process.env.GOOGLE_PLACES_KEY = 'y'
const O = { lat: 35.6896, lng: 139.7006 }
const at = (dLatM: number) => ({ latitude: O.lat + dLatM / 111000, longitude: O.lng })
const open = { openNow: true }
const RAW = [
  { id: 'A', displayName: { text: 'A 4.2 近' }, location: at(550), currentOpeningHours: open, rating: 4.2, userRatingCount: 800, primaryType: 'italian_restaurant', types: ['italian_restaurant', 'restaurant'] },
  { id: 'B', displayName: { text: 'B 3.8 近' }, location: at(350), currentOpeningHours: open, rating: 3.8, userRatingCount: 800, primaryType: 'japanese_restaurant', types: ['japanese_restaurant', 'restaurant'] },
  { id: 'C', displayName: { text: 'C 4.6 遠' }, location: at(2300), currentOpeningHours: open, rating: 4.6, userRatingCount: 800, primaryType: 'italian_restaurant', types: ['italian_restaurant', 'restaurant'] },
  { id: 'D', displayName: { text: 'D 4.7 居酒屋 近' }, location: at(600), currentOpeningHours: open, rating: 4.7, userRatingCount: 800, primaryType: 'japanese_izakaya_restaurant', types: ['japanese_izakaya_restaurant', 'restaurant'] },
]
const ORDER = JSON.stringify({ verdict: 'do', meme: { top: 'a', big: 'b', bot: 'c' }, steps: ['步行。', '點招牌。', '慢慢吃 90 分鐘。'], place: { id: 'A', name: 'A' }, log: 'x' })
globalThis.fetch = (async (url: any) => {
  const u = String(typeof url === 'object' && 'url' in url ? url.url : url)
  if (u.includes('anthropic')) return new Response(JSON.stringify({ content: [{ type: 'text', text: ORDER }] }), { status: 200 })
  return new Response(JSON.stringify({ places: RAW }), { status: 200 })
}) as any
const tally: Record<string, Record<string, number>> = {}
for (let i = 0; i < 40; i++) for (const [label, mem] of [
  ['無記憶', []],
  ['A 被「又是這家」擋 14 天', [{ id: 'A', sh: [], dn: [], x: Date.now() + 14 * 864e5 }]],
  ['A 被「不要再來」永久擋', [{ id: 'A', sh: [], dn: [], x: 'forever' }]],
] as const) {
  const res = await api.fetch(new Request('http://localhost/api/order', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
    module: 'eat', level: 1, choices: { diet: '都可以', scene: '約會吃好一點' }, loc: { ...O, label: '新宿' }, now: '2026-11-05T07:30:00+09:00', recentOrders: [], mem, debug: true,
  }) }))
  const j: any = await res.json()
  const d = j.debug ?? {}
  const key = String(j.place?.name) + ' 走' + String(j.place?.walkMin ?? '?'); const t = tally[label] ?? (tally[label] = {}); t[key] = (t[key] ?? 0) + 1
}
console.log(JSON.stringify(tally, null, 1))
