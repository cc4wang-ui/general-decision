// 系統提示詞 — DECIDE-DEV-DOC-v1.md 第 7 節，照抄人設與絕對規則。
import { OFFICER_BY_LEVEL, sampleCorpus } from './officers.ts'
import { CARD_BY_ID } from './cards.ts'
import { attendVerdict, buyVerdict, lightsOut } from './rules.ts'
import { bandOf, estText, priceFit, priceText } from './price.ts'
import { sceneOf, sceneTimes, sceneTimesLine } from './scene.ts'
import { hhmmIn, tzOf } from './tz.ts'
import type { Band, Country, Level, ModuleId, OrderRequest, PickResult } from './types.ts'

// Round 3：PlaceCandidate 搬到 types.ts（DEV-PLAN-3 §B.1），這裡轉出口讓既有 import 不用動。
export type { PlaceCandidate } from './types.ts'

export const ORDER_SYSTEM_PROMPT = `你是台灣 1990–2000 年代軍教片裡的班長。三種火力，由 level 決定：
level 0「菜鳥班長 阿良」：剛下部隊，兇不起來，會結巴、會冒汗、講「你各位」會軟掉。
level 1「值星班長 黑面」：標準值星班長。短句、命令式、動詞開頭。口頭禪：「你各位啊」「一個口令一個動作」「合理的要求是訓練，不合理的要求是磨練」「軍中沒有還好」。
level 2「士官長 老郭」：毒舌、比喻狠、不留情。「我看過的菜鳥比你吃過的饅頭多」「這不叫拖延，這叫菜」。

【絕對規則】
1. 罵行為，不罵人：只罵猶豫、拖延、菜、屁股重、賴床。禁止外貌、性別、族群、家庭、健康、性相關詞；禁止髒話。
2. 命令本體零毒性：steps 與 place 只放可執行資訊，不放梗、不放罵。毒只放在 meme.top 與 meme.bot。
3. log（登記）不罵、不誇：只描述時間、口令、使用者做了什麼。例：「你去了你不想去的地方，而且準時。」
4. 不解釋、不道歉、不給第二選項。verdict=stop 時，steps 第一條就是替代行為（且只有一個）。
5. 這八張卡全部是小事，一律要給可執行的口令。禁止回「大事不受理」、禁止叫使用者去找連長或任何人、禁止用「這不是班長管的」之類的話推掉。verdict:'stop' 只有在【已判定】明講時才出現（赴、買不買）。
6. 有【店已決定】時，店已由班長決定：place.name 照填那一家（place.id 由伺服器填，留空字串），meme.big 就是那家店名。禁止只講類別（「甜點店」「小吃店」「附近的咖啡廳」一律不算回答）、禁止編造店名、禁止提到任何別家店。註明「HH:MM 開」的店要在 steps 寫清楚幾點開門。金額只准照抄【店已決定】給的價位，禁止自己生金額。
7. 輸出只有 Order JSON，不加任何前後文、不加 markdown fence。
8. 一律用台灣的繁體中文與台灣生活用語。禁止中國用語（質量／視頻／信息／屏幕／默認／用戶／激活／軟件／網絡／出租車／自行車／盒飯／早點／地鐵）。軍事用語只用國軍的（連、排、班、值星、出操、寢室、輔導長），不得使用解放軍編制用語（指導員、政委）。

【Order JSON 形狀】
{"verdict":"do"|"stop","meme":{"top":"≤16字","big":"≤10字","bot":"≤24字"},"steps":["≤22字",...1到3條],"place":{"id":"","name":"","walkMin":0,"openUntil":"HH:MM"}(可省略),"log":"≤30字"}`

/**
 * Round 3（DEV-PLAN-3 W1.5）：店由 pickPlace 決定，prompt 只帶那一家（附錄 2）。模型再也看不到候選清單（規則 11、T2）。
 */
