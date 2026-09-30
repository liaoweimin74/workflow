/**
 * process-instance.ts — /api/v1/process-instances/*（Task 13-6b 路由层）
 * 对齐 ProcessInstanceController（发起/列表/详情/挂起/恢复/终止/高亮/预测/历史）
 * + 变量端点（含挂 process-instances 前缀的任务变量写入）+ 评论（wf_task_comment）。
 */
import { Router } from 'express';
import { all, one, run, type Row } from '../lib/db';
import { R, BusinessException, IllegalArgumentError } from '../lib/errors';
import { authGuard, ah, ok, requireBody, type AuthedRequest } from '../lib/http';
import { pageResponse } from '../lib/page';
import { jsonBody, bodyStr, pathId } from '../lib/params';
import { tenantOf } from './shared';
import {
  startProcessInstance,
  terminateProcessInstance,
  loadRuntimeModel,
  getProcVariables,
  setProcVariables,
  removeProcVariable,
  getHighlight,
  getPrediction,
  getApprovalHistory,
  instanceToMap,
  instanceToHistoricMap,
  saveComment,
} from '../engine/runtime';

export const processInstanceRouter = Router();

const nowText = (): string => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};

function instById(id: string, tenant: string): Row | null {
  return one('SELECT * FROM WF_PROC_INST WHERE ID = ? AND TENANT_ID = ?', [id, tenant]);
}

// ---------------------------------------------------------------- 发起

processInstanceRouter.post(
  '/api/v1/process-instances',
  authGuard,
  ah(async (req: AuthedRequest, res) => {
    const tenant = tenantOf(req);
    const b = jsonBody(
      req,
      'public com.workflow.common.domain.R com.workflow.api.controller.ProcessInstanceController.start(com.workflow.api.dto.StartProcessRequest)',
    );
    const processKey = bodyStr(b['processKey']);
    const businessKey = bodyStr(b['businessKey']);
    const formDefId = bodyStr(b['formDefId']);
    const variables = (b['variables'] ?? {}) as Record<string, unknown>;
    if (typeof processKey !== 'string' || processKey.trim() === '') {
      throw new BusinessException('processKey 不能为空');
    }
    if (formDefId) variables['formDefId'] = formDefId;
    const result = startProcessInstance({
      key: processKey,
      businessKey,
      variables,
      userId: req.userId as number,
      tenant,
    });
    ok(res, result);
  }),
);

// ---------------------------------------------------------------- 列表/历史

processInstanceRouter.get(
  '/api/v1/process-instances',
  authGuard,
  ah(async (req: AuthedRequest, res) => {
    const tenant = tenantOf(req);
    const q = req.query as Record<string, unknown>;
    const page = Math.max(Number(q['page'] ?? 1) || 1, 1);
    const size = Math.max(Number(q['size'] ?? 10) || 10, 1);
    const offset = (page - 1) * size;
    const wheres: string[] = ['TENANT_ID = ?', "STATUS = 'running'"];
    const params: unknown[] = [tenant];
    if (typeof q['initiator'] === 'string' && q['initiator'] !== '') { wheres.push('START_USER_ID = ?'); params.push(q['initiator']); }
    if (typeof q['processName'] === 'string' && q['processName'] !== '') { wheres.push('I.KEY_ IN (SELECT KEY_ FROM WF_PROC_DEPLOY WHERE NAME LIKE ?)'); params.push(`%${q['processName']}%`); }
    const where = `WHERE ${wheres.join(' AND ')}`;
    const total = Number(one(`SELECT COUNT(*) AS C FROM WF_PROC_INST ${where}`, params)?.['C'] ?? 0);
    const rows = all(`SELECT * FROM WF_PROC_INST ${where} ORDER BY START_TIME DESC LIMIT ? OFFSET ?`, [...params, size, offset]);
    ok(res, pageResponse(rows.map((r) => instanceToMap(r, null, null)), page, size, total));
  }),
);

processInstanceRouter.get(
  '/api/v1/process-instances/history',
  authGuard,
  ah(async (req: AuthedRequest, res) => {
    const tenant = tenantOf(req);
    const q = req.query as Record<string, unknown>;
    const page = Math.max(Number(q['page'] ?? 1) || 1, 1);
    const size = Math.max(Number(q['size'] ?? 10) || 10, 1);
    const offset = (page - 1) * size;
    const wheres: string[] = ['TENANT_ID = ?', "STATUS != 'running'"];
    const params: unknown[] = [tenant];
    if (typeof q['initiator'] === 'string' && q['initiator'] !== '') { wheres.push('START_USER_ID = ?'); params.push(q['initiator']); }
    if (typeof q['status'] === 'string' && q['status'] !== '') { wheres.push('STATUS = ?'); params.push(q['status']); }
    const where = `WHERE ${wheres.join(' AND ')}`;
    const total = Number(one(`SELECT COUNT(*) AS C FROM WF_PROC_INST ${where}`, params)?.['C'] ?? 0);
    const rows = all(`SELECT * FROM WF_PROC_INST ${where} ORDER BY START_TIME DESC LIMIT ? OFFSET ?`, [...params, size, offset]);
    ok(res, pageResponse(rows.map((r) => instanceToHistoricMap(r, null)), page, size, total));
  }),
);

