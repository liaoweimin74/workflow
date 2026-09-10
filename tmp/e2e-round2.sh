#!/bin/bash
# 第二轮 e2e：验证 H2 JSON 列修复后表单绑定链路全通
set -e
BASE=http://localhost:8080/api
H1="X-Tenant-Id: default"
CT="Content-Type: application/json"

TOKEN=$(curl -s -X POST $BASE/auth/login -H "$CT" -d '{"username":"admin","password":"admin123"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['accessToken'])")
AUTH="Authorization: Bearer $TOKEN"
FID=4a2e8ee181eb4ec6ac57f66385975e2c
DID=8abe1402f2834449b205601dfb2bfb93

echo "=== 1. 重新保存 design（LONGTEXT 列，微调名称触发 hash 变化）==="
python3 - "$FID" > /home/z/my-project/tmp/design-payload2.json <<'PYEOF'
import json, sys
fid = sys.argv[1]
bpmn = open('/home/z/my-project/workflow_lowcode/backend/src/main/resources/example/leave-bill.bpmn20.xml', encoding='utf-8').read()
bpmn = bpmn.replace('id="leave-bill"', 'id="leave-form-flow"').replace('name="请假审批"', 'name="请假审批（表单版）"')
bpmn = bpmn.replace('BPMNDiagram_leave-bill', 'BPMNDiagram_leave-form-flow').replace('BPMNPlane_leave-bill', 'BPMNPlane_leave-form-flow')
submit_cfg = {"form": {"formDefId": fid, "fieldPermissions": {}, "dataMappings": []}}
mgr_cfg = {"form": {"formDefId": fid,
                    "fieldPermissions": {"reason": "VIEW", "leaveType": "VIEW", "days": "VIEW"},
                    "dataMappings": [
                        {"targetField": "reason", "source": "form:initiator", "sourceField": "reason"},
                        {"targetField": "leaveType", "source": "form:initiator", "sourceField": "leaveType"},
                        {"targetField": "days", "source": "form:initiator", "sourceField": "days"}
                    ]}}
payload = {
    "name": "请假审批（表单版）", "key": "leave-form-flow", "categoryId": None,
    "bpmnXml": bpmn,
    "nodeConfigs": {
        "submitTask": json.dumps(submit_cfg, ensure_ascii=False),
        "managerApproval": json.dumps(mgr_cfg, ensure_ascii=False)
    }
}
print(json.dumps(payload, ensure_ascii=False))
PYEOF
curl -s -X PUT "$BASE/v1/process-definitions/$DID/design" -H "$AUTH" -H "$H1" -H "$CT" -d @/home/z/my-project/tmp/design-payload2.json | python3 -c "import sys,json;d=json.load(sys.stdin);print('design saved:',d.get('code'),d.get('msg',''))"

echo "=== 2. 检查 DB 存储是否为纯文本（无外层包装）==="
cp /home/z/my-project/workflow_lowcode/backend/data/workflow.mv.db /home/z/my-project/tmp/dbcopy2.mv.db 2>/dev/null || true
java -cp /home/z/.m2/repository/com/h2database/h2/2.4.240/h2-2.4.240.jar org.h2.tools.Shell -url "jdbc:h2:/home/z/my-project/tmp/dbcopy2" -user sa -password "" -sql "SELECT NODE_ID, SUBSTRING(CONFIG_JSON,1,60) AS CFG FROM wf_node_config WHERE PROCESS_DEFINITION_ID IS NULL;" 2>&1 | head -6

echo "=== 3. 部署 v2 ==="
DEPLOY=$(curl -s -X POST "$BASE/v1/process-definitions/$DID/deploy" -H "$AUTH" -H "$H1")
echo "$DEPLOY" | python3 -c "import sys,json;d=json.load(sys.stdin);print('deploy:',d.get('code'),d.get('msg',''))"
PDID=$(echo "$DEPLOY" | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['processDefinitionId'])")
echo "procDefId=$PDID"

echo "=== 4. 验证 deployed-processes 表单解析（关键！之前为 None）==="
curl -s "$BASE/v1/deployed-processes/$PDID" -H "$AUTH" -H "$H1" | python3 -c "
import sys,json
d=json.load(sys.stdin)['data']
print('name:',d.get('name'),'| version:',d.get('version'))
print('formDefId:',d.get('formDefId'))
print('initiatorFormDefId:',d.get('initiatorFormDefId'))
print('processFormDefId:',d.get('processFormDefId'))"

echo "=== 5. 发起流程（带表单数据）==="
cat > /home/z/my-project/tmp/start-payload2.json <<EOF
{"processKey":"leave-form-flow","businessKey":"e2e-form-002","formDefId":"$FID",
 "variables":{"manager":"1","reason":"家中有事需要请假三天","leaveType":"personal","startDate":"2026-09-15","endDate":"2026-09-17","days":3,"comment":"请批准"}}
EOF
START=$(curl -s -X POST "$BASE/v1/process-instances" -H "$AUTH" -H "$H1" -H "$CT" -d @/home/z/my-project/tmp/start-payload2.json)
PIID=$(echo "$START" | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['id'])")
echo "instanceId=$PIID"

echo "=== 6. 任务详情（验证 formKey/fieldPermissions/mappedData）==="
TASKID=$(curl -s -G "$BASE/v1/tasks" --data-urlencode "assignee=1" -H "$AUTH" -H "$H1" | python3 -c "
import sys,json
d=json.load(sys.stdin)['data']
items=d.get('content',d if isinstance(d,list) else [])
for t in items:
    if t.get('processInstanceId')=='$PIID':
        print(t['taskId']); break
")
echo "taskId=$TASKID"
curl -s "$BASE/v1/tasks/$TASKID" -H "$AUTH" -H "$H1" | python3 -c "
import sys,json
d=json.load(sys.stdin)['data']
print('taskName:',d.get('name'))
print('formKey:',d.get('formKey'))
print('fieldPermissions:',json.dumps(d.get('fieldPermissions'),ensure_ascii=False))
print('mappedData:',json.dumps(d.get('mappedData'),ensure_ascii=False))"

echo "=== ROUND2 DONE ==="
echo "PDID=$PDID" > /home/z/my-project/tmp/e2e-ids2.env
echo "PIID=$PIID" >> /home/z/my-project/tmp/e2e-ids2.env
echo "TASKID=$TASKID" >> /home/z/my-project/tmp/e2e-ids2.env
