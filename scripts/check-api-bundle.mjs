/**
 * 打包測試：在本機重建 Vercel lambda 的 /var/task 版面，確認 api/ 的 function 真的載得起來。
 *
 * 為什麼需要這支：npm run smoke 是透過 vite 的 ssrLoadModule 跑 api/，vite 解析得了
 * '../src/cards.ts' 這種帶副檔名的 specifier，所以本機永遠綠燈。Vercel 不是——它把
 * api/order.ts 轉成 api/order.js、specifier 原樣保留，但 dependency tracing 解析不了
 * .ts specifier，於是 src/ 整個沒被放進 lambda，上線後每一次呼叫都是
 * ERR_MODULE_NOT_FOUND，函式在載入階段就死了，連 405 都回不出來。
 *
 * 這支腳本只信 vercel.json 承諾會打包的東西：照 functions[].includeFiles 複製檔案，
 * 其餘一律不給。少一個檔就紅燈。
 *
 * 載入成功還不夠。Vercel 的 Node runtime 只要看到函式型的 export default 就走舊式
 * (req, res) => void：回傳的 Response 被直接丟棄、請求永遠掛住（狀態碼 0，不是 500，
 * 所以連 error log 都不會有），而且此時具名 export 完全不被理會——這點在正式站實測
 * 過，不是推測。所以這支斷言 default 必須是 { fetch }、不能是函式，並把具名 GET/POST
 * 與 default.fetch 兩條入口都走一次。
 *
 *   node scripts/check-api-bundle.mjs
 */
import { execFileSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'

const ROOT = resolve(import.meta.dirname, '..')
const task = mkdtempSync(join(tmpdir(), 'vartask-'))
let failed = 0

const fail = (msg) => { console.error(`  FAIL ${msg}`); failed++ }
const pass = (msg) => console.log(`  ok   ${msg}`)

try {
  // ── 1. 讀 vercel.json，取出承諾要打包的檔案 ────────────────────────
  const vercel = JSON.parse(readFileSync(join(ROOT, 'vercel.json'), 'utf8'))
  const globs = Object.values(vercel.functions ?? {})
    .flatMap((cfg) => (Array.isArray(cfg.includeFiles) ? cfg.includeFiles : [cfg.includeFiles]))
    .filter(Boolean)
  if (globs.length === 0) fail('vercel.json 沒有任何 includeFiles，src/ 不會進 lambda')

  // ── 2. 照 Vercel 的方式把 api/*.ts 轉成 .js，module specifier 不動 ──
  mkdirSync(join(task, 'api'), { recursive: true })
  const fns = readdirSync(join(ROOT, 'api')).filter((f) => f.endsWith('.ts'))
  for (const f of fns) {
    const out = ts.transpileModule(readFileSync(join(ROOT, 'api', f), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2023 },
    }).outputText
    writeFileSync(join(task, 'api', f.replace(/\.ts$/, '.js')), out)
  }

  // ── 3. 只放 includeFiles 承諾的東西，其餘不給 ───────────────────────
  writeFileSync(join(task, 'package.json'), JSON.stringify({ type: 'module' }))
  symlinkSync(join(ROOT, 'node_modules'), join(task, 'node_modules'))
  for (const glob of globs) {
    // includeFiles 是 glob；用 git ls-files 展開，避免自寫 glob 引擎與 Vercel 不一致
    const files = execFileSync('git', ['ls-files', glob.replace(/\/\*\*$/, '')], { cwd: ROOT, encoding: 'utf8' })
      .split('\n').filter(Boolean)
    if (files.length === 0) fail(`includeFiles "${glob}" 展開後是空的`)
    for (const rel of files) {
      mkdirSync(dirname(join(task, rel)), { recursive: true })
      cpSync(join(ROOT, rel), join(task, rel))
    }
  }

  // ── 4. 載入每支 function，並用 GET 打一次證明 handler 真的跑得動 ────
  console.log(`lambda 版面：${task}`)
  for (const f of fns) {
    const name = f.replace(/\.ts$/, '')
    let mod
    try {
      mod = await import(pathToFileURL(join(task, 'api', `${name}.js`)).href)
    } catch (e) {
      fail(`api/${name} 載不起來：${e.code ?? ''} ${String(e.message).split('\n')[0]}`)
      continue
    }
    // 正式站實測過的病灶：只要 export default 是函式，Vercel 就走舊式 (req, res) => void，
    // 回傳的 Response 被丟棄、請求永遠掛住，而且具名 export 完全不被理會。
    if (typeof mod.default === 'function') {
      fail(`api/${name} 的 export default 是函式，Vercel 會當成舊式 (req, res) 並丟棄回傳值`)
      continue
    }
    if (typeof mod.default?.fetch !== 'function') { fail(`api/${name} 缺 export default { fetch }`); continue }

    const missing = ['GET', 'POST'].filter((m) => typeof mod[m] !== 'function')
    if (missing.length) { fail(`api/${name} 缺具名 export：${missing.join('、')}`); continue }

    // GET 應該回 405（第 4 節：只收 POST）。Vercel 兩種入口都可能被選中，兩種都驗。
    // 例外：api/probe 是 preview 專用的量測工具，沒有 VERCEL_ENV=preview 時必須 404（正式站不能被拿來燒額度）。
    // 例外：api/place-photo 只收 GET（今日行程 PR #32）；沒帶 placeId 的 GET 必須回 400。
    const expected = name === 'probe' ? 404 : name === 'place-photo' ? 400 : 405
    let ok = true
    for (const [label, fn] of [['具名 GET', mod.GET], ['default.fetch', mod.default.fetch]]) {
      const res = await fn(new Request(`https://example.com/api/${name}`, { method: 'GET' }))
      if (!(res instanceof Response)) { fail(`api/${name} 的 ${label} 沒有回 Response`); ok = false; continue }
      if (res.status !== expected) { fail(`api/${name} 的 ${label} 回 ${res.status}，預期 ${expected}`); ok = false }
    }
    if (ok) pass(`api/${name} 載入成功，default 是 { fetch }、具名 GET/POST 齊全，GET → ${expected}`)
  }
} finally {
  rmSync(task, { recursive: true, force: true })
}

if (failed > 0) {
  console.error(`\nBUNDLE FAIL：${failed} 項不通過。上線後 /api/* 不是 500 就是請求掛住。`)
  process.exit(1)
}
console.log('\nBUNDLE PASS：api/ 的 function 在 lambda 版面下載得起來。')
