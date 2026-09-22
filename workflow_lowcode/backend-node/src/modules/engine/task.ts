/**
 * 任务（待办/已办/详情/办理/特殊操作/催办）——TaskController + TaskRemindController 合并移植（Task 13-6）
 * mount 前缀：/api/v1/tasks（14 端点）
 * 详情 VO 组装：表单权限（节点级>流程级）/变量/候选人/operations AND 合并（C.11）。
 */
/* mount: /api/v1/tasks */
import { Router } from "express";
import type { Request, Response } from "express";
import { ok } from "../../lib/http";
import { BusinessException } from "../../lib/errors";
import { exec, mapRow, pageParams, query, queryOne } from "../../lib/db";
import { nowStr, uuid32 } from "../../lib/dialect";
import {
  addSign as engineAddSign, claimTask, completeTask, configMapOf, delegateTask, forwardSign as engineForwardSign,
  getInst, getIR, getVariables, getTask, loadDeployForInstance, pendingTasksOfUser, rejectTask, refuseTask,
  resolveInitiatorNode, transferTask,
} from "../../lib/engine/engine";
import { resolveOperations, resolveFormConfig } from "../../lib/engine/types";
import type { InstRow, TaskRow } from "../../lib/engine/engine";

const router = Router();
const TASK = "WF_TASK_INST";
const INST = "WF_PROC_INST";

function pageOut(rows: Record<string, unknown>[], page: number, size: number, total: number) {
  return { content: rows, pageNumber: page, pageSize: size, totalElements: total, totalPages: Math.ceil(total / size) };
}

function instOf(task: TaskRow): InstRow { return getInst(task.PROC_INST_ID); }

function latestCommentAction(taskId: string): string | null {
  const c = queryOne<{ ACTION: string }>("SELECT ACTION FROM WF_TASK_COMMENT WHERE TASK_ID = ? ORDER BY CREATED_AT DESC, ID DESC LIMIT 1", [taskId]);
  return c?.ACTION ?? null;
}

function currentNodeNames(instId: string): string {
  const rows = query<{ NODE_NAME: string | null }>("SELECT DISTINCT NODE_NAME FROM WF_TASK_INST WHERE PROC_INST_ID = ? AND STATUS = 'PENDING'", [instId]);
  return rows.map((r) => r.NODE_NAME ?? "").filter(Boolean).join("、");
}

/** 流程定义名解析：DEPLOY_ID 优先，旧实例按 PROC_KEY 兜底最新 deploy（对齐 Java pd.getName() ?? key） */
function processNameOf(inst: Record<string, unknown> | null, fallbackKey: string | null): string | null {
  const dep = inst ? loadDeployForInstance(String(inst.ID)) : null;
  return dep?.PROC_NAME ?? (inst as { PROC_NAME?: string | null } | null)?.PROC_NAME ?? fallbackKey;
}

function definitionIdOf(inst: Record<string, unknown> | null): string | null {
  const dep = inst ? loadDeployForInstance(String(inst.ID)) : null;
  return dep?.ID ?? null;
}

function nicknameOf(userId: string | null | undefined): string | null {
  if (!userId) return null;
  return queryOne<{ NICKNAME: string | null }>("SELECT NICKNAME FROM SYS_USER WHERE ID = ?", [userId])?.NICKNAME ?? null;
}

function remindedOf(taskId: string): boolean {
  return !!queryOne<{ ID: string }>("SELECT ID FROM WF_TASK_REMIND WHERE TASK_ID = ? LIMIT 1", [taskId]);
}

/** 任务节点超时已滞留小时数（未配超时/未超时返回 0；阈值取节点 timeout.duration 小时） */
function overdueHoursOf(t: TaskRow): number {
  if (!t.START_TIME) return 0;
  const dep = loadDeployForInstance(t.PROC_INST_ID);
  if (!dep) return 0;
  const duration = Number(configMapOf(dep)[t.NODE_KEY]?.timeout?.duration ?? 0);
  if (!Number.isFinite(duration) || duration <= 0) return 0;
  const deadlineMs = new Date(t.START_TIME.replace(" ", "T")).getTime() + duration * 3600_000;
  if (Date.now() < deadlineMs) return 0;
  return Math.max(1, Math.floor((Date.now() - deadlineMs) / 3600_000));
}

