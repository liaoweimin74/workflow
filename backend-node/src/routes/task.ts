/**
 * task.ts — /api/v1/tasks/*（Task 13-6b 路由层）
 * 对齐 TaskController（待办/已办/详情/认领/完成/拒绝/转办/委派/加减签）+ TaskRemindController（催办）。
 * CompleteTaskResponse 字段名与 runtime.completeTaskById 返回对齐。
 */
import { Router } from 'express';
import { all, one, run, type Row } from '../lib/db';
import { R, BusinessException } from '../lib/errors';
import { authGuard, ah, ok, requireBody, type AuthedRequest } from '../lib/http';
import { pageResponse } from '../lib/page';
import { jsonBody, bodyStr } from '../lib/params';
import { tenantOf } from './shared';
import {
  completeTaskById,
  rejectTaskById,
  refuseTaskById,
  transferTaskById,
  delegateTaskById,
  addSignTaskById,
  forwardSignTaskById,
  claimTaskById,
  remindTask,
  extractOperations,
  extractFormConfig,
  getProcVariables,
  userNamesOf,
  loadRuntimeModel,
} from '../engine/runtime';

export const taskRouter = Router();

function taskById(id: string): Row | null {
  return one('SELECT * FROM WF_TASK_INST WHERE ID = ?', [id]);
}

function isCandidate(taskId: string, userId: string): boolean {
  const c = one(`SELECT ID FROM WF_TASK_CANDIDATE WHERE TASK_ID = ? AND TYPE = 'user' AND CANDIDATE_ID = ?`, [taskId, userId]);
  return c != null;
}

/** 待办归属：assignee=me 或候选人含我；实例须 running（Flowable 挂起实例不可办） */
function todoWhere(userId: string): string {
  return `WHERE T.STATUS = 'pending' AND P.STATUS = 'running' AND (T.ASSIGNEE = ? OR EXISTS (SELECT 1 FROM WF_TASK_CANDIDATE C WHERE C.TASK_ID = T.ID AND C.TYPE = 'user' AND C.CANDIDATE_ID = ?))`;
}

function procNameOf(procDefId: string | null): { name: string | null; key: string | null; version: number | null; initiator: string | null; businessKey: string | null; processInstanceId: string | null } {
  if (procDefId == null) return { name: null, key: null, version: null, initiator: null, businessKey: null, processInstanceId: null };
  return { name: null, key: null, version: null, initiator: null, businessKey: null, processInstanceId: null };
}

function todoVO(t: Row, userIds: Map<string, string>): Record<string, unknown> {
  const p = one('SELECT * FROM WF_PROC_INST WHERE ID = ?', [t['PROC_INST_ID']]);
  const procDefId = p ? String(p['PROC_DEF_ID'] ?? '') : null;
  let procName: string | null = null;
  if (procDefId) {
    const dep = one('SELECT NAME FROM WF_PROC_DEPLOY WHERE ID = ?', [Number(procDefId.split(':').pop())]);
    procName = dep ? (dep['NAME'] == null ? null : String(dep['NAME'])) : null;
  }
  const initiator = p ? (p['START_USER_ID'] == null ? null : String(p['START_USER_ID'])) : null;
  return {
    taskId: t['ID'],
    taskDefinitionKey: t['TASK_DEF_KEY'],
    name: t['NAME'],
    processInstanceId: t['PROC_INST_ID'],
    processDefinitionId: procDefId,
    processName: procName,
    businessKey: p ? (p['BUSINESS_KEY'] == null ? null : String(p['BUSINESS_KEY'])) : null,
    initiator,
    initiatorName: initiator ? (userIds.get(initiator) ?? initiator) : null,
    currentNodeName: t['NAME'],
    assignee: t['ASSIGNEE'],
    createTime: t['CREATE_TIME'] == null ? null : String(t['CREATE_TIME']).replace(' ', 'T'),
    reminded: false,
  };
}

// ---------------------------------------------------------------- 待办/已办

