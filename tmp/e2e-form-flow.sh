#!/bin/bash
# 端到端验证：表单设计→发布→流程节点绑定→部署→发起渲染→审批→数据落库
set -e
BASE=http://localhost:8080/api
H1="X-Tenant-Id: default"
CT="Content-Type: application/json"

echo "=== 1. 登录 ==="
TOKEN=$(curl -s -X POST $BASE/auth/login -H "$CT" -d '{"username":"admin","password":"admin123"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['accessToken'])")
AUTH="Authorization: Bearer $TOKEN"
echo "token ok: ${TOKEN:0:20}..."

echo "=== 2. 创建 WORKFLOW 表单 ==="
FID=$(curl -s -G -X POST "$BASE/v1/form-definitions" --data-urlencode "name=请假申请表" --data-urlencode "key=leave-form" --data-urlencode "type=WORKFLOW" -H "$AUTH" -H "$H1" | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['id'])")
echo "formDefId=$FID"

echo "=== 3. 保存 schema ==="
cat > /home/z/my-project/tmp/form-schema.json <<'EOF'
{
  "name": "请假申请表",
  "key": "leave-form",
  "schema": "{\"rule\":[{\"type\":\"input\",\"field\":\"reason\",\"title\":\"请假事由\",\"props\":{\"placeholder\":\"请输入请假事由\"},\"effect\":{\"required\":true}},{\"type\":\"select\",\"field\":\"leaveType\",\"title\":\"请假类型\",\"options\":[{\"value\":\"annual\",\"label\":\"年假\"},{\"value\":\"sick\",\"label\":\"病假\"},{\"value\":\"personal\",\"label\":\"事假\"}],\"effect\":{\"required\":true}},{\"type\":\"datePicker\",\"field\":\"startDate\",\"title\":\"开始日期\",\"props\":{\"type\":\"date\",\"valueFormat\":\"YYYY-MM-DD\"}},{\"type\":\"datePicker\",\"field\":\"endDate\",\"title\":\"结束日期\",\"props\":{\"type\":\"date\",\"valueFormat\":\"YYYY-MM-DD\"}},{\"type\":\"inputNumber\",\"field\":\"days\",\"title\":\"请假天数\",\"props\":{\"min\":0.5,\"max\":30}},{\"type\":\"textarea\",\"field\":\"comment\",\"title\":\"备注\",\"props\":{\"type\":\"textarea\",\"rows\":3}}],\"option\":{\"labelPosition\":\"right\",\"labelWidth\":\"100px\"}}",
  "columnConfig": null,
  "processKey": null
}
EOF
curl -s -X PUT "$BASE/v1/form-definitions/$FID" -H "$AUTH" -H "$H1" -H "$CT" -d @/home/z/my-project/tmp/form-schema.json | python3 -c "import sys,json;d=json.load(sys.stdin);print('update ok, version:',d['data']['version'],'status:',d['data']['status'])"

echo "=== 4. 发布表单 ==="
curl -s -X POST "$BASE/v1/form-definitions/$FID/publish" -H "$AUTH" -H "$H1" | python3 -c "import sys,json;d=json.load(sys.stdin);print('publish ok, publishedVersion:',d['data'].get('publishedVersion'),'status:',d['data']['status'])"

echo "=== 5. 创建流程草稿 ==="
DID=$(curl -s -G -X POST "$BASE/v1/process-definitions/drafts" --data-urlencode "name=请假审批-表单版" --data-urlencode "key=leave-form-flow" -H "$AUTH" -H "$H1" | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['id'])")
echo "draftId=$DID"

echo "=== 6. 保存 design（BPMN+nodeConfigs 表单绑定）==="
python3 - "$FID" > /home/z/my-project/tmp/design-payload.json <<'PYEOF'
import json, sys
fid = sys.argv[1]
bpmn = open('/home/z/my-project/workflow_lowcode/backend/src/main/resources/example/leave-bill.bpmn20.xml', encoding='utf-8').read()
bpmn = bpmn.replace('id="leave-bill"', 'id="leave-form-flow"').replace('name="请假审批"', 'name="请假审批-表单版"')
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
    "name": "请假审批-表单版", "key": "leave-form-flow", "categoryId": None,
    "bpmnXml": bpmn,
    "nodeConfigs": {
        "submitTask": json.dumps(submit_cfg, ensure_ascii=False),
        "managerApproval": json.dumps(mgr_cfg, ensure_ascii=False)
    }
}
print(json.dumps(payload, ensure_ascii=False))
PYEOF
curl -s -X PUT "$BASE/v1/process-definitions/$DID/design" -H "$AUTH" -H "$H1" -H "$CT" -d @/home/z/my-project/tmp/design-payload.json | python3 -c "import sys,json;d=json.load(sys.stdin);print('design saved:',d.get('code'),d.get('msg',''))"

