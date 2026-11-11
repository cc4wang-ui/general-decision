// 產生 Claude Design 畫布用的 .dc.html 工作檔（七個畫面 + 圖示 + 啟動畫面 + token 表）。
// 用法：node design/build.mjs   → 輸出到 design/*.dc.html 與 design/canvas.json
// token 取自 src/styles.css；頭像取自 src/avatar.tsx（先用 esbuild 打成 _avatar.bundle.mjs）。
import { writeFileSync } from 'node:fs'
import { avatarSvg } from './_avatar.bundle.mjs'

const OUT = new URL('./', import.meta.url).pathname

// ── token（src/styles.css :root，逐字） ───────────────────────────────
const LIGHT = { khaki: '#E3DFD0', ink: '#1B1D1A', olive: '#4A5733', olive2: '#39452A', signal: '#B3261E', mute: '#6F715F', line: '#C9C4B2', card: '#F2EFE4', white: '#FFFFFF', memeText: '#FFFFFF', gold: '#D4AF37', paper: '#F7F4EA' }
const DARK = { khaki: '#171813', ink: '#ECEAE0', olive: '#5E6E42', olive2: '#3F4B2E', signal: '#B8332B', mute: '#9A9C8C', line: '#2E3027', card: '#22241D', white: '#F3F1E8', memeText: '#F3F1E8', gold: '#D4AF37', paper: '#26281F' }

// 三段火力：同一個 app，換人就換氣壓。
const LEVELS = [
  { key: 'lv0', label: '下士 菜鳥班長 阿良', rank: '下士 菜鳥班長', name: '阿良', hello: '報、報告什麼事？班長…我是說，你各位啊。', sub: '',
    cmd: { light: '#5F6E43', dark: '#6B7A4E' }, r: '14px', bw: '1px', w: '800', ls: '0', stripe: 'rgba(255,255,255,.06)',
    punish: { action: '罰站', label: '十秒', count: 10, done: 3, line: '剛才哪一步沒走？想清楚。' },
    eat: { top: '去吃熱的', bot: '這、這週兩天超商了…', bark: '有、有沒有忌口？' },
    buy: { top: '本週第二次猶豫', bot: '72 小時後再來報告', bark: '多、多少錢？' },
    attend: { bark: '什麼場合？對方…多熟？' },
    weekly: { body: '本週 11 道口令，9 道完成，1 道換口令，2 次罰則。你的服從率八成，比上週好。\n\n兩次都是 23:30 熄燈跟下午那杯咖啡。晚上跟下午，你的意志力最弱，班長知道了。\n\n下週熄燈前 20 分鐘，班長會先出現。', verdict: '本週講評：尚可。' } },
  { key: 'lv1', label: '中士 值星班長 黑面', rank: '中士 值星班長', name: '黑面', hello: '你各位啊！報告什麼事？', sub: '合理的要求是訓練，不合理的要求是磨練。',
    cmd: { light: '#4A5733', dark: '#5E6E42' }, r: '10px', bw: '1.5px', w: '900', ls: '-0.01em', stripe: 'rgba(0,0,0,.08)',
    punish: { action: '伏地挺身', label: '二十下', count: 20, done: 6, line: '軍中沒有下次注意，只有這一次。' },
    eat: { top: '給我去吃', bot: '超商吃兩天，你是在當兵還是在超商上班？', bark: '點名！有沒有忌口？沒有就閉嘴聽令。' },
    buy: { top: '同一類東西第二次', bot: '不買。72 小時。', bark: '多少錢？講數字，不要形容詞。' },
    attend: { bark: '什麼場合？多熟？不要跟我說「還好」，軍中沒有還好。' },
    weekly: { body: '十一道口令，九道完成。兩次罰則，一次是熄燈後開手機，一次是叫你去喝咖啡你賴在椅子上。\n\n發現規律了沒？你只有在「不用出門」的事情上會偷懶。餐廳你去了，飯局你去了，象山你也爬了。\n\n結論：你不是懶，你是屁股重。下週歇的口令改成「站起來再說」。', verdict: '本週講評：合格。屁股記過一次。' } },
  { key: 'lv2', label: '三等士官長 連士官長 老郭', rank: '三等士官長 連士官長', name: '老郭', hello: '你各位給我站好。要報告什麼，三秒內講完。', sub: '我看過的菜鳥比你吃過的饅頭多。',
    cmd: { light: '#2B331F', dark: '#33402A' }, r: '4px', bw: '2px', w: '900', ls: '-0.02em', stripe: 'rgba(212,175,55,.10)',
    punish: { action: '交互蹲跳', label: '三十下', count: 30, done: 9, line: '你各位看清楚，這就是猶豫的下場。' },
    eat: { top: '跑步去吃', bot: '吃到店員都認識你。這不叫拖延，這叫菜。', bark: '忌口？你以為這裡是餐廳？講，快！' },
    buy: { top: '你的錢包比你還想退伍', bot: '關掉。72 小時。', bark: '多少錢！「還可以」不是數字！' },
    attend: { bark: '場合！星數！你猶豫的樣子我看過一百次。' },
    weekly: { body: '十一道口令，兩次違紀，都是坐著的時候。你站著的時候是個兵，坐下就變菜。\n\n飯局你去了還準時走，這種事上週你要想三天。象山那張六巨石照片班長看了，還可以。\n\n下週目標：零違紀。做不到，週報我貼在你手機桌布。', verdict: '本週講評：合格，但不要得意。' } },
]

