import http from '@/utils/http'
import type { R } from '@/types/common'

/** 触发点（后端 FormLogicBindingService 同名常量）；group 供绑定弹窗/设计器导入按事件类别分组展示 */
export const FORM_LOGIC_TRIGGERS = [
  { value: 'BEFORE_CREATE', label: '新增前', formType: 'BUSINESS', group: '业务数据' },
  { value: 'AFTER_CREATE', label: '新增后', formType: 'BUSINESS', group: '业务数据' },
  { value: 'BEFORE_UPDATE', label: '更新前', formType: 'BUSINESS', group: '业务数据' },
  { value: 'AFTER_UPDATE', label: '更新后', formType: 'BUSINESS', group: '业务数据' },
  { value: 'BEFORE_DELETE', label: '删除前', formType: 'BUSINESS', group: '业务数据' },
  { value: 'AFTER_DELETE', label: '删除后', formType: 'BUSINESS', group: '业务数据' },
  { value: 'BEFORE_SNAPSHOT', label: '快照保存前', formType: 'WORKFLOW', group: '表单存档' },
  { value: 'AFTER_SNAPSHOT', label: '快照保存后', formType: 'WORKFLOW', group: '表单存档' },
  { value: 'BEFORE_SAVE', label: '表单保存前', formType: 'WORKFLOW', group: '表单存档' },
  { value: 'AFTER_SAVE', label: '表单保存后', formType: 'WORKFLOW', group: '表单存档' },
  { value: 'AFTER_TASK_APPROVE', label: '审批通过后', formType: 'WORKFLOW', group: '审批动作' },
  { value: 'AFTER_TASK_REJECT', label: '审批拒绝后', formType: 'WORKFLOW', group: '审批动作' },
  { value: 'AFTER_TASK_RETURN', label: '驳回退回后', formType: 'WORKFLOW', group: '审批动作' },
  { value: 'AFTER_TASK_TRANSFER', label: '转办后', formType: 'WORKFLOW', group: '审批动作' },
  { value: 'AFTER_TASK_DELEGATE', label: '委派后', formType: 'WORKFLOW', group: '审批动作' },
  { value: 'AFTER_TASK_ADD_SIGN', label: '加签后', formType: 'WORKFLOW', group: '审批动作' },
  { value: 'AFTER_TASK_CLAIM', label: '认领后', formType: 'WORKFLOW', group: '审批动作' },
  { value: 'AFTER_TASK_URGE', label: '催办后', formType: 'WORKFLOW', group: '审批动作' },
  { value: 'AFTER_PROCESS_FINISH', label: '流程结束后', formType: 'WORKFLOW', group: '流程事件' },
  { value: 'AFTER_PROCESS_WITHDRAW', label: '发起人撤回后', formType: 'WORKFLOW', group: '流程事件' },
  { value: 'AFTER_PROCESS_TERMINATE', label: '流程终止后', formType: 'WORKFLOW', group: '流程事件' },
  { value: 'AFTER_PROCESS_START', label: '流程启动后', formType: 'WORKFLOW', group: '流程事件' },
] as const

/**
 * 辅助动作触发点（与后端 DEFAULT_AFTER_COMMIT_TRIGGERS 同集）：
 * 转办/委派/加签/认领/催办/撤回/终止/启动。这八个动作以留痕为主、
 * 失败回滚主操作意义有限，后端 executionMode 缺省时默认 AFTER_COMMIT（可显式 SYNC_IN_TX 覆盖）；
 * 绑定弹窗选中时前端同步预置 AFTER_COMMIT。
 */
export const AFTER_COMMIT_DEFAULT_TRIGGERS: ReadonlySet<string> = new Set([
  'AFTER_TASK_TRANSFER',
  'AFTER_TASK_DELEGATE',
  'AFTER_TASK_ADD_SIGN',
  'AFTER_TASK_CLAIM',
  'AFTER_TASK_URGE',
  'AFTER_PROCESS_WITHDRAW',
  'AFTER_PROCESS_TERMINATE',
  'AFTER_PROCESS_START',
])

export type FormLogicTrigger = (typeof FORM_LOGIC_TRIGGERS)[number]['value']

/** 触发点事件参数规格（与后端 FormLogicBindingService.buildVars 实际注入逐字段对齐） */
export interface TriggerParamSpec {
  name: string
  type: 'string' | 'number' | 'boolean' | 'json'
  required: boolean
  desc: string
}

