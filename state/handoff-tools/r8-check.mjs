// Round 8 量測整理：歇（咖啡）6 列有沒有派到卡拉OK、美食街；外帶有沒有派到酒吧類。
// 用法：node state/handoff-tools/r8-check.mjs state/evidence/r8/scene-shinjuku-<day|night>.json
import { readFileSync } from 'node:fs'
const d = JSON.parse(readFileSync(process.argv[2], 'utf8'))
const REST_BAD_T = new Set(['karaoke', 'food_court', 'hookah_bar', 'shopping_mall', 'department_store'])
const REST_BAD_N = /シーシャ|shisha|hookah|水煙|food ?court|フードコート|美食街|美食廣場|居酒屋|izakaya|カラオケ|karaoke|卡拉ok|ktv/i
const BARISH = new Set(['bar', 'pub', 'wine_bar', 'cocktail_bar', 'lounge_bar', 'sports_bar', 'night_club', 'bar_and_grill', 'beer_hall', 'japanese_izakaya_restaurant'])
console.log(`loc=${d.loc} localHour=${d.localHour}`)
let restBad = 0, takeoutBad = 0
for (const r of d.rows) {
  const isRest = r.id.startsWith('rest')
  const isTakeout = r.id === 'eat:外帶'
  if (!isRest && !isTakeout) continue
  const bad = isRest ? (REST_BAD_T.has(r.type) || REST_BAD_N.test(r.picked ?? '')) : BARISH.has(r.type)
  if (bad && isRest) restBad++
  if (bad && isTakeout) takeoutBad++
  const q = (r.how ?? '').match(/text="([^"]+)"/)?.[1] ?? ''
  console.log(`${r.scene.padEnd(6)} q=${q.padEnd(10)} | ${(r.picked ?? '-').slice(0, 30).padEnd(30)} ${String(r.type).padEnd(20)} ${bad ? '!!派錯店' : 'ok'} kept/total=${r.dbg?.kept}/${r.dbg?.total}${r.dbg?.relaxed ? ' relaxed' : ''} ${r.pass ? 'pass' : 'FAIL:' + (r.why ?? '')}`)
}
console.log(JSON.stringify({ restRows: d.rows.filter((r) => r.id.startsWith('rest')).length, restBad, takeoutBad, pass: d.summary?.pass, scenarios: d.summary?.scenarios }))