function todoVO(t: TaskRow) {
  const inst = queryOne<Record<string, unknown>>(`SELECT * FROM ${INST} WHERE ID = ?`, [t.PROC_INST_ID]);
  const vars = inst ? getVariables(inst as never) : {};
  const initiator = String(vars["initiator"] ?? (inst as { START_USER?: string })?.START_USER ?? "");
  const dep = inst ? loadDeployForInstance(String(inst.ID)) : null;
  return {
    id: t.ID, taskId: t.ID, name: t.NODE_NAME, nodeKey: t.NODE_KEY, taskKey: t.NODE_KEY,
    processInstanceId: t.PROC_INST_ID, processDefinitionKey: t.PROC_KEY,
    processDefinitionId: dep?.ID ?? null,
    processName: dep?.PROC_NAME ?? (inst as { PROC_NAME?: string | null } | null)?.PROC_NAME ?? t.PROC_KEY ?? "",
    businessKey: (inst as { BUSINESS_KEY?: string | null } | null)?.BUSINESS_KEY ?? null,
    currentNodeName: t.NODE_NAME,
    assignee: t.ASSIGNEE, createTime: t.START_TIME, priority: t.PRIORITY,
    initiator, initiatorName: nicknameOf(initiator),
    formDefId: t.FORM_DEF_ID, miGroupId: t.MI_GROUP_ID, delegation: t.DELEGATION,
    reminded: remindedOf(t.ID),
    overdueHours: overdueHoursOf(t),
  };
}

/** GET /：待办分页（assignee 必填；processName/initiator/createTime 内存过滤下沉为 SQL） */
router.get("/", (req: Request, res: Response) => {
  const assignee = (req.query.assignee as string) || req.loginUser!.userId;
  const { page, size, offset } = pageParams(req.query as Record<string, unknown>);
  const tasks = pendingTasksOfUser(assignee);
  const processName = req.query.processName as string;
  const initiator = req.query.initiator as string;
  const cStart = req.query.createTimeStart as string;
  const cEnd = req.query.createTimeEnd as string;
  let list = tasks;
  const instCache = new Map<string, Record<string, unknown> | null>();
  const instInfo = (id: string) => {
    if (!instCache.has(id)) instCache.set(id, queryOne<Record<string, unknown>>(`SELECT * FROM ${INST} WHERE ID = ?`, [id]));
    return instCache.get(id)!;
  };
  if (processName) list = list.filter((t) => (processNameOf(instInfo(t.PROC_INST_ID), t.PROC_KEY) ?? "").includes(processName));
  if (initiator) list = list.filter((t) => String(getVariables(instInfo(t.PROC_INST_ID) as never)["initiator"] ?? "") === initiator);
  if (cStart) list = list.filter((t) => (t.START_TIME ?? "") >= cStart);
  if (cEnd) list = list.filter((t) => (t.START_TIME ?? "") <= cEnd);
  const total = list.length;
  const slice = list.slice(offset, offset + size).map(todoVO);
  ok(res, pageOut(slice, page, size, total));
});

/** GET /count：待办数量 */
router.get("/count", (req: Request, res: Response) => {
  const assignee = (req.query.assignee as string) || req.loginUser!.userId;
  ok(res, { count: pendingTasksOfUser(assignee).length });
});

