// 直傳打包（Round 8 起）：正式站的程式碼 = git 某個 commit（BASE）。把 BASE..HEAD 之間有變的打包檔（src/ 等）打成 deploy/bundle-<名>*.json.gz。
// 不用找舊的 bundle：舊 bundle 已經在正式站（create_deployment 用 sha 引用即可）。
// 用法：node state/handoff-tools/pack-diff.mjs <BASE commit> <bundle 前綴，例 8> <輸出目錄>
// 輸出：每個新 bundle 的 file／sha／size／base64（貼進 mcp__Vercel__upload_file），以及 api/ 等直傳檔是否跟 BASE 一樣。
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { gunzipSync, gzipSync } from 'node:zlib'

const [BASE, PREFIX, OUT] = process.argv.slice(2)
if (!BASE || !PREFIX || !OUT) throw new Error('用法：node pack-diff.mjs <BASE> <前綴> <輸出目錄>')
const R = resolve(import.meta.dirname, '../..')
const sha1 = (b) => createHash('sha1').update(b).digest('hex')
const git = (...a) => execFileSync('git', a, { cwd: R, maxBuffer: 1 << 26 })
const show = (rev, f) => git('show', `${rev}:${f}`).toString('utf8')
const PACKED = (f) => f.startsWith('src/') || ['index.html', 'vite.config.ts', 'tsconfig.json', 'tsconfig.app.json', 'tsconfig.node.json', 'scripts/fetch-public.mjs', 'scripts/public-manifest.json', 'package-lock.json'].includes(f)
const RAW = ['api/geocode.ts', 'api/order.ts', 'api/probe.ts', 'api/weekly.ts', 'package.json', 'scripts/unpack.mjs', 'vercel.json']

const diff = git('diff', '--name-status', BASE, 'HEAD').toString('utf8').trim().split('\n').filter(Boolean).map((l) => l.split('\t'))
const deleted = diff.filter(([s, f]) => s === 'D' && PACKED(f)).map(([, f]) => f)
if (deleted.length) throw new Error(`有刪除的打包檔（unpack 不會刪）：${deleted.join(' ')}`)
const changed = diff.filter(([s, f]) => s !== 'D' && PACKED(f)).map(([, f]) => f)
const rawChanged = RAW.filter((f) => sha1(git('show', `${BASE}:${f}`)) !== sha1(git('show', `HEAD:${f}`)))
console.log('打包檔有變：', changed.join(' ') || '（無）')
console.log('直傳檔有變（要另外上傳）：', rawChanged.join(' ') || '（無）')

rmSync(OUT, { recursive: true, force: true }); mkdirSync(join(OUT, 'deploy'), { recursive: true })
const bundle = (list) => gzipSync(Buffer.from(JSON.stringify(Object.fromEntries(list.map((f) => { const t = show('HEAD', f); return [f, { sha1: sha1(t), text: t }] })))), { level: 9 })
const LIMIT = 9_000
const groups = []; let cur = []
for (const f of [...changed].sort((a, b) => show('HEAD', b).length - show('HEAD', a).length)) {
  if (cur.length && bundle([...cur, f]).length > LIMIT) { groups.push(cur); cur = [] }
  cur.push(f)
}
if (cur.length) groups.push(cur)
const res = groups.map((g, i) => {
  const file = `deploy/bundle-${PREFIX}${String.fromCharCode(97 + i)}.json.gz`
  const b = bundle(g)
  writeFileSync(join(OUT, file), b)
  // 自我檢查：解開後跟 HEAD 一字不差
  const back = JSON.parse(gunzipSync(b).toString('utf8'))
  for (const f of g) if (back[f].sha1 !== sha1(show('HEAD', f))) throw new Error(`自我檢查失敗：${f}`)
  return { file, sha: sha1(b), size: b.length, files: g }
})
for (const r of res) {
  writeFileSync(join(OUT, `${r.file.replace('deploy/', '')}.b64`), readB64(join(OUT, r.file)))
  console.log(JSON.stringify(r))
}
function readB64(p) { return execFileSync('base64', ['-w0', p]).toString('utf8') }
