// 約會：15 分內 4.3★、兩家沒評分（新店）、4.2、4.1、3.8；4.3 與兩家新店被記憶擋掉 → 剩下最高 4.2，應派 ≥4.0。
const api = (await import('/home/user/general-decision/api/order.ts')).default
process.env.ANTHROPIC_API_KEY = 'x'; process.env.GOOGLE_PLACES_KEY = 'y'
const O = { lat: 35.6896, lng: 139.7006 }
const ORDER = JSON.stringify({ verdict: 'do', meme: { top: 'a', big: 'b', bot: 'c' }, steps: ['步行。', '點招牌。', '慢慢吃 90 分鐘。'], place: { id: 'x', name: 'x' }, log: 'x' })
const P = (id: string, m: number, rating: number | undefined, type: string, cnt = 600) => ({ id, displayName: { text: id }, location: { latitude: O.lat + m / 111000, longitude: O.lng }, currentOpeningHours: { openNow: true }, ...(rating !== undefined ? { rating, userRatingCount: cnt } : {}), primaryType: type, types: [type] })
const RAW = [P('A43', 300, 4.3, 'italian_restaurant'), P('U1', 350, undefined, 'french_restaurant'), P('U2', 400, undefined, 'italian_restaurant'), P('B42', 500, 4.2, 'japanese_restaurant'), P('C41', 450, 4.1, 'sushi_restaurant'), P('D38', 200, 3.8, 'restaurant')]
globalThis.fetch = (async (url: any) => {
  const u = String(typeof url === 'object' && 'url' in url ? url.url : url)
  if (u.includes('anthropic')) return new Response(JSON.stringify({ content: [{ type: 'text', text: ORDER }] }), { status: 200 })
  return new Response(JSON.stringify({ places: RAW }), { status: 200 })
}) as any
const until = Date.now() + 14 * 864e5
for (const [label, mem] of [
  ['只擋 A43', [{ id: 'A43', sh: [], dn: [], x: until }]],
  ['擋 A43、U1、U2', [{ id: 'A43', sh: [], dn: [], x: until }, { id: 'U1', sh: [], dn: [], x: 'forever' }, { id: 'U2', sh: [], dn: [], x: 'forever' }]],
] as const) {
  const t: Record<string, number> = {}
  for (let seed = 1; seed <= 40; seed++) {
    const j: any = await (await api.fetch(new Request('http://localhost/api/order', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
      module: 'eat', level: 1, choices: { diet: '都可以', scene: '約會吃好一點' }, loc: { ...O, label: '新宿' }, now: '2026-11-05T19:30:00+09:00', recentOrders: [], mem, seed,
    }) }))).json()
    t[j.place?.name] = (t[j.place?.name] ?? 0) + 1
  }
  console.log(label, JSON.stringify(t))
}
