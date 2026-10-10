/**
 * 临时 E2E（Task 16）：callActivity 子流程展开引擎语义验证（隔离库直连引擎函数）。
 * 用法（先拷贝真实库三件套到 /tmp/t16.db）：
 *   BACKEND_NODE_DB=/tmp/t16.db bun run tmp-test-callactivity.ts
 * 覆盖：
 *   1. 子实例创建（PARENT_ID/PARENT_NODE_KEY 回链）+ inParams 变量映射
 *   2. 子任务完成 → 子实例完结 → outParams 回写父变量 → 父令牌离开调用活动
 *   3. 父实例续跑至 COMPLETED；轨迹（调用活动 COMPLETED）
 *   4. 同步直达子流程（start→end）：startProcess 内重入推进路径
 *   5. 级联终止（父终止 → 运行中子实例一并 CANCELED）
 * 一次性脚手架，测完可删。
 */
import { exec, query, queryOne } from "./src/lib/db";
import { nowStr, uuid32 } from "./src/lib/dialect";
import { deployDraft } from "./src/lib/engine/deploy";
import { completeTask, getVariables, startProcess, terminateInstance } from "./src/lib/engine/engine";

let pass = 0;
let fail = 0;
function check(cond: boolean, name: string, extra?: unknown): void {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.error(`  ✗ ${name}`, extra ?? ""); }
}

const WRAP = `<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:flowable="http://flowable.org/bpmn" xmlns:wf="http://workflow.lowcode/bpmn">`;
const BPMN_CHILD = `${WRAP}
  <process id="sub-travel-approve" name="出差审批子流程" isExecutable="true">
    <startEvent id="s_start" name="开始"/>
    <userTask id="sub_approve" name="子流程审批" flowable:assignee="\${subApprover}"/>
    <endEvent id="s_end" name="结束"/>
    <sequenceFlow id="sf1" sourceRef="s_start" targetRef="sub_approve"/>
    <sequenceFlow id="sf2" sourceRef="sub_approve" targetRef="s_end"/>
  </process>
</definitions>`;
const BPMN_CHILD_AUTO = `${WRAP}
  <process id="sub-auto" name="自动子流程" isExecutable="true">
    <startEvent id="a_start" name="开始"/>
    <endEvent id="a_end" name="结束"/>
    <sequenceFlow id="af1" sourceRef="a_start" targetRef="a_end"/>
  </process>
</definitions>`;
const BPMN_PARENT = `${WRAP}
  <process id="main-travel" name="出差申请主流程" isExecutable="true">
    <startEvent id="p_start" name="开始"/>
    <userTask id="p_submit" name="提交申请" wf:nodeRole="initiator" flowable:assignee="\${initiator}"/>
    <callActivity id="p_call" name="调用审批子流程" calledElement="sub-travel-approve"/>
    <userTask id="p_record" name="结果归档" flowable:assignee="\${archiveUser}"/>
    <endEvent id="p_end" name="结束"/>
    <sequenceFlow id="pf1" sourceRef="p_start" targetRef="p_submit"/>
    <sequenceFlow id="pf2" sourceRef="p_submit" targetRef="p_call"/>
    <sequenceFlow id="pf3" sourceRef="p_call" targetRef="p_record"/>
    <sequenceFlow id="pf4" sourceRef="p_record" targetRef="p_end"/>
  </process>
</definitions>`;
const BPMN_PARENT_AUTO = `${WRAP}
  <process id="main-auto" name="直达子流程主流程" isExecutable="true">
    <startEvent id="q_start" name="开始"/>
    <userTask id="q_submit" name="提交" wf:nodeRole="initiator" flowable:assignee="\${initiator}"/>
    <callActivity id="q_call" name="调用自动子流程" calledElement="sub-auto"/>
    <endEvent id="q_end" name="结束"/>
    <sequenceFlow id="qf1" sourceRef="q_start" targetRef="q_submit"/>
    <sequenceFlow id="qf2" sourceRef="q_submit" targetRef="q_call"/>
    <sequenceFlow id="qf3" sourceRef="q_call" targetRef="q_end"/>
  </process>
</definitions>`;

function insertDraft(key: string, name: string, xml: string, nodeConfigs: Record<string, object>): string {
  const id = uuid32();
  exec(
    `INSERT INTO WF_PROCESS_DRAFT (ID, TENANT_ID, NAME, PROCESS_KEY, BPMN_XML, STATUS, VERSION, CREATED_BY, CREATED_AT, UPDATED_AT)
     VALUES (?,?,?,?,?,'DRAFT',1,'tester',?,?)`,
    [id, "default", name, key, xml, nowStr(), nowStr()],
  );
  for (const [nodeId, cfg] of Object.entries(nodeConfigs)) {
    exec(
      `INSERT INTO WF_NODE_CONFIG (ID, TENANT_ID, PROCESS_DEF_ID, NODE_ID, NODE_TYPE, CONFIG_JSON) VALUES (?,?,?,?,?,?)`,
      [uuid32(), "default", id, nodeId, "userTask", JSON.stringify(cfg)],
    );
  }
  return id;
}