// ── 共用片段 ─────────────────────────────────────────────────────────
const FONTS = '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;600;800&amp;family=Noto+Serif+TC:wght@900&amp;family=Oswald:wght@600;700&amp;display=swap">'

const BASE_CSS = `
  body { margin: 0; font-family: "Noto Sans TC", -apple-system, "PingFang TC", "Hiragino Sans", system-ui, sans-serif; -webkit-font-smoothing: antialiased; }
  a { color: #B3261E; } a:hover { color: #8E1E17; }
  .serif { font-family: "Noto Serif TC", "PingFang TC", "Hiragino Mincho ProN", serif; }
  .num { font-family: "Oswald", "Helvetica Neue", Arial, sans-serif; font-variant-numeric: tabular-nums; }
  .phone { position: relative; overflow: hidden; display: flex; flex-direction: column; background: var(--khaki); color: var(--ink);
           font-size: 16px; line-height: 1.5; padding: 54px 18px 22px; box-sizing: border-box; }
  .phone::before { content: ""; position: absolute; inset: 0; pointer-events: none;
           background: repeating-linear-gradient(135deg, var(--stripe) 0 2px, transparent 2px 14px); opacity: .5; mix-blend-mode: multiply; }
  .phone > * { position: relative; }
  .stamp { display: inline-flex; align-items: center; justify-content: center; border: 2.5px solid var(--signal); color: var(--signal);
           border-radius: 6px; padding: 4px 8px; font-weight: 900; letter-spacing: .18em; font-size: 12px; transform: rotate(-8deg);
           mix-blend-mode: multiply; opacity: .92; white-space: nowrap; }
  .stamp.light { border-color: var(--khaki); color: var(--khaki); mix-blend-mode: normal; opacity: .9; }
  .cap { font-weight: var(--w); line-height: 1.15; overflow-wrap: anywhere; color: var(--memeText);
         text-shadow: 0 0 2px #000, 2px 2px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000; }
  @media (prefers-reduced-motion: no-preference) {
    .reveal { animation: in .2s ease-out both; }
    @keyframes in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
  }
`

const ICON = {
  eat: '<path d="M4 10h16a8 8 0 0 1-16 0Z"/><path d="M8 4l1 5M12 3v6M16 4l-1 5"/>',
  go: '<path d="M12 21s-6-6.2-6-11a6 6 0 0 1 12 0c0 4.8-6 11-6 11Z"/><circle cx="12" cy="10" r="2"/>',
  attend: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18M9 15l2 2 4-4"/>',
  rest: '<path d="M5 9h11v6a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4V9Z"/><path d="M16 11h2a2 2 0 0 1 0 4h-2M7 5c0-1 1-1 1-2M11 5c0-1 1-1 1-2"/>',
  sleep: '<path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5Z"/>',
  reply: '<path d="M4 5h16v11H9l-5 4V5Z"/>',
  buy: '<path d="M3 7h18l-1.5 12H4.5L3 7Z"/><path d="M8 7a4 4 0 0 1 8 0"/>',
  diary: '<path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3V4Z"/><path d="M5 17a3 3 0 0 1 3-3h11M9 8h6"/>',
  share: '<path d="M12 15V4M8 8l4-4 4 4"/><path d="M5 12v7h14v-7"/>',
  back: '<path d="M14 6l-6 6 6 6"/>',
  check: '<path d="M5 12l5 5L20 7"/>',
}
const icon = (k, size = 20, stroke = 'currentColor') =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${stroke}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[k]}</svg>`

// 頭像：命令卡上用「胸像特寫」裁切，存在感 +30%。
const face = (lv, mood, close = false) => {
  let s = avatarSvg(lv, mood, true)
  if (close) s = s.replace('viewBox="0 0 120 120"', 'viewBox="14 16 92 104"')
  return s
}
const plateFace = (lv, mood) => avatarSvg(lv, mood, false)

/** 三段火力分支：每段字面文案，viewer 可以直接改字。 */
const branches = (fn) => LEVELS.map((L, i) =>
  `<sc-if value="{{${L.key}}}" hint-placeholder-val="{{${i === 1}}}">${fn(L, i)}</sc-if>`).join('\n')

const ROOT_STYLE = 'width: 390px; height: 844px; --khaki: {{c.khaki}}; --ink: {{c.ink}}; --olive: {{c.olive}}; --olive2: {{c.olive2}}; --signal: {{c.signal}}; --mute: {{c.mute}}; --line: {{c.line}}; --card: {{c.card}}; --white: {{c.white}}; --memeText: {{c.memeText}}; --gold: {{c.gold}}; --paper: {{c.paper}}; --cmd: {{c.cmd}}; --r: {{c.r}}; --bw: {{c.bw}}; --w: {{c.w}}; --ls: {{c.ls}}; --stripe: {{c.stripe}};'

const PROPS = `{"dark":{"editor":"boolean","default":false,"section":"主題"},"level":{"editor":"enum","default":"值星班長 黑面","options":["菜鳥班長 阿良","值星班長 黑面","士官長 老郭"],"section":"火力"},"$preview":{"width":390,"height":844}}`

const LOGIC = `
class Component extends DCLogic {
  renderVals() {
    const dark = this.props.dark ?? false
    const idx = Math.max(0, ["菜鳥班長 阿良","值星班長 黑面","士官長 老郭"].indexOf(this.props.level ?? "值星班長 黑面"))
    const base = dark
      ? ${JSON.stringify(DARK)}
      : ${JSON.stringify(LIGHT)}
    const L = ${JSON.stringify(LEVELS.map((l) => ({ cmd: l.cmd, r: l.r, bw: l.bw, w: l.w, ls: l.ls, stripe: l.stripe })))}[idx]
    return {
      c: { ...base, cmd: dark ? L.cmd.dark : L.cmd.light, r: L.r, bw: L.bw, w: L.w, ls: L.ls, stripe: L.stripe },
      lv0: idx === 0, lv1: idx === 1, lv2: idx === 2,
    }
  }
}`

const page = (helmetCss, body) => `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
  ${FONTS}
  <style>${BASE_CSS}${helmetCss}</style>