taskRouter.get(
  '/api/v1/tasks',
  authGuard,
  ah(async (req: AuthedRequest, res) => {
    const tenant = tenantOf(req);
    const q = req.query as Record<string, unknown>;
    const assignee = typeof q['assignee'] === 'string' ? q['assignee'] : String(req.userId ?? '');
    const page = Math.max(Number(q['page'] ?? 1) || 1, 1);
    const size = Math.max(Number(q['size'] ?? 10) || 10, 1);
    const offset = (page - 1) * size;
    const base = `FROM WF_TASK_INST T JOIN WF_PROC_INST P ON P.ID = T.PROC_INST_ID ${todoWhere(assignee)} AND P.TENANT_ID = ?`;
    const params: unknown[] = [assignee, assignee, tenant];
    const total = Number(one(`SELECT COUNT(*) AS C ${base}`, params)?.['C'] ?? 0);
    const rows = all(`SELECT T.* ${base} ORDER BY T.CREATE_TIME DESC LIMIT ? OFFSET ?`, [...params, size, offset]);
    const userIds = userNamesOf(rows.map((r) => (r['ASSIGNEE'] == null ? null : String(r['ASSIGNEE']))));
    ok(res, pageResponse(rows.map((r) => todoVO(r, userIds)), page, size, total));
  }),
);

taskRouter.get(
  '/api/v1/tasks/historic',
  authGuard,
  ah(async (req: AuthedRequest, res) => {
    const tenant = tenantOf(req);
    const q = req.query as Record<string, unknown>;
    const assignee = typeof q['assignee'] === 'string' ? q['assignee'] : String(req.userId ?? '');
    const page = Math.max(Number(q['page'] ?? 1) || 1, 1);
    const size = Math.max(Number(q['size'] ?? 10) || 10, 1);
    const offset = (page - 1) * size;
    const where = `WHERE T.STATUS IN ('completed','cancelled') AND T.ASSIGNEE = ? AND P.TENANT_ID = ?`;
    const base = `FROM WF_TASK_INST T JOIN WF_PROC_INST P ON P.ID = T.PROC_INST_ID ${where}`;
    const params: unknown[] = [assignee, tenant];
    const total = Number(one(`SELECT COUNT(*) AS C ${base}`, params)?.['C'] ?? 0);
    const rows = all(`SELECT T.*, P.BUSINESS_KEY AS BK, P.START_USER_ID AS SU, P.PROC_DEF_ID AS PDEF ${base} ORDER BY T.END_TIME DESC LIMIT ? OFFSET ?`, [...params, size, offset]);
    const userIds = userNamesOf(rows.map((r) => (r['SU'] == null ? null : String(r['SU']))));
    ok(res, pageResponse(rows.map((r) => {
      const dep = r['PDEF'] ? one('SELECT NAME FROM WF_PROC_DEPLOY WHERE ID = ?', [Number(String(r['PDEF']).split(':').pop())]) : null;
      return {
        taskId: r['ID'],
        name: r['NAME'],
        processInstanceId: r['PROC_INST_ID'],
        processName: dep ? (dep['NAME'] == null ? null : String(dep['NAME'])) : null,
        businessKey: r['BK'] == null ? null : String(r['BK']),
        initiator: r['SU'] == null ? null : String(r['SU']),
        initiatorName: r['SU'] == null ? null : (userIds.get(String(r['SU'])) ?? String(r['SU'])),
        currentNode: null,
        endTime: r['END_TIME'] == null ? null : String(r['END_TIME']).replace(' ', 'T'),
        approveResult: r['STATUS'],
        deleteReason: null,
      };
    }), page, size, total));
  }),
);

// ---------------------------------------------------------------- 详情

