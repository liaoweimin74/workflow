/**
 * 流程实例（运行时 + 历史 + 变量）——ProcessInstanceController / ProcessHistoryController /
 * ProcessVariableController 合并移植（Task 13-6）。mount 前缀：/api/v1/process-instances（16 端点）
 */
/* mount: /api/v1/process-instances */
import { Router } from "express";
import type { Request, Response } from "express";
import { ok } from "../../lib/http";
import { BusinessException } from "../../lib/errors";
import { exec, mapRow, pageParams, query, queryOne, tx } from "../../lib/db";
import { nowStr, uuid32 } from "../../lib/dialect";
import {
  currentNodeKeys, getIR, getVariables, loadDeployForInstance, pendingTasksOfUser, predict, recallInstance, startProcess,
  suspendInstance, resumeInstance, terminateInstance, getInst,
} from "../../lib/engine/engine";
import type { InstRow, TaskRow } from "../../lib/engine/engine";

const router = Router();
const INST = "WF_PROC_INST";
const TASK = "WF_TASK_INST";

function pageOut(rows: Record<string, unknown>[], page: number, size: number, total: number) {
  return { content: rows, pageNumber: page, pageSize: size, totalElements: total, totalPages: Math.ceil(total / size) };
}

function instView(inst: Record<string, unknown>) {
  const r = mapRow(INST, inst) as Record<string, unknown>;
  void r;
  const id = String(r.id);
  const rawStatus = String(r.status ?? "RUNNING");
  // 对齐前端 ProcessInstanceVO：status ∈ running|suspended|completed
  const status = rawStatus === "SUSPENDED" ? "suspended" : rawStatus === "RUNNING" ? "running" : "completed";
  // currentNode：取运行中活动的节点名（旧/新数据通用）
  const actNames = query<{ NODE_NAME: string | null }>(
    `SELECT DISTINCT NODE_NAME FROM WF_ACTIVITY_INST WHERE PROC_INST_ID = ? AND STATUS = 'RUNNING' AND NODE_TYPE = 'userTask'`,
    [id],
  ).map((a) => a.NODE_NAME).filter(Boolean);
  // 流程定义名：DEPLOY_ID 优先，旧实例（DEPLOY_ID 为空）按 PROC_KEY 兑底最新 deploy
  const dep = loadDeployForInstance(id);
  const defName = dep?.PROC_NAME ?? (r.procName as string | null) ?? r.procKey;
  // callActivity 子流程标记（Task 16）：父实例名回显，供前端「子流程」徽标/跳转
  const parentId = (r.parentId as string | null) ?? null;
  const parent = parentId
    ? queryOne<{ TITLE: string | null; PROC_NAME: string | null }>("SELECT TITLE, PROC_NAME FROM WF_PROC_INST WHERE ID = ?", [parentId])
    : null;
  return {
    id,
    processDefinitionId: (r.deployId as string | null) ?? dep?.ID ?? r.procKey,
    processDefinitionKey: r.procKey,
    processDefinitionName: defName,
    businessKey: r.businessKey ?? null,
    tenantId: r.tenantId ?? null,
    suspended: status === "suspended",
    ended: status === "completed",
    name: (r.title as string | null) ?? defName,
    startTime: r.startTime,
    currentNode: actNames.length ? actNames.join(",") : null,
    status,
    // 附加原始字段（详情/高亮页使用）
    procKey: r.procKey, procName: r.procName, procVersion: r.procVersion, startUser: r.startUser,
    endTime: r.endTime, deleteReason: r.deleteReason, currentNodes: currentNodesOf(id),
    // callActivity 子流程链接
    parentId, parentTitle: parent ? (parent.TITLE ?? parent.PROC_NAME) : null,
  };
}

function currentNodesOf(instId: string): string[] {
  return currentNodeKeys(instId);
}

/** POST /：启动流程 { processKey, businessKey?, variables?, formDefId? } */
router.post("/", (req: Request, res: Response) => {
  const userId = req.loginUser!.userId;
  const body = req.body as { processKey?: string; businessKey?: string; variables?: Record<string, unknown>; formDefId?: string };
  if (!body.processKey) throw new BusinessException("processKey 不能为空", 400);
  const result = startProcess({
    procKey: body.processKey, starter: userId,
    variables: (body.variables ?? {}) as never,
    businessKey: body.businessKey ?? null, formDefId: body.formDefId ?? null,
  });
  ok(res, result);
});

