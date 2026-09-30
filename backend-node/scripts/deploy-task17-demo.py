#!/usr/bin/env python3
"""Task 17 演示数据部署（v2，带 DI 图形坐标）：内嵌 subProcess（含编号规则）+ sequential 依次审批。
用法：
  python3 scripts/deploy-task17-demo.py            # 部署 + 发起演示实例
  python3 scripts/deploy-task17-demo.py --cleanup  # 终止既有演示实例（保留定义）
"""
import json
import sys
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

# ---------- 清理模式 ----------
if "--cleanup" in sys.argv:
    insts = call("GET", "/v1/process-instances?size=50", tok)["data"]["content"]
    for i in insts:
        if i.get("processDefinitionKey") in ("main-sub-demo", "main-seq-demo") and i.get("status") == "running":
            call("POST", f"/v1/process-instances/{i['id']}/terminate", tok, {"reason": "演示数据清理"})
            print(f"终止演示实例 {i['id']} ({i.get('processDefinitionKey')})")
    print("CLEANUP DONE")
    sys.exit(0)

# ---------- 1) 内嵌 subProcess（isExpanded + DI）+ numberRule ----------
SUB_XML = """<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:flowable="http://flowable.org/bpmn" xmlns:wf="http://workflow.lowcode/bpmn" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI">
  <process id="main-sub-demo" name="出差申请（嵌套子流程）" isExecutable="true">
    <startEvent id="d_start" name="开始"/>
    <userTask id="d_submit" name="提交申请" wf:nodeRole="initiator" flowable:assignee="${initiator}"/>
    <subProcess id="d_sub" name="内部审批段">
      <startEvent id="ds_start" name="开始"/>
      <userTask id="ds_approve" name="内部审批" flowable:assignee="1"/>
      <userTask id="ds_review" name="内部复核" flowable:assignee="1"/>
      <endEvent id="ds_end" name="结束"/>
      <sequenceFlow id="dsf1" sourceRef="ds_start" targetRef="ds_approve"/>
      <sequenceFlow id="dsf2" sourceRef="ds_approve" targetRef="ds_review"/>
      <sequenceFlow id="dsf3" sourceRef="ds_review" targetRef="ds_end"/>
    </subProcess>
    <userTask id="d_record" name="结果归档" flowable:assignee="1"/>
    <endEvent id="d_end" name="结束"/>
    <sequenceFlow id="df1" sourceRef="d_start" targetRef="d_submit"/>
    <sequenceFlow id="df2" sourceRef="d_submit" targetRef="d_sub"/>
    <sequenceFlow id="df3" sourceRef="d_sub" targetRef="d_record"/>
    <sequenceFlow id="df4" sourceRef="d_record" targetRef="d_end"/>
  </process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="main-sub-demo">
      <bpmndi:BPMNShape id="d_start_di" bpmnElement="d_start"><dc:Bounds x="180" y="202" width="36" height="36"/></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="d_submit_di" bpmnElement="d_submit"><dc:Bounds x="260" y="180" width="100" height="80"/></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="d_sub_di" bpmnElement="d_sub" isExpanded="true"><dc:Bounds x="410" y="120" width="620" height="200"/></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="ds_start_di" bpmnElement="ds_start"><dc:Bounds x="445" y="202" width="36" height="36"/></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="ds_approve_di" bpmnElement="ds_approve"><dc:Bounds x="520" y="180" width="100" height="80"/></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="ds_review_di" bpmnElement="ds_review"><dc:Bounds x="670" y="180" width="100" height="80"/></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="ds_end_di" bpmnElement="ds_end"><dc:Bounds x="820" y="202" width="36" height="36"/></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="d_record_di" bpmnElement="d_record"><dc:Bounds x="1090" y="180" width="100" height="80"/></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="d_end_di" bpmnElement="d_end"><dc:Bounds x="1240" y="202" width="36" height="36"/></bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="df1_di" bpmnElement="df1"><di:waypoint x="216" y="220"/><di:waypoint x="260" y="220"/></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="df2_di" bpmnElement="df2"><di:waypoint x="360" y="220"/><di:waypoint x="410" y="220"/></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="dsf1_di" bpmnElement="dsf1"><di:waypoint x="481" y="220"/><di:waypoint x="520" y="220"/></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="dsf2_di" bpmnElement="dsf2"><di:waypoint x="620" y="220"/><di:waypoint x="670" y="220"/></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="dsf3_di" bpmnElement="dsf3"><di:waypoint x="770" y="220"/><di:waypoint x="820" y="220"/></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="df3_di" bpmnElement="df3"><di:waypoint x="1030" y="220"/><di:waypoint x="1090" y="220"/></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="df4_di" bpmnElement="df4"><di:waypoint x="1190" y="220"/><di:waypoint x="1240" y="220"/></bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</definitions>"""

d = call("POST", "/v1/process-definitions/drafts", tok, {
    "name": "出差申请（嵌套子流程）", "processKey": "main-sub-demo", "bpmnXml": SUB_XML})["data"]