function taskOf(instId: string, nodeKey: string): { ID: string; ASSIGNEE: string | null; STATUS: string } | null {
  return queryOne(`SELECT ID, ASSIGNEE, STATUS FROM WF_TASK_INST WHERE PROC_INST_ID = ? AND NODE_KEY = ? AND STATUS = 'PENDING'`, [instId, nodeKey]);
}

// ================= 部署 =================
console.log("== 部署四个定义 ==");
const dSub = deployDraft(insertDraft("sub-travel-approve", "出差审批子流程", BPMN_CHILD, {
  sub_approve: { basic: { name: "子流程审批" } },
}), "tester");
check(dSub.version === 1, "子流程部署 v1", dSub);
const dAuto = deployDraft(insertDraft("sub-auto", "自动子流程", BPMN_CHILD_AUTO, {}), "tester");
check(dAuto.version === 1, "自动子流程部署 v1", dAuto);
const dMain = deployDraft(insertDraft("main-travel", "出差申请主流程", BPMN_PARENT, {
  p_submit: { basic: { name: "提交申请" } },
  p_call: {
    basic: { name: "调用审批子流程" },
    callActivity: {
      calledElement: "sub-travel-approve",
      inParams: [{ source: "approver", target: "subApprover" }],
      outParams: [{ source: "subResult", target: "archiveNote" }, { source: "archiveUser", target: "archiveUser" }],
    },
  },
  p_record: { basic: { name: "结果归档" } },
}), "tester");
check(dMain.version === 1, "主流程部署 v1", dMain);
deployDraft(insertDraft("main-auto", "直达子流程主流程", BPMN_PARENT_AUTO, {
  q_submit: { basic: { name: "提交" } },
  q_call: { basic: { name: "调用自动子流程" }, callActivity: { calledElement: "sub-auto" } },
}), "tester");

// ================= 场景 1：完整父子链路 =================
console.log("== 场景1：发起 → 提交 → 子流程 → 归档 → 办结 ==");
const st = startProcess({ procKey: "main-travel", starter: "admin", variables: { approver: "test" }, businessKey: "CC-2026-001" });
const parent = queryOne<{ ID: string; STATUS: string; BUSINESS_KEY: string }>("SELECT ID, STATUS, BUSINESS_KEY FROM WF_PROC_INST WHERE ID = ?", [st.id])!;
check(parent.STATUS === "RUNNING", "父实例 RUNNING");
check(parent.BUSINESS_KEY === "CC-2026-001", "父实例 BUSINESS_KEY");
// 发起人节点（wf:nodeRole=initiator）在 startProcess 内已自动 complete → 令牌直达调用活动并创建子实例
const tSubmitGone = taskOf(st.id, "p_submit");
check(!tSubmitGone, "发起节点任务已自动提交");
const child = queryOne<{ ID: string; STATUS: string; PARENT_ID: string; PARENT_NODE_KEY: string; START_USER: string; VARIABLES_JSON: string; TITLE: string }>(
  "SELECT ID, STATUS, PARENT_ID, PARENT_NODE_KEY, START_USER, VARIABLES_JSON, TITLE FROM WF_PROC_INST WHERE PARENT_ID = ?", [st.id])!;
check(!!child, "子实例已创建");
check(child?.PARENT_ID === st.id && child?.PARENT_NODE_KEY === "p_call", "子实例 PARENT_ID/PARENT_NODE_KEY 回链正确", child);
check(child?.START_USER === "admin", "子实例 START_USER 继承父", child?.START_USER);
check((child?.VARIABLES_JSON ?? "").includes('"subApprover":"test"'), "inParams 映射 approver→subApprover", child?.VARIABLES_JSON);
check((child?.VARIABLES_JSON ?? "").includes('"initiator":"admin"'), "子实例 initiator 继承", child?.VARIABLES_JSON);
check((child?.TITLE ?? "").includes("子流程"), "子实例 TITLE 带子流程标记", child?.TITLE);
const tSub = taskOf(child!.ID, "sub_approve");
check(tSub?.ASSIGNEE === "test", "子任务分配给变量审批人 test（XML assignee 变量）", tSub);
const parentToken = queryOne<{ NODE_KEY: string; STATUS: string }>(
  "SELECT NODE_KEY, STATUS FROM WF_EXEC_TOKEN WHERE PROC_INST_ID = ? AND STATUS = 'ACTIVE'", [st.id])!;
check(parentToken?.NODE_KEY === "p_call", "父令牌停在调用活动", parentToken);
const callAct = queryOne<{ STATUS: string }>(
  "SELECT STATUS FROM WF_ACTIVITY_INST WHERE PROC_INST_ID = ? AND NODE_KEY = 'p_call'", [st.id])!;
check(callAct?.STATUS === "RUNNING", "父图调用活动轨迹 RUNNING", callAct);