taskRouter.get(
  '/api/v1/tasks/:id',
  authGuard,
  ah(async (req: AuthedRequest, res) => {
    const tenant = tenantOf(req);
    const id = String(req.params['id'] ?? '');
    const t = taskById(id);
    if (!t) throw new BusinessException('任务不存在: ' + id, 404);
    const p = one('SELECT * FROM WF_PROC_INST WHERE ID = ?', [t['PROC_INST_ID']]);
    if (!p) throw new BusinessException('流程实例不存在: ' + String(t['PROC_INST_ID']), 404);
    const procDefId = String(p['PROC_DEF_ID'] ?? '');
    let model = null;
    try { model = loadRuntimeModel(procDefId); } catch { /* 定义已删除场景 */ }
    const assignee = t['ASSIGNEE'] == null ? null : String(t['ASSIGNEE']);
    const userIds = userNamesOf([assignee, p['START_USER_ID'] == null ? null : String(p['START_USER_ID'])]);
    let formDefId: string | null = null;
    let fieldPermissions: Record<string, unknown> = {};
    if (model) {
      const fc = extractFormConfig(model, String(t['TASK_DEF_KEY'] ?? ''));
      if (fc) {
        formDefId = fc.formDefId;
        fieldPermissions = (fc.fieldPermissions ?? {}) as Record<string, unknown>;
      }
    }
    ok(res, {
      taskId: t['ID'],
      name: t['NAME'],
      description: null,
      assignee,
      assigneeName: assignee ? (userIds.get(assignee) ?? assignee) : null,
      processInstanceId: t['PROC_INST_ID'],
      processDefinitionId: procDefId,
      processName: model?.deployName ?? null,
      processVersion: model?.version ?? null,
      businessKey: p['BUSINESS_KEY'] == null ? null : String(p['BUSINESS_KEY']),
      initiator: p['START_USER_ID'] == null ? null : String(p['START_USER_ID']),
      initiatorName: p['START_USER_ID'] == null ? null : (userIds.get(String(p['START_USER_ID'])) ?? String(p['START_USER_ID'])),
      formKey: formDefId,
      fieldPermissions,
      operations: model ? extractOperations(model, String(t['TASK_DEF_KEY'] ?? '')) : {},
      variables: getProcVariables(String(t['PROC_INST_ID'])),
      candidateNames: null,
    });
  }),
);

// ---------------------------------------------------------------- 动作

taskRouter.post(
  '/api/v1/tasks/:id/complete',
  authGuard,
  ah(async (req: AuthedRequest, res) => {
    const tenant = tenantOf(req);
    const id = String(req.params['id'] ?? '');
    const raw = req.body == null || Object.keys(req.body as object).length === 0 ? {} : jsonBody(req, 'complete');
    const userId = bodyStr(raw['userId']) ?? String(req.userId ?? '');
    const variables = (raw['variables'] ?? {}) as Record<string, unknown>;
    const comment = bodyStr(raw['comment']);
    const result = completeTaskById(id, variables, userId, comment, tenant);
    ok(res, result);
  }),
);

taskRouter.post(
  '/api/v1/tasks/:id/reject',
  authGuard,
  ah(async (req: AuthedRequest, res) => {
    const tenant = tenantOf(req);
    const id = String(req.params['id'] ?? '');
    const b = req.body == null ? {} : (requireBody(req.body) as Record<string, unknown>);
    rejectTaskById(id, String(req.userId ?? ''), bodyStr(b['reason']), tenant);
    ok(res);
  }),
);

taskRouter.post(
  '/api/v1/tasks/:id/refuse',
  authGuard,
  ah(async (req: AuthedRequest, res) => {
    const tenant = tenantOf(req);
    const id = String(req.params['id'] ?? '');
    const b = req.body == null ? {} : (requireBody(req.body) as Record<string, unknown>);
    // 拒绝语义：不同意并终止整个流程（区别于驳回回发起人）
    refuseTaskById(id, String(req.userId ?? ''), bodyStr(b['reason']), tenant);
    ok(res);
  }),
);

taskRouter.post(
  '/api/v1/tasks/:id/transfer',
  authGuard,
  ah(async (req: AuthedRequest, res) => {
    const tenant = tenantOf(req);
    const id = String(req.params['id'] ?? '');
    const b = req.body == null ? {} : (requireBody(req.body) as Record<string, unknown>);
    transferTaskById(id, bodyStr(b['fromUser']) ?? String(req.userId ?? ''), bodyStr(b['toUser']) ?? '', bodyStr(b['reason']), tenant);
    ok(res);
  }),
);

