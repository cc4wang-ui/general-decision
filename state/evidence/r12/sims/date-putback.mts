// checker R12：約會整批放回路徑（STOP 2 的失敗路徑）。
// A：11-05 07:00 新宿真候選（state/evidence/r11/morning-0700），連按「換一家」（exclude 累加），看第幾次開始派到購物中心／美食街／居酒屋／走 >15 分。
// B：15 分內只剩外帶店、購物中心、百貨（沒有酒吧）＋ 25 分外的義大利餐廳。
import { readFileSync } from 'node:fs'
const api = (await import('/home/user/general-decision/api/order.ts')).default
process.env.ANTHROPIC_API_KEY = 'x'; process.env.GOOGLE_PLACES_KEY = 'y'
const O = { lat: 35.6896, lng: 139.7006 }
const ORDER = JSON.stringify({ verdict: 'do', meme: { top: 'a', big: 'b', bot: 'c' }, steps: ['步行。', '點招牌。', '慢慢吃 90 分鐘。'], place: { id: 'x', name: 'x' }, log: 'x' })
let RAW: any[] = []
globalThis.fetch = (async (url: any, init?: any) => {
  const u = String(typeof url === 'object' && 'url' in url ? url.url : url)
  if (u.includes('anthropic')) return new Response(JSON.stringify({ content: [{ type: 'text', text: ORDER }] }), { status: 200 })
  const b = init?.body ? JSON.parse(init.body) : {}
  if (/コンビニ|便利商店/.test(b.textQuery ?? '')) return new Response(JSON.stringify({ places: [{ id: 'cv', displayName: { text: 'セブン' }, location: { latitude: O.lat + 0.002, longitude: O.lng }, currentOpeningHours: { openNow: true }, rating: 3.4, userRatingCount: 100, primaryType: 'convenience_store', types: ['convenience_store'] }] }), { status: 200 })
  return new Response(JSON.stringify({ places: RAW }), { status: 200 })
}) as any
const req = (seed: number, exclude: string[], now: string) => api.fetch(new Request('http://localhost/api/order', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
  module: 'eat', level: 1, choices: { diet: '都可以', scene: '約會吃好一點' }, loc: { ...O, label: '新宿' }, now, recentOrders: [], seed, debug: true, ...(exclude.length ? { exclude } : {}),
}) })).then((r) => r.json() as any)

// A
const d = JSON.parse(readFileSync('/home/user/general-decision/state/evidence/r11/morning-0700/scene-shinjuku.json', 'utf8'))
const cands = d.rows.find((r: any) => r.id === 'eat:約會吃好一點').cands.filter((c: any) => !(c.closeIn !== undefined && c.closeIn - c.walkMin < 90 && c.walkMin <= 15 && c.type === 'italian_restaurant'))
RAW = cands.map((c: any, i: number) => ({ id: 'id' + i, displayName: { text: c.name }, location: { latitude: O.lat + (80 * c.walkMin - 40) / 111000, longitude: O.lng }, currentOpeningHours: { openNow: true }, rating: c.rating, userRatingCount: 300, primaryType: c.type, types: [c.type] }))
const AVOID = new Set(['shopping_mall', 'food_court', 'japanese_izakaya_restaurant', 'meal_takeaway', 'department_store', 'bar'])
const firstBad: Record<string, number> = {}
const badPick: Record<string, number> = {}
for (let seed = 1; seed <= 30; seed++) {
  const ex: string[] = []
  for (let press = 0; press < 10; press++) {
    const j = await req(seed, ex, '2026-11-05T07:00:00+09:00')
    if (!j.place?.id) break
    const c = cands.find((x: any) => x.name === j.place.name)
    if (AVOID.has(c?.type) || (c?.walkMin ?? 0) > 15) {
      firstBad[`第 ${press + 1} 次`] = (firstBad[`第 ${press + 1} 次`] ?? 0) + 1
      const k = `${c.name}｜${c.type}｜走${c.walkMin}`
      badPick[k] = (badPick[k] ?? 0) + 1
      break
    }
    ex.push(j.place.id)
  }
}
console.log('A 07:00 新宿真候選，連按換一家：第一次派到「不該派的類型或走 >15 分」', JSON.stringify(firstBad), JSON.stringify(badPick))

// B
const P = (id: string, m: number, rating: number, type: string) => ({ id, displayName: { text: id }, location: { latitude: O.lat + m / 111000, longitude: O.lng }, currentOpeningHours: { openNow: true }, rating, userRatingCount: 600, primaryType: type, types: [type] })
RAW = [P('駅弁屋 祭', 80, 3.8, 'meal_takeaway'), P('すし屋のはなれ、', 150, 4.0, 'meal_takeaway'), P('新宿サザンテラス', 160, 4.1, 'shopping_mall'), P('伊勢丹 新宿店', 900, 4.2, 'department_store'), P('Rossi', 2000, 4.6, 'italian_restaurant')]
const tB: Record<string, number> = {}
for (let seed = 1; seed <= 40; seed++) {
  const j = await req(seed, [], '2026-11-05T07:30:00+09:00')
  tB[`${j.place?.name}｜${j.place?.walkMin}分`] = (tB[`${j.place?.name}｜${j.place?.walkMin}分`] ?? 0) + 1
}
console.log('B 15 分內只剩外帶店／購物中心／百貨（無酒吧）：', JSON.stringify(tB))