/* 参数规格说明：
 * - 系统注入约定（第一版免映射）：formData / formDataExisting / formKey / formType / dataId / opType / operator / __trigger
 * - BEFORE_* 时机 dataId 尚未生成（BEFORE_CREATE/BEFORE_SNAPSHOT/BEFORE_SAVE 无 dataId 有效值）
 * - CREATE/DELETE 时机无 formDataExisting（UPDATE/SAVE 的 upsert 旧行才注入）
 * - WORKFLOW BEFORE_SAVE/AFTER_SAVE 的 formDataExisting 为节点间保存路径的旧行（首次保存为 null 值）
 * - 审批事件触发点（AFTER_TASK_APPROVE/REJECT/RETURN/PROCESS_FINISH）另行注入：
 *   processInstanceId / taskId / comment；不注入 formDataExisting/dataId；
 *   formData 为该流程实例最新一条表单数据（无表单数据的流程不触发，绑定也不会被调度）
 * - 审批事件二期（AFTER_TASK_TRANSFER/DELEGATE/ADD_SIGN/CLAIM/URGE、
 *   AFTER_PROCESS_WITHDRAW/TERMINATE/START）注入同一集合，动作类另注入 toUser
 *   （转办/委派的新办理人、加签人逗号分隔、被催办人；认领/流程级为 null）；
 *   taskId 为被操作任务（撤回时为活跃任务，终止/启动为空）；
 *   八个辅助动作触发点 executionMode 缺省 AFTER_COMMIT（见 AFTER_COMMIT_DEFAULT_TRIGGERS）
 */
/** 审批事件触发点共用参数（formData/操作员等差异字段在后端 buildApprovalVars 逐字段对齐；extra 追加 toUser 等动作差异字段） */
function approvalTriggerSpec(opType: string, opLabel: string, extra?: TriggerParamSpec[]): TriggerParamSpec[] {
  return [
    { name: 'formData', type: 'json', required: true, desc: '该流程实例最新表单数据（无表单数据时不触发）' },
    { name: 'processInstanceId', type: 'string', required: false, desc: '流程实例 ID' },
    { name: 'taskId', type: 'string', required: false, desc: '关联任务 ID（部分流程级事件为空）' },
    { name: 'formKey', type: 'string', required: false, desc: '表单标识' },
    { name: 'formType', type: 'string', required: false, desc: '表单类型（WORKFLOW）' },
    { name: 'opType', type: 'string', required: false, desc: `操作类型（${opType}）` },
    { name: 'operator', type: 'string', required: false, desc: '操作人' },
    { name: 'comment', type: 'string', required: false, desc: `审批意见/${opLabel}原因（可空）` },
    ...(extra ?? []),
    { name: '__trigger', type: 'json', required: false, desc: '触发元信息（调试用）' },
  ]
}

/** toUser 参数（动作目标人：转办/委派新办理人、加签人逗号分隔、被催办人） */
function toUserSpec(desc: string): TriggerParamSpec {
  return { name: 'toUser', type: 'string', required: false, desc }
}

