#!/usr/bin/env python3
"""Task 16 演示数据 2：组织机构补录 + dept_head 审批链路演示。一次性脚本（幂等：按 orgCode 查重）。"""
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
        env = json.loads(r.read())
    if env.get("code") != 200:
        raise RuntimeError(f"{method} {path} -> code={env.get('code')} msg={env.get('msg')}")
    return env


tok = call("POST", "/auth/login", body={"username": "admin", "password": "admin123"})["data"]["accessToken"]
tok_test = call("POST", "/auth/login", body={"username": "test", "password": "123456"})["data"]["accessToken"]

# ---- 1) 组织树（石化总厂 → 生产运行部，主管=admin；root 主管=admin 兜底） ----
tree = call("GET", "/orgs/tree", tok)["data"]


def find_org(nodes, code):
    for n in nodes:
        if n["code"] == code:
            return n
        hit = find_org(n.get("children") or [], code)
        if hit:
            return hit
    return None


def ensure_org(name, code, parent_id, leader_id):
    node = find_org(tree, code)
    if node:
        call("PUT", f"/orgs/{node['id']}", tok, {"leaderId": leader_id})
        print(f"组织已存在，主管已确认: {name} leader={leader_id}")
        return node["id"]
    created = call("POST", "/orgs", tok, {
        "orgName": name, "orgCode": code, "parentId": parent_id,
        "leaderId": leader_id, "sortOrder": 1, "status": 1,
    })["data"]
    print(f"组织已创建: {name} id={created['id']} leader={leader_id}")
    return created["id"]


root_id = ensure_org("石化总厂", "PLANT-ROOT", None, 1)
dept_id = ensure_org("生产运行部", "PLANT-OPS", root_id, 1)

# ---- 2) test 用户归属生产运行部（orgId 走用户更新） ----
call("PUT", "/users/2", tok, {"orgId": dept_id})
print(f"test 用户已归属生产运行部 id={dept_id}")

# ---- 3) 部署 dept_head 演示流程（发起 → 部门负责人审批 → 办结） ----
xml = """<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:flowable="http://flowable.org/bpmn" xmlns:wf="http://workflow.lowcode/bpmn">
  <process id="leave-dept-head" name="请假申请（部门主管审批）" isExecutable="true">
    <startEvent id="d_start" name="开始"/>
    <userTask id="d_submit" name="提交请假" wf:nodeRole="initiator" flowable:assignee="${initiator}"/>
    <userTask id="d_head" name="部门负责人审批"/>
    <endEvent id="d_end" name="结束"/>
    <sequenceFlow id="df1" sourceRef="d_start" targetRef="d_submit"/>
    <sequenceFlow id="df2" sourceRef="d_submit" targetRef="d_head"/>
    <sequenceFlow id="df3" sourceRef="d_head" targetRef="d_end"/>
  </process>
</definitions>"""

deps = call("GET", "/v1/process-definitions/drafts?keyword=leave-dept-head&size=1", tok)["data"]
draft_id = None
if deps["content"]:
    draft_id = deps["content"][0]["id"]
    call("PUT", f"/v1/process-definitions/{draft_id}/design", tok, {
        "bpmnXml": xml,
        "nodeConfigs": {
            "d_submit": {"basic": {"name": "提交请假"}},
            "d_head": {"basic": {"name": "部门负责人审批"}, "approval": {"type": "dept_head"}},
        },
    })
    dep = call("POST", f"/v1/process-definitions/{draft_id}/deploy", tok, {})["data"]
else:
    d = call("POST", "/v1/process-definitions/drafts", tok, {"name": "请假申请（部门主管审批）", "processKey": "leave-dept-head", "bpmnXml": xml})["data"]
    draft_id = d["id"]
    call("PUT", f"/v1/process-definitions/{draft_id}/design", tok, {
        "nodeConfigs": {
            "d_submit": {"basic": {"name": "提交请假"}},
            "d_head": {"basic": {"name": "部门负责人审批"}, "approval": {"type": "dept_head"}},
        },
    })
    dep = call("POST", f"/v1/process-definitions/{draft_id}/deploy", tok, {})["data"]
print(f"dept_head 演示流程已部署 v{dep.get('version')}")

# ---- 4) test 发起 → 部门负责人审批任务应落到 admin（主管逐级解析） ----
st = call("POST", "/v1/process-instances", tok_test, {
    "processKey": "leave-dept-head",
    "businessKey": "QJ-DEPT-001",
    "variables": {"reason": "家中有事，请假一天"},
})["data"]
tasks = call("GET", "/v1/tasks?size=20", tok)["data"]["content"]
hit = [t for t in tasks if t.get("businessKey") == "QJ-DEPT-001"]
print(f"实例 {st['id'][:12]}… 部门负责人任务 → {json.dumps(hit, ensure_ascii=False)[:260]}")

# ---- 5) 预测接口校验 dept_head ----
pred = call("GET", f"/v1/process-instances/{st['id']}/prediction", tok)["data"]["nodes"]
print("预测节点:", json.dumps([{ "n": p["nodeName"], "a": p["assignees"]} for p in pred], ensure_ascii=False))
