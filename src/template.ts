// 模板口令（Round 4）：Claude 失敗時伺服器自己出口令（逾時、429、格式壞、兩次都推掉、金鑰沒設）。
// Cross 2026-09-18：不吐口令是不被允許的；Cross 2026-10-30：很多情境沒辦法給任何解答。
// 這裡只放算得出來的句子：店名、步行、營業時間、熄燈時間、買不買都由程式決定；回傳後照樣經過 enforceRules（禁詞、mode 語料、用語守門）。
// 純函式，無 I/O。
import { budgetBot } from './prompt.ts'
import { attendVerdict, buyVerdict, lightsOut } from './rules.ts'
import { sceneOf } from './scene.ts'
import { TRANSPORT_HEAD, minutesOf, transportOf } from './go.ts'
import { hhmmIn, type Tz } from './tz.ts'
import type { Order, OrderRequest, PickResult } from './types.ts'

const DRINKS = new Set(['酒吧', '居酒屋', '熱炒燒烤'])

/** 回一道合法的 Order。pick 由伺服器挑好（吃／歇），其他卡為 null。 */
export function templateOrder(req: Pick<OrderRequest, 'module' | 'choices' | 'recentOrders' | 'budget'>, pick: PickResult | null, now: Date, tz: Tz): Order {
  const name = pick?.place.name ?? ''
  const walk = pick?.place.walkMin ? `走 ${pick.place.walkMin} 分鐘過去。` : '現在出發。'
  const at = (min: number) => hhmmIn(new Date(now.getTime() + min * 60_000).toISOString(), tz)
  // 跟 Claude 口令同一套實話（Round 4 checker 2026-11-01）：派超商要說附近都收了；預算對不上要說。
  const rescue = pick?.place.lane === 'rescue'
  const honest = rescue ? '附近都收了，去超商' : pick && req.module === 'eat' ? budgetBot(pick.band ?? null, req.budget) : ''
  const base = (big: string, steps: string[], verdict: Order['verdict'] = 'do'): Order => ({
    verdict,
    meme: { top: '班長下令', big, bot: honest || '不准挑，照做' },
    steps,
    ...(pick ? { place: { id: pick.place.id, name } } : {}),
    log: `${at(0)} 口令：${big}。`,
  })

  // Round 5：口令跟情境對得上（外帶不寫在店裡吃完、聚餐寫一起分、工作讀書寫插座）。「其他」用通用句。
  const scene = sceneOf(req.module, req.choices ?? {})?.id
  switch (req.module) {
    case 'eat':
      if (rescue) return base(name, [walk, '拿一個熱的主食，加一瓶水。', `${at(20)} 前吃完，回報。`])
      if (scene === '一個人快吃') return base(name, [walk, '只點一道，不加點。', `${at(25)} 前吃完，回報。`])
      if (scene === '外帶') return base(name, [walk, '點一份，外帶。', `${at(30)} 前帶回去吃完。`])
      if (scene === '朋友聚餐') return base(name, [walk, '點三道一起分，不要各點各的。', `${at(100)} 前散會。`])
      if (scene === '約會吃好一點') return base(name, [walk, '點店裡的招牌，慢慢吃。', '手機收進包包。'])
      if (scene === '宵夜') return base(name, [walk, '點一份小的，不加點。', `${at(30)} 前吃完回家。`])
      return base(name, [walk, '點店裡賣最多的那一道。', `${at(40)} 前吃完，回報。`])
    case 'rest':
      if (rescue) return base(name, [walk, '買一瓶熱飲。', '店外站 10 分鐘，喝完回家。'])
      if (DRINKS.has(String(req.choices.drink ?? ''))) {
        return base(name, ['最多兩杯，不准續攤。', `${at(90)} 前離開。`, '搭車或走路回家，不准開車騎車。'])
      }
      if (scene === '工作讀書') return base(name, ['找有插座的位子，點一杯。', '專心 50 分鐘再起來走動。', `${at(150)} 前收工。`])
      if (scene === '朋友聊天') return base(name, ['找坐得下的位子，一起點。', '手機面朝下。', `${at(120)} 前散。`])
      if (scene === '談事情') return base(name, ['找角落的位子。', '先點好，再開始談。', `${at(90)} 前談完。`])
      if (scene === '等人') return base(name, ['點一杯。', '坐 20 分鐘，不滑手機。', `${at(20)} 前起身。`])
      return base(name, ['點一杯熱的。', '坐 30 分鐘。', '手機面朝下。'])
    case 'go': {
      // Round 10 X2：地點由伺服器查（pick），模板不再寫死「附近公園」。單程只講使用者選的上限，不編車程。
      const how = TRANSPORT_HEAD[transportOf(req.choices ?? {})]
      const m = minutesOf(req.choices ?? {})
      if (rescue) return base(name, [`${how}單程 ${m} 分內。`, '買一杯熱的。', `${at(m * 2 + 15)} 前回家。`])
      return base(name || '出門走一圈', [`${how}單程 ${m} 分內。`, '到了走一圈，手機收起來。', `${at(m * 2 + 60)} 前回家。`])
    }
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