/** 触发点事件参数规格（单源：绑定弹窗过滤 + 设计器导入共用，勿在调用处重复定义） */
export const TRIGGER_PARAM_SPECS: Record<string, TriggerParamSpec[]> = {
  BEFORE_CREATE: [
    { name: 'formData', type: 'json', required: true, desc: '当前数据行（新增前）' },
    { name: 'formKey', type: 'string', required: false, desc: '表单标识' },
    { name: 'formType', type: 'string', required: false, desc: '表单类型（BUSINESS）' },
    { name: 'opType', type: 'string', required: false, desc: '操作类型（CREATE）' },
    { name: 'operator', type: 'string', required: false, desc: '当前操作人' },
    { name: '__trigger', type: 'json', required: false, desc: '触发元信息（调试用）' },
  ],
  AFTER_CREATE: [
    { name: 'formData', type: 'json', required: true, desc: '当前数据行（新增后）' },
    { name: 'dataId', type: 'string', required: false, desc: '数据行 ID' },
    { name: 'formKey', type: 'string', required: false, desc: '表单标识' },
    { name: 'formType', type: 'string', required: false, desc: '表单类型（BUSINESS）' },
    { name: 'opType', type: 'string', required: false, desc: '操作类型（CREATE）' },
    { name: 'operator', type: 'string', required: false, desc: '当前操作人' },
    { name: '__trigger', type: 'json', required: false, desc: '触发元信息（调试用）' },
  ],
  BEFORE_UPDATE: [
    { name: 'formData', type: 'json', required: true, desc: '更新后的数据行' },
    { name: 'formDataExisting', type: 'json', required: false, desc: '更新前的旧行' },
    { name: 'dataId', type: 'string', required: false, desc: '数据行 ID' },
    { name: 'formKey', type: 'string', required: false, desc: '表单标识' },
    { name: 'formType', type: 'string', required: false, desc: '表单类型（BUSINESS）' },
    { name: 'opType', type: 'string', required: false, desc: '操作类型（UPDATE）' },
    { name: 'operator', type: 'string', required: false, desc: '当前操作人' },
    { name: '__trigger', type: 'json', required: false, desc: '触发元信息（调试用）' },
  ],
  AFTER_UPDATE: [
    { name: 'formData', type: 'json', required: true, desc: '更新后的数据行' },
    { name: 'formDataExisting', type: 'json', required: false, desc: '更新前的旧行' },
    { name: 'dataId', type: 'string', required: false, desc: '数据行 ID' },
    { name: 'formKey', type: 'string', required: false, desc: '表单标识' },
    { name: 'formType', type: 'string', required: false, desc: '表单类型（BUSINESS）' },
    { name: 'opType', type: 'string', required: false, desc: '操作类型（UPDATE）' },
    { name: 'operator', type: 'string', required: false, desc: '当前操作人' },
    { name: '__trigger', type: 'json', required: false, desc: '触发元信息（调试用）' },
  ],
  BEFORE_DELETE: [
    { name: 'formData', type: 'json', required: true, desc: '删除前的数据行快照' },
    { name: 'dataId', type: 'string', required: false, desc: '数据行 ID' },
    { name: 'formKey', type: 'string', required: false, desc: '表单标识' },
    { name: 'formType', type: 'string', required: false, desc: '表单类型（BUSINESS）' },
    { name: 'opType', type: 'string', required: false, desc: '操作类型（DELETE）' },
    { name: 'operator', type: 'string', required: false, desc: '当前操作人' },
    { name: '__trigger', type: 'json', required: false, desc: '触发元信息（调试用）' },
  ],
  AFTER_DELETE: [
    { name: 'formData', type: 'json', required: true, desc: '删除前的数据行快照' },
    { name: 'dataId', type: 'string', required: false, desc: '数据行 ID' },
    { name: 'formKey', type: 'string', required: false, desc: '表单标识' },
    { name: 'formType', type: 'string', required: false, desc: '表单类型（BUSINESS）' },
    { name: 'opType', type: 'string', required: false, desc: '操作类型（DELETE）' },
    { name: 'operator', type: 'string', required: false, desc: '当前操作人' },
    { name: '__trigger', type: 'json', required: false, desc: '触发元信息（调试用）' },
  ],
  BEFORE_SNAPSHOT: [
    { name: 'formData', type: 'json', required: true, desc: '本次审批提交的表单数据（快照保存前）' },
    { name: 'formKey', type: 'string', required: false, desc: '表单标识' },
    { name: 'formType', type: 'string', required: false, desc: '表单类型（WORKFLOW）' },
    { name: 'opType', type: 'string', required: false, desc: '操作类型（SNAPSHOT）' },
    { name: 'operator', type: 'string', required: false, desc: '当前操作人' },
    { name: '__trigger', type: 'json', required: false, desc: '触发元信息（调试用）' },
  ],
  AFTER_SNAPSHOT: [
    { name: 'formData', type: 'json', required: true, desc: '本次审批提交的表单数据（快照保存后）' },
    { name: 'dataId', type: 'string', required: false, desc: '快照记录 ID' },
    { name: 'formKey', type: 'string', required: false, desc: '表单标识' },
    { name: 'formType', type: 'string', required: false, desc: '表单类型（WORKFLOW）' },
    { name: 'opType', type: 'string', required: false, desc: '操作类型（SNAPSHOT）' },
    { name: 'operator', type: 'string', required: false, desc: '当前操作人' },
    { name: '__trigger', type: 'json', required: false, desc: '触发元信息（调试用）' },
  ],
  BEFORE_SAVE: [
    { name: 'formData', type: 'json', required: true, desc: '节点间表单数据（保存前）' },
    { name: 'formDataExisting', type: 'json', required: false, desc: '保存前的旧行（首次保存为空）' },
    { name: 'formKey', type: 'string', required: false, desc: '表单标识' },
    { name: 'formType', type: 'string', required: false, desc: '表单类型（WORKFLOW）' },
    { name: 'opType', type: 'string', required: false, desc: '操作类型（SAVE）' },
    { name: 'operator', type: 'string', required: false, desc: '当前操作人' },
    { name: '__trigger', type: 'json', required: false, desc: '触发元信息（调试用）' },
  ],
  AFTER_SAVE: [
    { name: 'formData', type: 'json', required: true, desc: '节点间表单数据（保存后）' },
    { name: 'formDataExisting', type: 'json', required: false, desc: '保存前的旧行（首次保存为空）' },
    { name: 'dataId', type: 'string', required: false, desc: '表单数据记录 ID' },
    { name: 'formKey', type: 'string', required: false, desc: '表单标识' },
    { name: 'formType', type: 'string', required: false, desc: '表单类型（WORKFLOW）' },
    { name: 'opType', type: 'string', required: false, desc: '操作类型（SAVE）' },
    { name: 'operator', type: 'string', required: false, desc: '当前操作人' },
    { name: '__trigger', type: 'json', required: false, desc: '触发元信息（调试用）' },
  ],
  AFTER_TASK_APPROVE: approvalTriggerSpec('APPROVE', '通过'),
  AFTER_PROCESS_FINISH: approvalTriggerSpec('FINISH', '结束'),
  AFTER_TASK_REJECT: approvalTriggerSpec('REJECT', '拒绝'),
  AFTER_TASK_RETURN: approvalTriggerSpec('RETURN', '驳回'),
  AFTER_TASK_TRANSFER: approvalTriggerSpec('TRANSFER', '转办', [toUserSpec('转办后的新办理人')]),
  AFTER_TASK_DELEGATE: approvalTriggerSpec('DELEGATE', '委派', [toUserSpec('被委派人')]),
  AFTER_TASK_ADD_SIGN: approvalTriggerSpec('ADD_SIGN', '加签', [toUserSpec('加签人（多个逗号分隔）')]),
  AFTER_TASK_CLAIM: approvalTriggerSpec('CLAIM', '认领'),
  AFTER_TASK_URGE: approvalTriggerSpec('URGE', '催办', [toUserSpec('被催办人')]),
  AFTER_PROCESS_WITHDRAW: approvalTriggerSpec('WITHDRAW', '撤回'),
  AFTER_PROCESS_TERMINATE: approvalTriggerSpec('TERMINATE', '终止'),
  AFTER_PROCESS_START: approvalTriggerSpec('START', '启动'),
}

