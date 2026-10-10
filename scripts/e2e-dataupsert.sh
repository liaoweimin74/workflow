#!/bin/bash
# e2e-dataupsert.sh — DATA_UPSERT 节点 API 级全链路验证
# 覆盖：创建→保存(upserts 双条目)→发布→运行(created/updated)→DB 落库核对
set -e
BASE=http://127.0.0.1:8080/api/v1
H1='Content-Type: application/json'
TS=$(date +%H%M%S)
FK="e2e_upsert_$TS"

TOKEN=$(curl -s --max-time 5 -X POST -H "$H1" -d '{"username":"admin","password":"admin123"}' http://127.0.0.1:8080/api/auth/login | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['accessToken'])")
AH="Authorization: Bearer $TOKEN"
TEN='X-Tenant-Id: default'

echo "== 1. 创建逻辑流 =="
FID=$(curl -s --max-time 6 -X POST -H "$AH" -H "$TEN" -H "$H1" -d "{\"key\":\"$FK\",\"name\":\"E2E DATA_UPSERT $TS\",\"description\":\"e2e\"}" $BASE/logic-flows | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['id'])")
echo "flowId=$FID"

cat > /tmp/upsert-inner.json <<EOF
{"nodes":[
  {"id":"start1","type":"START","name":"开始","x":120,"y":160},
  {"id":"up1","type":"DATA_UPSERT","name":"写入人员","x":340,"y":160,
   "config":{
     "upserts":[
       {"alias":"u1","formKey":"person","conflictKey":"code",
        "values":[{"column":"code","value":"E100$TS"},{"column":"name","value":"张三$TS"}]},
       {"alias":"u2","formKey":"person","conflictKey":"code",
        "values":[{"column":"code","value":"E200$TS"},{"column":"name","value":"李四$TS"}]}
     ]
   },
   "results":[{"name":"up1","mode":"WHOLE"}],"errorAction":"FAIL_FLOW"},
  {"id":"end1","type":"END","name":"结束","x":560,"y":160}
],
"edges":[
  {"id":"e1","source":"start1","target":"up1"},
  {"id":"e2","source":"up1","target":"end1"}
]}
EOF
python3 - <<PYEOF
import json
inner=json.load(open('/tmp/upsert-inner.json'))
json.dump({"name":"E2E DATA_UPSERT $TS","description":"e2e upserts dual-entry","dsl":json.dumps(inner,ensure_ascii=False)},open('/tmp/upsert-dsl.json','w'),ensure_ascii=False)
PYEOF

echo "== 2. 保存 DSL（验证 UNKNOWN_NODE_TYPE 消除）=="
curl -s --max-time 6 -X PUT -H "$AH" -H "$TEN" -H "$H1" -d @/tmp/upsert-dsl.json $BASE/logic-flows/$FID | python3 -c "import sys,json;d=json.load(sys.stdin);print('code:',d['code'],d.get('msg',''))"

echo "== 3. 发布（硬校验：图结构+upserts 条目校验）=="
curl -s --max-time 6 -X POST -H "$AH" -H "$TEN" $BASE/logic-flows/$FID/publish | python3 -c "import sys,json;d=json.load(sys.stdin);print('code:',d['code'],d.get('msg',''), d['data'].get('status') if d.get('data') else '')"

echo "== 4. 第一次运行（期望 created×2）=="
curl -s --max-time 10 -X POST -H "$AH" -H "$TEN" -H "$H1" -d '{}' $BASE/logic-flows/$FID/run > /tmp/run1.json
python3 -c "
import json
d=json.load(open('/tmp/run1.json'))
print('code:',d['code'],'status:',d['data']['status'] if d.get('data') else '','err:',d['data'].get('errorMessage') if d.get('data') else d.get('msg'))
out=d['data'].get('outputVars',{}) if d.get('data') else {}
print('output:',json.dumps(out,ensure_ascii=False)[:300])"

echo "== 5. 第二次运行（期望 updated×2，同 code 改名）=="
python3 - <<PYEOF
import json
d=json.load(open('/tmp/upsert-inner.json'))
for u in d['nodes'][1]['config']['upserts']:
    for v in u['values']:
        if v['column']=='name': v['value']=v['value']+'-v2'
json.dump({"name":"E2E DATA_UPSERT $TS","description":"e2e v2","dsl":json.dumps(d,ensure_ascii=False)},open('/tmp/upsert-dsl2.json','w'),ensure_ascii=False)
PYEOF
curl -s --max-time 6 -X PUT -H "$AH" -H "$TEN" -H "$H1" -d @/tmp/upsert-dsl2.json $BASE/logic-flows/$FID > /dev/null
curl -s --max-time 6 -X POST -H "$AH" -H "$TEN" $BASE/logic-flows/$FID/publish > /dev/null
curl -s --max-time 10 -X POST -H "$AH" -H "$TEN" -H "$H1" -d '{}' $BASE/logic-flows/$FID/run > /tmp/run2.json
python3 -c "
import json
d=json.load(open('/tmp/run2.json'))
print('code:',d['code'],'err:',d['data'].get('errorMessage') if d.get('data') else d.get('msg'))
out=d['data'].get('outputVars',{}) if d.get('data') else {}
print('output:',json.dumps(out,ensure_ascii=False)[:300])"

echo "== 6. DB 落库核对（期望 E100/E200 各 1 行，version=2，name 带 -v2）=="
export LD_LIBRARY_PATH=/home/z/my-project/mariadb-user/root/lib/x86_64-linux-gnu:/home/z/my-project/mariadb-user/sysroot/usr/lib/x86_64-linux-gnu
/home/z/my-project/mariadb-user/root/bin/mariadb -u root -p740130 -h 127.0.0.1 workflow -e "SELECT code, name, version, created_by, updated_at FROM wf_biz_person WHERE code IN ('E100$TS','E200$TS')" 2>/dev/null

echo "== 7. 清理测试流 =="
curl -s --max-time 6 -X DELETE -H "$AH" -H "$TEN" $BASE/logic-flows/$FID | head -c 60; echo
echo E2E_DONE
