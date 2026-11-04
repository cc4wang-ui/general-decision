// Vercel Function：/api/order。實作在 src/orderHandler.ts（api/probe.ts 也要用同一份；
// Vercel 的 dependency tracing 只保證 vercel.json includeFiles 的 src/** 進 lambda，api/ 互相 import 不保證）。
import { handleOrder } from '../src/orderHandler.ts'

export { placesLanguage, sanitizeRequest, withPlace } from '../src/orderHandler.ts'

export const config = { runtime: 'nodejs' }

// Vercel 的 Node runtime 只要看到「函式型的 export default」就走舊式 (req, res) => void：
// 回傳的 Response 直接丟棄、請求永遠掛住，而且具名 export 完全不被理會。
// 正式站實測過——只加 GET/POST、default 仍是函式時，log 照樣是
// 「default export returned a `Response`」、狀態碼 0。所以 default 必須是物件形式的
// fetch handler，不能是函式。具名 GET/POST 一併保留：文件把兩者都列為合法入口。
// 一律只傳 request：Vercel 可能在第二個參數塞 context，不能被當成 OrderIo。
export function GET(request: Request): Promise<Response> { return handleOrder(request) }
export function POST(request: Request): Promise<Response> { return handleOrder(request) }
export default { fetch: (request: Request): Promise<Response> => handleOrder(request) }
