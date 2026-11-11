// 8-bit 方向的 Claude Design 畫布工作檔。
import { writeFileSync } from 'node:fs'
import { spriteSvg, silhouetteSvg, MOODS } from './sprites.mjs'
import { hwPalettes, HW } from './hwpalette.mjs'

// 預設走任天堂 FC/NES 的硬體調色盤。SMS 版在「調色盤」畫板上對照。
const PAL = hwPalettes('nes')

const H = HW.nes
const T = { khaki:H.page, ink:H.ink, olive:H.unis[1].uni, olive2:H.unis[1].dark,
            signal:H.signal, gold:H.gold, pop:H.accents[0], white:H.white, mute:'#7C7C7C' }
const FONT = '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Press+Start+2P&amp;family=Noto+Sans+TC:wght@400;700;900&amp;display=swap">'
const CSS = `
  body{margin:0;font-family:"Noto Sans TC",-apple-system,"PingFang TC",system-ui,sans-serif;-webkit-font-smoothing:antialiased}
  a{color:${T.signal}}a:hover{color:#A82419}
  .px{font-family:"Press Start 2P",monospace}
  svg{image-rendering:pixelated;display:block}
  .phone{width:390px;height:844px;box-sizing:border-box;display:flex;flex-direction:column;
         background:${T.khaki};color:${T.ink};padding:54px 16px 20px;position:relative;overflow:hidden}
  /* 8-bit 的框：厚描邊 + 硬陰影，沒有圓角 */
  .box{border:3px solid ${T.ink};background:${T.white};box-shadow:5px 5px 0 ${T.ink}}
  .btn{font:inherit;font-weight:900;font-size:17px;border:3px solid ${T.ink};background:${T.ink};
       color:${T.khaki};box-shadow:4px 4px 0 ${T.signal};padding:0 18px;height:58px;cursor:pointer;flex:1}
  .btn.line{background:${T.white};color:${T.ink};box-shadow:4px 4px 0 ${T.ink};flex:0 0 auto}
  .btn.ghost{background:none;border:0;box-shadow:none;color:${T.mute};font-weight:400;font-size:15px;flex:0 0 auto;padding:0 8px}
  .tile{border:3px solid ${T.ink};background:${T.white};box-shadow:5px 5px 0 ${T.olive2};
        padding:12px;text-align:left;display:flex;flex-direction:column;gap:6px;cursor:pointer;font:inherit;color:${T.ink}}
  .tile b{font-size:40px;font-weight:900;line-height:1}
  .hp{height:14px;border:3px solid ${T.ink};background:${T.white};display:flex;padding:2px;gap:2px}
  .hp i{flex:1;background:${T.olive}}
  .hp i.off{background:#D8D0B8}
`
const wrap = (body, w=390, h=844) => `<!doctype html><html><head><meta charset="utf-8"><script src="./support.js"></script></head>
<body><x-dc><helmet>${FONT}<style>${CSS}</style></helmet>
<div style="width:${w}px;height:${h}px;box-sizing:border-box">${body}</div>
</x-dc></body></html>`