</helmet>
<div class="phone" style="${ROOT_STYLE}">
${body}
</div>
</x-dc>
<script data-dc-script data-props='${PROPS}'>${LOGIC}
</script>
</body>
</html>
`

// ── 元件：班長名牌 ──────────────────────────────────────────────────
// 火力表：三格，亮到第 level+1 格。這是「換了一個人」的第一個訊號。
const firebars = (lit) => `<div style="display: flex; gap: 3px; align-items: flex-end; height: 14px;">${[0, 1, 2].map((i) =>
  `<span style="display: block; width: 6px; height: ${8 + i * 3}px; border-radius: 1px; background: ${i <= lit ? 'var(--signal)' : 'var(--line)'};"></span>`).join('')}</div>`

const plate = (mood, meta, tap) => `
<div style="display: flex; align-items: flex-end; gap: 14px;">
  <div style="width: 96px; height: 96px; flex: none; border-radius: var(--r); overflow: hidden; border: var(--bw) solid var(--ink); background: var(--card); box-shadow: 4px 4px 0 var(--ink);">
    ${branches((L, i) => `<div style="width: 100%; height: 100%;">${plateFace(i, mood)}</div>`)}
  </div>
  <div style="flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 5px; padding-bottom: 2px;">
    <div style="display: flex; align-items: center; gap: 8px;">
      ${branches((L) => `<span style="display: inline-block; font-size: 11px; letter-spacing: .16em; color: var(--khaki); background: var(--ink); padding: 3px 8px; border-radius: 3px; font-weight: 600;">${L.rank}</span>`)}
      ${branches((L, i) => firebars(i))}
    </div>
    ${branches((L) => `<div class="serif" style="font-size: 26px; font-weight: 900; line-height: 1.05; letter-spacing: var(--ls);">${L.name}</div>`)}
    ${meta ? `<div style="font-size: 12px; color: var(--mute);">${meta}</div>` : ''}
    ${tap ? `<div style="font-size: 11px; color: var(--mute);">點頭像換班長</div>` : ''}
  </div>
</div>`

const bubble = (fn) => `
<div style="position: relative; background: var(--card); border: var(--bw) solid var(--ink); border-radius: var(--r); padding: 14px 16px; font-size: 17px; line-height: 1.5; font-weight: 600; box-shadow: 3px 3px 0 var(--ink);">
  <span style="position: absolute; left: 30px; top: -9px; width: 14px; height: 14px; background: var(--card); border-left: var(--bw) solid var(--ink); border-top: var(--bw) solid var(--ink); transform: rotate(45deg);"></span>
  ${branches(fn)}
</div>`

const primaryBtn = (label, extra = '') => `<button style="flex: 1; min-width: 0; font: inherit; font-size: 17px; font-weight: 800; height: 56px; padding: 0 18px; cursor: pointer; background: var(--ink); color: var(--khaki); border: 0; border-radius: var(--r); box-shadow: 4px 4px 0 var(--signal); letter-spacing: .02em; ${extra}">${label}</button>`
const lineBtn = (label) => `<button style="flex: 0 0 auto; font: inherit; font-size: 16px; font-weight: 700; height: 56px; padding: 0 16px; cursor: pointer; background: var(--card); color: var(--ink); border: var(--bw) solid var(--ink); border-radius: var(--r);">${label}</button>`
const ghostBtn = (label) => `<button style="flex: 0 0 auto; font: inherit; font-size: 15px; font-weight: 500; height: 56px; padding: 0 8px; cursor: pointer; background: none; color: var(--mute); border: 0;">${label}</button>`
const backBtn = (label) => `<button style="align-self: flex-start; display: inline-flex; align-items: center; gap: 4px; font: inherit; font-size: 14px; color: var(--mute); background: none; border: 0; padding: 0; cursor: pointer;">${icon('back', 16)}${label}</button>`

// ── 命令卡（4:5，兩欄 1fr 38%，角色永遠不壓字） ─────────────────────
const memeCard = ({ bg, tag, stampText, top, big, bot, mood, bigSize = '40px', close = true, numberBlock = '', hazardTop = false }) => `
<div class="reveal" style="position: relative; aspect-ratio: 4 / 5; border-radius: var(--r); overflow: hidden; background: ${bg}; color: var(--memeText); display: grid; grid-template-columns: 1fr 38%; grid-template-rows: 1fr; gap: 10px; padding: ${hazardTop ? '48px' : '40px'} 16px 16px; box-sizing: border-box; border: var(--bw) solid var(--ink); box-shadow: 5px 5px 0 var(--ink);">
  ${hazardTop ? '<span style="position: absolute; left: 0; right: 0; top: 0; height: 10px; background: repeating-linear-gradient(135deg, var(--ink) 0 12px, var(--gold) 12px 24px);"></span>' : ''}
  <span style="position: absolute; left: 14px; top: ${hazardTop ? '20px' : '12px'}; font-size: 11px; letter-spacing: .14em; opacity: .85; color: var(--memeText);">${tag}</span>
  <span class="stamp light" style="position: absolute; right: 12px; top: ${hazardTop ? '18px' : '10px'};">${stampText}</span>
  <div style="display: flex; flex-direction: column; justify-content: space-between; min-width: 0; gap: 12px;">
    ${branches((L) => `<div class="cap" style="font-size: 19px;">${top(L)}</div>`)}
    ${numberBlock || branches(() => `<div class="cap serif" style="font-size: ${bigSize}; letter-spacing: var(--ls);">${big}</div>`)}
    ${branches((L) => `<div class="cap" style="font-size: 16px; font-weight: 700;">${bot(L)}</div>`)}
  </div>
  <div style="align-self: end; width: 100%; aspect-ratio: 92 / 104; opacity: .98;">
    ${branches((L, i) => `<div style="width: 100%; height: 100%;">${face(i, mood, close)}</div>`)}
  </div>
  <span style="position: absolute; left: 0; right: 0; bottom: 0; height: 6px; background: repeating-linear-gradient(135deg, var(--gold) 0 10px, transparent 10px 20px); opacity: .9;"></span>
