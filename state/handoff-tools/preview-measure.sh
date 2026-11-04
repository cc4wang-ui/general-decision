#!/usr/bin/env bash
# 對有登入保護的 Vercel 測試版做真資料量測（Round 9 起）。
# 先用 mcp__Vercel__get_access_to_vercel_url 拿分享連結（含 _vercel_share=…），再跑：
#   bash state/handoff-tools/preview-measure.sh <分享連結> <輸出目錄> [name]
# 會存：<name>.json、<name>.headers.txt、<name>.meta.txt（URL、時間、x-vercel-id、HTTP 狀態）。
# name 預設 scene-shinjuku；可傳 "scene-shinjuku" 或任何 probe 參數組合，見下方 PATHS。
set -euo pipefail
SHARE="$1"; OUT="$2"; NAME="${3:-scene-shinjuku}"
BASE="${SHARE%%/?*}"; BASE="${SHARE%%\?*}"; BASE="${BASE%/}"
JAR="$(mktemp)"; trap 'rm -f "$JAR"' EXIT
mkdir -p "$OUT"
curl -sS -m 30 -c "$JAR" -o /dev/null "$SHARE"
case "$NAME" in
  scene-*) PATHQ="/api/probe?mode=scene&loc=${NAME#scene-}" ;;
  go-*) PATHQ="/api/probe?mode=go&loc=${NAME#go-}" ;;
  lanes-*) PATHQ="/api/probe?mode=lanes&loc=${NAME#lanes-}" ;;
  *) echo "不認得的 name：$NAME" >&2; exit 2 ;;
esac
CODE=$(curl -sS -m 180 -b "$JAR" -D "$OUT/$NAME.headers.txt" -o "$OUT/$NAME.json" -w '%{http_code}' "$BASE$PATHQ")
{
  echo "URL: $BASE$PATHQ"
  echo "fetched: curl（分享連結 cookie）"
  echo "date: $(date -u '+%F %T UTC')（東京 $(TZ=Asia/Tokyo date '+%H:%M')）"
  echo "status: $CODE"
  grep -i '^x-vercel-id' "$OUT/$NAME.headers.txt" || true
} > "$OUT/$NAME.meta.txt"
cat "$OUT/$NAME.meta.txt"
