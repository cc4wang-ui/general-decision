R9 測試版（合併版）真資料證據
deployment: dpl_28ffDkpeN5VRGgPMsGgP3VuWB9pp（git preview，分支 claude/nifty-ramanujan-szofu5，commit 984645e）
host: general-decision-5w50ysoee-cc4wang-uis-projects.vercel.app
取得方式：mcp__Vercel__get_access_to_vercel_url 建分享連結 → curl 帶 _vercel_jwt cookie
時間：2026-11-03 13:47 UTC（東京 22:47）
- scene-shinjuku.json／.headers.txt：GET /api/probe?mode=scene&loc=shinjuku，200，x-vercel-id iad1::iad1::vg7l6-1793713628678-d90a04bcee9d
- daily-route.request.json／.json／.headers.txt：POST /api/daily-route，200，x-vercel-id iad1::iad1::dsvdh-1793713632314-e04b7d5873fe
- place-photo.txt：GET /api/place-photo?placeId=<daily-route 回的 3 個 id>，各 200，回 attributions／photoUrl／source（不存 photoUrl 本身）
- 首頁：/assets/index-BZa8PEbl.js（= 本機 984645e build）；該 JS 含「今日行程」「一個人放空」「工作讀書」「你在車上」「外帶」「固定」各 ≥1
- /api/order GET 405、/api/weekly GET 405
