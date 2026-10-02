#!/bin/bash
# 主页仪表盘页面重建（幂等）——Task 130e
#
# 背景：pageKey=dashboard 的 form-create 仪表盘页（Task 119 创建）随 MariaDB 卷
# 回退从双库消失（v6 与 workflow 均无），前端 DashboardRouterPage 因查不到
# 已发布页面而回退静态首页，导致最新的仪表盘组件族（dash-kpi/dash-chart）
# 全部不可见。本脚本从仓库留档 schema 一键重建：创建 → 保存 schema → 发布 →
# 挂接菜单（path=/page/dashboard 是后端 getByKey 的可见性前提）。
#
# 用法: bash scripts/recreate-dashboard-page.sh [BASE_URL]
#   BASE_URL 缺省 http://localhost:8080（Java 引擎直连）
# 幂等：页面已发布则跳过；页面在但菜单丢失则只补挂菜单。
set -euo pipefail

BASE="${1:-http://localhost:8080}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCHEMA_FILE="$SCRIPT_DIR/dashboard-page.schema.json"

command -v jq >/dev/null 2>&1 || { echo "[dash] 需要 jq"; exit 1; }
[ -f "$SCHEMA_FILE" ] || { echo "[dash] 缺少留档 schema: $SCHEMA_FILE"; exit 1; }

TENANT="default"
API="$BASE/api/v1"

# ---- 登录 ----
TOKEN=$(curl -s -m 15 -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"admin123"}' \
  | jq -r '.data.accessToken // .data.token // empty')
[ -n "$TOKEN" ] || { echo "[dash] 登录失败"; exit 1; }
AUTH=(-H "Authorization: Bearer $TOKEN" -H "X-Tenant-Id: $TENANT" -H 'Content-Type: application/json')

# ---- 现状检查 ----
DEF=$(curl -s -m 15 "${AUTH[@]}" "$API/pages/dashboard/definition" || true)
STATUS=$(echo "$DEF" | jq -r '.data.status // "ABSENT"')
MENUS=$(echo "$DEF" | jq -r '( .data and (.data | keys | index("key")) ) ? 1 : 0' 2>/dev/null || echo 0)

if [ "$STATUS" = "PUBLISHED" ]; then
  echo "[dash] dashboard 页已存在且已发布，检查菜单挂接…"
  MENU_COUNT=$(curl -s -m 15 "${AUTH[@]}" "$API/pages/dashboard/menus" | jq -r '.data.items | length')
  if [ "$MENU_COUNT" -gt 0 ]; then
    echo "[dash] 完成：页面已发布 + $MENU_COUNT 条挂接菜单，无需重建"
    exit 0
  fi
  PAGE_ID=$(echo "$DEF" | jq -r '.data.id')
  echo "[dash] 菜单丢失，补挂菜单…"
  curl -s -m 15 -X POST "${AUTH[@]}" "$API/pages/$PAGE_ID/mount-menu" \
    -d '{"name":"主页仪表盘","parentId":null}' | jq -r '.data'
  echo "[dash] 完成：菜单已补挂"
  exit 0
fi

if [ "$STATUS" != "ABSENT" ] && [ "$STATUS" != "404" ]; then
  # DRAFT（创建过但没发布）：复用该行，走 schema+publish
  PAGE_ID=$(echo "$DEF" | jq -r '.data.id // empty')
  echo "[dash] 发现未发布草稿 id=$PAGE_ID，继续保存 schema 并发布…"
fi

# ---- 创建页面（create 不收 schema，schema 走 PUT）----
if [ -z "${PAGE_ID:-}" ]; then
  PAGE_ID=$(curl -s -m 15 -X POST "${AUTH[@]}" "$API/pages" \
    -d '{"name":"主页仪表盘","key":"dashboard","type":"PAGE"}' \
    | jq -r '.data.id // empty')
  [ -n "$PAGE_ID" ] || { echo "[dash] 创建页面失败"; exit 1; }
  echo "[dash] 页面已创建 id=$PAGE_ID"
fi

# ---- 保存 schema（PUT 全量保存请求体）----
python3 - "$SCHEMA_FILE" << 'PYEOF' > /tmp/dash-put-body.json
import json, sys
schema = json.load(open(sys.argv[1]))
body = {"name": "主页仪表盘", "key": "dashboard", "type": "PAGE",
        "formKey": None, "dataSourceId": None,
        "schema": json.dumps(schema, ensure_ascii=False)}
json.dump(body, open("/tmp/dash-put-body.json", "w"), ensure_ascii=False)
PYEOF
curl -s -m 15 -X PUT "${AUTH[@]}" "$API/pages/$PAGE_ID" \
  -d @/tmp/dash-put-body.json | jq -r '.msg'

# ---- 发布 ----
PUB=$(curl -s -m 15 -X POST "${AUTH[@]}" "$API/pages/$PAGE_ID/publish")
PUB_STATUS=$(echo "$PUB" | jq -r '.data.status // "FAIL"')
[ "$PUB_STATUS" = "PUBLISHED" ] || { echo "[dash] 发布失败: $PUB"; exit 1; }
echo "[dash] 已发布 (version=$(echo "$PUB" | jq -r '.data.publishedVersion'))"

# ---- 挂接菜单（getByKey 依赖 sys_menu.path=/page/dashboard 反查）----
MENU=$(curl -s -m 15 -X POST "${AUTH[@]}" "$API/pages/$PAGE_ID/mount-menu" \
  -d '{"name":"主页仪表盘","parentId":null}')
echo "[dash] 菜单挂接: $(echo "$MENU" | jq -r '.data | {menuId, menuName, path, permission}')"

# ---- 终验 ----
FINAL=$(curl -s -m 15 "${AUTH[@]}" "$API/pages/dashboard/definition")
echo "[dash] 终验: status=$(echo "$FINAL" | jq -r '.data.status') schema_len=$(echo "$FINAL" | jq -r '.data.schema | length')"
echo "[dash] 完成：浏览器打开首页即可看到 form-create 仪表盘（4 组件）"
