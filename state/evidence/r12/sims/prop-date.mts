// checker R12：約會（STOP 1、2）隨機性質測試，走真的 handler（api/order.ts），判準自己寫、不靠 scene.ts。
// 判準：15 分內、類型可派（不是酒吧類／速食／甜點／外帶／購物中心／百貨）、沒被記憶擋掉的店 = U。
//  U 非空 → 派的店必須 ∈ U；U 裡有 ≥4.3 → 派的 ≥4.3；否則派的 ≥ max(U) − 0.2。
//  U 空 → 整批放回（記錄派到什麼類型）。
const api = (await import('/home/user/general-decision/api/order.ts')).default
process.env.ANTHROPIC_API_KEY = 'x'; process.env.GOOGLE_PLACES_KEY = 'y'
const O = { lat: 35.6896, lng: 139.7006 }
let s = Number(process.argv[2] ?? 12345)
const rnd = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648)
const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)]
const GOOD = ['italian_restaurant', 'japanese_restaurant', 'sushi_restaurant', 'french_restaurant', 'restaurant', 'ramen_restaurant', 'steak_house']
const BADT = ['japanese_izakaya_restaurant', 'bar', 'wine_bar', 'meal_takeaway', 'shopping_mall', 'department_store', 'fast_food_restaurant', 'bakery', 'cake_shop']
const AVOID = new Set(['fast_food_restaurant', 'convenience_store', 'food_court', 'sandwich_shop', 'bakery', 'cake_shop', 'dessert_shop', 'dessert_restaurant', 'pastry_shop', 'confectionery', 'ice_cream_shop', 'donut_shop', 'chocolate_shop', 'candy_store', 'bar', 'pub', 'wine_bar', 'cocktail_bar', 'lounge_bar', 'sports_bar', 'night_club', 'bar_and_grill', 'beer_hall', 'japanese_izakaya_restaurant', 'hookah_bar', 'shopping_mall', 'department_store', 'meal_takeaway'])
const ORDER = JSON.stringify({ verdict: 'do', meme: { top: 'a', big: 'b', bot: 'c' }, steps: ['步行。', '點招牌。', '慢慢吃 90 分鐘。'], place: { id: 'x', name: 'x' }, log: 'x' })
let RAW: any[] = []
globalThis.fetch = (async (url: any) => {
  const u = String(typeof url === 'object' && 'url' in url ? url.url : url)
  if (u.includes('anthropic')) return new Response(JSON.stringify({ content: [{ type: 'text', text: ORDER }] }), { status: 200 })
  return new Response(JSON.stringify({ places: RAW }), { status: 200 })
}) as any
const N = Number(process.argv[3] ?? 400)
const stat = { cases: 0, U_nonempty: 0, bad: 0, putback: 0, putbackTypes: {} as Record<string, number>, rescue: 0 }
const bads: string[] = []
const names = ['あ', 'い', 'う', 'え', 'お', 'か', 'き', 'く', 'け', 'こ', 'さ', 'し', 'す', 'せ', 'そ']
for (let k = 0; k < N; k++) {
  const n = 3 + Math.floor(rnd() * 10)
  RAW = Array.from({ length: n }, (_, i) => {
    const type = rnd() < 0.65 ? pick(GOOD) : pick(BADT)
    const m = Math.floor(rnd() * 2000) + 30
    const rating = Math.round((3.0 + rnd() * 1.9) * 10) / 10
    return { id: 'P' + i, displayName: { text: `${names[i]}亭${i}号` }, location: { latitude: O.lat + m / 111000, longitude: O.lng }, currentOpeningHours: { openNow: true }, rating, userRatingCount: 300 + Math.floor(rnd() * 900), primaryType: type, types: [type, 'restaurant'] }
  })
  const blocked = new Set(RAW.filter(() => rnd() < 0.35).map((r) => r.id))
  const mem = [...blocked].map((id) => ({ id, sh: [], dn: [], x: rnd() < 0.5 ? 'forever' : Date.now() + 14 * 864e5 }))
  const seed = 1 + Math.floor(rnd() * 1e6)
  const res = await api.fetch(new Request('http://localhost/api/order', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
    module: 'eat', level: 1, choices: { diet: '都可以', scene: '約會吃好一點' }, loc: { ...O, label: '新宿' }, now: '2026-11-05T19:30:00+09:00', recentOrders: [], mem, seed, debug: true,
  }) }))
  const j: any = await res.json()
  stat.cases++
  if (j.debug?.rescue) stat.rescue++
  const cands: any[] = j.debug?.places?.candidates ?? []
  const byName = new Map(RAW.map((r) => [r.displayName.text, r]))
  const info = cands.map((c) => ({ ...c, id: byName.get(c.name)?.id }))
  const U = info.filter((c) => (c.walkMin ?? 99) <= 15 && !AVOID.has(c.type) && !blocked.has(c.id))
  const got = info.find((c) => c.name === j.place?.name)
  if (!got) { bads.push(`case ${k}: 沒派店 ${res.status} ${JSON.stringify(j.error)}`); stat.bad++; continue }
  if (U.length) {
    stat.U_nonempty++
    const top = Math.max(...U.map((c) => c.rating ?? 0))
    const need = top >= 4.3 ? 4.3 : top - 0.2
    const inU = U.some((c) => c.id === got.id)
    if (!inU || (got.rating ?? 0) < need - 1e-9) {
      stat.bad++
      bads.push(`case ${k}: 派 ${got.name} ${got.type} ${got.rating}★ 走${got.walkMin}（inU=${inU}，要 ≥${need.toFixed(1)}）U=${U.map((c) => `${c.rating}/${c.walkMin}/${c.type}`).join(',')} blocked=${[...blocked].join(',')}`)
    }
  } else {
    stat.putback++
    const key = `${AVOID.has(got.type) ? got.type : 'ok-type'}${(got.walkMin ?? 0) > 15 ? '+走>15' : ''}`
    stat.putbackTypes[key] = (stat.putbackTypes[key] ?? 0) + 1
  }
}
console.log(JSON.stringify(stat))
console.log(bads.slice(0, 15).join('\n'))