echo "=== 7. 部署流程 ==="
DEPLOY=$(curl -s -X POST "$BASE/v1/process-definitions/$DID/deploy" -H "$AUTH" -H "$H1")
echo "$DEPLOY" | python3 -c "import sys,json;d=json.load(sys.stdin);print('deploy:',d.get('code'),d.get('msg',''))"
PDID=$(echo "$DEPLOY" | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['processDefinitionId'])")
echo "procDefId=$PDID"

echo "=== 8. 查询已部署流程（验证发起表单解析）==="
curl -s "$BASE/v1/deployed-processes/$PDID" -H "$AUTH" -H "$H1" | python3 -c "
import sys,json
d=json.load(sys.stdin)['data']
print('name:',d.get('name'),'| formDefId:',d.get('formDefId'),'| initiatorFormDefId:',d.get('initiatorFormDefId'),'| processFormDefId:',d.get('processFormDefId'))"

echo "=== 9. 发起流程（带表单数据）==="
cat > /home/z/my-project/tmp/start-payload.json <<EOF
{"processKey":"leave-form-flow","businessKey":"e2e-form-001","formDefId":"$FID",
 "variables":{"manager":"1","reason":"家中有事需要请假三天","leaveType":"personal","startDate":"2026-09-15","endDate":"2026-09-17","days":3,"comment":"请批准"}}
EOF
START=$(curl -s -X POST "$BASE/v1/process-instances" -H "$AUTH" -H "$H1" -H "$CT" -d @/home/z/my-project/tmp/start-payload.json)
PIID=$(echo "$START" | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['id'])")
echo "instanceId=$PIID"

echo "=== 10. 查询 admin 待办（经理审批节点）==="
TASKS=$(curl -s -G "$BASE/v1/tasks" --data-urlencode "assignee=1" -H "$AUTH" -H "$H1")
TASKID=$(echo "$TASKS" | python3 -c "
import sys,json
d=json.load(sys.stdin)['data']
items=d['records'] if isinstance(d,dict) and 'records' in d else d
for t in items:
    if t.get('name')=='部门经理审批':
        print(t['id']); break
")
echo "taskId=$TASKID"

echo "=== 11. 任务详情（验证 formKey/fieldPermissions/mappedData）==="
curl -s "$BASE/v1/tasks/$TASKID" -H "$AUTH" -H "$H1" | python3 -c "
import sys,json
d=json.load(sys.stdin)['data']
print('taskName:',d.get('name'))
print('formKey(formDefId):',d.get('formKey'))
print('fieldPermissions:',json.dumps(d.get('fieldPermissions'),ensure_ascii=False))
print('mappedData:',json.dumps(d.get('mappedData'),ensure_ascii=False))"

echo "=== E2E API 链路完成 ==="
echo "FID=$FID" > /home/z/my-project/tmp/e2e-ids.env
echo "DID=$DID" >> /home/z/my-project/tmp/e2e-ids.env
echo "PDID=$PDID" >> /home/z/my-project/tmp/e2e-ids.env
echo "PIID=$PIID" >> /home/z/my-project/tmp/e2e-ids.env
echo "TASKID=$TASKID" >> /home/z/my-project/tmp/e2e-ids.env
