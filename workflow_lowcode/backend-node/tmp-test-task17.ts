/**
 * 临时 E2E（Task 17）：subProcess 嵌套展开 + sequential MI 依次多实例 + numberRule 编号规则。
 * 用法（先拷贝真实库三件套到 /tmp/t17.db）：
 *   BACKEND_NODE_DB=/tmp/t17.db bun run tmp-test-task17.ts
 * 覆盖：
 *   A. subProcess：令牌入子图（SCOPE 入栈）→ 内图任务 → 内 endEvent 弹栈出图 → 后续节点 → COMPLETED
 *      + 轨迹（subProcess RUNNING→COMPLETED、内层节点/连线入高亮）+ 驳回守卫兼容（实例级取消）
 *   B. sequential MI：仅展开第 1 位 → 完成 → 链式第 2/3 位 → 全部完成后组延续出线 → endEvent
 *      + approverList 变量注入 + MI_TOTAL 记账
 *   C. numberRule：{{year}}-{{seq:4}} 生成 businessNo → BUSINESS_KEY/TITLE/变量 businessNo 落库 + 按月自增
 * 一次性脚手架，测完可删。
 */
import { exec, query, queryOne } from "./src/lib/db";
import { nowStr, uuid32 } from "./src/lib/dialect";
import { deployDraft } from "./src/lib/engine/deploy";
import { completeTask, getVariables, loadDeployForInstance, rejectTask, startProcess, predict } from "./src/lib/engine/engine";

let pass = 0;
let fail = 0;
function check(cond: boolean, name: string, extra?: unknown): void {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.error(`  ✗ ${name}`, extra ?? ""); }
}

const WRAP = `<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:flowable="http://flowable.org/bpmn" xmlns:wf="http://workflow.lowcode/bpmn">`;

// A：嵌套 subProcess（内含 userTask + 内图终点）
const BPMN_SUB = `${WRAP}
  <process id="proc-sub" name="内嵌子流程测试" isExecutable="true">
    <startEvent id="a_start" name="开始"/>
    <userTask id="a_submit" name="提交申请" wf:nodeRole="initiator" flowable:assignee="\${initiator}"/>
    <subProcess id="a_sub" name="内部审批段">
      <startEvent id="s1_start" name="开始"/>
      <userTask id="s1_approve" name="内部审批" flowable:assignee="1"/>
      <userTask id="s1_review" name="内部复核" flowable:assignee="1"/>
      <endEvent id="s1_end" name="结束"/>
      <sequenceFlow id="sf1" sourceRef="s1_start" targetRef="s1_approve"/>
      <sequenceFlow id="sf2" sourceRef="s1_approve" targetRef="s1_review"/>
      <sequenceFlow id="sf3" sourceRef="s1_review" targetRef="s1_end"/>
    </subProcess>
    <userTask id="a_record" name="结果归档" flowable:assignee="1"/>
    <endEvent id="a_end" name="结束"/>
    <sequenceFlow id="af1" sourceRef="a_start" targetRef="a_submit"/>
    <sequenceFlow id="af2" sourceRef="a_submit" targetRef="a_sub"/>
    <sequenceFlow id="af3" sourceRef="a_sub" targetRef="a_record"/>
    <sequenceFlow id="af4" sourceRef="a_record" targetRef="a_end"/>
  </process>
</definitions>`;

// B：sequential 依次多实例（3 人：发起人提交后进入）
const BPMN_SEQ = `${WRAP}
  <process id="proc-seq" name="依次审批测试" isExecutable="true">
    <startEvent id="b_start" name="开始"/>
    <userTask id="b_submit" name="提交申请" wf:nodeRole="initiator" flowable:assignee="\${initiator}"/>
    <userTask id="b_seq" name="依次审批">
      <multiInstanceLoopCharacteristics isSequential="true" flowable:collection="approverList" flowable:elementVariable="approver"/>
    </userTask>
    <endEvent id="b_end" name="结束"/>
    <sequenceFlow id="bf1" sourceRef="b_start" targetRef="b_submit"/>
    <sequenceFlow id="bf2" sourceRef="b_submit" targetRef="b_seq"/>
    <sequenceFlow id="bf3" sourceRef="b_seq" targetRef="b_end"/>
  </process>
</definitions>`;