</div>`

const stepsCard = (steps) => `
<div style="background: var(--card); border: var(--bw) solid var(--ink); border-radius: var(--r); padding: 12px 14px; display: flex; flex-direction: column; gap: 6px; font-size: 17px; line-height: 1.5;">
  ${steps.map((s) => `<div style="display: flex; gap: 8px;"><span style="color: var(--signal); font-weight: 900;">▸</span><span>${s}</span></div>`).join('')}
</div>`

// ── 01 首頁 ─────────────────────────────────────────────────────────
const TILES = [
  ['eat', '吃', '中午、晚上，吃什麼'], ['go', '去', '下班後、週末，去哪'],
  ['attend', '赴', '那個場合，去不去'], ['rest', '歇', '現在，去哪喝一杯'],
]
const MINOR = [['sleep', '幾點睡'], ['reply', '這訊息現在回嗎'], ['buy', '買不買']]

const HOME = page(`
  .tile { display: flex; flex-direction: column; justify-content: space-between; gap: 6px; min-height: 118px; padding: 14px 14px 12px; text-align: left; cursor: pointer;
          background: var(--card); color: var(--ink); border: var(--bw) solid var(--ink); border-radius: var(--r); box-shadow: 4px 4px 0 var(--ink); font: inherit; }
  .tile:active { transform: translate(2px, 2px); box-shadow: 2px 2px 0 var(--ink); }
`, `
<div style="display: flex; justify-content: flex-end;">
  <button style="display: inline-flex; align-items: center; gap: 6px; font: inherit; font-size: 13px; font-weight: 600; color: var(--ink); background: var(--card); border: var(--bw) solid var(--ink); border-radius: 999px; padding: 7px 12px; cursor: pointer;">${icon('diary', 16)}新兵日記</button>
</div>
<div style="height: 10px;"></div>
${plate('idle', '決斷連 · 大事不受理', true)}
<div style="height: 16px;"></div>
${bubble((L) => `<div>${L.hello}${L.sub ? `<div style="font-weight: 400; font-size: 13px; color: var(--mute); margin-top: 6px;">${L.sub}</div>` : ''}</div>`)}
<div style="height: 18px;"></div>
<div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px;">
  ${TILES.map(([k, t, sub]) => `<button class="tile">
    <div style="display: flex; justify-content: space-between; align-items: flex-start;">
      <span class="serif" style="font-size: 46px; font-weight: 900; line-height: 1; letter-spacing: var(--ls);">${t}</span>
      <span style="color: var(--olive);">${icon(k, 22)}</span>
    </div>
    <span style="font-size: 12px; color: var(--mute);">${sub}</span>
  </button>`).join('')}
</div>
<div style="height: 12px;"></div>
<div style="display: flex; gap: 8px; flex-wrap: wrap;">
  ${MINOR.map(([k, t]) => `<button style="display: inline-flex; align-items: center; gap: 6px; font: inherit; font-size: 14px; font-weight: 600; color: var(--ink); background: none; border: var(--bw) solid var(--ink); border-radius: 999px; padding: 10px 14px; cursor: pointer;">${icon(k, 16)}${t}</button>`).join('')}
</div>
<div style="flex: 1;"></div>
<p style="margin: 0; font-size: 12px; color: var(--mute); line-height: 1.5;">大事不受理。班長只管小事，大事你自己去找連長。</p>
`)

// ── 02 點名（赴） ────────────────────────────────────────────────────
const chip = (t, on) => `<button aria-pressed="${on}" style="font: inherit; font-size: 15px; font-weight: 600; padding: 11px 14px; border-radius: 6px; cursor: pointer; border: var(--bw) solid var(--ink); background: ${on ? 'var(--ink)' : 'var(--card)'}; color: ${on ? 'var(--khaki)' : 'var(--ink)'}; box-shadow: ${on ? 'none' : '2px 2px 0 var(--ink)'};">${t}</button>`
const star = (lit) => `<button aria-label="星" style="font: inherit; font-size: 36px; line-height: 1; background: none; border: 0; padding: 4px; cursor: pointer; color: ${lit ? 'var(--gold)' : 'var(--line)'}; text-shadow: ${lit ? '1px 1px 0 var(--ink)' : 'none'};">★</button>`

const INTAKE = page('', `
${backBtn('回報告')}
<div style="height: 10px;"></div>
${plate('bark')}
<div style="height: 16px;"></div>
${bubble((L) => `<div>${L.attend.bark}</div>`)}
<div style="height: 20px;"></div>
<div style="display: flex; flex-direction: column; gap: 18px;">
  <div style="display: flex; flex-direction: column; gap: 8px;">
    <div style="font-size: 12px; letter-spacing: .12em; color: var(--mute); font-weight: 600;">場合</div>
    <div style="display: flex; gap: 8px; flex-wrap: wrap;">${chip('飯局', true)}${chip('公司聚會', false)}${chip('朋友生日', false)}${chip('婚禮', false)}</div>
  </div>
  <div style="display: flex; flex-direction: column; gap: 8px;">
    <div style="font-size: 12px; letter-spacing: .12em; color: var(--mute); font-weight: 600;">熟識</div>
    <div style="display: flex; gap: 4px;">${star(true)}${star(true)}${star(true)}${star(true)}${star(false)}</div>
  </div>
