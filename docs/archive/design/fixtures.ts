import type { Order, WeeklyReport } from "../src/types.ts"
export const WEEKLY: WeeklyReport = {
  weekStart: '2026-09-07T00:00:00.000Z',
  level: 1,
  stats: { orders: 11, complianceRate: 82, punishments: 2, weakestModule: 'rest' },
  body: '本週十一道口令，九道完成，兩次罰則。\n\n發現規律了沒？你只在「不用出門」的事情上偷懶。餐廳你去了，飯局你去了，象山你也爬了。\n\n下週歇的口令改成「站起來再說」。',
  verdict: '本週講評：合格。屁股記過一次。',
}
export const EAT: Order = {
  verdict: 'do',
  meme: { top: '去吃熱的', big: '阿財魯肉飯', bot: '這週兩天超商了' },
  steps: ['步行 6 分鐘，營業到 21:00。', '魯肉飯、滷蛋、燙青菜。', '12 分鐘吃完，手機收起來。'],
  place: { id: 'p1', name: '阿財魯肉飯', walkMin: 6, openUntil: '21:00' },
  log: '12:41 魯肉飯，12:58 完成。',
}
export const BUY: Order = {
  verdict: 'stop',
  meme: { top: '本週第二次猶豫', big: '不買。', bot: '72 小時後再來報告' },
  steps: ['關掉頁面。', '72 小時後還想要，再來報告。'],
  log: '不買，頁面已關。',
}