/** GET /：运行中实例分页（initiator/businessKey/procKey） */
router.get("/", (req: Request, res: Response) => {
  const { page, size, offset } = pageParams(req.query as Record<string, unknown>);
  const conds = ["STATUS = 'RUNNING'"];
  const params: unknown[] = [];
  const initiator = (req.query.initiator as string) || "";
  if (initiator) { conds.push("(START_USER = ? OR JSON_EXTRACT(VARIABLES_JSON, '$.initiator') = ?)"); params.push(initiator, initiator); }
  const businessKey = req.query.businessKey as string;
  if (businessKey) { conds.push("BUSINESS_KEY = ?"); params.push(businessKey); }
  const procKey = req.query.processKey as string;
  if (procKey) { conds.push("PROC_KEY = ?"); params.push(procKey); }
  const nameLike = req.query.processDefinitionName as string;
  if (nameLike) {
    // 旧实例 PROC_NAME 为空 → 同时匹配 PROC_KEY 与 deploy 快照名
    conds.push(`(PROC_NAME LIKE ? OR PROC_KEY LIKE ? OR EXISTS (SELECT 1 FROM WF_PROC_DEPLOY d WHERE (d.ID = ${INST}.DEPLOY_ID OR (${INST}.DEPLOY_ID IS NULL AND d.PROC_KEY = ${INST}.PROC_KEY)) AND d.PROC_NAME LIKE ?))`);
    params.push(`%${nameLike}%`, `%${nameLike}%`, `%${nameLike}%`);
  }
  const where = `WHERE ${conds.join(" AND ")}`;
  const total = (queryOne<{ C: number }>(`SELECT COUNT(*) C FROM ${INST} ${where}`, params)?.C ?? 0) as number;
  const rows = query(`SELECT * FROM ${INST} ${where} ORDER BY START_TIME DESC LIMIT ? OFFSET ?`, [...params, size, offset] as never[]);
  ok(res, pageOut(rows.map((r) => ({ ...instView(r), currentNodeKeys: currentNodesOf((r as { ID: string }).ID) })), page, size, total));
});

/** GET /history：历史实例分页（我发起的：initiator/finished） */
router.get("/history", (req: Request, res: Response) => {
  const { page, size, offset } = pageParams(req.query as Record<string, unknown>);
  const conds: string[] = [];
  const params: unknown[] = [];
  const initiator = (req.query.initiator as string) || (req.query.startedBy as string) || "";
  if (initiator) { conds.push("(START_USER = ? OR JSON_EXTRACT(VARIABLES_JSON, '$.initiator') = ?)"); params.push(initiator, initiator); }
  const finished = req.query.finished as string;
  if (finished === "true") conds.push("STATUS IN ('COMPLETED','CANCELED','REJECTED')");
  else if (finished === "false") conds.push("STATUS = 'RUNNING'");
  const procKey = req.query.processKey as string;
  if (procKey) { conds.push("PROC_KEY = ?"); params.push(procKey); }
  const startAfter = req.query.startedAfter as string;
  if (startAfter) { conds.push("START_TIME >= ?"); params.push(startAfter); }
  const startBefore = req.query.startedBefore as string;
  if (startBefore) { conds.push("START_TIME <= ?"); params.push(startBefore); }
  const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";
  const total = (queryOne<{ C: number }>(`SELECT COUNT(*) C FROM ${INST} ${where}`, params)?.C ?? 0) as number;
  const rows = query(`SELECT * FROM ${INST} ${where} ORDER BY START_TIME DESC LIMIT ? OFFSET ?`, [...params, size, offset] as never[]);
  ok(res, pageOut(rows.map(instView), page, size, total));
});

/** GET /{id}/history：实例审批记录时间线（Java 契约：ApprovalRecordVO[] 扁平数组，Task 17 修复——
 *  原 {timeline} 包装 + nodeId/nodeName 字段名与前端 ApprovalTimeline 期望的 activityId/activityName 错位，时间线从未渲染） */