// ── 01 首頁 ──
const TILES = [['吃','中午、晚上'],['去','下班後、週末'],['赴','去不去'],['歇','喝一杯']]
writeFileSync('8bit/Main.dc.html', wrap(`<div class="phone">
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
    <span class="px" style="font-size:9px;color:${T.mute}">DECIDE CO.</span>
    <button style="font:inherit;font-size:12px;font-weight:700;border:3px solid ${T.ink};background:${T.white};color:${T.ink};padding:6px 10px;cursor:pointer">新兵日記</button>
  </div>
  <div style="display:flex;gap:12px;align-items:flex-end;margin-bottom:12px">
    <div class="box" style="padding:0;box-shadow:4px 4px 0 ${T.ink}">${spriteSvg(1,'idle',{scale:2,bg:T.khaki,palettes:PAL})}</div>
    <div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:6px">
      <span class="px" style="font-size:8px;color:${T.khaki};background:${T.ink};padding:4px 6px;align-self:flex-start">LV.2  值星班長</span>
      <div style="font-size:26px;font-weight:900;line-height:1">黑面</div>
      <div class="hp">${Array.from({length:10},(_,i)=>`<i class="${i>7?'off':''}"></i>`).join('')}</div>
      <span style="font-size:10px;color:${T.mute}">服從率 82%　·　點頭像換班長</span>
    </div>
  </div>
  <div class="box" style="padding:12px 14px;font-size:16px;font-weight:700;line-height:1.5;margin-bottom:16px">
    你各位啊！報告什麼事？
    <div style="font-weight:400;font-size:12px;color:${T.mute};margin-top:6px">合理的要求是訓練，不合理的要求是磨練。</div>
  </div>
  <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px">
    ${TILES.map(([t,s])=>`<button class="tile"><b>${t}</b><span style="font-size:11px;color:${T.mute}">${s}</span></button>`).join('')}
  </div>
  <div style="display:flex;gap:8px;margin-top:12px">
    ${['幾點睡','回訊息','買不買'].map(t=>`<button style="font:inherit;font-size:12px;font-weight:700;border:3px solid ${T.ink};background:none;color:${T.ink};padding:9px 10px;cursor:pointer;white-space:nowrap">${t}</button>`).join('')}
  </div>
  <div style="flex:1"></div>
  <p class="px" style="margin:0;font-size:8px;color:${T.mute};line-height:1.8">大事不受理。<br>大事你自己去找連長。</p>
</div>`))

// ── 02 命令卡 ──
writeFileSync('8bit/Cmd.dc.html', wrap(`<div class="phone">
  <div style="border:3px solid ${T.ink};background:${T.olive};box-shadow:6px 6px 0 ${T.ink};
              aspect-ratio:4/5;display:grid;grid-template-columns:1fr 38%;padding:14px;gap:8px;position:relative;overflow:hidden">
    <span class="px" style="position:absolute;left:12px;top:10px;font-size:7px;color:${T.khaki};opacity:.9">一個口令一個動作</span>
    <div style="display:flex;flex-direction:column;justify-content:space-between;min-width:0;padding-top:16px">
      <div style="font-size:17px;font-weight:900;color:${T.white};text-shadow:2px 2px 0 ${T.ink}">給我去吃</div>
      <div style="font-size:34px;font-weight:900;line-height:1.1;color:${T.white};text-shadow:3px 3px 0 ${T.ink};overflow-wrap:anywhere">阿財<br>魯肉飯</div>
      <div style="font-size:13px;font-weight:700;color:${T.gold};text-shadow:2px 2px 0 ${T.ink}">超商吃兩天了</div>
    </div>
    <div style="align-self:end">${spriteSvg(1,'bark',{scale:3,palettes:PAL})}</div>
    <span style="position:absolute;left:0;right:0;bottom:0;height:6px;background:repeating-linear-gradient(90deg,${T.gold} 0 8px,${T.ink} 8px 16px)"></span>
  </div>
  <div class="box" style="margin-top:14px;padding:12px 14px;font-size:16px;line-height:1.6;display:flex;flex-direction:column;gap:4px">
    ${['步行 6 分鐘，營業到 21:00。','魯肉飯、滷蛋、燙青菜。','12 分鐘吃完，手機收起來。']
      .map(t=>`<div style="display:flex;gap:8px"><span style="color:${T.signal};font-weight:900">▶</span><span>${t}</span></div>`).join('')}
  </div>
  <div style="flex:1"></div>
  <div style="display:flex;gap:10px;align-items:center">
    <button class="btn">報告班長，完成</button><button class="btn line">店關了</button><button class="btn ghost">沒做</button>
  </div>
</div>`))

