// 模板口令（Round 4）：Claude 失敗時伺服器自己出口令（逾時、429、格式壞、兩次都推掉、金鑰沒設）。
// Cross 2026-09-18：不吐口令是不被允許的；Cross 2026-10-30：很多情境沒辦法給任何解答。
// 這裡只放算得出來的句子：店名、步行、營業時間、熄燈時間、買不買都由程式決定；回傳後照樣經過 enforceRules（禁詞、mode 語料、用語守門）。
// 純函式，無 I/O。
import { attendVerdict, buyVerdict, lightsOut } from './rules.ts'
import { hhmmIn, type Tz } from './tz.ts'
import type { Order, OrderRequest, PickResult } from './types.ts'

const DRINKS = new Set(['酒吧', '居酒屋', '熱炒燒烤'])

/** 回一道合法的 Order。pick 由伺服器挑好（吃／歇），其他卡為 null。 */
export function templateOrder(req: Pick<OrderRequest, 'module' | 'choices' | 'recentOrders'>, pick: PickResult | null, now: Date, tz: Tz): Order {
  const name = pick?.place.name ?? ''
  const walk = pick?.place.walkMin ? `走 ${pick.place.walkMin} 分鐘過去。` : '現在出發。'
  const at = (min: number) => hhmmIn(new Date(now.getTime() + min * 60_000).toISOString(), tz)
  const base = (big: string, steps: string[], verdict: Order['verdict'] = 'do'): Order => ({
    verdict,
    meme: { top: '班長下令', big, bot: '不准挑，照做' },
    steps,
    ...(pick ? { place: { id: pick.place.id, name } } : {}),
    log: `${at(0)} 口令：${big}。`,
  })

  switch (req.module) {
    case 'eat':
      return base(name, [walk, '點店裡賣最多的那一道。', `${at(40)} 前吃完，回報。`])
    case 'rest':
      if (DRINKS.has(String(req.choices.drink ?? ''))) {
        return base(name, ['最多兩杯，不准續攤。', `${at(90)} 前離開。`, '搭車或走路回家，不准開車騎車。'])
      }
      return base(name, ['點一杯熱的。', '坐 30 分鐘。', '手機面朝下。'])
    case 'go':
      return base('附近公園', [`${String(req.choices.transport ?? '走路')}出門，單程不超過 15 分鐘。`, '到了走一圈，不看手機。', `${at(60)} 前回家。`])
    case 'attend': {
      const v = attendVerdict(Number(req.choices.stars ?? 5), String(req.choices.occasion ?? ''))
      if (v === 'stop') return base('不去。', ['傳這句：「這次不過去了，祝順利，改天約。」'], 'stop')
      return base('去。', ['提早 10 分鐘到。', 'smart casual。', '兩小時後可以離場。'])
    }
    case 'sleep':
      return base(`${lightsOut(String(req.choices.wake ?? '07:30'))} 熄燈`, ['充電器放客廳。', '刷牙洗臉。', '關燈，不確認訊息。'])
    case 'reply':
      return base('現在回。2 句。', ['第一句：先給答案。', '第二句：講什麼時候給完整版。', '送出後關掉。'])
    case 'buy':
      if (buyVerdict(req.recentOrders ?? [], now) === 'do') return base('准買。', ['現在付款。', '付完關掉購物 app。'])
      return base('不買。', ['關掉頁面。', '72 小時後還想要，再來報告。'], 'stop')
    case 'travel': {
      // 區域 → 一個簽證簡單、短程也去得了的國家（模板只求不空手；平常由 Claude 依天數與 recentOrders 換國家）。
      const region = String(req.choices.region ?? '都可以')
      const days = String(req.choices.days ?? '5 天')
      const country = region === '東南亞' ? '泰國' : region === '歐洲' ? (days === '3 天' ? '日本' : '荷蘭') : region === '美洲' ? (days === '3 天' ? '日本' : '美國') : '日本'
      return base(country, [`今天 ${at(180)} 前訂機票。`, '出發前只辦一件事：確認護照效期超過 6 個月。', `${days}後回國，日期今天就訂死。`])
    }
  }
}