draft_id = d["id"]
call("PUT", f"/v1/process-definitions/{draft_id}/design", tok, {"nodeConfigs": {
    "__PROCESS__": {"numberRule": {"enabled": True, "pattern": "SP-{{year}}{{month}}-{{seq:4}}"}},
    "d_submit": {"basic": {"name": "提交申请"}},
    "ds_approve": {"basic": {"name": "内部审批"}, "approval": {"type": "user", "userIds": ["1"]}},
    "ds_review": {"basic": {"name": "内部复核"}, "approval": {"type": "user", "userIds": ["1"]}},
    "d_record": {"basic": {"name": "结果归档"}, "approval": {"type": "user", "userIds": ["1"]}},
}})
dep = call("POST", f"/v1/process-definitions/{draft_id}/deploy", tok, {})["data"]
print(f"部署 main-sub-demo v{dep.get('version')} deployId={dep.get('deployId')}")

tok_test = call("POST", "/auth/login", body={"username": "test", "password": "123456"})["data"]["accessToken"]
st = call("POST", "/v1/process-instances", tok_test, {
    "processKey": "main-sub-demo",
    "variables": {"reason": "嵌套子流程演示：设备巡检异常复核"},
})["data"]
inst = call("GET", f"/v1/process-instances/{st['id']}", tok_test)["data"]
print(f"演示实例已发起: {st['id']} 编号={inst.get('businessKey')} 标题={inst.get('title')}")

todo = call("GET", "/v1/tasks?size=50", tok)["data"]["content"]
hit = [t for t in todo if t.get("processDefinitionKey") == "main-sub-demo"]
print(f"admin 待办命中 {len(hit)} 条: {json.dumps([{k: t.get(k) for k in ('id', 'name', 'businessKey')} for t in hit], ensure_ascii=False)}")

# ---------- 2) sequential 依次审批（带 DI） ----------
SEQ_XML = """<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:flowable="http://flowable.org/bpmn" xmlns:wf="http://workflow.lowcode/bpmn" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI">
  <process id="main-seq-demo" name="依次审批演示" isExecutable="true">
    <startEvent id="e_start" name="开始"/>
    <userTask id="e_submit" name="提交申请" wf:nodeRole="initiator" flowable:assignee="${initiator}"/>
    <userTask id="e_seq" name="依次审批">
      <multiInstanceLoopCharacteristics isSequential="true" flowable:collection="approverList" flowable:elementVariable="approver"/>
    </userTask>
    <endEvent id="e_end" name="结束"/>
    <sequenceFlow id="ef1" sourceRef="e_start" targetRef="e_submit"/>
    <sequenceFlow id="ef2" sourceRef="e_submit" targetRef="e_seq"/>
    <sequenceFlow id="ef3" sourceRef="e_seq" targetRef="e_end"/>
  </process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="main-seq-demo">
      <bpmndi:BPMNShape id="e_start_di" bpmnElement="e_start"><dc:Bounds x="180" y="202" width="36" height="36"/></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="e_submit_di" bpmnElement="e_submit"><dc:Bounds x="260" y="180" width="100" height="80"/></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="e_seq_di" bpmnElement="e_seq"><dc:Bounds x="420" y="180" width="100" height="80"/></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="e_end_di" bpmnElement="e_end"><dc:Bounds x="580" y="202" width="36" height="36"/></bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="ef1_di" bpmnElement="ef1"><di:waypoint x="216" y="220"/><di:waypoint x="260" y="220"/></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="ef2_di" bpmnElement="ef2"><di:waypoint x="360" y="220"/><di:waypoint x="420" y="220"/></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="ef3_di" bpmnElement="ef3"><di:waypoint x="520" y="220"/><di:waypoint x="580" y="220"/></bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</definitions>"""

d2 = call("POST", "/v1/process-definitions/drafts", tok, {
    "name": "依次审批演示", "processKey": "main-seq-demo", "bpmnXml": SEQ_XML})["data"]
call("PUT", f"/v1/process-definitions/{d2['id']}/design", tok, {"nodeConfigs": {
    "e_submit": {"basic": {"name": "提交申请"}},
    "e_seq": {"basic": {"name": "依次审批"}, "approval": {"type": "user", "multiMode": "sequential", "userIds": ["2", "1"]}},
}})
dep2 = call("POST", f"/v1/process-definitions/{d2['id']}/deploy", tok, {})["data"]
print(f"部署 main-seq-demo v{dep2.get('version')} deployId={dep2.get('deployId')}")

st2 = call("POST", "/v1/process-instances", tok_test, {
    "processKey": "main-seq-demo",
    "variables": {"reason": "依次审批演示：多级串行签核"},
})["data"]
print(f"依次实例已发起: {st2['id']}")
todo2 = call("GET", "/v1/tasks?size=50", tok_test)["data"]["content"]
hit2 = [t for t in todo2 if t.get("processDefinitionKey") == "main-seq-demo"]
print(f"test 待办命中: {json.dumps([{k: t.get(k) for k in ('id', 'name')} for t in hit2], ensure_ascii=False)}")

print("DONE")