</div>
<div style="flex: 1;"></div>
<div style="display: flex; gap: 10px; padding-bottom: 8px;">${primaryBtn('是！班長')}</div>
`)

// ── 03 命令卡（吃） ──────────────────────────────────────────────────
const CMD = page('', `
${memeCard({ bg: 'var(--cmd)', tag: '決斷連 · 一個口令一個動作', stampText: '口令', mood: 'bark',
  top: (L) => L.eat.top, big: '阿財魯肉飯', bot: (L) => L.eat.bot, bigSize: '36px' })}
<div style="height: 14px;"></div>
${stepsCard(['步行 6 分鐘，營業到 21:00。', '魯肉飯、滷蛋、燙青菜。', '12 分鐘吃完，手機收起來。'])}
<div style="flex: 1;"></div>
<div style="display: flex; gap: 10px; align-items: center; padding-bottom: 8px;">
  ${primaryBtn('報告班長，完成')}${lineBtn('店關了')}${ghostBtn('沒做')}
</div>
`)

// ── 04 命令卡 stop（買不買，紅卡） ────────────────────────────────────
const CMD_STOP = page('', `
${memeCard({ bg: 'var(--signal)', tag: '決斷連 · 一個口令一個動作', stampText: '止', mood: 'bark',
  top: (L) => L.buy.top, big: '不買。', bot: (L) => L.buy.bot, bigSize: '56px' })}
<div style="height: 14px;"></div>
${stepsCard(['關掉頁面。', '72 小時後還想要，再來報告。'])}
<div style="flex: 1;"></div>
<div style="display: flex; gap: 10px; align-items: center; padding-bottom: 8px;">
  ${primaryBtn('報告班長，完成')}${ghostBtn('沒做')}
</div>
`)

// ── 05 登記 ─────────────────────────────────────────────────────────
const LOG = page('', `
${memeCard({ bg: 'var(--olive2)', tag: '莒光日 · 榮譽榜', stampText: '登記', mood: 'praise',
  top: () => '登記', big: '12:41 魯肉飯<br>12:58 完成', bot: () => '雄壯！威武！', bigSize: '30px', close: false })}
<div style="height: 14px;"></div>
<div style="display: flex; align-items: center; gap: 10px; font-size: 13px; color: var(--mute);">
  <span style="display: inline-flex; width: 22px; height: 22px; border-radius: 50%; background: var(--olive); color: var(--white); align-items: center; justify-content: center;">${icon('check', 14)}</span>
  已寫進新兵日記。不用寫，班長替你寫。
</div>
<div style="flex: 1;"></div>
<div style="display: flex; gap: 10px; align-items: center; padding-bottom: 8px;">
  ${primaryBtn('解散')}${lineBtn(`<span style="display: inline-flex; align-items: center; gap: 6px;">${icon('share', 16)}分享梗圖</span>`)}
</div>
`)

// ── 06 罰則倒數 ──────────────────────────────────────────────────────
const tally = (count, done) => `<div style="display: flex; gap: 3px; flex-wrap: wrap; max-width: 100%;">${Array.from({ length: count }, (_, i) =>
  `<span style="display: block; width: 5px; height: 16px; border-radius: 1px; background: ${i < done ? 'var(--gold)' : 'rgba(255,255,255,.35)'}; ${i % 5 === 4 ? 'margin-right: 4px;' : ''}"></span>`).join('')}</div>`

const STAND = page('', `
${memeCard({ bg: 'var(--signal)', tag: '決斷連 · 違紀登記', stampText: '違紀', mood: 'punish', close: true, hazardTop: true,
  top: (L) => `${L.punish.action}，${L.punish.label}！數給我聽！`,
  bot: (L) => L.punish.line,
  numberBlock: branches((L) => `<div style="display: flex; flex-direction: column; gap: 10px;">
    <div class="num" style="font-size: 132px; line-height: .9; font-weight: 700; color: var(--memeText); text-shadow: 4px 4px 0 var(--ink);">${L.punish.count - L.punish.done}</div>
    ${tally(L.punish.count, L.punish.done)}
  </div>`) })}
<div style="height: 14px;"></div>
<div style="font-size: 13px; color: var(--mute); text-align: center;">數到 0 自動解散。中途離開不算。</div>
<div style="flex: 1;"></div>
`)

// ── 07 週報（成績單） ────────────────────────────────────────────────
const stat = (n, label, accent = false) => `<div style="display: flex; flex-direction: column; gap: 2px; min-width: 0;">
  <span class="num" style="font-size: 40px; line-height: 1; font-weight: 700; color: ${accent ? 'var(--signal)' : 'var(--ink)'};">${n}</span>
  <span style="font-size: 11px; letter-spacing: .12em; color: var(--mute); font-weight: 600;">${label}</span>