// ---------------------------------------------------------------- 详情/生命周期

processInstanceRouter.get(
  '/api/v1/process-instances/:id',
  authGuard,
  ah(async (req: AuthedRequest, res) => {
    const tenant = tenantOf(req);
    const row = instById(String(req.params['id'] ?? ''), tenant);
    if (!row) throw new BusinessException('流程实例不存在: ' + String(req.params['id'] ?? ''), 404);
    ok(res, instanceToMap(row, null, null));
  }),
);

processInstanceRouter.post(
  '/api/v1/process-instances/:id/suspend',
  authGuard,
  ah(async (req: AuthedRequest, res) => {
    const tenant = tenantOf(req);
    const row = instById(String(req.params['id'] ?? ''), tenant);
    if (!row) throw new BusinessException('流程实例不存在: ' + String(req.params['id'] ?? ''), 404);
    if (String(row['STATUS']) !== 'running') throw new BusinessException('仅运行中实例可挂起');
    run(`UPDATE WF_PROC_INST SET STATUS = 'suspended' WHERE ID = ?`, [row['ID']]);
    ok(res);
  }),
);

processInstanceRouter.post(
  '/api/v1/process-instances/:id/resume',
  authGuard,
  ah(async (req: AuthedRequest, res) => {
    const tenant = tenantOf(req);
    const row = instById(String(req.params['id'] ?? ''), tenant);
    if (!row) throw new BusinessException('流程实例不存在: ' + String(req.params['id'] ?? ''), 404);
    if (String(row['STATUS']) !== 'suspended') throw new BusinessException('仅挂起实例可恢复');
    run(`UPDATE WF_PROC_INST SET STATUS = 'running' WHERE ID = ?`, [row['ID']]);
    ok(res);
  }),
);

processInstanceRouter.post(
  '/api/v1/process-instances/:id/terminate',
  authGuard,
  ah(async (req: AuthedRequest, res) => {
    const tenant = tenantOf(req);
    const id = String(req.params['id'] ?? '');
    const row = instById(id, tenant);
    if (!row) throw new BusinessException('流程实例不存在: ' + id, 404);
    if (String(row['STATUS']) !== 'running') throw new BusinessException('仅运行中实例可终止');
    terminateProcessInstance(id, typeof (req.query as Record<string, unknown>)['reason'] === 'string' ? String((req.query as Record<string, unknown>)['reason']) : '');
    ok(res);
  }),
);

// ---------------------------------------------------------------- 高亮/预测/审批历史

processInstanceRouter.get(
  '/api/v1/process-instances/:id/highlight',
  authGuard,
  ah(async (req: AuthedRequest, res) => {
    const tenant = tenantOf(req);
    const row = instById(String(req.params['id'] ?? ''), tenant);
    if (!row) throw new BusinessException('流程实例不存在: ' + String(req.params['id'] ?? ''), 404);
    ok(res, getHighlight(String(row['ID'])));
  }),
);

processInstanceRouter.get(
  '/api/v1/process-instances/:id/prediction',
  authGuard,
  ah(async (req: AuthedRequest, res) => {
    const tenant = tenantOf(req);
    const row = instById(String(req.params['id'] ?? ''), tenant);
    if (!row) throw new BusinessException('流程实例不存在: ' + String(req.params['id'] ?? ''), 404);
    ok(res, getPrediction(String(row['ID'])));
  }),
);

processInstanceRouter.get(
  '/api/v1/process-instances/:id/approval-history',
  authGuard,
  ah(async (req: AuthedRequest, res) => {
    const tenant = tenantOf(req);
    const row = instById(String(req.params['id'] ?? ''), tenant);
    if (!row) throw new BusinessException('流程实例不存在: ' + String(req.params['id'] ?? ''), 404);
    ok(res, getApprovalHistory(String(row['ID'])));
  }),
);

// ---------------------------------------------------------------- 变量

processInstanceRouter.get(
  '/api/v1/process-instances/:id/variables',
  authGuard,
  ah(async (req: AuthedRequest, res) => {
    const tenant = tenantOf(req);
    const row = instById(String(req.params['id'] ?? ''), tenant);
    if (!row) throw new BusinessException('流程实例不存在: ' + String(req.params['id'] ?? ''), 404);
    ok(res, getProcVariables(String(row['ID'])));
  }),
);

