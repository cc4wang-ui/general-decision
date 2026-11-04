// Round 7 量測整理：歇的 6 列 → 查詞是否日文、type／店名是否水煙吧或購物中心、距離。
import { readFileSync } from 'node:fs'
const d = JSON.parse(readFileSync(process.argv[2], 'utf8'))
const BAD_T = new Set(['hookah_bar', 'shopping_mall', 'department_store'])
const SHISHA = /シーシャ|shisha|hookah|水煙/i
let bad = 0, jp = 0
console.log(`loc=${d.loc} hour=${d.localHour}`)
for (const r of d.rows.filter((r) => r.id.startsWith('rest'))) {
  const q = (r.how ?? '').match(/text="([^"]+)"/)?.[1] ?? ''
  const isJp = /[぀-ヿ]/.test(q) && !/咖啡廳/.test(q)
  const isBad = BAD_T.has(r.type) || SHISHA.test(r.picked ?? '')
  if (isJp) jp++
  if (isBad) bad++
  console.log(`${r.scene.padEnd(6)} q=${q.padEnd(10)} ${isJp ? 'JA' : '!!非日文'} | ${(r.picked ?? '-').slice(0, 26).padEnd(26)} ${String(r.type).padEnd(22)} ${isBad ? '!!水煙吧／商場' : 'ok'} dist=${r.distM} r=${r.radiusM} kept/total=${r.dbg?.kept}/${r.dbg?.total}${r.dbg?.relaxed ? ' relaxed' : ''} ${r.pass ? '' : 'FAIL:' + r.why}`)
}
const rest = d.rows.filter((r) => r.id.startsWith('rest'))
console.log(JSON.stringify({ rest: rest.length, japaneseQuery: jp, hookahOrMall: bad, pass: rest.filter((r) => r.pass).length, eatPass: d.rows.filter((r) => r.id.startsWith('eat') && r.pass).length }))
