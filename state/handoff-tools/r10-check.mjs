// Round 10 量測整理：在 r8-check 之上，多查「約會派酒吧」「歇派到還沒開的店」「到店時已關（剩 < 10 分）」。
// 用法：node state/handoff-tools/r10-check.mjs <scene json>
import { readFileSync } from 'node:fs'
const d = JSON.parse(readFileSync(process.argv[2], 'utf8'))
const REST_BAD_T = new Set(['karaoke', 'food_court', 'hookah_bar', 'shopping_mall', 'department_store'])
const REST_BAD_N = /シーシャ|shisha|hookah|水煙|food ?court|フードコート|美食街|美食廣場|居酒屋|izakaya|カラオケ|karaoke|卡拉ok|ktv/i
const BARISH = new Set(['bar', 'pub', 'wine_bar', 'cocktail_bar', 'lounge_bar', 'sports_bar', 'night_club', 'bar_and_grill', 'beer_hall', 'japanese_izakaya_restaurant'])
const out = { loc: d.loc, localHour: d.localHour, scenarios: d.summary?.scenarios, pass: d.summary?.pass, failed: d.summary?.failed, restWrong: 0, takeoutBar: 0, dateBar: 0, restNotOpen: 0, closedOnArrival: 0 }
for (const r of d.rows) {
  const flags = []
  if (r.id.startsWith('rest') && (REST_BAD_T.has(r.type) || REST_BAD_N.test(r.picked ?? ''))) { out.restWrong++; flags.push('歇派錯店') }
  if (r.id === 'eat:外帶' && BARISH.has(r.type)) { out.takeoutBar++; flags.push('外帶派酒吧') }
  if (r.id === 'eat:約會吃好一點' && BARISH.has(r.type)) { out.dateBar++; flags.push('約會派酒吧') }
  if (r.id.startsWith('rest') && r.opensAt && r.type !== 'convenience_store') { out.restNotOpen++; flags.push(`歇派到還沒開（${r.opensAt}）`) }
  if (typeof r.closeIn === 'number' && r.closeIn - (r.walkMin ?? 0) < 10) { out.closedOnArrival++; flags.push(`到店剩 ${r.closeIn - (r.walkMin ?? 0)} 分`) }
  console.log(`${r.id.padEnd(14)} ${(r.picked ?? '-').slice(0, 28).padEnd(28)} ${String(r.type).padEnd(20)} 走${r.walkMin ?? '?'}分 剩${r.closeIn ?? '-'}分 ${r.opensAt ? r.opensAt + '開 ' : ''}${r.pass ? 'pass' : 'FAIL:' + (r.why ?? '')} ${flags.join(' ')}`)
}
console.log(JSON.stringify(out))