export function buildOrderPrompt(req: OrderRequest, pick: PickResult | null, country: Country = 'TW'): { system: string; user: string } {
  const card = CARD_BY_ID[req.module]
  const officer = OFFICER_BY_LEVEL[req.level]
  const samples = sampleCorpus(req.level, 3)
  const now = new Date(req.now)

  const system = [
    ORDER_SYSTEM_PROMPT,
    '',
    `【本次火力】level ${req.level}：${officer.rank} ${officer.duty} ${officer.name}`,
    `【當次風格樣本】（改寫，不要整句照抄）\n${samples.map((s) => `・${s}`).join('\n')}`,
    '',
    `【模組規則：${card.title}】\n${card.promptHint}`,
    computedFacts(req, now),
  ].filter(Boolean).join('\n')

  const user = [
    // checker 2026-11-01：以前給 UTC 的 ISO 字串，模型照 UTC 寫鐘點（當地 19:32 寫「11:52 前吃完」）。改給當地時間。
    `現在時間：${localStamp(req.now, tzOf(req.loc))}（${tzOf(req.loc) === 'Asia/Tokyo' ? '日本' : '台灣'}當地時間）。steps 裡的鐘點一律從這個時間往後算。`,
    // 資料最小化（Team Lead，2026-10-22）：店已由伺服器挑好，模型用不到座標——只告訴它在哪個國家，不送經緯度、不送地點名稱。
    req.loc ? `使用者人在${country === 'JP' ? '日本' : country === 'TW' ? '台灣' : '台灣與日本以外的地方'}。` : '使用者沒有給定位。依規則 6 降級，不得編造店名與距離。',
    country === 'JP' ? '使用者人在日本：交通講電車／地下鐵，不講捷運；金額只有日圓。' : '',
    `使用者的選擇：${JSON.stringify(req.choices, null, 0)}`,
    // Round 5：情境一行（口令要對得上：外帶不寫內用、聚餐寫幾道一起分…）。
    sceneOf(req.module, req.choices ?? {})?.rule.hint ?? '',
    pick ? decidedBlock(req, pick, country) : '',
    req.recentOrders.length
      ? `近 7 天口令：\n${req.recentOrders.map((r) => `・${r.at} ${r.module} ${r.big}`).join('\n')}`
      : '近 7 天沒有紀錄。',
    '只輸出 Order JSON。',
  ].filter(Boolean).join('\n\n')

  return { system, user }
}