// ── 03 罰則倒數 ──
writeFileSync('8bit/Stand.dc.html', wrap(`<div class="phone">
  <div style="border:3px solid ${T.ink};background:${T.signal};box-shadow:6px 6px 0 ${T.ink};
              aspect-ratio:4/5;display:grid;grid-template-columns:1fr 38%;padding:14px;gap:8px;position:relative;overflow:hidden">
    <span style="position:absolute;left:0;right:0;top:0;height:8px;background:repeating-linear-gradient(45deg,${T.ink} 0 8px,${T.gold} 8px 16px)"></span>
    <div style="display:flex;flex-direction:column;justify-content:space-between;min-width:0;padding-top:18px">
      <div style="font-size:15px;font-weight:900;color:${T.white};text-shadow:2px 2px 0 ${T.ink}">伏地挺身，二十下！</div>
      <div>
        <div class="px" style="font-size:56px;line-height:1;color:${T.white};text-shadow:4px 4px 0 ${T.ink}">14</div>
        <div style="display:flex;gap:2px;flex-wrap:wrap;margin-top:8px;max-width:100%">
          ${Array.from({length:20},(_,i)=>`<span style="width:4px;height:12px;background:${i<6?T.gold:'rgba(255,255,255,.35)'}"></span>`).join('')}
        </div>
      </div>
      <div style="font-size:12px;font-weight:700;color:${T.white};text-shadow:2px 2px 0 ${T.ink}">軍中沒有下次注意，只有這一次。</div>
    </div>
    <div style="align-self:end">${spriteSvg(1,'punish',{scale:3,palettes:PAL})}</div>
  </div>
  <p class="px" style="text-align:center;font-size:8px;color:${T.mute};margin-top:16px;line-height:1.8">數到 0 自動解散<br>中途離開不算</p>
  <div style="flex:1"></div>
</div>`))

// ── 04 sprite 表 ──
const NAMES=['阿良 LV.0','黑面 LV.1','老郭 LV.2']
writeFileSync('8bit/Sprites.dc.html', wrap(`<div style="padding:28px;background:${T.khaki};color:${T.ink};box-sizing:border-box;width:900px;height:640px">
  <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:6px">
    <span style="font-size:20px;font-weight:900">三人 × 五表情</span>
    <span class="px" style="font-size:8px;color:${T.mute}">48×48 · 眼線 Y24 · 肩線 Y38 · 三人鎖死</span>
  </div>
  <div style="display:grid;grid-template-columns:74px repeat(5,1fr);gap:8px;align-items:center;margin-top:14px">
    <span></span>${MOODS.map(m=>`<span class="px" style="font-size:8px;color:${T.mute};text-align:center">${m}</span>`).join('')}
    ${[0,1,2].map(lv=>`<span style="font-size:12px;font-weight:700">${NAMES[lv]}</span>`+
      MOODS.map(m=>`<div style="border:2px solid ${T.ink};background:${T.white};justify-self:center">${spriteSvg(lv,m,{scale:2,palettes:PAL})}</div>`).join('')).join('')}
  </div>
  <div style="display:flex;gap:32px;margin-top:22px;align-items:flex-end">
    <div>
      <div style="font-size:12px;font-weight:700;margin-bottom:6px">黑剪影測試 · 48px 原寸</div>
      <div style="display:flex;gap:16px;background:#fff;border:2px solid ${T.ink};padding:10px">
        ${[0,1,2].map(lv=>silhouetteSvg(lv,'idle',1)).join('')}
      </div>
    </div>
    <div>
      <div style="font-size:12px;font-weight:700;margin-bottom:6px">實際尺寸</div>
      <div style="display:flex;gap:12px;align-items:flex-end">
        ${[1,2,3].map(s=>`<div style="border:2px solid ${T.ink}">${spriteSvg(1,'bark',{scale:s,bg:T.white,palettes:PAL})}</div>`).join('')}
      </div>
    </div>
  </div>
</div>`, 900, 640))