/** GET /historic：已办分页（finished + 已易主补充集：按 wf_task_comment 反查） */
router.get("/historic", (req: Request, res: Response) => {
  const userId = (req.query.userId as string) || req.loginUser!.userId;
  const { page, size, offset } = pageParams(req.query as Record<string, unknown>);
  const endTimeStart = req.query.endTimeStart as string;
  const endTimeEnd = req.query.endTimeEnd as string;
  const approveResult = req.query.approveResult as string;
  const processName = req.query.processName as string;
  const initiator = req.query.initiator as string;

  // ① finished（COMPLETED 且 COMPLETED_BY/ASSIGNEE=本人）
  const conds = ["STATUS = 'COMPLETED'", "(COMPLETED_BY = ? OR ASSIGNEE = ?)"];
  const params: unknown[] = [userId, userId];
  if (endTimeStart) { conds.push("END_TIME >= ?"); params.push(endTimeStart); }
  if (endTimeEnd) { conds.push("END_TIME <= ?"); params.push(endTimeEnd); }
  const doneTasks = query<TaskRow>(`SELECT * FROM ${TASK} WHERE ${conds.join(" AND ")} ORDER BY END_TIME DESC`, params);
  // ② 补充集：操作过但任务已易主 → wf_task_comment(user_id) 反查 taskId
  const commented = query<{ TASK_ID: string }>("SELECT DISTINCT TASK_ID FROM WF_TASK_COMMENT WHERE USER_ID = ?", [userId]);
  const extra: TaskRow[] = [];
  for (const c of commented) {
    const t = queryOne<TaskRow>(`SELECT * FROM ${TASK} WHERE ID = ? AND STATUS != 'PENDING' AND COALESCE(COMPLETED_BY, ASSIGNEE) != ?`, [c.TASK_ID, userId]);
    if (t && !doneTasks.some((d) => d.ID === t.ID)) extra.push(t);
  }
  let all = [...doneTasks, ...extra].sort((a, b) => String(b.END_TIME ?? "").localeCompare(String(a.END_TIME ?? "")));
  // VO + 过滤（approveResult/processName/initiator）
  let vos = all.map((t) => {
    const inst = queryOne<Record<string, unknown>>(`SELECT * FROM ${INST} WHERE ID = ?`, [t.PROC_INST_ID]);
    const vars = inst ? getVariables(inst as never) : {};
    return {
      id: t.ID, taskId: t.ID, name: t.NODE_NAME, nodeKey: t.NODE_KEY, processInstanceId: t.PROC_INST_ID,
      processDefinitionKey: t.PROC_KEY, processDefinitionId: definitionIdOf(inst),
      processName: processNameOf(inst, t.PROC_KEY) ?? "",
      businessKey: (inst as { BUSINESS_KEY?: string | null } | null)?.BUSINESS_KEY ?? null,
      assignee: t.ASSIGNEE, startTime: t.START_TIME, endTime: t.END_TIME, completedBy: t.COMPLETED_BY,
      approveResult: latestCommentAction(t.ID),
      initiator: String(vars["initiator"] ?? (inst as { START_USER?: string })?.START_USER ?? ""),
      initiatorName: nicknameOf(String(vars["initiator"] ?? (inst as { START_USER?: string })?.START_USER ?? "")),
      reminded: remindedOf(t.ID),
      instanceStatus: (inst as { STATUS?: string })?.STATUS ?? null,
      currentNode: currentNodeNames(t.PROC_INST_ID),
    };
  });
  if (approveResult) vos = vos.filter((v) => v.approveResult === approveResult);
  if (processName) vos = vos.filter((v) => v.processName?.includes(processName));
  if (initiator) vos = vos.filter((v) => v.initiator === initiator);
  const total = vos.length;
  ok(res, pageOut(vos.slice(offset, offset + size), page, size, total));
});

