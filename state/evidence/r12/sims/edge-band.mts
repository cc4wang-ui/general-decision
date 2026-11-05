// 第 2 輪：被記憶擋掉後，第 2 層只拿掉評分 → 會不會派到 15 分內「不是最高分（差 0.2★ 內）」的店？
const api = (await import('/home/user/general-decision/api/order.ts')).default
process.env.ANTHROPIC_API_KEY = 'x'; process.env.GOOGLE_PLACES_KEY = 'y'
const O = { lat: 35.6896, lng: 139.7006 }
const at = (dLatM: number) => ({ latitude: O.lat + dLatM / 111000, longitude: O.lng })
const open = { openNow: true }
const P = (id: string, m: number, rating: number, type: string, cnt = 800) => ({ id, displayName: { text: id }, location: at(m), currentOpeningHours: open, rating, userRatingCount: cnt, primaryType: type, types: [type, 'restaurant'] })
const ORDER = JSON.stringify({ verdict: 'do', meme: { top: 'a', big: 'b', bot: 'c' }, steps: ['步行。', '點招牌。', '慢慢吃 90 分鐘。'], place: { id: 'x', name: 'x' }, log: 'x' })
let RAW: any[] = []
globalThis.fetch = (async (url: any) => {
  const u = String(typeof url === 'object' && 'url' in url ? url.url : url)
  if (u.includes('anthropic')) return new Response(JSON.stringify({ content: [{ type: 'text', text: ORDER }] }), { status: 200 })
  return new Response(JSON.stringify({ places: RAW }), { status: 200 })
}) as any
const cases: Array<[string, any[], any[]]> = [
  ['S2 放寬評分：A4.2 被擋；15 分內剩 B3.8、E3.0（各 800 則）', [P('A4.2', 550, 4.2, 'italian_restaurant'), P('B3.8', 350, 3.8, 'japanese_restaurant'), P('E3.0', 300, 3.0, 'italian_restaurant'), P('C4.6遠', 2300, 4.6, 'italian_restaurant')], [{ id: 'A4.2', sh: [], dn: [], x: Date.now() + 14 * 864e5 }]],
  ['S3 嚴格：A4.5、A4.4 被擋；15 分內剩 F4.2、E3.0', [P('A4.5', 550, 4.5, 'italian_restaurant'), P('A4.4', 500, 4.4, 'french_restaurant'), P('F4.2', 450, 4.2, 'japanese_restaurant'), P('E3.0', 300, 3.0, 'italian_restaurant'), P('C4.6遠', 2300, 4.6, 'italian_restaurant')], [{ id: 'A4.5', sh: [], dn: [], x: 'forever' }, { id: 'A4.4', sh: [], dn: [], x: 'forever' }]],
  ['S4 嚴格：A4.5 被擋；15 分內剩 F4.2、G3.6、E3.4', [P('A4.5', 550, 4.5, 'italian_restaurant'), P('F4.2', 450, 4.2, 'japanese_restaurant'), P('G3.6', 400, 3.6, 'japanese_restaurant'), P('E3.4', 300, 3.4, 'italian_restaurant'), P('C4.6遠', 2300, 4.6, 'italian_restaurant')], [{ id: 'A4.5', sh: [], dn: [], x: 'forever' }]],
]
for (const [label, raw, mem] of cases) {
  RAW = raw
  const t: Record<string, number> = {}
  for (let seed = 1; seed <= 40; seed++) {
    const res = await api.fetch(new Request('http://localhost/api/order', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
      module: 'eat', level: 1, choices: { diet: '都可以', scene: '約會吃好一點' }, loc: { ...O, label: '新宿' }, now: '2026-11-05T07:30:00+09:00', recentOrders: [], mem, seed,
    }) }))
    const j: any = await res.json()
    const k = `${j.place?.name} 走${j.place?.walkMin}`
    t[k] = (t[k] ?? 0) + 1
  }
  console.log(label, JSON.stringify(t))
}
