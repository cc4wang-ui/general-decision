// Round 11 量測整理：r10-check 的全部檢查，再加「約會步行上限 15 分」與「約會派的是 15 分內最高分」。
// 約會的最高分用 probe 附的全部候選（cands）自己重算，不靠 src/scene.ts。
// 用法：node state/handoff-tools/r11-check.mjs <scene json>
import { readFileSync } from 'node:fs'
const d = JSON.parse(readFileSync(process.argv[2], 'utf8'))
const REST_BAD_T = new Set(['karaoke', 'food_court', 'hookah_bar', 'shopping_mall', 'department_store'])
const REST_BAD_N = /シーシャ|shisha|hookah|水煙|food ?court|フードコート|美食街|美食廣場|居酒屋|izakaya|カラオケ|karaoke|卡拉ok|ktv/i
const BARISH = new Set(['bar', 'pub', 'wine_bar', 'cocktail_bar', 'lounge_bar', 'sports_bar', 'night_club', 'bar_and_grill', 'beer_hall', 'japanese_izakaya_restaurant'])
const FASTISH = new Set(['fast_food_restaurant', 'convenience_store', 'food_court', 'sandwich_shop', 'bakery'])
const DESSERTISH = new Set(['cake_shop', 'dessert_shop', 'dessert_restaurant', 'pastry_shop', 'confectionery', 'ice_cream_shop', 'donut_shop', 'chocolate_shop', 'candy_store'])
const MAX_WALK = 15, MIN_OPEN = 90, MIN_RATING = 4.3
const out = { loc: d.loc, localHour: d.localHour, scenarios: d.summary?.scenarios, pass: d.summary?.pass, failed: d.summary?.failed, restWrong: 0, takeoutBar: 0, dateBar: 0, restNotOpen: 0, closedOnArrival: 0, dateWalkOver: 0, dateNotBest: 0, date: null }
for (const r of d.rows) {
  const flags = []
  if (r.id.startsWith('rest') && (REST_BAD_T.has(r.type) || REST_BAD_N.test(r.picked ?? ''))) { out.restWrong++; flags.push('歇派錯店') }
  if (r.id === 'eat:外帶' && BARISH.has(r.type)) { out.takeoutBar++; flags.push('外帶派酒吧') }
  if (r.id === 'eat:約會吃好一點' && BARISH.has(r.type)) { out.dateBar++; flags.push('約會派酒吧') }
  if ((r.id.startsWith('rest') || r.id === 'eat:一個人快吃' || r.id === 'eat:外帶') && r.opensAt && r.type !== 'convenience_store') { out.restNotOpen++; flags.push(`派到還沒開（${r.opensAt}）`) }
  if (typeof r.closeIn === 'number' && r.closeIn - (r.walkMin ?? 0) < 10) { out.closedOnArrival++; flags.push(`到店剩 ${r.closeIn - (r.walkMin ?? 0)} 分`) }
  if (r.id === 'eat:約會吃好一點') {
    // 走得到、類型對、到店後還能待 90 分、到店時沒關（剩 ≥ 10 分）的候選
    const ok = (c) => !BARISH.has(c.type) && !FASTISH.has(c.type) && !DESSERTISH.has(c.type) && (c.closeIn === undefined || c.closeIn - (c.walkMin ?? 0) >= MIN_OPEN)
    const near = (r.cands ?? []).filter((c) => ok(c) && (c.walkMin ?? 99) <= MAX_WALK)
    const best = near.length ? Math.max(...near.map((c) => c.rating ?? 0)) : null
    const strict = near.some((c) => (c.rating ?? 0) >= MIN_RATING)
    if (near.length && (r.walkMin ?? 99) > MAX_WALK) { out.dateWalkOver++; flags.push(`約會走 ${r.walkMin} 分 > ${MAX_WALK}`) }
    if (best !== null && !strict && (r.rating ?? 0) < best - 0.2) { out.dateNotBest++; flags.push(`約會 ${r.rating}★ < 15 分內最高 ${best}★ − 0.2`) }
    if (best !== null && strict && (r.rating ?? 0) < MIN_RATING) { out.dateNotBest++; flags.push(`15 分內有 ≥ ${MIN_RATING}★ 卻派 ${r.rating}★`) }
    out.date = { picked: r.picked, rating: r.rating, walkMin: r.walkMin, near: near.length, bestNear: best, hasStrict: strict, ratingRelaxed: !!r.ratingRelaxed, cands: (r.cands ?? []).length }
  }
  console.log(`${r.id.padEnd(14)} ${(r.picked ?? '-').slice(0, 28).padEnd(28)} ${String(r.type).padEnd(20)} ${r.rating ?? '?'}★ 走${r.walkMin ?? '?'}分 剩${r.closeIn ?? '-'}分 ${r.opensAt ? r.opensAt + '開 ' : ''}${r.pass ? 'pass' : 'FAIL:' + (r.why ?? '')}${r.ratingRelaxed ? '（放寬評分）' : ''} ${flags.join(' ')}`)
}
console.log(JSON.stringify(out))