// 完成子任务（带 outParams 源变量）
completeTask({ taskId: tSub!.ID, userId: "test", variables: { subResult: "同意出差", archiveUser: "test" }, comment: "子流程通过", action: "approve" });
const childAfter = queryOne<{ STATUS: string; END_TIME: string | null }>("SELECT STATUS, END_TIME FROM WF_PROC_INST WHERE ID = ?", [child!.ID])!;
check(childAfter?.STATUS === "COMPLETED" && !!childAfter?.END_TIME, "子实例完结", childAfter);
const pvars = getVariables(queryOne("SELECT VARIABLES_JSON FROM WF_PROC_INST WHERE ID = ?", [st.id])!);
check(pvars["archiveNote"] === "同意出差", "outParams 回写 subResult→archiveNote", pvars);
check(pvars["archiveUser"] === "test", "outParams 回写 archiveUser→archiveUser", pvars);
const tRecord = taskOf(st.id, "p_record");
check(tRecord?.ASSIGNEE === "test", "父续跑：归档任务分配 archiveUser=test（变量 assignee）", tRecord);
const callActAfter = queryOne<{ STATUS: string; END_TIME: string | null }>(
  "SELECT STATUS, END_TIME FROM WF_ACTIVITY_INST WHERE PROC_INST_ID = ? AND NODE_KEY = 'p_call'", [st.id])!;
check(callActAfter?.STATUS === "COMPLETED" && !!callActAfter?.END_TIME, "调用活动轨迹 COMPLETED", callActAfter);

completeTask({ taskId: tRecord!.ID, userId: "test", variables: {}, comment: "归档完成", action: "approve" });
const parentAfter = queryOne<{ STATUS: string; END_TIME: string | null }>("SELECT STATUS, END_TIME FROM WF_PROC_INST WHERE ID = ?", [st.id])!;
check(parentAfter?.STATUS === "COMPLETED", "父实例办结", parentAfter);
const trail = query<{ NODE_KEY: string; STATUS: string; NODE_TYPE: string }>(
  "SELECT NODE_KEY, STATUS, NODE_TYPE FROM WF_ACTIVITY_INST WHERE PROC_INST_ID = ? ORDER BY START_TIME", [st.id]);
const nodeTrail = trail.filter((a) => a.NODE_TYPE !== "sequenceFlow").map((a) => `${a.NODE_KEY}:${a.STATUS}`);
check(nodeTrail.join(",").includes("p_start:COMPLETED") && nodeTrail.includes("p_call:COMPLETED") && nodeTrail.includes("p_record:COMPLETED"),
  "父实例轨迹完整", nodeTrail);

// ================= 场景 2：同步直达子流程（重入推进路径） =================
console.log("== 场景2：start→end 子流程，startProcess 内同步完成 ==");
const st2 = startProcess({ procKey: "main-auto", starter: "admin", variables: {}, businessKey: null });
const inst2 = queryOne<{ STATUS: string; END_TIME: string | null }>("SELECT STATUS, END_TIME FROM WF_PROC_INST WHERE ID = ?", [st2.id])!;
check(inst2?.STATUS === "COMPLETED" && !!inst2?.END_TIME, "父实例 startProcess 同步办结（直达子流程重入路径）", inst2);
const child2 = queryOne<{ STATUS: string }>("SELECT STATUS FROM WF_PROC_INST WHERE PARENT_ID = ?", [st2.id])!;
check(child2?.STATUS === "COMPLETED", "直达子实例 COMPLETED", child2);

// ================= 场景 3：级联终止 =================
console.log("== 场景3：父终止 → 运行中子实例级联取消 ==");
const st3 = startProcess({ procKey: "main-travel", starter: "admin", variables: { approver: "test" }, businessKey: "CC-2026-002" });
const child3 = queryOne<{ ID: string; STATUS: string }>("SELECT ID, STATUS FROM WF_PROC_INST WHERE PARENT_ID = ?", [st3.id])!;
check(child3?.STATUS === "RUNNING", "场景3 子实例运行中", child3);
terminateInstance(st3.id, "audit-test");
const p3 = queryOne<{ STATUS: string; DELETE_REASON: string }>("SELECT STATUS, DELETE_REASON FROM WF_PROC_INST WHERE ID = ?", [st3.id])!;
const c3 = queryOne<{ STATUS: string; DELETE_REASON: string }>("SELECT STATUS, DELETE_REASON FROM WF_PROC_INST WHERE ID = ?", [child3!.ID])!;
check(p3?.STATUS === "CANCELED", "父实例 CANCELED", p3);
check(c3?.STATUS === "CANCELED" && c3?.DELETE_REASON === "audit-test", "子实例级联 CANCELED(reason 随父)", c3);
const c3task = queryOne<{ STATUS: string }>("SELECT STATUS FROM WF_TASK_INST WHERE PROC_INST_ID = ? AND STATUS != 'CANCELED'", [child3!.ID])!;
check(!c3task, "子实例无遗留未取消任务");

// ================= 汇总 =================
console.log(`\n结果: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