/** ISO → 當地「YYYY-MM-DD HH:MM」。 */
export function localStamp(iso: string, tz: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return new Intl.DateTimeFormat('sv-SE', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(d).replace('T', ' ')
}

/**
 * 店跟預算對不上時要講清楚，方向也要對（PR #22 紅隊）：比預算貴才講「貴」，比預算便宜就講「便宜」。
 * 差一檔 → 准了；差兩檔以上 → 附近預算內的沒得挑（深夜打烊最常見）。對得上或沒資料 → 不講。
 */
export function budgetLine(band: number | null, budget: Band[] | undefined): string {
  const bot = budgetBot(band, budget)
  if (!bot) return ''
  const why: Record<string, string> = {
    '超出預算一檔，我准了': '這家超出使用者選的預算一檔',
    '預算內的沒開，這家比較貴': '附近預算內的店現在沒得挑，這家比使用者選的預算貴',
    '比預算省一點，我准了': '這家比使用者選的預算便宜一檔',
    '預算內的沒開，這家比較便宜': '附近預算內的店現在沒得挑，這家比使用者選的預算便宜',
  }
  const verb = bot.startsWith('預算內') ? '直說' : '講'
  return `${why[bot]}：在 meme.bot ${verb}「${bot}」。`
}

/** 預算對不上時 meme.bot 要講的那句（模板口令也用，Claude 失敗時一樣講實話）。對得上或沒資料 → ''。 */
export function budgetBot(band: number | null, budget: Band[] | undefined): string {
  if (!budget?.length || band === null || priceFit(band, budget) === 1) return ''
  const pricier = Math.floor(band) > Math.max(...budget)
  const near = priceFit(band, budget) > 0
  if (pricier) return near ? '超出預算一檔，我准了' : '預算內的沒開，這家比較貴'
  return near ? '比預算省一點，我准了' : '預算內的沒開，這家比較便宜'
}

/** 附錄 2 的【店已決定】段落。數字（步行、營業、價位、第 N 次）全部是伺服器算好的，模型照講不准改（T6）。 */
function decidedBlock(req: OrderRequest, pick: PickResult, country: Country): string {
  const p = pick.place
  const hours = p.opensAt ? `${p.opensAt} 開` : p.openUntil ? `營業到 ${p.openUntil}` : '營業中'
  // Round 4：Google 沒有價位資料時，pick 帶我方推估（「推估平價」），只講描述不講金額。
  const band = pick.band !== undefined ? pick.band : bandOf(p, country)
  const price = priceText(p, country) ?? (pick.bandEst && band !== null ? `${estText(band)}（我方推估，不准講成確定價位）` : '價位未知')
  const modeRule =
    pick.mode === 'new' ? 'mode=new：在 meme.top 或 meme.bot 講這家他沒去過（新據點）。'
      : pick.mode === 'revisit' ? `mode=revisit：在 meme.top 或 meme.bot 講「第 ${pick.visits} 次」，數字照抄。`
        : 'mode=wildcard：在 meme.top 或 meme.bot 講這是偵察任務。'
  return [
    // R3 修正 S-9：不送 place.id——模型用不到，id 由 withPlace 填（資料最小化，跟不送座標同一個理由）。
    `【店已決定】place.name=${p.name}　${p.walkMin ? `步行 ${p.walkMin} 分　` : ''}${hours}　價位：${price}`,
    `mode=${pick.mode}　這是使用者第 ${pick.visits} 次被派到這家。`,
    '你只負責寫口令：meme.big 就是這家店名（≤10 字，太長用店家慣稱）。',
    modeRule,
    pick.exhausted ? '附近能偵察的新店都偵察完了，這次派的是已知據點。' : '',
    // Round 4 救援：前兩次查詢之後附近一家都派不出去，派的是營業中的便利商店。
    p.lane === 'rescue' ? '附近營業中的店都派不出去，這次派的是便利商店：在 meme.bot 直說「附近都收了，去超商」，steps 寫在超商買什麼、幾分鐘內吃完。' : '',
    budgetLine(band, req.budget),
    // Round 5：到店、最早離開、關門都先算好（preview-5 實測：模型自己加減會算錯）。
    sceneTimesLine(sceneTimes(sceneOf(req.module, req.choices ?? {}), hhmmIn(req.now, tzOf(req.loc)), p.walkMin, p.closeInMin)),
    '禁止提到任何別家店或類別；禁止寫出「價位」以外的金額；禁止寫連結。',
    // Team Lead 設計修訂：口令卡最上面已經印了店名、步行、營業、價位，steps 再講一次就是廢話。
    '口令卡上已經印好店名、步行分鐘、營業時間、價位：steps 不要重複這些，只寫點什麼、怎麼吃、幾分鐘內吃完這類動作（「HH:MM 開」的店例外，要講幾點到）。',
  ].filter(Boolean).join('\n')
}

/** 算得出來的事先算好，不讓模型自己推（第 6 節 sleep / attend / buy 硬規則）。 */
function computedFacts(req: OrderRequest, now: Date): string {
  const lines: string[] = []
  if (req.module === 'sleep') {
    const wake = String(req.choices.wake ?? '07:30')
    lines.push(`【已算好】起床 ${wake} → meme.big 必須是「${lightsOut(wake)} 熄燈」，不要自己再算一次。`)
  }
  if (req.module === 'attend') {
    const v = attendVerdict(Number(req.choices.stars ?? 5), String(req.choices.occasion ?? ''))
    lines.push(`【已判定】verdict 必須是 "${v}"。`)
  }
  if (req.module === 'buy') {
    const v = buyVerdict(req.recentOrders, now)
    lines.push(`【已判定】verdict 必須是 "${v}"。`)
  }
  return lines.length ? `\n${lines.join('\n')}` : ''
}

export const WEEKLY_SYSTEM_PROMPT = `${ORDER_SYSTEM_PROMPT}

【本次任務】讀 entries（本週 DiaryEntry[]）。用同一位班長口吻寫 WeeklyReport.body（≤180 字）：
outcome=mismatch 是班長派的店不符合使用者的情境，錯在班長：不罵、不算罰則。
① 數字：口令數、服從率、罰則次數 ② 一個規律（例：只在不用出門的事上偷懶／晚上意志最弱）③ 下週一個對策 ④ verdict 一句（≤14 字）。
只輸出 WeeklyReport JSON：{"weekStart":"","level":0,"stats":{"orders":0,"complianceRate":0,"punishments":0,"weakestModule":null},"body":"","verdict":""}`

export function levelName(level: Level): string {
  const o = OFFICER_BY_LEVEL[level]
  return `${o.rank} ${o.duty} ${o.name}`
}

export function moduleTitle(id: ModuleId): string {
  return CARD_BY_ID[id].title
}
