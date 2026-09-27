#!/usr/bin/env python3
"""Task 64 端到端验证：签名落库 + lastSignature 回填 + reInitiate 拦截/放行"""
import json, urllib.request, sys

BASE = "http://127.0.0.1:8080"
TENANT = {"X-Tenant-Id": "default"}

def req(method, path, body=None, token=None, tok=None):
    if tok and not token: token = tok
    headers = dict(TENANT)
    data = None
    if token:
        headers["Authorization"] = f"Bearer {token}"
    if body is not None:
        data = json.dumps(body).encode()
        headers["Content-Type"] = "application/json"
    r = urllib.request.Request(BASE + path, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(r, timeout=15) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        try:
            return json.loads(e.read().decode())
        except Exception:
            return {"code": e.code, "msg": "http error"}

tok = req("POST", "/api/auth/login", {"username": "admin", "password": "admin123"})["data"]["accessToken"]
DRAFT_ID = open("/home/z/my-project/tool-results/t64_draft_id.txt").read().strip()

BPMN = '''<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:flowable="http://flowable.org/bpmn" targetNamespace="http://flowable.org/bpmn">
  <bpmn:process id="sig_verify_64" name="签名验证流程" isExecutable="true">
    <bpmn:startEvent id="startEvent_1">
      <bpmn:outgoing>flow_1</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:sequenceFlow id="flow_1" sourceRef="startEvent_1" targetRef="initiatorTask_1"/>
    <bpmn:userTask id="initiatorTask_1" name="发起节点" nodeRole="initiator">
      <bpmn:incoming>flow_1</bpmn:incoming>
      <bpmn:outgoing>flow_2</bpmn:outgoing>
    </bpmn:userTask>
    <bpmn:sequenceFlow id="flow_2" sourceRef="initiatorTask_1" targetRef="userTask_1"/>
    <bpmn:userTask id="userTask_1" name="审批节点" nodeRole="approver">
      <bpmn:incoming>flow_2</bpmn:incoming>
      <bpmn:outgoing>flow_3</bpmn:outgoing>
    </bpmn:userTask>
    <bpmn:sequenceFlow id="flow_3" sourceRef="userTask_1" targetRef="endEvent_1"/>
    <bpmn:endEvent id="endEvent_1">
      <bpmn:incoming>flow_3</bpmn:incoming>
    </bpmn:endEvent>
  </bpmn:process>
</bpmn:definitions>'''

SIG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="

node_configs = {
    "initiatorTask_1": {
        "basic": {"name": "发起节点", "description": ""},
        "taskRole": "initiator",
        "initiator": {"disallowRecall": False, "urge": {"enabled": True, "interval": 1, "unit": "hour"}, "reInitiate": True, "smsOnEnd": False},
    },
    "userTask_1": {
        "basic": {"name": "审批节点", "description": ""},
        "taskRole": "approver",
        "approval": {"type": "user", "userIds": ["1"], "multiMode": "or_sign"},
        "signature": {"enabled": True, "required": True, "useLast": True, "allowUpload": True},
    },
}

print("== 1. 保存设计并部署 ==")
r = req("PUT", f"/api/v1/process-definitions/{DRAFT_ID}/design", {"bpmnXml": BPMN, "nodeConfigs": {k: json.dumps(v) for k, v in node_configs.items()}}, tok)
assert r["code"] == 200, r
r = req("POST", f"/api/v1/process-definitions/{DRAFT_ID}/deploy", None, tok)
assert r["code"] == 200, r
print("   部署成功")

print("== 2. 发起实例1 ==")
r = req("POST", "/api/v1/process-instances", {"processKey": "sig_verify_64", "variables": {"initiator": "1", "day": 3}}, tok)
assert r["code"] == 200, r
inst1 = r["data"]["id"]
print(f"   实例1 = {inst1}")

print("== 3. 查审批任务详情（第一次，lastSignature 应为 null）==")
r = req("GET", "/api/v1/tasks?assignee=1&page=1&size=50", None, tok)
tasks1 = [t for t in r["data"]["content"] if t.get("processInstanceId") == inst1]
assert tasks1, f"未找到实例1的待办: {str(r['data'])[:200]}"
task1 = tasks1[0]["taskId"]
r = req("GET", f"/api/v1/tasks/{task1}", None, tok)
nf = r["data"].get("nodeFlags", {})
print(f"   nodeFlags={nf}")
assert nf.get("signatureUseLast") is True, "signatureUseLast 未下发"
assert nf.get("signatureAllowUpload") is True, "signatureAllowUpload 未下发"
prev_last = r["data"].get("lastSignature")
print(f"   历史签名回查: {'无(全新用户)' if prev_last in (None, '') else '有(上轮验证遗留,合法)'}")

print("== 4. 审批提交（不带签名 → 应被 required 拦截）==")
r = req("POST", f"/api/v1/tasks/{task1}/complete", {"userId": "1", "comment": "同意"}, tok)
assert "手写签名" in str(r.get("msg", "")), f"required 拦截未生效: {r}"
print(f"   拦截生效: {r['msg']}")

print("== 5. 审批提交（带签名 → 流程结束 + 签名落库）==")
r = req("POST", f"/api/v1/tasks/{task1}/complete", {"userId": "1", "comment": "同意", "signature": SIG}, tok)
assert r["code"] == 200, r
print(f"   流程结束 processFinished={r['data'].get('processFinished')}")

print("== 6. re-initiate 实例1（reInitiate=true → 放行）==")
r = req("POST", f"/api/v1/process-instances/{inst1}/re-initiate", None, tok)
assert r["code"] == 200, r
inst2 = r["data"]["id"]
print(f"   新实例2 = {inst2}")

print("== 7. 实例2 审批任务详情（lastSignature 应回填实例1的签名）==")
r = req("GET", "/api/v1/tasks?assignee=1&page=1&size=50", None, tok)
tasks2 = [t for t in r["data"]["content"] if t.get("processInstanceId") == inst2]
assert tasks2, "未找到实例2的待办"
task2 = tasks2[0]["taskId"]
r = req("GET", f"/api/v1/tasks/{task2}", None, tok)
last = r["data"].get("lastSignature")
assert last == SIG, f"lastSignature 回填失败: {str(last)[:80]}"
print("   lastSignature 回填成功 ✓")

print("== 8. DB 直查意见表 signature 列 ==")
import subprocess
js = f"""
import mysql from 'mysql2/promise';
const conn = await mysql.createConnection({{host:'127.0.0.1',port:3306,user:'root',password:'740130',database:'workflow_v6'}});
const [cnt] = await conn.execute("SELECT COUNT(*) AS c FROM wf_task_comment WHERE process_instance_id = ? AND action='approve' AND signature IS NOT NULL", ['{inst1}']);
console.log('sig_rows_inst1=' + cnt[0].c);
const [head] = await conn.execute("SELECT LEFT(signature,30) AS h FROM wf_task_comment WHERE process_instance_id = ? LIMIT 1", ['{inst1}']);
console.log('sig_head=' + head[0].h);
await conn.end();
"""
db_check = subprocess.run(["bun", "-e", js], capture_output=True, text=True,
                          cwd="/home/z/my-project/workflow_lowcode/backend-node", timeout=30)
out = db_check.stdout.strip()
print("   " + (out.replace("\n", "\n   ") or db_check.stderr[:200]))
assert "sig_rows_inst1=1" in out, "签名未落库"

print("== 9. 版本2：reInitiate=false → re-initiate 应拦截 ==")
node_configs2 = dict(node_configs)
node_configs2["initiatorTask_1"] = {
    "basic": {"name": "发起节点", "description": ""},
    "taskRole": "initiator",
    "initiator": {"disallowRecall": False, "urge": {"enabled": True, "interval": 1, "unit": "hour"}, "reInitiate": False, "smsOnEnd": False},
}
r = req("PUT", f"/api/v1/process-definitions/{DRAFT_ID}/design", {"bpmnXml": BPMN, "nodeConfigs": {k: json.dumps(v) for k, v in node_configs2.items()}}, tok)
assert r["code"] == 200, r
r = req("POST", f"/api/v1/process-definitions/{DRAFT_ID}/deploy", None, tok)
assert r["code"] == 200, r
r = req("POST", f"/api/v1/process-instances/{inst1}/re-initiate", None, tok)
assert r["code"] != 200 and "不支持再次发起" in str(r.get("msg", "")), f"reInitiate=false 拦截失败: {r}"
print(f"   拦截生效: {r['msg']}")

print("\n✅ 全部验证通过")
print(json.dumps({"inst1": inst1, "inst2": inst2, "task1": task1, "task2": task2, "draftId": DRAFT_ID}))