taskRouter.post(
  '/api/v1/tasks/:id/delegate',
  authGuard,
  ah(async (req: AuthedRequest, res) => {
    const tenant = tenantOf(req);
    const id = String(req.params['id'] ?? '');
    const b = requireBody(req.body);
    // 前端 DelegateRequest 字段为 delegateTo（兼容 toUser/userId）
    const toUser = bodyStr(b['delegateTo'] ?? b['toUser'] ?? b['userId']);
    if (!toUser) throw new BusinessException('委派目标用户不能为空', 400);
    delegateTaskById(id, toUser, bodyStr(b['fromUser']) ?? String(req.userId ?? ''), bodyStr(b['comment']), tenant);
    ok(res);
  }),
);

taskRouter.post(
  '/api/v1/tasks/:id/claim',
  authGuard,
  ah(async (req: AuthedRequest, res) => {
    const tenant = tenantOf(req);
    const id = String(req.params['id'] ?? '');
    const userId = typeof (req.query as Record<string, unknown>)['userId'] === 'string' ? String((req.query as Record<string, unknown>)['userId']) : String(req.userId ?? '');
    claimTaskById(id, userId, tenant);
    ok(res);
  }),
);

/** 加签：MI 节点新增子任务；普通节点加候选人（AddSignService 对位） */
taskRouter.post(
  '/api/v1/tasks/:id/add-sign',
  authGuard,
  ah(async (req: AuthedRequest, res) => {
    const tenant = tenantOf(req);
    const id = String(req.params['id'] ?? '');
    const b = requireBody(req.body);
    const usersRaw = b['users'] ?? b['userIds'];
    const users = Array.isArray(usersRaw) ? usersRaw.map((u) => String(u).trim()).filter((u) => u !== '') : null;
    addSignTaskById(id, users, bodyStr(b['userId']) ?? String(req.userId ?? ''), bodyStr(b['comment']), tenant);
    ok(res);
  }),
);

/** 转签：MI 子任务换人（ForwardSignService 对位） */
taskRouter.post(
  '/api/v1/tasks/:id/forward-sign',
  authGuard,
  ah(async (req: AuthedRequest, res) => {
    const tenant = tenantOf(req);
    const id = String(req.params['id'] ?? '');
    const b = requireBody(req.body);
    const toUser = bodyStr(b['toUser'] ?? b['userId']);
    if (!toUser) throw new BusinessException('转签目标用户不能为空');
    forwardSignTaskById(id, toUser, bodyStr(b['userId']) ?? String(req.userId ?? ''), bodyStr(b['comment']), tenant);
    ok(res);
  }),
);

// ---------------------------------------------------------------- 催办（TaskRemindController）

taskRouter.post(
  '/api/v1/tasks/:taskId/remind',
  authGuard,
  ah(async (req: AuthedRequest, res) => {
    const tenant = tenantOf(req);
    const id = String(req.params['taskId'] ?? '');
    const outcome = remindTask(id, String(req.userId ?? ''), tenant);
    if (outcome.kind !== 'ok') throw new BusinessException(outcome.message ?? '催办失败');
    ok(res);
  }),
);

taskRouter.post(
  '/api/v1/tasks/by-instance/:processInstanceId/remind',
  authGuard,
  ah(async (req: AuthedRequest, res) => {
    const tenant = tenantOf(req);
    const piId = String(req.params['processInstanceId'] ?? '');
    const tasks = all(`SELECT ID FROM WF_TASK_INST WHERE PROC_INST_ID = ? AND STATUS = 'pending'`, [piId]);
    if (tasks.length === 0) throw new BusinessException('该实例没有待办任务');
    let lastMsg: string | null = null;
    for (const t of tasks) {
      const outcome = remindTask(String(t['ID']), String(req.userId ?? ''), tenant);
      if (outcome.kind !== 'ok') lastMsg = outcome.message ?? '催办失败';
    }
    if (lastMsg && tasks.length === 1) throw new BusinessException(lastMsg);
    ok(res);
  }),
);

export const _tk = { R, pageResponse, taskById, isCandidate, procNameOf, run, all, one, requireBody };