processInstanceRouter.post(
  '/api/v1/process-instances/:id/variables',
  authGuard,
  ah(async (req: AuthedRequest, res) => {
    const tenant = tenantOf(req);
    const row = instById(String(req.params['id'] ?? ''), tenant);
    if (!row) throw new BusinessException('流程实例不存在: ' + String(req.params['id'] ?? ''), 404);
    const b = requireBody(req.body);
    const vars: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(b)) if (k !== 'userId' && k !== 'tenant') vars[k] = v;
    setProcVariables(String(row['ID']), vars, tenant);
    ok(res);
  }),
);

/** PUT /api/v1/process-instances/tasks/{taskId}/variables —— 任务变量挂在实例前缀下（Java 特例路径） */
processInstanceRouter.put(
  '/api/v1/process-instances/tasks/:taskId/variables',
  authGuard,
  ah(async (req: AuthedRequest, res) => {
    const tenant = tenantOf(req);
    const taskId = String(req.params['taskId'] ?? '');
    const task = one('SELECT * FROM WF_TASK_INST WHERE ID = ?', [taskId]);
    if (!task) throw new BusinessException('任务不存在: ' + taskId, 404);
    const b = requireBody(req.body);
    setProcVariables(String(task['PROC_INST_ID']), b, tenant);
    ok(res);
  }),
);

processInstanceRouter.delete(
  '/api/v1/process-instances/:id/variables/:name',
  authGuard,
  ah(async (req: AuthedRequest, res) => {
    const tenant = tenantOf(req);
    const row = instById(String(req.params['id'] ?? ''), tenant);
    if (!row) throw new BusinessException('流程实例不存在: ' + String(req.params['id'] ?? ''), 404);
    removeProcVariable(String(row['ID']), String(req.params['name'] ?? ''));
    ok(res);
  }),
);

// ---------------------------------------------------------------- 实例任务列表/评论

processInstanceRouter.get(
  '/api/v1/process-instances/:id/tasks',
  authGuard,
  ah(async (req: AuthedRequest, res) => {
    const tenant = tenantOf(req);
    const row = instById(String(req.params['id'] ?? ''), tenant);
    if (!row) throw new BusinessException('流程实例不存在: ' + String(req.params['id'] ?? ''), 404);
    const rows = all('SELECT * FROM WF_TASK_INST WHERE PROC_INST_ID = ? ORDER BY CREATE_TIME', [row['ID']]);
    ok(res, rows.map(taskSummaryMap));
  }),
);

function taskSummaryMap(r: Row): Record<string, unknown> {
  return {
    taskId: r['ID'],
    name: r['NAME'],
    taskDefinitionKey: r['TASK_DEF_KEY'],
    assignee: r['ASSIGNEE'],
    createTime: r['CREATE_TIME'] == null ? null : String(r['CREATE_TIME']).replace(' ', 'T'),
    endTime: r['END_TIME'] == null ? null : String(r['END_TIME']).replace(' ', 'T'),
    status: r['STATUS'],
  };
}

processInstanceRouter.get(
  '/api/v1/process-instances/:id/comments',
  authGuard,
  ah(async (req: AuthedRequest, res) => {
    const tenant = tenantOf(req);
    const row = instById(String(req.params['id'] ?? ''), tenant);
    if (!row) throw new BusinessException('流程实例不存在: ' + String(req.params['id'] ?? ''), 404);
    const rows = all('SELECT * FROM wf_task_comment WHERE "process_instance_id" = ? ORDER BY "created_at"', [row['ID']]);
    ok(res, rows.map((r) => ({
      id: r['id'],
      processInstanceId: r['process_instance_id'],
      taskId: r['task_id'],
      userId: r['user_id'],
      type: r['type'],
      message: r['message'],
      createdAt: r['created_at'] == null ? null : String(r['created_at']).replace(' ', 'T'),
    })));
  }),
);

processInstanceRouter.post(
  '/api/v1/process-instances/:id/comments',
  authGuard,
  ah(async (req: AuthedRequest, res) => {
    const tenant = tenantOf(req);
    const row = instById(String(req.params['id'] ?? ''), tenant);
    if (!row) throw new BusinessException('流程实例不存在: ' + String(req.params['id'] ?? ''), 404);
    const b = requireBody(req.body);
    const message = bodyStr(b['message']);
    if (!message) throw new BusinessException('评论内容不能为空');
    saveComment({
      processInstanceId: String(row['ID']),
      taskId: bodyStr(b['taskId']) ?? '',
      userId: String(req.userId ?? ''),
      action: bodyStr(b['type']) ?? 'comment',
      comment: message,
      targetUserId: bodyStr(b['targetUserId']),
      tenant,
    });
    ok(res);
  }),
);

// 未使用导入保持导出面完整（防 tree-shake 语义漂移）
export const _pi = { R, IllegalArgumentError, pageResponse, pathId, loadRuntimeModel, R2: R, nowText };
