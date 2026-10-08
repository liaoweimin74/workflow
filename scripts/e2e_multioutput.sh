#!/bin/bash
# E2E 验证：SCRIPT 节点统一输出模型 results:[{name, mode: WHOLE|KEY, ...}]（单表，无 resultVar 双轨）
# 正例：1) KEY 拆包+CONDITION 引用  2) WHOLE 标量  3) 混排 WHOLE+KEY  4) null WHOLE 跳过
# 反例：5) SCRIPT 带 resultVar 发布拦截  6) 输出名重复发布拦截  7) 缺 mode 发布拦截
#       8) KEY 声明但返回标量 → run FAILED
# 回归：9) BATCH 循环体 SCRIPT 步骤 results（childVars 展开，末次迭代胜出）
set -u
BASE="http://127.0.0.1:8080/api/v1/logic-flows"
TS=$(date +%s)
pass=0; fail=0

TOKEN=$(curl -s --max-time 10 -X POST -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"admin123"}' http://127.0.0.1:8080/api/auth/login \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['accessToken'])")
[ -z "$TOKEN" ] && { echo '登录失败'; exit 1; }

A() { curl -s --max-time 15 -H "X-Tenant-Id: default" -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" "$@"; }

jqget() { python3 -c "import sys,json;d=json.load(sys.stdin);print(eval(sys.argv[1]))" "$2" 2>/dev/null <<<"$1"; }

mkflow() { # $1=key $2=name → flowId
  jqget "$(A -X POST "$BASE" -d "{\"key\":\"$1\",\"name\":\"$2\"}")" "d['data']['id']"
}
putdsl() { # $1=flowId $2=dsl文件
  A -X PUT "$BASE/$1" -d "{\"dsl\":$(python3 -c 'import json,sys;print(json.dumps(open(sys.argv[1]).read()))' "$2")}"
}

echo "== 1) 正例：KEY 拆包 + CONDITION 引用平铺变量 =="
F1=$(mkflow "results_e2e_${TS}" "results拆包")
cat > /tmp/dsl_r1.json <<'EOF'
{
  "nodes": [
    {"id":"start1","type":"START","name":"开始","x":100,"y":160},
    {"id":"s1","type":"SCRIPT","name":"多输出脚本","x":300,"y":160,
     "config":{"language":"groovy","source":"def lv = score > 60 ? 'HIGH' : 'LOW'\ndef rt = total == 0 ? 0 : (passCount / total)\n[outLevel: lv, outRatio: rt, hits: ['r1','r2']]"},
     "results":[{"name":"outLevel","mode":"KEY","type":"string","desc":"风险等级"},{"name":"outRatio","mode":"KEY","type":"number"},{"name":"hits","mode":"KEY","type":"json"}],
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
putdsl "$F1" /tmp/dsl_r1.json > /dev/null
P1=$(jqget "$(A -X POST "$BASE/$F1/publish")" "d['data']['status']")
RUN1=$(A -X POST "$BASE/$F1/run" -d '{"vars":{"score":80,"total":200,"passCount":150}}')
echo "$RUN1" > /tmp/run_r1.json
S1=$(jqget "$RUN1" "d['data']['status']")
python3 - /tmp/run_r1.json <<'PYEOF'
import sys, json
d = json.load(open(sys.argv[1]))["data"]
ov = d.get("outputVars") or {}
ok = d.get("status") == "SUCCESS"
if ov.get("outLevel") != "HIGH": print("FAIL outLevel:", ov.get("outLevel")); ok = False
if abs((ov.get("outRatio") or 0) - 0.75) > 1e-9: print("FAIL outRatio:", ov.get("outRatio")); ok = False
if ov.get("hits") != ["r1", "r2"]: print("FAIL hits:", ov.get("hits")); ok = False
if "scriptOut" in ov: print("FAIL 不应再写 resultVar 整包:", ov.get("scriptOut")); ok = False
c1 = next((t for t in (d.get("traces") or []) if t.get("nodeId") == "c1"), None)
if not c1 or c1.get("result") != "true": print("FAIL CONDITION 走向:", c1); ok = False
print("用例1 KEY拆包+CONDITION引用:", "PASS" if ok else "FAIL")
sys.exit(0 if ok else 1)
PYEOF
[ $? -eq 0 ] && pass=$((pass+1)) || fail=$((fail+1))

echo "== 2) 正例：WHOLE 标量 =="
F2=$(mkflow "results_w_${TS}" "WHOLE标量")
cat > /tmp/dsl_r2.json <<'EOF'
{
  "nodes": [
    {"id":"start1","type":"START","name":"开始","x":100,"y":160},
    {"id":"s1","type":"SCRIPT","name":"标量脚本","x":300,"y":160,
     "config":{"language":"groovy","source":"score * 2"},
     "results":[{"name":"doubled","mode":"WHOLE","type":"number","desc":"入参翻倍"}]},
    {"id":"end1","type":"END","name":"结束","x":520,"y":160}
  ],
  "edges": [{"id":"e1","source":"start1","target":"s1"},{"id":"e2","source":"s1","target":"end1"}],
  "inputVars":[{"name":"score","type":"number","required":true}]
}
EOF
putdsl "$F2" /tmp/dsl_r2.json > /dev/null
A -X POST "$BASE/$F2/publish" > /dev/null
RUN2=$(A -X POST "$BASE/$F2/run" -d '{"vars":{"score":80}}')
S2=$(jqget "$RUN2" "d['data']['status']"); D2=$(jqget "$RUN2" "d['data']['outputVars']['doubled']")
echo "status=$S2 doubled=$D2"
if [ "$S2" = "SUCCESS" ] && [ "$D2" = "160" ]; then pass=$((pass+1)); else fail=$((fail+1)); echo "FAIL: $(echo "$RUN2" | head -c 300)"; fi

echo "== 3) 正例：混排 WHOLE+KEY 同表 =="
F3=$(mkflow "results_mix_${TS}" "混排")
cat > /tmp/dsl_r3.json <<'EOF'
{
  "nodes": [
    {"id":"start1","type":"START","name":"开始","x":100,"y":160},
    {"id":"s1","type":"SCRIPT","name":"混排脚本","x":300,"y":160,
     "config":{"language":"groovy","source":"[a: 1, b: 2]"},
     "results":[{"name":"wholeMap","mode":"WHOLE","type":"json","desc":"整包"},{"name":"a","mode":"KEY","type":"number"},{"name":"b","mode":"KEY","type":"number"}]},
    {"id":"end1","type":"END","name":"结束","x":520,"y":160}
  ],
  "edges": [{"id":"e1","source":"start1","target":"s1"},{"id":"e2","source":"s1","target":"end1"}]
}
EOF
putdsl "$F3" /tmp/dsl_r3.json > /dev/null
A -X POST "$BASE/$F3/publish" > /dev/null
RUN3=$(A -X POST "$BASE/$F3/run" -d '{"vars":{}}')
echo "$RUN3" > /tmp/run_r3.json
python3 - /tmp/run_r3.json <<'PYEOF'
import sys, json
d = json.load(open(sys.argv[1]))["data"]
ov = d.get("outputVars") or {}
ok = d.get("status") == "SUCCESS"
if ov.get("wholeMap") != {"a": 1, "b": 2}: print("FAIL wholeMap:", ov.get("wholeMap")); ok = False
if ov.get("a") != 1 or ov.get("b") != 2: print("FAIL 拆包:", ov.get("a"), ov.get("b")); ok = False
print("用例3 混排 WHOLE+KEY:", "PASS" if ok else "FAIL")
sys.exit(0 if ok else 1)
PYEOF
[ $? -eq 0 ] && pass=$((pass+1)) || fail=$((fail+1))

echo "== 4) 正例：null 整体值跳过写入 =="
F4=$(mkflow "results_null_${TS}" "null跳过")
cat > /tmp/dsl_r4.json <<'EOF'
{
  "nodes": [
    {"id":"start1","type":"START","name":"开始","x":100,"y":160},
    {"id":"s1","type":"SCRIPT","name":"null脚本","x":300,"y":160,
     "config":{"language":"groovy","source":"null"},
     "results":[{"name":"outNull","mode":"WHOLE","type":"string"}]},
    {"id":"end1","type":"END","name":"结束","x":520,"y":160}
  ],
  "edges": [{"id":"e1","source":"start1","target":"s1"},{"id":"e2","source":"s1","target":"end1"}]
}
EOF
putdsl "$F4" /tmp/dsl_r4.json > /dev/null
A -X POST "$BASE/$F4/publish" > /dev/null
RUN4=$(A -X POST "$BASE/$F4/run" -d '{"vars":{}}')
S4=$(jqget "$RUN4" "d['data']['status']"); N4=$(jqget "$RUN4" "d['data']['outputVars'].get('outNull')")
echo "status=$S4 outNull=${N4:-<absent>}"
if [ "$S4" = "SUCCESS" ] && [ "$N4" = "None" ]; then pass=$((pass+1)); else fail=$((fail+1)); echo "FAIL: $(echo "$RUN4" | head -c 300)"; fi

echo "== 5) 反例：SCRIPT 带 resultVar → 发布拦截 =="
F5=$(mkflow "results_rv_${TS}" "resultVar拦截")
cat > /tmp/dsl_r5.json <<'EOF'
{
  "nodes": [
    {"id":"start1","type":"START","name":"开始","x":100,"y":160},
    {"id":"s1","type":"SCRIPT","name":"脚本","x":300,"y":160,
     "config":{"language":"groovy","source":"[a: 1]"},
     "resultVar":"staleOut",
     "results":[{"name":"a","mode":"KEY","type":"number"}]},
    {"id":"end1","type":"END","name":"结束","x":520,"y":160}
  ],
  "edges": [{"id":"e1","source":"start1","target":"s1"},{"id":"e2","source":"s1","target":"end1"}]
}
EOF
putdsl "$F5" /tmp/dsl_r5.json > /dev/null
PUB5=$(A -X POST "$BASE/$F5/publish")
echo "发布响应: $(echo "$PUB5" | head -c 300)"
if echo "$PUB5" | grep -q "不支持 resultVar"; then pass=$((pass+1)); else fail=$((fail+1)); echo "FAIL 未拦截"; fi

echo "== 6) 反例：输出名重复 → 发布拦截 =="
F6=$(mkflow "results_dup_${TS}" "重名拦截")
cat > /tmp/dsl_r6.json <<'EOF'
{
  "nodes": [
    {"id":"start1","type":"START","name":"开始","x":100,"y":160},
    {"id":"s1","type":"SCRIPT","name":"脚本","x":300,"y":160,
     "config":{"language":"groovy","source":"[a: 1]"},
     "results":[{"name":"a","mode":"KEY"},{"name":"a","mode":"WHOLE"}]},
    {"id":"end1","type":"END","name":"结束","x":520,"y":160}
  ],
  "edges": [{"id":"e1","source":"start1","target":"s1"},{"id":"e2","source":"s1","target":"end1"}]
}
EOF
putdsl "$F6" /tmp/dsl_r6.json > /dev/null
PUB6=$(A -X POST "$BASE/$F6/publish")
echo "发布响应: $(echo "$PUB6" | head -c 300)"
if echo "$PUB6" | grep -q "重复"; then pass=$((pass+1)); else fail=$((fail+1)); echo "FAIL 未拦截"; fi

echo "== 7) 反例：缺 mode → 发布拦截 =="
F7=$(mkflow "results_mode_${TS}" "mode拦截")
cat > /tmp/dsl_r7.json <<'EOF'
{
  "nodes": [
    {"id":"start1","type":"START","name":"开始","x":100,"y":160},
    {"id":"s1","type":"SCRIPT","name":"脚本","x":300,"y":160,
     "config":{"language":"groovy","source":"[a: 1]"},
     "results":[{"name":"a"}]},
    {"id":"end1","type":"END","name":"结束","x":520,"y":160}
  ],
  "edges": [{"id":"e1","source":"start1","target":"s1"},{"id":"e2","source":"s1","target":"end1"}]
}
EOF
putdsl "$F7" /tmp/dsl_r7.json > /dev/null
PUB7=$(A -X POST "$BASE/$F7/publish")
echo "发布响应: $(echo "$PUB7" | head -c 300)"
if echo "$PUB7" | grep -q "缺少 mode"; then pass=$((pass+1)); else fail=$((fail+1)); echo "FAIL 未拦截"; fi

echo "== 8) 反例：KEY 声明但返回标量 → run FAILED =="
F8=$(mkflow "results_scalar_${TS}" "标量报错")
cat > /tmp/dsl_r8.json <<'EOF'
{
  "nodes": [
    {"id":"start1","type":"START","name":"开始","x":100,"y":160},
    {"id":"s1","type":"SCRIPT","name":"标量脚本","x":300,"y":160,
     "config":{"language":"groovy","source":"42"},
     "results":[{"name":"outNum","mode":"KEY","type":"number"}]}
  ],
  "edges": [{"id":"e1","source":"start1","target":"s1"}]
}
EOF
putdsl "$F8" /tmp/dsl_r8.json > /dev/null
A -X POST "$BASE/$F8/publish" > /dev/null
RUN8=$(A -X POST "$BASE/$F8/run" -d '{"vars":{}}')
S8=$(jqget "$RUN8" "d['data']['status']"); E8=$(jqget "$RUN8" "d['data']['errorMessage'] or ''")
echo "status=$S8 err=${E8:0:150}"
if [ "$S8" = "FAILED" ] && echo "$E8" | grep -q "未返回 Map"; then pass=$((pass+1)); else fail=$((fail+1)); echo "FAIL: $(echo "$RUN8" | head -c 300)"; fi

echo "== 9) 回归：BATCH 循环体 SCRIPT 步骤 results =="
F9=$(mkflow "results_batch_${TS}" "BATCH回归")
cat > /tmp/dsl_r9.json <<'EOF'
{
  "nodes": [
    {"id":"start1","type":"START","name":"开始","x":100,"y":160},
    {"id":"b1","type":"BATCH","name":"遍历","x":300,"y":160,
     "config":{"collection":"{{nums}}","itemVar":"item","indexVar":"index",
       "body":[{"id":"bs1","type":"SCRIPT","name":"翻倍",
                "config":{"language":"groovy","source":"[doubled: item * 2]"},
                "results":[{"name":"doubled","mode":"KEY","type":"number"}]}],
       "stopOnError":true,"maxItems":100},
     "errorAction":"FAIL_FLOW"},
    {"id":"end1","type":"END","name":"结束","x":520,"y":160}
  ],
  "edges": [{"id":"e1","source":"start1","target":"b1"},{"id":"e2","source":"b1","target":"end1"}],
  "inputVars":[{"name":"nums","type":"json","required":true}]
}
EOF
putdsl "$F9" /tmp/dsl_r9.json > /dev/null
A -X POST "$BASE/$F9/publish" > /dev/null
RUN9=$(A -X POST "$BASE/$F9/run" -d '{"vars":{"nums":[1,2,3]}}')
S9=$(jqget "$RUN9" "d['data']['status']"); D9=$(jqget "$RUN9" "d['data']['outputVars']['doubled']")
echo "status=$S9 doubled=$D9（末次迭代胜出应为 6）"
if [ "$S9" = "SUCCESS" ] && [ "$D9" = "6" ]; then pass=$((pass+1)); else fail=$((fail+1)); echo "FAIL: $(echo "$RUN9" | head -c 400)"; fi

echo "== 清理测试流 =="
for id in $F1 $F2 $F3 $F4 $F5 $F6 $F7 $F8 $F9; do A -X DELETE "$BASE/$id" > /dev/null && echo "deleted $id"; done

echo ""
echo "======== E2E 结果: PASS=$pass FAIL=$fail ========"
[ $fail -eq 0 ] && echo "ALL GREEN" || echo "HAS FAILURES"