router.get("/:id/history", (req: Request, res: Response) => {
  const instId = req.params.id;
  const acts = query<Record<string, unknown>>(
    "SELECT * FROM WF_ACTIVITY_INST WHERE PROC_INST_ID = ? ORDER BY START_TIME", [instId]);
  const comments = query<Record<string, unknown>>(
    "SELECT * FROM WF_TASK_COMMENT WHERE PROCESS_INSTANCE_ID = ? ORDER BY CREATED_AT", [instId]);
  // WF_ACTIVITY_INST 无 TASK_ID 列 → 按 NODE_KEY 队列把 comment 关联到对应活动（时间升序消费）
  const tasksOfInst = query<{ ID: string; NODE_KEY: string }>(`SELECT ID, NODE_KEY FROM ${TASK} WHERE PROC_INST_ID = ?`, [instId]);
  const commentsByTask = new Map<string, Record<string, unknown>>();
  for (const c of comments) if (!commentsByTask.has(c.TASK_ID as string)) commentsByTask.set(c.TASK_ID as string, c);
  const queueByNode = new Map<string, Record<string, unknown>[]>();
  for (const t of tasksOfInst) {
    const c = commentsByTask.get(t.ID);
    if (c) (queueByNode.get(t.NODE_KEY) ?? queueByNode.set(t.NODE_KEY, []).get(t.NODE_KEY)!).push(c);
  }
  const nickname = (uid: unknown): string | null =>
    uid ? queryOne<{ NICKNAME: string | null }>("SELECT NICKNAME FROM SYS_USER WHERE ID = ?", [String(uid)])?.NICKNAME ?? null : null;
  const timeline = acts
    .filter((a) => (a.NODE_TYPE as string) === "userTask")
    .map((a) => {
      const q = queueByNode.get(a.NODE_KEY as string);
      const c = q && q.length ? q.shift()! : null;
      const assignee = (a.ASSIGNEE as string | null) ?? null;
      return {
        // Java ApprovalRecordVO 契约字段
        activityId: a.NODE_KEY, activityName: a.NODE_NAME,
        assignee, assigneeName: nickname(assignee),
        startTime: a.START_TIME, endTime: a.END_TIME,
        action: c?.ACTION ?? a.ACTION ?? null, comment: c?.COMMENT ?? a.COMMENT ?? null,
        // 附加原始字段（兼容旧消费方）
        activityInstanceId: a.ID, nodeId: a.NODE_KEY, nodeName: a.NODE_NAME, nodeType: a.NODE_TYPE,
        status: a.STATUS, commentUserId: c?.USER_ID ?? null, commentTime: c?.CREATED_AT ?? null,
      };
    });
  ok(res, timeline);
});

/** PUT /tasks/{taskId}/variables：任务级写 → 落实例变量（对齐 RuntimeService.setVariables(task execution)） */
router.put("/tasks/:taskId/variables", (req: Request, res: Response) => {
  const task = queryOne<TaskRow>(`SELECT * FROM ${TASK} WHERE ID = ?`, [req.params.taskId]);
  if (!task) throw new BusinessException("任务不存在", 404);
  const inst = getInst(task.PROC_INST_ID);
  const body = req.body as Record<string, unknown>;
  tx(() => {
    const vars = getVariables(inst);
    Object.assign(vars, body);
    exec("UPDATE WF_PROC_INST SET VARIABLES_JSON = ? WHERE ID = ?", [JSON.stringify(vars), inst.ID]);
  });
  ok(res, null);
});

// 兼容 /tasks/{taskId}/variables 前缀挂载在 /api/v1/process-instances 下（路径冲突：/tasks 需在 /:id 之前注册）
void pendingTasksOfUser; void nowStr; void uuid32;


/** GET /{id}：实例详情（runtime 优先） */
router.get("/:id", (req: Request, res: Response) => {
  const inst = queryOne<Record<string, unknown>>(`SELECT * FROM ${INST} WHERE ID = ?`, [req.params.id]);
  if (!inst) throw new BusinessException("流程实例不存在", 404);
  ok(res, { ...instView(inst), currentNodes: currentNodesOf(req.params.id) });
});

/** POST /{id}/suspend：挂起 */
router.post("/:id/suspend", (req: Request, res: Response) => { suspendInstance(req.params.id); ok(res, null); });

/** POST /:id/recall：发起人撤回（回退到发起人节点重新提交；对齐 reject 的 changeActivityState 语义） */
router.post("/:id/recall", (req: Request, res: Response) => {
  const result = recallInstance(req.params.id, req.loginUser!.userId, (req.body as { comment?: string } | undefined)?.comment ?? null);
  ok(res, result);
});
/** POST /{id}/resume：恢复 */
router.post("/:id/resume", (req: Request, res: Response) => { resumeInstance(req.params.id); ok(res, null); });
/** POST /{id}/terminate：终止 { reason? } */
router.post("/:id/terminate", (req: Request, res: Response) => {
  terminateInstance(req.params.id, (req.body as { reason?: string })?.reason ?? "manual-terminate");
  ok(res, null);
});

/** GET /{id}/highlight：流程图高亮（Task 17 修复：前端 BpmnViewer 消费 Java 契约字段 completedActivityIds/activeActivityIds，
 *  原 completedNodeIds/activeNodeIds 命名导致高亮从未在 UI 生效；两套字段名同时返回兼容） */