/** GET /{id}：任务详情 VO（表单权限/变量/候选人/operations 组装） */
router.get("/:id", (req: Request, res: Response) => {
  const t = getTask(req.params.id);
  const inst = instOf(t);
  const deploy = loadDeployForInstance(inst.ID);
  const ir = deploy ? getIR(deploy) : null;
  const nodeCfg = deploy && ir ? configMapOf(deploy)[t.NODE_KEY] ?? null : null;
  const procCfg = ir?.processConfig ?? null;
  const form = resolveFormConfig(nodeCfg, procCfg);
  const operations = resolveOperations(nodeCfg, procCfg);
  const candidates = t.CANDIDATES_JSON ? JSON.parse(t.CANDIDATES_JSON) : [];
  const comments = query<Record<string, unknown>>("SELECT * FROM WF_TASK_COMMENT WHERE TASK_ID = ? ORDER BY CREATED_AT", [t.ID]);
  // Java TaskDetailVO 契约补齐（Task 17）：initiator/initiatorName/assigneeName/businessKey/processVersion/formKey/description/isInitiatorTask
  const vars = getVariables(inst);
  const initiator = String(vars["initiator"] ?? inst.START_USER ?? "");
  const initiatorNodeId = ir ? resolveInitiatorNode(ir)?.id ?? null : null;
  ok(res, {
    id: t.ID, taskId: t.ID, name: t.NODE_NAME, nodeKey: t.NODE_KEY, assignee: t.ASSIGNEE, assigneeName: t.ASSIGNEE ? nicknameOf(t.ASSIGNEE) : null,
    owner: t.OWNER, delegation: t.DELEGATION, status: t.STATUS, createTime: t.START_TIME, claimTime: t.CLAIM_TIME, endTime: t.END_TIME,
    description: nodeCfg?.basic?.description ?? "",
    processInstanceId: t.PROC_INST_ID, processDefinitionId: deploy?.ID ?? null,
    processName: deploy?.PROC_NAME ?? inst.PROC_NAME ?? t.PROC_KEY ?? "",
    processVersion: deploy?.VERSION ?? null, businessKey: (inst as { BUSINESS_KEY?: string | null }).BUSINESS_KEY ?? null,
    initiator, initiatorName: initiator ? nicknameOf(initiator) : null,
    isInitiatorTask: initiatorNodeId != null && initiatorNodeId === t.NODE_KEY,
    instanceStatus: inst.STATUS, miGroupId: t.MI_GROUP_ID, miIndex: t.MI_INDEX, miTotal: t.MI_TOTAL,
    formKey: form?.formDefId ?? t.FORM_DEF_ID ?? null,
    formDefId: form?.formDefId ?? t.FORM_DEF_ID ?? null,
    fieldPermissions: form?.fieldPermissions ?? {},
    operations,
    variables: vars,
    candidates, candidateUsers: candidates,
    initiatorNode: ir ? (() => { const n = resolveInitiatorNode(ir); return n ? { nodeId: n.id, nodeName: n.name ?? n.id } : null; })() : null,
    comments: comments.map((c) => mapRow("WF_TASK_COMMENT", c)),
  });
});

/** POST /{id}/claim：认领 */
router.post("/:id/claim", (req: Request, res: Response) => { claimTask(req.params.id, req.loginUser!.userId); ok(res, null); });

/** POST /{id}/complete：完成 { variables?, comment? } */
router.post("/:id/complete", (req: Request, res: Response) => {
  const body = req.body as { variables?: Record<string, unknown>; comment?: string };
  ok(res, completeTask({
    taskId: req.params.id, userId: req.loginUser!.userId,
    variables: (body?.variables ?? {}) as never, comment: body?.comment ?? null, action: "approve",
  }));
});

/** POST /{id}/reject：驳回（回发起人节点）{ comment? } */
router.post("/:id/reject", (req: Request, res: Response) => {
  const comment = (req.body as { comment?: string })?.comment ?? null;
  ok(res, rejectTask(req.params.id, req.loginUser!.userId, comment));
});

/** POST /{id}/refuse：拒绝（终止实例）{ comment? } */
router.post("/:id/refuse", (req: Request, res: Response) => {
  const comment = (req.body as { comment?: string })?.comment ?? null;
  ok(res, refuseTask(req.params.id, req.loginUser!.userId, comment));
});

/** POST /{id}/transfer：转办 { toUser, reason? }（唯一强制 allowTransfer 校验） */
router.post("/:id/transfer", (req: Request, res: Response) => {
  const body = req.body as { toUser?: string; reason?: string };
  if (!body.toUser) throw new BusinessException("toUser 不能为空", 400);
  transferTask(req.params.id, req.loginUser!.userId, String(body.toUser), body.reason ?? null);
  ok(res, null);
});

