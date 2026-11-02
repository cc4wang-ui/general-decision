// Round 6 直傳：從 preview-6 的 bundle 清單（sha 對得上的檔）重建已部署的 src，跟 HEAD 比，差異打成 bundle-6*。
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { gunzipSync, gzipSync } from 'node:zlib'
const R = '/home/user/general-decision'
const S = '/tmp/claude-0/-home-user-general-decision/6683b543-6e62-55b0-83c5-5afc962b4a54/scratchpad'
const out = `${S}/up-r7`
const sha1 = (b) => createHash('sha1').update(b).digest('hex')
// preview-6 的 bundle：名稱 → sha（來自 create_deployment 的檔案清單）
const WANT = {
  '0a': 'bd96f45cf2abd872c1e88d04afb78495dbb049b4', '0b': '1af091f2063616ea2009ee7407223f00f8117f4c', '0c': '1564c51ed2b4f6f8a16af7cd7a66c9b892f0b59c',
  '0d': '269448650b87993688bd8c38c5d3cba3947e1170', '0e': 'e5e9556529b02f1cce56064d7b9b3a51c9657b20', '0f': '38ae6a94647635b0c3248baa5b3347e84dab79e9',
  '0g': '5f32af4d22fb2c290b91a41a0724aed5d616f99b', '0h': '5a8aa2236e26b5c19e5ffea768eb8d08dfff28dc', '0i': 'fe4b588daee9d0a0017415d057328654826c7078',
  '2a': '7e20b575ea46f4f7ac0fea18ec2a5894c0932e68', '2b': '4ec0b395c7e09e30bb00dc1dd339abc71b7084c8', '2c': 'f72d417e312bdc07a8fac5fdedce656133f07a04',
  '3a': 'be937820e44e039a310ef047fb4a9f6f8d202abc', '3b': 'a967a17df120c621d2313b5ebb76aeb28e911ee8', '3c': '0ce39abea471f90bbebe1c281a43c28fcdb1ffe1',
  '3d': '674e4a8a5702d6086f9b3363e41b917e2af708e4', '3e': 'aa7151e36186cd6611e14bad6f0e719a91de5384',
  '4a': '73db25a76c5390ba91656fad29a3f7e7fca2a727', '4b': 'c82c55189ec55b7d81cc528ff897a9304f339b44', '4c': '64043f27ebb046f683f83243365930716d203a81',
  '4d': 'a51cc237f1ebc41532fe6b5892313c3a4252c212', '4e': '81bd26277781e231c5a1015daf886cd7d16b99fb', '5a': '9cbe6e73bed1247f158f88a04e6035c6c504bc0c',
  '6a': '91e7553336ee08ac250bf335a9245e767e573f9c', '6b': '90a360f7a70b922dd6ea0e42c89bc18f62e73c41', '6c': '05b7ea1c2185152eeb1fc3ab36395651abafcfc5', '6d': '01ae6589f5ffca3dfad542023a009505aa4f93a0',
  '6e': '5000ef033437bd9c4c81e866c761729aae354d8f', '6f': '2709379339a5925575c671f26cebded86ec4845c', '6g': '86694e9de9104ef3f045f5ae75a2e858855d7a4d', '6h': '91ee2764e2f927685dbce4f71d25bc4686e22c4e', '6i': 'cbeb7cde3f4f6baf5f958b760957da011cab8d5e', '6j': '7130d53af5813eba2b88d852e5863e565c853fa7',
}
// 在所有 up-* 目錄裡找 sha 對得上的檔
const found = {}
for (const d of readdirSync(S).filter((n) => n.startsWith('up-'))) {
  const dir = join(S, d, 'deploy')
  try { statSync(dir) } catch { continue }
  for (const f of readdirSync(dir)) { const b = readFileSync(join(dir, f)); const h = sha1(b); for (const [k, v] of Object.entries(WANT)) if (v === h) found[k] = b }
}
const missing = Object.keys(WANT).filter((k) => !found[k])
if (missing.length) throw new Error(`找不到 bundle：${missing.join(' ')}`)
const deployed = {}
for (const k of Object.keys(WANT).sort()) Object.assign(deployed, JSON.parse(gunzipSync(found[k]).toString('utf8')))
const files = execFileSync('git', ['ls-tree', '-r', '--name-only', 'HEAD'], { cwd: R, encoding: 'utf8' }).split('\n').filter(Boolean)
const show = (f) => execFileSync('git', ['show', `HEAD:${f}`], { cwd: R, maxBuffer: 1 << 26 }).toString('utf8')
const changed = []
for (const f of Object.keys(deployed)) {
  if (!files.includes(f)) { console.log(`DELETED in HEAD: ${f}`); continue }
  if (sha1(show(f)) !== deployed[f].sha1) changed.push(f)
}
const packedSet = files.filter((f) => f.startsWith('src/') || ['index.html', 'vite.config.ts', 'tsconfig.json', 'tsconfig.app.json', 'tsconfig.node.json', 'scripts/fetch-public.mjs', 'scripts/public-manifest.json', 'package-lock.json'].includes(f))
for (const f of packedSet) if (!(f in deployed)) changed.push(f)
console.log('changed/new:', changed.join(' '))
rmSync(out, { recursive: true, force: true }); mkdirSync(join(out, 'deploy'), { recursive: true })
const bundle = (list) => gzipSync(Buffer.from(JSON.stringify(Object.fromEntries(list.map((f) => { const t = show(f); return [f, { sha1: sha1(t), text: t }] })))), { level: 9 })
const LIMIT = 9_000
const groups = []; let cur = []
for (const f of [...changed].sort((a, b) => show(b).length - show(a).length)) {
  if (cur.length && bundle([...cur, f]).length > LIMIT) { groups.push(cur); cur = [] }
  cur.push(f)
}
if (cur.length) groups.push(cur)
const res = []
groups.forEach((g, i) => { const name = `deploy/bundle-7${String.fromCharCode(97 + i)}.json.gz`; const b = bundle(g); writeFileSync(join(out, name), b); res.push({ file: name, sha: sha1(b), size: b.length, files: g }) })
for (const f of files.filter((x) => /^api\/[^/]+\.ts$/.test(x))) {
  const b = execFileSync('git', ['show', `HEAD:${f}`], { cwd: R })
  res.push({ file: f, sha: sha1(b), size: b.length, raw: true })
  mkdirSync(join(out, f, '..'), { recursive: true }); writeFileSync(join(out, f), b)
}
// 驗證：已部署 + 新 bundle 解開後 == HEAD 的 src
const after = { ...deployed }
for (const r of res.filter((x) => !x.raw)) Object.assign(after, JSON.parse(gunzipSync(readFileSync(join(out, r.file))).toString('utf8')))
let bad = 0
for (const f of packedSet) if (!after[f] || sha1(show(f)) !== after[f].sha1) { bad++; console.log('MISMATCH', f) }
console.log('bad=' + bad)
console.log(JSON.stringify(res.map(({ files: _f, ...r }) => r), null, 0))
