#!/bin/bash
# E2E 验证：SCRIPT 节点 outputs 多输出（双轨）功能
# 用例：1) 正例：outputs 平铺 + resultVar 整包 + CONDITION 引用平铺变量
#       2) 反例A：outputs 与 resultVar 同名 → 发布被校验器拦截
#       3) 反例B：配 outputs 但脚本返回标量 → run FAILED 且报错文案明确
set -u
BASE="http://127.0.0.1:8080/api/v1/logic-flows"
TS=$(date +%s)
KEY="multioutput_e2e_${TS}"
pass=0; fail=0

TOKEN=$(curl -s --max-time 10 -X POST -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"admin123"}' http://127.0.0.1:8080/api/auth/login \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['accessToken'])")
[ -z "$TOKEN" ] && { echo '登录失败'; exit 1; }

A() { curl -s --max-time 15 -H "X-Tenant-Id: default" -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" "$@"; }

jqget() { python3 -c "import sys,json;d=json.load(sys.stdin);print(eval(sys.argv[1]))" "$2" 2>/dev/null <<<"$1"; }

echo "== 1) 创建流 $KEY =="
CREATE=$(A -X POST "$BASE" -d "{\"key\":\"$KEY\",\"name\":\"多输出E2E\",\"description\":\"outputs 双轨验证\"}")
FID=$(jqget "$CREATE" "d['data']['id']")
[ -z "$FID" ] && { echo "创建失败: $CREATE"; exit 1; }
echo "flowId=$FID"

cat > /tmp/dsl_mo.json <<'EOF'
{
  "nodes": [
    {"id":"start1","type":"START","name":"开始","x":100,"y":160},
    {"id":"s1","type":"SCRIPT","name":"多输出脚本","x":300,"y":160,
     "config":{"language":"groovy","source":"def lv = score > 60 ? 'HIGH' : 'LOW'\ndef rt = total == 0 ? 0 : (passCount / total)\n[outLevel: lv, outRatio: rt, hits: ['r1','r2']]"},
     "resultVar":"scriptOut",
     "outputs":[{"name":"outLevel","type":"string","desc":"风险等级"},{"name":"outRatio","type":"number"},{"name":"hits","type":"json"}],
     "errorAction":"FAIL_FLOW"},
    {"id":"c1","type":"CONDITION","name":"等级判断","x":520,"y":160,
     "config":{"variable":"outLevel","operator":"EQ","value":"HIGH"}},
    {"id":"end1","type":"END","name":"高分支","x":720,"y":80},
    {"id":"end2","type":"END","name":"低分支","x":720,"y":260}
  ],
  "edges": [
    {"id":"e1","source":"start1","target":"s1"},
    {"id":"e2","source":"s1","target":"c1"},
    {"id":"e3","source":"c1","target":"end1","branch":"true"},
    {"id":"e4","source":"c1","target":"end2","branch":"false"}
  ],
  "inputVars":[{"name":"score","type":"number","required":true},{"name":"total","type":"number","required":true},{"name":"passCount","type":"number","required":true}]
}
EOF
UPD=$(A -X PUT "$BASE/$FID" -d "{\"dsl\":$(python3 -c 'import json;print(json.dumps(open("/tmp/dsl_mo.json").read()))')}")
echo "更新DSL: status=$(jqget "$UPD" "d['data']['status']")"

echo "== 2) 发布 =="
PUB=$(A -X POST "$BASE/$FID/publish")
PUB_STATUS=$(jqget "$PUB" "d['data']['status']")
echo "发布结果: $PUB_STATUS"
if [ "$PUB_STATUS" = "PUBLISHED" ]; then pass=$((pass+1)); else fail=$((fail+1)); echo "FAIL: $PUB"; fi

echo "== 3) 运行（score=80,total=200,passCount=150）=="
RUN=$(A -X POST "$BASE/$FID/run" -d '{"vars":{"score":80,"total":200,"passCount":150}}')
echo "$RUN" > /tmp/run_mo.json
STATUS=$(jqget "$RUN" "d['data']['status']")
OUTLEVEL=$(jqget "$RUN" "d['data']['outputVars']['outLevel']")
echo "status=$STATUS outLevel=$OUTLEVEL"
if [ "$STATUS" = "SUCCESS" ] && [ "$OUTLEVEL" = "HIGH" ]; then pass=$((pass+1)); else fail=$((fail+1)); echo "FAIL 基础运行: $(echo "$RUN" | head -c 400)"; fi

python3 - /tmp/run_mo.json <<'PYEOF'
import sys, json
d = json.load(open(sys.argv[1]))["data"]
ok = True
ov = d.get("outputVars") or {}
if ov.get("outLevel") != "HIGH": print("FAIL outLevel:", ov.get("outLevel")); ok = False
if abs((ov.get("outRatio") or 0) - 0.75) > 1e-9: print("FAIL outRatio:", ov.get("outRatio")); ok = False
hits = ov.get("hits")
if not (isinstance(hits, list) and hits == ["r1", "r2"]): print("FAIL hits:", hits); ok = False
sout = ov.get("scriptOut")
if not (isinstance(sout, dict) and sout.get("outLevel") == "HIGH" and abs((sout.get("outRatio") or 0) - 0.75) < 1e-9):
    print("FAIL scriptOut 整包:", sout); ok = False
traces = d.get("traces") or []
c1 = next((t for t in traces if t.get("nodeId") == "c1"), None)
if not c1 or c1.get("result") != "true":
    print("FAIL CONDITION 走向:", c1); ok = False
print("用例1 平铺变量+整包双轨+CONDITION引用平铺变量:", "PASS" if ok else "FAIL")
sys.exit(0 if ok else 1)
PYEOF
[ $? -eq 0 ] && pass=$((pass+1)) || fail=$((fail+1))

echo "== 4) 反例A：outputs 与 resultVar 同名 → 发布拦截 =="
FID2=$(jqget "$(A -X POST "$BASE" -d "{\"key\":\"mo_dup_${TS}\",\"name\":\"同名拦截\"}")" "d['data']['id']")
cat > /tmp/dsl_dup.json <<'EOF'
{
  "nodes": [
    {"id":"start1","type":"START","name":"开始","x":100,"y":160},
    {"id":"s1","type":"SCRIPT","name":"脚本","x":300,"y":160,
     "config":{"language":"groovy","source":"[a: 1]"},
     "resultVar":"outA",
     "outputs":[{"name":"outA","type":"number"}]},
    {"id":"end1","type":"END","name":"结束","x":720,"y":160}
  ],
  "edges": [{"id":"e1","source":"start1","target":"s1"},{"id":"e2","source":"s1","target":"end1"}]
}
EOF
A -X PUT "$BASE/$FID2" -d "{\"dsl\":$(python3 -c 'import json;print(json.dumps(open("/tmp/dsl_dup.json").read()))')}" > /dev/null
PUB2=$(A -X POST "$BASE/$FID2/publish")
PUB2_MSG=$(echo "$PUB2" | head -c 400)
echo "发布响应: $PUB2_MSG"
if echo "$PUB2_MSG" | grep -q "同名"; then pass=$((pass+1)); else fail=$((fail+1)); echo "FAIL 未拦截"; fi

echo "== 5) 反例B：配 outputs 但返回标量 → run FAILED =="
FID3=$(jqget "$(A -X POST "$BASE" -d "{\"key\":\"mo_scalar_${TS}\",\"name\":\"标量报错\"}")" "d['data']['id']")
cat > /tmp/dsl_scalar.json <<'EOF'
{
  "nodes": [
    {"id":"start1","type":"START","name":"开始","x":100,"y":160},
    {"id":"s1","type":"SCRIPT","name":"标量脚本","x":300,"y":160,
     "config":{"language":"groovy","source":"42"},
     "outputs":[{"name":"outNum","type":"number"}]},
    {"id":"end1","type":"END","name":"结束","x":720,"y":160}
  ],
  "edges": [{"id":"e1","source":"start1","target":"s1"},{"id":"e2","source":"s1","target":"end1"}]
}
EOF
A -X PUT "$BASE/$FID3" -d "{\"dsl\":$(python3 -c 'import json;print(json.dumps(open("/tmp/dsl_scalar.json").read()))')}" > /dev/null
A -X POST "$BASE/$FID3/publish" > /dev/null
RUN3=$(A -X POST "$BASE/$FID3/run" -d '{"vars":{}}')
RUN3_STATUS=$(jqget "$RUN3" "d['data']['status']")
RUN3_ERR=$(jqget "$RUN3" "d['data']['errorMessage'] or ''")
echo "运行: status=$RUN3_STATUS err=${RUN3_ERR:0:150}"
if [ "$RUN3_STATUS" = "FAILED" ] && echo "$RUN3_ERR" | grep -q "未返回 Map"; then pass=$((pass+1)); else fail=$((fail+1)); echo "FAIL: $(echo "$RUN3" | head -c 400)"; fi

echo "== 6) 清理测试流 =="
for id in $FID $FID2 $FID3; do A -X DELETE "$BASE/$id" > /dev/null && echo "deleted $id"; done

echo ""
echo "======== E2E 结果: PASS=$pass FAIL=$fail ========"
[ $fail -eq 0 ] && echo "ALL GREEN" || echo "HAS FAILURES"