router.get("/:id/highlight", (req: Request, res: Response) => {
  const instId = req.params.id;
  const inst = queryOne<InstRow>(`SELECT * FROM ${INST} WHERE ID = ?`, [instId]);
  if (!inst) throw new BusinessException("流程实例不存在", 404);
  // 兜底：旧实例无 DEPLOY_ID → 按 PROC_KEY 找最新 deploy（历史数据兼容）
  const deploy = loadDeployForInstance(instId);
  const completedActs = query<{ NODE_KEY: string; NODE_TYPE: string; END_TIME: string | null; STATUS: string }>(
    "SELECT NODE_KEY, NODE_TYPE, END_TIME, STATUS FROM WF_ACTIVITY_INST WHERE PROC_INST_ID = ? ORDER BY START_TIME", [instId]);
  const completedNodes = [...new Set(completedActs.filter((a) => a.END_TIME && a.NODE_TYPE !== "sequenceFlow").map((a) => a.NODE_KEY))];
  const completedFlows = [...new Set(completedActs.filter((a) => a.NODE_TYPE === "sequenceFlow" && a.END_TIME).map((a) => a.NODE_KEY))];
  const activeNodes = [...new Set(currentNodeKeys(instId))];
  ok(res, {
    processInstanceId: instId,
    // Java 契约字段（前端消费）
    completedActivityIds: completedNodes, activeActivityIds: activeNodes, completedFlowActivityIds: completedFlows,
    // 旧 Node 版字段名（保留兼容）
    completedNodeIds: completedNodes, activeNodeIds: activeNodes, completedFlowIds: completedFlows,
    procKey: inst.PROC_KEY,
  });
});

/** GET /{id}/prediction：预测（当前节点向后静态遍历；对齐 ProcessTaskPredictionService 输出结构） */
router.get("/:id/prediction", (req: Request, res: Response) => {
  const inst = getInst(req.params.id);
  const deploy = loadDeployForInstance(inst.ID);
  if (!deploy) throw new BusinessException("流程定义不存在", 404);
  const vars = getVariables(inst);
  // 以当前活跃节点为起点近似预测：预测 API 从定义起点全图遍历（有变量即可求值）
  const result = predict(deploy.ID, null, String(vars["initiator"] ?? inst.START_USER ?? ""), vars as never);
  ok(res, result);
});

// ---------- 变量管理（ProcessVariableController） ----------

/** GET /{processInstanceId}/variables */
router.get("/:id/variables", (req: Request, res: Response) => {
  const inst = getInst(req.params.id);
  ok(res, getVariables(inst));
});

/** GET /{processInstanceId}/variables/{name} */
router.get("/:id/variables/:name", (req: Request, res: Response) => {
  const inst = getInst(req.params.id);
  const v = getVariables(inst)[req.params.name];
  if (v === undefined) throw new BusinessException(`变量不存在: ${req.params.name}`, 404);
  ok(res, v);
});

/** PUT /{processInstanceId}/variables：批量写 */
router.put("/:id/variables", (req: Request, res: Response) => {
  const inst = getInst(req.params.id);
  const body = req.body as Record<string, unknown>;
  tx(() => {
    const vars = getVariables(inst);
    Object.assign(vars, body);
    exec("UPDATE WF_PROC_INST SET VARIABLES_JSON = ? WHERE ID = ?", [JSON.stringify(vars), inst.ID]);
  });
  ok(res, null);
});

/** PUT /{processInstanceId}/variables/{name} */
router.put("/:id/variables/:name", (req: Request, res: Response) => {
  const inst = getInst(req.params.id);
  const value = (req.body as { value?: unknown })?.value ?? req.body;
  tx(() => {
    const vars = getVariables(inst);
    vars[req.params.name] = value as never;
    exec("UPDATE WF_PROC_INST SET VARIABLES_JSON = ? WHERE ID = ?", [JSON.stringify(vars), inst.ID]);
  });
  ok(res, null);
});

/** DELETE /{processInstanceId}/variables/{name} */
router.delete("/:id/variables/:name", (req: Request, res: Response) => {
  const inst = getInst(req.params.id);
  tx(() => {
    const vars = getVariables(inst);
    delete vars[req.params.name];
    exec("UPDATE WF_PROC_INST SET VARIABLES_JSON = ? WHERE ID = ?", [JSON.stringify(vars), inst.ID]);
  });
  ok(res, null);
});

export default router;