// ── 05 調色盤對照 ──
const PNAME=['阿良','黑面','老郭']
writeFileSync('8bit/Palette.dc.html', wrap(`<div style="padding:26px;background:#DDD8C6;color:#16180F;box-sizing:border-box;width:900px;height:560px;font-family:system-ui">
  <div style="font-size:19px;font-weight:900;margin-bottom:2px">硬體調色盤對照</div>
  <div style="font-size:11px;color:#666;margin-bottom:18px">同一組 sprite，只換顏色。到這個色數兩者差異很小 —— SMS 的 15 色/sprite 要做多階陰影才顯得出來。</div>
  <div style="display:flex;gap:30px;align-items:flex-start">
  ${['nes','sms'].map(mode=>{const pal=hwPalettes(mode);const hw=HW[mode];const P1=pal[1];
    return `<div><div style="font-size:14px;font-weight:700">${hw.label}</div>
      <div style="font-size:10px;font-family:monospace;color:#777;margin:2px 0 10px">${mode==='nes'?'54 色主調色盤 · 3 色/sprite':'64 色（RGB 2-2-2）· 15 色/sprite'}</div>
      ${[0,1,2].map(lv=>`<div style="display:flex;gap:6px;margin-bottom:6px;align-items:center">
        <span style="font-size:11px;width:28px;color:#555">${PNAME[lv]}</span>
        ${['idle','bark','punish'].map(m=>`<div style="border:2px solid #16180F">${spriteSvg(lv,m,{scale:3,bg:hw.page,palettes:pal})}</div>`).join('')}
      </div>`).join('')}
      <div style="display:flex;gap:3px;margin-top:10px">${[P1.skin,P1.skinDark,P1.uni,P1.uniDark,P1.accent,P1.gold].map(c=>`<span style="width:24px;height:24px;background:${c};border:1px solid #16180F"></span>`).join('')}</div>
      <div style="font:10px monospace;color:#777;margin-top:6px">${[P1.skin,P1.uni,P1.accent].join('  ')}</div>
    </div>`}).join('')}
  </div>
  <div style="margin-top:18px;font-size:11px;color:#666;line-height:1.7">
    三人膚色<b>共用</b>，改用制服亮度區分 —— 這是 8-bit 區分同類角色的標準技法（palette swap），<br>
    也剛好就是三段火力：制服由亮到暗，氣壓由低到高。
  </div>
</div>`, 900, 560))

const P={w:390,h:844}
writeFileSync('8bit/canvas.json', JSON.stringify({
  artboards:[
    {file:'Main.dc.html',title:'01 首頁',x:0,y:0,...P},
    {file:'Cmd.dc.html',title:'02 命令卡',x:480,y:0,...P},
    {file:'Stand.dc.html',title:'03 罰則倒數',x:960,y:0,...P},
    {file:'Sprites.dc.html',title:'sprite 表 + 剪影測試',x:1440,y:0,w:900,h:640},
    {file:'Palette.dc.html',title:'調色盤：NES vs SMS',x:1440,y:760,w:900,h:560},
  ],
  annotations:[
    {id:'note-dir',x:0,y:-190,w:440,text:'方向 C · 8-bit · 玩具電玩感\n48×48 sprite，三人共用格線（眼線 Y24、肩線 Y38 鎖死）。\n表情只換眉與嘴 —— 改表情是改一個函式，不重畫任何像素。'},
    {id:'note-ui',x:960,y:-190,w:440,text:'UI 走「混合」：角色、梗圖卡、按鈕是 8-bit（厚描邊、硬陰影、無圓角）；\n步驟卡的文字保持可讀 —— 那是真的要你照做的指令，不能為了風格犧牲。'},
    {id:'note-gate',x:2400,y:0,w:300,text:'第一道閘門\n\n黑剪影 48px 並排分不分得出來？\n阿良＝歪帽＋後腦翹髮\n黑面＝最寬最方＋值星帶抬肩\n老郭＝帽低＋鬢角白髮\n\n這關過不了整個方向作廢。'},
    {id:'note-todo',x:2400,y:280,w:300,text:'還沒做的\n\n・調色盤已吸附到任天堂 FC/NES 硬體色（SMS 版見對照畫板）\n・帽徽是金環不是五角星（五角星是解放軍系統）\n・值星帶方向需要一張參考照定死\n・繁中像素字（Cubic 11 / Zpix）還沒接\n・音效、日記、週報畫面'},
  ],
  launch:{view:'canvas'},
}, null, 2) + '\n')
console.log('wrote 4 artboards')