/** POST /{id}/delegate：委派 { toUser, comment? } */
router.post("/:id/delegate", (req: Request, res: Response) => {
  const body = req.body as { toUser?: string; comment?: string };
  if (!body.toUser) throw new BusinessException("toUser 不能为空", 400);
  delegateTask(req.params.id, req.loginUser!.userId, String(body.toUser), body.comment ?? null);
  ok(res, null);
});

/** POST /{id}/add-sign：加签 { userIds: [] , comment? } */
router.post("/:id/add-sign", (req: Request, res: Response) => {
  const body = req.body as { userIds?: (string | number)[]; comment?: string };
  const users = (body.userIds ?? []).map(String);
  if (!users.length) throw new BusinessException("userIds 不能为空", 400);
  engineAddSign(req.params.id, req.loginUser!.userId, users, body.comment ?? null);
  ok(res, null);
});

/** POST /{id}/forward-sign：转签 { fromUser, toUser, comment? } */
router.post("/:id/forward-sign", (req: Request, res: Response) => {
  const body = req.body as { fromUser?: string; toUser?: string; comment?: string };
  if (!body.toUser) throw new BusinessException("toUser 不能为空", 400);
  const t = getTask(req.params.id);
  engineForwardSign(req.params.id, req.loginUser!.userId, String(body.fromUser ?? t.ASSIGNEE ?? ""), String(body.toUser), body.comment ?? null);
  ok(res, null);
});

// ---------- 催办（TaskRemindController，C.7：24h 限频） ----------

function remindInner(taskId: string, fromUser: string): { reminded: boolean; toUser: string | null } {
  const t = getTask(taskId);
  const to = t.ASSIGNEE ?? t.OWNER;
  if (!to) throw new BusinessException("任务无办理人，无法催办", 400);
  const freqHours = Number(process.env.WORKFLOW_REMIND_FREQUENCY_HOURS ?? 24);
  const since = new Date(Date.now() - freqHours * 3600_000)
    .toISOString().replace("T", " ").slice(0, 19);
  const recent = queryOne<{ C: number }>(
    "SELECT COUNT(*) C FROM WF_TASK_REMIND WHERE TASK_ID = ? AND REMIND_TIME >= ?", [taskId, since]);
  if ((recent?.C ?? 0) > 0) throw new BusinessException(`该任务 ${freqHours} 小时内已催办过`, 400);
  exec("INSERT INTO WF_TASK_REMIND (ID, PROCESS_INSTANCE_ID, REMIND_FROM, REMIND_TIME, REMIND_TO, TASK_ID, TENANT_ID) VALUES (?,?,?,?,?,?,?)",
    [uuid32(), t.PROC_INST_ID, fromUser, nowStr(), to, taskId, t.TENANT_ID ?? "default"]);
  // 通知出口：当前 log（对齐 Java 现状，后续对接通知中心）
  console.log(`[engine] remind task=${taskId} from=${fromUser} to=${to}`);
  return { reminded: true, toUser: to };
}

/** POST /{taskId}/remind */
router.post("/:taskId/remind", (req: Request, res: Response) => {
  ok(res, remindInner(req.params.taskId, req.loginUser!.userId));
});

/** POST /by-instance/{processInstanceId}/remind：对实例全部活跃任务催办 */
router.post("/by-instance/:processInstanceId/remind", (req: Request, res: Response) => {
  const tasks = query<TaskRow>(`SELECT * FROM ${TASK} WHERE PROC_INST_ID = ? AND STATUS = 'PENDING'`, [req.params.processInstanceId]);
  const results = tasks.map((t) => {
    try { return { taskId: t.ID, ...remindInner(t.ID, req.loginUser!.userId) }; }
    catch (e) { return { taskId: t.ID, reminded: false, error: (e as Error).message }; }
  });
  ok(res, results);
});

export default router;