// C：编号规则
const BPMN_NUM = `${WRAP}
  <process id="proc-num" name="编号规则测试" isExecutable="true">
    <startEvent id="c_start" name="开始"/>
    <endEvent id="c_end" name="结束"/>
    <sequenceFlow id="cf1" sourceRef="c_start" targetRef="c_end"/>
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

function pendingTasks(instId: string): Array<{ ID: string; NODE_KEY: string; ASSIGNEE: string | null; MI_INDEX: number | null; MI_TOTAL: number | null; STATUS: string }> {
  return query(`SELECT ID, NODE_KEY, ASSIGNEE, MI_INDEX, MI_TOTAL, STATUS FROM WF_TASK_INST WHERE PROC_INST_ID = ? AND STATUS = 'PENDING'`, [instId]);
}
function activeTokens(instId: string): Array<{ NODE_KEY: string; SCOPE: string | null; STATUS: string }> {
  return query(`SELECT NODE_KEY, SCOPE, STATUS FROM WF_EXEC_TOKEN WHERE PROC_INST_ID = ? AND STATUS = 'ACTIVE'`, [instId]);
}

// ================= A. subProcess 嵌套展开 =================
console.log("== A. subProcess 嵌套图展开 ==");
const dSub = deployDraft(insertDraft("proc-sub", "内嵌子流程测试", BPMN_SUB, {
  a_submit: { basic: { name: "提交申请" } },
  s1_approve: { basic: { name: "内部审批" } },
  s1_review: { basic: { name: "内部复核" } },
  a_record: { basic: { name: "结果归档" } },
}), "tester");
check(!!dSub.deployId, "subProcess 定义部署", dSub);

const stA = startProcess({ procKey: "proc-sub", starter: "admin", businessKey: "SP-001" });
const tasksA1 = pendingTasks(stA.id);
check(tasksA1.length === 1 && tasksA1[0].NODE_KEY === "s1_approve", "发起人自动提交 → 内层首任务「内部审批」等待", tasksA1);
const toksA1 = activeTokens(stA.id);
check(toksA1.length === 1 && toksA1[0].SCOPE === "a_sub" && toksA1[0].NODE_KEY === "s1_approve", "令牌入子图（SCOPE=a_sub）", toksA1);
const subAct = queryOne<{ STATUS: string }>(`SELECT STATUS FROM WF_ACTIVITY_INST WHERE PROC_INST_ID = ? AND NODE_KEY = 'a_sub'`, [stA.id]);
check(subAct?.STATUS === "RUNNING", "subProcess 节点轨迹 RUNNING", subAct);

// 完成内层审批 → 内层复核
const t1 = tasksA1[0];
completeTask({ taskId: t1.ID, userId: "1", action: "approve" });
const tasksA2 = pendingTasks(stA.id);
check(tasksA2.length === 1 && tasksA2[0].NODE_KEY === "s1_review", "内层审批完成 → 内层复核等待", tasksA2);

// 完成内层复核 → 内 endEvent → 弹栈出图 → 结果归档
completeTask({ taskId: tasksA2[0].ID, userId: "1", action: "approve" });
const tasksA3 = pendingTasks(stA.id);
check(tasksA3.length === 1 && tasksA3[0].NODE_KEY === "a_record", "子图收尾弹栈 → 「结果归档」等待", tasksA3);
const toksA3 = activeTokens(stA.id);
check(toksA3.length === 1 && toksA3[0].SCOPE === null && toksA3[0].NODE_KEY === "a_record", "令牌已出子图（SCOPE=NULL）", toksA3);
const subAct2 = queryOne<{ STATUS: string }>(`SELECT STATUS FROM WF_ACTIVITY_INST WHERE PROC_INST_ID = ? AND NODE_KEY = 'a_sub'`, [stA.id]);
check(subAct2?.STATUS === "COMPLETED", "subProcess 节点轨迹 COMPLETED", subAct2);

// 预测包含内层节点（全图静态遍历入口验证——当前实例已在归档节点，用定义级预测）
const depA = loadDeployForInstance(stA.id)!;
const predA = predict(depA.ID, null, "admin", {});
check(predA.nodes.some((n) => n.nodeId === "s1_approve"), "预测展开内层任务「内部审批」", predA.nodes.map((n) => n.nodeId));

// 高亮：内层节点与内层连线都进轨迹
completeTask({ taskId: tasksA3[0].ID, userId: "1", action: "approve" });
const instA = queryOne<{ STATUS: string }>("SELECT STATUS FROM WF_PROC_INST WHERE ID = ?", [stA.id]);
check(instA?.STATUS === "COMPLETED", "实例办结 COMPLETED", instA);
const innerDone = queryOne<{ C: number }>(`SELECT COUNT(*) C FROM WF_ACTIVITY_INST WHERE PROC_INST_ID = ? AND NODE_KEY = 's1_review' AND STATUS = 'COMPLETED'`, [stA.id]);
check((innerDone?.C ?? 0) > 0, "内层节点轨迹已记录（高亮可用）", innerDone);
const innerFlow = queryOne<{ C: number }>(`SELECT COUNT(*) C FROM WF_ACTIVITY_INST WHERE PROC_INST_ID = ? AND NODE_KEY = 'sf2' AND NODE_TYPE = 'sequenceFlow'`, [stA.id]);
check((innerFlow?.C ?? 0) > 0, "内层连线轨迹已记录", innerFlow);

// A2：subProcess 内驳回（发起人节点不在子图，驳回应回发起节点并清空子图令牌/任务）
const stA2 = startProcess({ procKey: "proc-sub", starter: "admin", businessKey: "SP-002" });
const tA2 = pendingTasks(stA2.id)[0];
rejectTask(tA2.ID, "1", "内层驳回测试");
const tasksA2r = pendingTasks(stA2.id);
check(tasksA2r.length === 1 && tasksA2r[0].NODE_KEY === "a_submit", "内层驳回 → 回发起节点重新提交", tasksA2r);
const toksA2r = activeTokens(stA2.id);
check(toksA2r.length === 1 && toksA2r[0].SCOPE === null && toksA2r[0].NODE_KEY === "a_submit", "驳回后令牌在顶层发起节点", toksA2r);

// ================= B. sequential 依次多实例 =================
console.log("== B. sequential 依次多实例 ==");
const users = query<{ ID: string; USERNAME: string }>("SELECT ID, USERNAME FROM SYS_USER WHERE IS_DELETED = 0 ORDER BY ID LIMIT 3");
console.log("  参与用户:", users.map((u) => `${u.USERNAME}=${u.ID}`).join(", "));
const u1 = String(users[0]?.ID ?? "1");
const u2 = String(users[1]?.ID ?? "2");
const u3 = String(users[2]?.ID ?? "3");
const dSeq = deployDraft(insertDraft("proc-seq", "依次审批测试", BPMN_SEQ, {
  b_seq: { basic: { name: "依次审批" }, approval: { type: "user", multiMode: "sequential", userIds: [u1, u2, u3] } },
}), "tester");
check(!!dSeq.deployId, "sequential 定义部署", dSeq);

const stB = startProcess({ procKey: "proc-seq", starter: "admin", businessKey: "SEQ-001" });
const tB1 = pendingTasks(stB.id);
check(tB1.length === 1 && tB1[0].NODE_KEY === "b_seq" && String(tB1[0].ASSIGNEE) === u1 && tB1[0].MI_INDEX === 1 && tB1[0].MI_TOTAL === 3,
  "仅第 1 位审批人任务展开（index=1/total=3）", tB1);
check((getVariables(queryOne("SELECT VARIABLES_JSON FROM WF_PROC_INST WHERE ID = ?", [stB.id])!)["approverList"] as string[]).length === 3,
  "approverList 变量注入");

completeTask({ taskId: tB1[0].ID, userId: u1, action: "approve" });
const tB2 = pendingTasks(stB.id);
check(tB2.length === 1 && String(tB2[0].ASSIGNEE) === u2 && tB2[0].MI_INDEX === 2, "第 1 位完成 → 链式展开第 2 位", tB2);
check(queryOne<{ C: number }>("SELECT COUNT(*) C FROM WF_TASK_INST WHERE ID = ?", [tB1[0].ID])?.C === 1
  && queryOne<{ STATUS: string }>("SELECT STATUS FROM WF_TASK_INST WHERE ID = ?", [tB1[0].ID])?.STATUS === "COMPLETED", "第 1 位任务已完结");

completeTask({ taskId: tB2[0].ID, userId: u2, action: "approve" });
const tB3 = pendingTasks(stB.id);
check(tB3.length === 1 && String(tB3[0].ASSIGNEE) === u3 && tB3[0].MI_INDEX === 3, "第 2 位完成 → 链式展开第 3 位", tB3);

completeTask({ taskId: tB3[0].ID, userId: u3, action: "approve" });
const instB = queryOne<{ STATUS: string }>("SELECT STATUS FROM WF_PROC_INST WHERE ID = ?", [stB.id]);
check(instB?.STATUS === "COMPLETED", "第 3 位完成 → 组延续 → 实例办结 COMPLETED", instB);
check(activeTokens(stB.id).length === 0, "令牌全部收敛");

// ================= C. numberRule 编号规则 =================
console.log("== C. numberRule 编号规则 ==");
const dNum = deployDraft(insertDraft("proc-num", "编号规则测试", BPMN_NUM, {
  __PROCESS__: { numberRule: { enabled: true, pattern: "QJ-{{year}}{{month}}-{{seq:4}}" } },
}), "tester");
check(!!dNum.deployId, "numberRule 定义部署", dNum);
const stC1 = startProcess({ procKey: "proc-num", starter: "admin" });
const rowC1 = queryOne<{ BUSINESS_KEY: string | null; TITLE: string | null; VARIABLES_JSON: string }>("SELECT BUSINESS_KEY, TITLE, VARIABLES_JSON FROM WF_PROC_INST WHERE ID = ?", [stC1.id])!;
const year = new Date().getFullYear();
const month = String(new Date().getMonth() + 1).padStart(2, "0");
const expectNo1 = `QJ-${year}${month}-0001`;
check(rowC1.BUSINESS_KEY === expectNo1, "BUSINESS_KEY=编号规则生成值", { got: rowC1.BUSINESS_KEY, want: expectNo1 });
check(rowC1.TITLE === expectNo1, "TITLE=编号规则生成值", rowC1.TITLE);
check((JSON.parse(rowC1.VARIABLES_JSON) as Record<string, unknown>)["businessNo"] === expectNo1, "变量 businessNo 落库");
const stC2 = startProcess({ procKey: "proc-num", starter: "admin" });
const rowC2 = queryOne<{ BUSINESS_KEY: string | null }>("SELECT BUSINESS_KEY FROM WF_PROC_INST WHERE ID = ?", [stC2.id])!;
check(rowC2.BUSINESS_KEY === `QJ-${year}${month}-0002`, "同月第二笔自增 0002", rowC2.BUSINESS_KEY);
// 显式 businessKey 优先，但编号变量仍然生成
const stC3 = startProcess({ procKey: "proc-num", starter: "admin", businessKey: "CUSTOM-KEY" });
const rowC3 = queryOne<{ BUSINESS_KEY: string | null; VARIABLES_JSON: string }>("SELECT BUSINESS_KEY, VARIABLES_JSON FROM WF_PROC_INST WHERE ID = ?", [stC3.id])!;
check(rowC3.BUSINESS_KEY === "CUSTOM-KEY", "显式 businessKey 优先于编号", rowC3.BUSINESS_KEY);
check((JSON.parse(rowC3.VARIABLES_JSON) as Record<string, unknown>)["businessNo"] === `QJ-${year}${month}-0003`, "编号变量照常生成（可作关联键）");

// ================= 汇总 =================
console.log(`\n===== 结果: ${pass} passed, ${fail} failed =====`);
if (fail > 0) process.exit(1);
