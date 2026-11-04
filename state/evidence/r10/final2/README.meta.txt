Round 10 最終測試版實測（合併版全部六條線＋lane 翻 verified）
deployment: dpl_5ytjQPv8XEdqGgFyme9hY9atrDzw（git preview，commit 581a000）
host: general-decision-mohauuinv-cc4wang-uis-projects.vercel.app
取得方式：mcp__Vercel__get_access_to_vercel_url 分享連結 → curl 帶 cookie（state/handoff-tools/preview-measure.sh）
時間：2026-11-04 00:03–00:05 UTC（東京 09:03–09:05）
- scene-shinjuku／scene-xinyi：各 12/12；r10-check 派錯 0、外帶酒吧 0、約會酒吧 0、歇還沒開 0、到店已關 0
- go-shinjuku：4/4，四種交通指紋不同
- daily-gps：POST 帶 origin 座標（新宿駅）→ 200，origin「目前位置」，兩站都在新宿附近（35.68x, 139.69x–139.70x）
- daily-text：POST location「渋谷駅」→ 200，三站在澀谷（與 Round 9 相同 place id）
- daily-bad：origin lat 91 → 400 bad_origin
- place-photo.txt：daily-gps 兩站照片
- 首頁 JS：/assets/index-COfU0ckM.js（= 本機 581a000 build）；GET /api/order、/api/weekly、/api/daily-route 各 405
- 前一版 7931b8d 的實測（含 lanes 東京 83／信義 92 全 200）在 state/evidence/r10/final/