</div>`

const WEEKLY = page('', `
${backBtn('回日記')}
<div style="height: 10px;"></div>
<div class="reveal" style="border: var(--bw) solid var(--ink); border-radius: var(--r); overflow: hidden; background: var(--paper); box-shadow: 5px 5px 0 var(--ink); display: flex; flex-direction: column;">
  <div style="background: var(--olive2); color: var(--memeText); padding: 12px 16px; display: flex; justify-content: space-between; align-items: center;">
    <span style="font-size: 11px; letter-spacing: .14em; opacity: .9;">莒光園地 · 第 2 週 · 週日 20:00 發布</span>
    <span class="stamp light" style="transform: rotate(-6deg); font-size: 11px; padding: 3px 7px;">講評</span>
  </div>
  <div style="padding: 18px 16px 0; display: flex; flex-direction: column; gap: 16px;">
    <div class="serif" style="font-size: 26px; font-weight: 900; line-height: 1.1; letter-spacing: var(--ls);">本週講評</div>
    <div style="display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; padding: 12px 0; border-top: 1px solid var(--line); border-bottom: 1px solid var(--line);">
      ${stat('11', '道口令')}${stat('82%', '服從率')}${stat('2', '次罰則', true)}
    </div>
    ${branches((L) => `<div style="font-size: 15px; line-height: 1.7; white-space: pre-line;">${L.weekly.body}</div>`)}
  </div>
  <div style="display: grid; grid-template-columns: minmax(0, 1fr) 120px; gap: 12px; align-items: end; padding: 0 16px;">
    ${branches((L) => `<span class="stamp" style="justify-self: start; margin-bottom: 26px; font-size: 13px; padding: 6px 10px; white-space: normal; text-align: center; line-height: 1.35; max-width: 100%;">${L.weekly.verdict}</span>`)}
    <div style="width: 120px; aspect-ratio: 1;">${branches((L, i) => `<div style="width: 100%; height: 100%;">${face(i, 'idle', false)}</div>`)}</div>
  </div>
</div>
<div style="flex: 1;"></div>
<div style="display: flex; gap: 10px; align-items: center; padding-bottom: 8px;">
  ${lineBtn(`<span style="display: inline-flex; align-items: center; gap: 6px;">${icon('share', 16)}分享週報</span>`)}${primaryBtn('解散')}
</div>
`)

// ── App 圖示（帽徽 + 值星帶，無文字） ─────────────────────────────────
const badge = (size, r) => `<div style="position: relative; width: ${size}px; height: ${size}px; border-radius: ${r}; overflow: hidden; background: #4A5733; flex: none;">
  <div style="position: absolute; inset: 0; background: repeating-linear-gradient(135deg, rgba(0,0,0,.10) 0 ${size * 0.03}px, transparent ${size * 0.03}px ${size * 0.13}px);"></div>
  <svg viewBox="0 0 512 512" width="${size}" height="${size}" style="position: absolute; inset: 0;" aria-hidden="true">
    <path d="M-40 420 L420 -40 L512 52 L52 512 Z" fill="#C0392B"/>
    <path d="M-20 440 L440 -20" stroke="#F1D36A" stroke-width="10"/>
    <circle cx="256" cy="232" r="150" fill="none" stroke="#D4AF37" stroke-width="16"/>
    <path d="M256 112 l40 84 92 12 -67 64 17 92 -82 -44 -82 44 17 -92 -67 -64 92 -12 Z" fill="#D4AF37"/>
    <path d="M256 152 l24 50 55 7 -40 38 10 55 -49 -26 -49 26 10 -55 -40 -38 55 -7 Z" fill="#7A6314"/>
  </svg>
</div>`

const ICON_BOARD = `<!doctype html>
<html><head><meta charset="utf-8"><script src="./support.js"></script></head>
<body><x-dc>
<helmet>${FONTS}<style>${BASE_CSS}</style></helmet>
<div style="width: 560px; height: 420px; box-sizing: border-box; padding: 32px; background: #E3DFD0; color: #1B1D1A; display: flex; flex-direction: column; gap: 24px;">
  <div style="display: flex; justify-content: space-between; align-items: baseline;">
    <span class="serif" style="font-size: 22px; font-weight: 900;">App 圖示</span>
    <span style="font-size: 12px; color: #6F715F;">1024 × 1024 · 帽徽 + 值星帶 · 無文字</span>
  </div>
  <div style="display: flex; align-items: flex-end; gap: 28px;">
    ${badge(256, '22.4%')}
    <div style="display: flex; flex-direction: column; gap: 18px; align-items: flex-start;">
      ${badge(120, '22.4%')}
      <div style="display: flex; gap: 14px; align-items: flex-end;">${badge(60, '22.4%')}${badge(40, '22.4%')}${badge(29, '22.4%')}</div>
    </div>
  </div>
  <div style="font-size: 12px; color: #6F715F; line-height: 1.6;">紅色值星帶只在圖示與黑面的頭像出現，是「值星」這個字的視覺同義詞。29px 時星徽仍可辨。</div>
</div>
</x-dc></body></html>
`

const SPLASH = `<!doctype html>
<html><head><meta charset="utf-8"><script src="./support.js"></script></head>
<body><x-dc>
<helmet>${FONTS}<style>${BASE_CSS}</style></helmet>
<div style="width: 390px; height: 844px; box-sizing: border-box; background: {{c.khaki}}; color: {{c.ink}}; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 22px;">
  ${badge(120, '22.4%')}
  <div class="serif" style="font-size: 22px; font-weight: 900; letter-spacing: .3em; padding-left: .3em;">決斷連</div>
