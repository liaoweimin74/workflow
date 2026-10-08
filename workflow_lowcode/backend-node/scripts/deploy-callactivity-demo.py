#!/usr/bin/env python3
"""Task 16 演示数据部署：主子流程（callActivity）草稿 → 配置 → 部署 → 发起演示实例。一次性脚本。"""
import json
import urllib.request

API = "http://localhost:8080/api"


def call(method: str, path: str, token: str | None = None, body: dict | None = None):
    req = urllib.request.Request(API + path, method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    data = json.dumps(body).encode() if body is not None else None
    with urllib.request.urlopen(req, data=data) as r:
        envelope = json.loads(r.read())
    if envelope.get("code") != 200:
        raise RuntimeError(f"{method} {path} -> code={envelope.get('code')} msg={envelope.get('msg')}")
    return envelope


tok = call("POST", "/auth/login", body={"username": "admin", "password": "admin123"})["data"]["accessToken"]

CHILD_XML = """<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:flowable="http://flowable.org/bpmn">
  <process id="sub-travel-approve" name="出差审批子流程" isExecutable="true">
    <startEvent id="s_start" name="开始"/>
    <userTask id="sub_approve" name="子流程审批"/>
    <endEvent id="s_end" name="结束"/>
    <sequenceFlow id="sf1" sourceRef="s_start" targetRef="sub_approve"/>
    <sequenceFlow id="sf2" sourceRef="sub_approve" targetRef="s_end"/>
  </process>
</definitions>"""

PARENT_XML = """<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:flowable="http://flowable.org/bpmn" xmlns:wf="http://workflow.lowcode/bpmn">
  <process id="main-travel" name="出差申请（主子流程）" isExecutable="true">
    <startEvent id="p_start" name="开始"/>
    <userTask id="p_submit" name="提交申请" wf:nodeRole="initiator" flowable:assignee="${initiator}"/>
    <callActivity id="p_call" name="调用审批子流程" calledElement="sub-travel-approve"/>
    <userTask id="p_record" name="结果归档"/>
    <endEvent id="p_end" name="结束"/>
    <sequenceFlow id="pf1" sourceRef="p_start" targetRef="p_submit"/>
    <sequenceFlow id="pf2" sourceRef="p_submit" targetRef="p_call"/>
    <sequenceFlow id="pf3" sourceRef="p_call" targetRef="p_record"/>
    <sequenceFlow id="pf4" sourceRef="p_record" targetRef="p_end"/>
  </process>
</definitions>"""


def deploy(key: str, name: str, xml: str, node_configs: dict) -> str:
    d = call("POST", "/v1/process-definitions/drafts", tok, {"name": name, "processKey": key, "bpmnXml": xml})["data"]
    draft_id = d["id"]
    call("PUT", f"/v1/process-definitions/{draft_id}/design", tok, {"nodeConfigs": node_configs})
    dep = call("POST", f"/v1/process-definitions/{draft_id}/deploy", tok, {})["data"]
    print(f"部署 {key} v{dep.get('version')} deployId={dep.get('deployId')}")
    return draft_id


# 子流程：审批人 = admin（配置 userIds "1"）
deploy("sub-travel-approve", "出差审批子流程", CHILD_XML, {
    "sub_approve": {"basic": {"name": "子流程审批"}, "approval": {"userIds": ["1"]}},
})
# 主流程：p_call 配 inParams(reason→subReason)/outParams(subResult→archiveNote)；p_record 审批人 admin
deploy("main-travel", "出差申请（主子流程）", PARENT_XML, {
    "p_submit": {"basic": {"name": "提交申请"}},
    "p_call": {
        "basic": {"name": "调用审批子流程"},
        "callActivity": {
            "calledElement": "sub-travel-approve",
            "inParams": [{"source": "reason", "target": "subReason"}],
            "outParams": [{"source": "subResult", "target": "archiveNote"}],
        },
    },
    "p_record": {"basic": {"name": "结果归档"}, "approval": {"userIds": ["1"]}},
})

# test 用户发起演示实例（发起人节点自动提交 → 直接进子流程）
tok_test = call("POST", "/auth/login", body={"username": "test", "password": "123456"})["data"]["accessToken"]
st = call("POST", "/v1/process-instances", tok_test, {
    "processKey": "main-travel",
    "businessKey": "CC-2026-016",
    "variables": {"reason": "上海客户现场支持，为期三天"},
})["data"]
print(f"演示实例已发起: {st['id']}")

# 管理端核对：子实例已创建、admin 待办出现「子流程审批」
insts = call("GET", "/v1/process-instances?size=20", tok)["data"]["content"]
child = [i for i in insts if i.get("parentId") == st["id"]]
print(f"子实例: {child[0]['id'] if child else '未找到!'} name={child[0]['name'] if child else ''} parentTitle={child[0].get('parentTitle') if child else ''}")
todo = call("GET", "/v1/tasks/todo?size=20", tok)["data"]["content"]
sub_tasks = [t for t in todo if t.get("procInstId") == (child[0]["id"] if child else "-") or t.get("processInstanceId") == (child[0]["id"] if child else "-")]
print(f"admin 子流程待办: {json.dumps(sub_tasks, ensure_ascii=False)[:220]}")
