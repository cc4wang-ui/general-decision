// 台灣情境用語守門 — DEV-PLAN-2 階段 D。
// prompt 是盡力，這裡才是保證：模型輸出裡混進的中國用語 / 解放軍編制用語，在這裡就地替換。
// 純資料 + 純函式，不碰商業規則（那是 rules.ts 的事）。
// Round 3（DEV-PLAN-3 B2）：加 country。人在日本時「地鐵」不該被換成「捷運」，反而要把「捷運」改成當地說法。
import type { Country } from './types.ts'

export interface LocaleRule {
  /** 命中什麼。字串 = 全文替換；RegExp 必須帶 g flag。 */
  from: string | RegExp
  to: string
  note?: string
}

/**
 * ① 簡→繁轉換殘留的中國用語 → 台灣用語。
 * 只做詞彙層替換，接受少數誤判（例：「質量守恆」會變「品質守恆」）。
 * 已知誤判列在 tests/unit/locale.test.ts 當文件，不在這裡加語境判斷。
 */
export const CN_TO_TW: LocaleRule[] = [
  { from: '質量', to: '品質' },
  { from: '視頻', to: '影片' },
  { from: '信息', to: '訊息' },
  { from: '屏幕', to: '螢幕' },
  { from: '默認', to: '預設' },
  { from: '用戶', to: '使用者' },
  { from: '激活', to: '啟用' },
  { from: '軟件', to: '軟體' },
  { from: '網絡', to: '網路' },
  { from: '出租車', to: '計程車' },
  { from: '自行車', to: '腳踏車' },
  { from: '盒飯', to: '便當' },
  { from: '地鐵', to: '捷運' },
  // 「早點」在台灣是副詞（早點睡、早點去），只有當名詞（吃早點、早點店）才是中國用語。
  // 所以只抓名詞用法，不抓「早點睡」—— sleep 模組天天會講這句。
  { from: /(吃|買|賣|做|準備|一份|一頓)早點/g, to: '$1早餐', note: '名詞用法' },
  { from: /早點(店|攤|鋪)/g, to: '早餐$1', note: '名詞用法' },
]

/**
 * ② 語境不對的軍事用語：解放軍編制 → 國軍編制。
 * 指導員 / 政委 在國軍對應連輔導長（政戰）；決斷連的敘事是陸軍軍教片，一律改成輔導長。
 */
export const PLA_TO_ROC: LocaleRule[] = [
  { from: '政治指導員', to: '輔導長' },
  { from: '指導員', to: '輔導長' },
  { from: '政委', to: '輔導長' },
]

/**
 * ①′ 人在台灣：日本說法的「地下鐵」也換成「捷運」（R3 修正 S-8／checker B12）。
 * 不放進 CN_TO_TW：人在日本時「地下鐵」是對的（JP_TRANSIT 甚至會把「地鐵」換成它），日本規則不能套到。
 */
export const TW_TRANSIT: LocaleRule[] = [
  { from: '地下鐵', to: '捷運' },
]

export const LOCALE_RULES: LocaleRule[] = [...CN_TO_TW, ...TW_TRANSIT, ...PLA_TO_ROC]

/** ③ 人在日本：台灣專有的交通詞換成當地說法（介面仍是台灣繁中，只是不講錯地方）。 */
export const JP_TRANSIT: LocaleRule[] = [
  { from: '地鐵', to: '地下鐵' },
  { from: '捷運站', to: '車站' },
  { from: '捷運', to: '電車' },
]

/** 依所在國家取規則：日本不套「地鐵→捷運」「地下鐵→捷運」，改套 JP_TRANSIT；其餘國家照台灣規則。 */
export function rulesFor(country: Country = 'TW'): LocaleRule[] {
  if (country !== 'JP') return LOCALE_RULES
  return [...CN_TO_TW.filter((r) => r.from !== '地鐵'), ...PLA_TO_ROC, ...JP_TRANSIT]
}

export interface LocalizeResult {
  text: string
  /** 命中的規則（以 from 的字串形式列出），空陣列 = 原樣通過。 */
  hits: string[]
}

/** 掃一段文字。乾淨輸入必須原樣回傳（同一個字串，一個字都不動）。 */
export function localizeText(text: string, country: Country = 'TW'): LocalizeResult {
  const hits: string[] = []
  let out = text
  for (const rule of rulesFor(country)) {
    if (typeof rule.from === 'string') {
      if (out.includes(rule.from)) { hits.push(rule.from); out = out.split(rule.from).join(rule.to) }
    } else {
      rule.from.lastIndex = 0
      if (rule.from.test(out)) { hits.push(rule.from.source); rule.from.lastIndex = 0; out = out.replace(rule.from, rule.to) }
    }
  }
  return { text: out, hits }
}

/**
 * 掃一個物件裡指定路徑的字串欄位，就地替換並回傳命中清單。
 * 只動有命中的欄位；沒命中就回傳原物件（reference 相同），讓呼叫端零成本判斷。
 */
export function localizeFields<T extends object>(obj: T, paths: (keyof T & string)[], country: Country = 'TW'): { value: T; hits: string[] } {
  const hits: string[] = []
  let out: T = obj
  for (const key of paths) {
    const v = obj[key] as unknown
    if (typeof v === 'string') {
      const r = localizeText(v, country)
      if (r.hits.length) { hits.push(...r.hits.map((h) => `${key}:${h}`)); out = { ...out, [key]: r.text } }
    } else if (Array.isArray(v) && v.every((s) => typeof s === 'string')) {
      let changed = false
      const arr = (v).map((s) => {
        const r = localizeText(s, country)
        if (r.hits.length) { changed = true; hits.push(...r.hits.map((h) => `${key}[]:${h}`)) }
        return r.text
      })
      if (changed) out = { ...out, [key]: arr }
    }
  }
  return { value: out, hits }
}

/**
 * 模型永遠不准產生 URL（DEV-PLAN-2 規則 8）。
 * 文字欄位裡的 http(s):// 一律拔掉——連結只能在伺服器端用 Places 真實資料組出來（withPlace）。
 */
const URL_RE = /https?:\/\/[^\s"'<>）)]+/g

export function stripUrls(text: string): { text: string; hits: number } {
  const found = text.match(URL_RE)
  if (!found) return { text, hits: 0 }
  return { text: text.replace(URL_RE, '').replace(/[ \t]{2,}/g, ' ').trim(), hits: found.length }
}