/** 取触发点参数规格（未知触发点返回 null） */
export function triggerParamSpec(value: string): TriggerParamSpec[] | null {
  return TRIGGER_PARAM_SPECS[value] ?? null
}

/**
 * 判断逻辑流声明的入参与触发点事件参数是否完全匹配（名称集合严格相等）。
 * flowsMatchTrigger(['formData', ...], 'AFTER_SNAPSHOT') → boolean
 */
export function flowsMatchTrigger(inputVarNames: string[] | null | undefined, triggerValue: string): boolean {
  const spec = triggerParamSpec(triggerValue)
  if (!spec) return false
  const expected = spec.map((p) => p.name).sort().join(',')
  const actual = [...(inputVarNames || [])].sort().join(',')
  return expected === actual
}

export interface FormLogicBindingDTO {
  id: string
  formType: string
  formKey: string
  triggerType: string
  flowKey: string
  executionMode: string
  enabled: boolean
  description: string | null
  createdAt: string | null
}

export interface FormLogicBindingSaveRequest {
  formType: string
  formKey: string
  triggerType: string
  flowKey: string
  executionMode?: string
  enabled?: boolean
  description?: string | null
}

export const formLogicBindingApi = {
  /** 某表单全部绑定 */
  list(formType: string, formKey: string): Promise<R<FormLogicBindingDTO[]>> {
    return http.get('/v1/form-logic-bindings', {
      params: { formType, formKey },
    })
  },
  /** 创建绑定 */
  create(req: FormLogicBindingSaveRequest): Promise<R<FormLogicBindingDTO>> {
    return http.post('/v1/form-logic-bindings', req)
  },
  /** 更新绑定（触发点/流/模式/启停/描述） */
  update(id: string, req: Partial<FormLogicBindingSaveRequest>): Promise<R<FormLogicBindingDTO>> {
    return http.put(`/v1/form-logic-bindings/${id}`, req)
  },
  /** 删除绑定 */
  remove(id: string): Promise<R<void>> {
    return http.delete(`/v1/form-logic-bindings/${id}`)
  },
}
