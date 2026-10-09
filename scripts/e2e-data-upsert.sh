#!/usr/bin/env bash
# E2E: DATA_UPSERT 三态验证（created/updated/unchanged + id 稳定 + version 自增）
# 目标表单: upsert_e2e（code 唯一索引 + qty/note 业务列），由前置步骤准备
set -uo pipefail
BASE=http://127.0.0.1:8080

j() { python3 -c "import json,sys; d=json.load(sys.stdin); print($1)" 2>/dev/null; }

TOKEN=$(curl -s --max-time 6 -X POST -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"admin123"}' $BASE/api/auth/login | j "d['data']['accessToken']")
[ -z "$TOKEN" ] && { echo "LOGIN-FAIL"; exit 1; }
AUTH="Authorization: Bearer $TOKEN"
XTE="X-Tenant-Id: default"
TARGET=upsert_e2e; CONFLICT=code

echo "== 1) 建草稿流（START -> DATA_UPSERT -> END） =="
KEY="upsert_e2e_$(date +%s)"
FID=$(curl -s --max-time 6 -X POST -H "$AUTH" -H "$XTE" -H 'Content-Type: application/json' \
  -d "{\"key\":\"$KEY\",\"name\":\"upsert E2E\",\"description\":\"DATA_UPSERT 三态验证\"}" \
  "$BASE/api/v1/logic-flows" | j "d['data']['id']")
echo "flow id=$FID key=$KEY"

DSL=$(cat <<EOF
{"nodes":[
 {"id":"start","type":"START","name":"开始","x":100,"y":200},
 {"id":"up1","type":"DATA_UPSERT","name":"写入记录","x":320,"y":200,
  "config":{"formKey":"$TARGET","conflictKey":"$CONFLICT",
    "values":[{"column":"$CONFLICT","value":"{{kv}}"},{"column":"qty","value":"{{qty}}"},{"column":"note","value":"run-{{kv}}-n{{n}}"}]}},
 {"id":"end","type":"END","name":"结束","x":540,"y":200}],
 "edges":[
  {"id":"e1","source":"start","target":"up1"},
  {"id":"e2","source":"up1","target":"end"}],
 "inputVars":[{"name":"kv","type":"string","required":true,"desc":"冲突键值"},
              {"name":"qty","type":"number","required":false,"desc":"数量"},
              {"name":"n","type":"number","required":false,"desc":"轮次"}]}
EOF
)

echo "== 2) 保存 DSL =="
CODE=$(curl -s --max-time 8 -X PUT -H "$AUTH" -H "$XTE" -H 'Content-Type: application/json' \
  -d "$(python3 -c "import json,sys;print(json.dumps({'dsl':sys.argv[1]}))" "$DSL")" \
  "$BASE/api/v1/logic-flows/$FID" | j "d.get('code')")
echo "save code=$CODE"

echo "== 3) 发布 =="
PUB=$(curl -s --max-time 8 -X POST -H "$AUTH" -H "$XTE" "$BASE/api/v1/logic-flows/$FID/publish")
echo "publish: $(echo "$PUB" | j "str(d.get('code'))+' '+str(d.get('msg'))[:80]")"

echo "== 4) 运行三连（期望 created -> updated -> unchanged） =="
for i in 1 2 3; do
  R=$(curl -s --max-time 15 -X POST -H "$AUTH" -H "$XTE" -H 'Content-Type: application/json' \
    -d "{\"vars\":{\"kv\":\"e2e-sku-001\",\"qty\":$i,\"n\":$i}}" "$BASE/api/v1/logic-flows/$FID/run")
  echo "run#$i: $(echo "$R" | j "str(d.get('code'))+' '+str((d.get('data') or {}).get('status'))+' up1='+str(((((d.get('data') or {}).get('output') or {}).get('up1')) or {}))")"
done

echo "== 5) 换值再跑（应 updated，note 刷新） =="
R=$(curl -s --max-time 15 -X POST -H "$AUTH" -H "$XTE" -H 'Content-Type: application/json' \
  -d '{"vars":{"kv":"e2e-sku-001","qty":99,"n":4}}' "$BASE/api/v1/logic-flows/$FID/run")
echo "run#4: $(echo "$R" | j "str(d.get('code'))+' '+str((d.get('data') or {}).get('status'))+' up1='+str(((((d.get('data') or {}).get('output') or {}).get('up1')) or {}))")"