</div>
</x-dc>
<script data-dc-script data-props='{"dark":{"editor":"boolean","default":false,"section":"主題"},"$preview":{"width":390,"height":844}}'>
class Component extends DCLogic {
  renderVals() { return { c: (this.props.dark ?? false) ? ${JSON.stringify(DARK)} : ${JSON.stringify(LIGHT)} } }
}
</script></body></html>
`

// ── Token 表（工程端直接抄進 styles.css） ─────────────────────────────
const sw = (name, l, d) => `<div style="display: grid; grid-template-columns: 120px 1fr 1fr; gap: 10px; align-items: center; font-size: 12px;">
  <code style="font-family: ui-monospace, Menlo, monospace; font-size: 12px;">--${name}</code>
  <div style="display: flex; align-items: center; gap: 8px;"><span style="display: block; width: 28px; height: 28px; border-radius: 6px; background: ${l}; border: 1px solid #C9C4B2;"></span><code style="font-family: ui-monospace, Menlo, monospace;">${l}</code></div>
  <div style="display: flex; align-items: center; gap: 8px;"><span style="display: block; width: 28px; height: 28px; border-radius: 6px; background: ${d}; border: 1px solid #2E3027;"></span><code style="font-family: ui-monospace, Menlo, monospace;">${d}</code></div>
</div>`

const TOKENS = `<!doctype html>
<html><head><meta charset="utf-8"><script src="./support.js"></script></head>
<body><x-dc>
<helmet>${FONTS}<style>${BASE_CSS} h3 { margin: 0; font-size: 12px; letter-spacing: .14em; color: #6F715F; font-weight: 600; }</style></helmet>
<div style="width: 960px; height: 820px; box-sizing: border-box; padding: 32px; background: #F7F4EA; color: #1B1D1A; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 32px;">
  <div style="display: flex; flex-direction: column; gap: 14px;">
    <div style="display: flex; justify-content: space-between; align-items: baseline;"><span class="serif" style="font-size: 22px; font-weight: 900;">色彩 token</span><span style="font-size: 11px; color: #6F715F;">淺色 · 深色 · 對應 src/styles.css</span></div>
    ${sw('khaki', LIGHT.khaki, DARK.khaki)}${sw('ink', LIGHT.ink, DARK.ink)}${sw('olive', LIGHT.olive, DARK.olive)}${sw('olive2', LIGHT.olive2, DARK.olive2)}
    ${sw('signal', LIGHT.signal, DARK.signal)}${sw('mute', LIGHT.mute, DARK.mute)}${sw('line', LIGHT.line, DARK.line)}${sw('card', LIGHT.card, DARK.card)}
    <h3 style="margin-top: 6px;">新增</h3>
    ${sw('gold', LIGHT.gold, DARK.gold)}${sw('paper', LIGHT.paper, DARK.paper)}
    <h3 style="margin-top: 6px;">三段火力（--cmd 命令卡底色 · --r 圓角 · --bw 邊線）</h3>
    ${LEVELS.map((L) => `<div style="display: grid; grid-template-columns: 120px 1fr 1fr 60px 60px; gap: 10px; align-items: center; font-size: 12px;">
      <span style="font-weight: 600;">${L.rank} ${L.name}</span>
      <div style="display: flex; align-items: center; gap: 8px;"><span style="display: block; width: 28px; height: 28px; border-radius: ${L.r}; background: ${L.cmd.light}; border: ${L.bw} solid #1B1D1A;"></span><code style="font-family: ui-monospace, Menlo, monospace;">${L.cmd.light}</code></div>
      <div style="display: flex; align-items: center; gap: 8px;"><span style="display: block; width: 28px; height: 28px; border-radius: ${L.r}; background: ${L.cmd.dark}; border: ${L.bw} solid #ECEAE0;"></span><code style="font-family: ui-monospace, Menlo, monospace;">${L.cmd.dark}</code></div>
      <code style="font-family: ui-monospace, Menlo, monospace;">r ${L.r}</code><code style="font-family: ui-monospace, Menlo, monospace;">bw ${L.bw}</code>
    </div>`).join('')}
  </div>
  <div style="display: flex; flex-direction: column; gap: 18px;">
    <span class="serif" style="font-size: 22px; font-weight: 900;">字級與元件</span>
    <div style="display: flex; flex-direction: column; gap: 10px;">
      <h3>標題 · Noto Serif TC 900（fallback PingFang TC）</h3>
      <div class="serif" style="font-size: 46px; font-weight: 900; line-height: 1;">吃　去　赴　歇</div>
      <div class="serif" style="font-size: 26px; font-weight: 900; line-height: 1.1;">黑面 · 本週講評</div>
      <h3>梗圖大字 · 40px（5 字店名 36px · stop 56px）· clamp 1.8–3rem · overflow-wrap anywhere</h3>
      <div class="serif cap" style="--w: 900; font-size: 40px; color: #fff; background: #4A5733; padding: 10px 14px; border-radius: 10px; display: inline-block;">阿財魯肉飯</div>
      <h3>數字 · Oswald 700</h3>
      <div class="num" style="font-size: 64px; line-height: 1; font-weight: 700;">14　82%　23:30</div>
      <h3>內文 · Noto Sans TC 400/600/800 · 17px / 15px / 13px / 12px 標籤 .12em</h3>
      <div style="font-size: 17px; font-weight: 600;">合理的要求是訓練，不合理的要求是磨練。</div>
      <div style="font-size: 15px;">步行 6 分鐘，營業到 21:00。魯肉飯、滷蛋、燙青菜。</div>
    </div>
    <div style="display: flex; flex-direction: column; gap: 8px;">
      <h3>元件規則</h3>
      <div style="font-size: 13px; line-height: 1.7; color: #1B1D1A;">硬陰影 <code style="font-family: ui-monospace, Menlo, monospace;">4px 4px 0 var(--ink)</code>（磁貼、名牌、卡）· 主按鈕陰影用 <code style="font-family: ui-monospace, Menlo, monospace;">var(--signal)</code> · 按下位移 2px<br>
      印章 <code style="font-family: ui-monospace, Menlo, monospace;">.stamp</code> 旋轉 −8°，紅底透、卡片上用卡其 · 金色斜紋 6px 收邊 · 罰則卡頂端警示紋 10px<br>
      觸控目標 ≥ 44px；按鈕 56px · 圓角／邊線／命令卡底色隨火力層變（見左）</div>
    </div>
  </div>
</div>
</x-dc></body></html>
`

// ── 寫檔 ────────────────────────────────────────────────────────────
const files = {
  'Main.dc.html': HOME, 'Intake.dc.html': INTAKE, 'Cmd.dc.html': CMD, 'CmdStop.dc.html': CMD_STOP,
  'Log.dc.html': LOG, 'Stand.dc.html': STAND, 'Weekly.dc.html': WEEKLY,
  'Splash.dc.html': SPLASH, 'Icon.dc.html': ICON_BOARD, 'Tokens.dc.html': TOKENS,
}
for (const [name, html] of Object.entries(files)) writeFileSync(OUT + name, html)

const P = { w: 390, h: 844 }
const canvas = {
  artboards: [
    { file: 'Main.dc.html', title: '01 首頁', x: 0, y: 0, ...P },
    { file: 'Intake.dc.html', title: '02 點名 · 赴', x: 480, y: 0, ...P },
    { file: 'Cmd.dc.html', title: '03 命令卡 · 吃', x: 960, y: 0, ...P },
    { file: 'CmdStop.dc.html', title: '04 命令卡 · 不買（紅）', x: 1440, y: 0, ...P },
    { file: 'Log.dc.html', title: '05 登記', x: 0, y: 984, ...P },
    { file: 'Stand.dc.html', title: '06 罰則倒數', x: 480, y: 984, ...P },
    { file: 'Weekly.dc.html', title: '07 莒光園地', x: 960, y: 984, ...P },
    { file: 'Splash.dc.html', title: '啟動畫面', x: 1440, y: 984, ...P },
    { file: 'Icon.dc.html', title: 'App 圖示', x: 0, y: 1968, w: 560, h: 420 },
    { file: 'Tokens.dc.html', title: 'Token 與字級', x: 640, y: 1968, w: 960, h: 820 },
  ],
  annotations: [
    { id: 'how-to-read', x: 0, y: -170, w: 420, text: '每個手機畫面上方有兩個開關：「主題」切深淺色、「火力」切三位班長。\n換人不只換頭像：命令卡底色、圓角、邊線、字重全部跟著變——這是給「三段火力視覺無差」那條弱點的解。' },
    { id: 'rules-kept', x: 480, y: -170, w: 420, text: '第 9 節八條規則全部保留：班長在上、命令卡 1fr 38% 兩欄且角色是 grid 子元素（不壓字）、字用 clamp、步驟白卡分離、每頁一顆主按鈕、命令／登記／罰則卡 4:5、小螢幕橫捲、跟隨系統。' },
    { id: 'motion-haptics', x: 1920, y: 984, w: 300, text: '動態與觸覺（實作用，不畫）\n\n・命令卡進場：.reveal 0.2s 單向淡入上移，reduced-motion 關閉\n・罰則倒數：每一下短觸覺（impact light）+ 數字 scale .96→1；金色計數條逐格亮；數到 0 長觸覺（notification success）+ 紅卡 0.4s 轉回卡其\n・完成登記：中觸覺 + 「雄壯！威武！」放大一次\n・換班長：頭像換的同一幀，--cmd/--r/--bw 一起換，viewer 感覺整個人換了' },
    { id: 'weakness-map', x: 1920, y: 1340, w: 300, text: '簡報第 3 節六個弱點 → 對應解\n\n1 磁貼等重 → 硬陰影方塊 + 大字 + 線描圖示，按下會沉\n2 角色縮角落 → 胸像裁切放大 30%，右欄置底\n3 三段火力無差 → 火力層 token（底色／圓角／邊線／字重）+ 名牌火力格\n4 倒數沒壓迫 → Oswald 132px + 金色計數條 + 頂端警示紋\n5 週報難讀 → 成績單：紙底墨字、三格 hero 數字、紅印講評\n6 沒動態觸覺 → 見左側便條' },
    { id: 'handoff', x: 1920, y: 1700, w: 300, text: '交接\n\nToken 表在下方；--gold 與 --paper 是新增，其餘沿用 styles.css 原值。三段火力的四個變數（--cmd --r --bw --w）在 App 層依 level 設在 :root 即可，元件不用改。\n\n字體：Noto Serif TC 900 / Noto Sans TC / Oswald，皆可內嵌 iOS；PNG 匯出會顯示 PingFang 備援。' },
  ],
  launch: { view: 'canvas' },
}
writeFileSync(OUT + 'canvas.json', JSON.stringify(canvas, null, 2) + '\n')
console.log('wrote', Object.keys(files).length, 'artboards + canvas.json')
