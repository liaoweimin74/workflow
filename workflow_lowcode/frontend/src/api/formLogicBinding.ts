import http from '@/utils/http'
import type { R } from '@/types/common'

/** 触发点（后端 FormLogicBindingService 同名常量） */
export const FORM_LOGIC_TRIGGERS = [
  { value: 'BEFORE_CREATE', label: '新增前', formType: 'BUSINESS' },
  { value: 'AFTER_CREATE', label: '新增后', formType: 'BUSINESS' },
  { value: 'BEFORE_UPDATE', label: '更新前', formType: 'BUSINESS' },
  { value: 'AFTER_UPDATE', label: '更新后', formType: 'BUSINESS' },
  { value: 'BEFORE_DELETE', label: '删除前', formType: 'BUSINESS' },
  { value: 'AFTER_DELETE', label: '删除后', formType: 'BUSINESS' },
  { value: 'BEFORE_SNAPSHOT', label: '快照保存前', formType: 'WORKFLOW' },
  { value: 'AFTER_SNAPSHOT', label: '快照保存后', formType: 'WORKFLOW' },
  { value: 'BEFORE_SAVE', label: '表单保存前', formType: 'WORKFLOW' },
  { value: 'AFTER_SAVE', label: '表单保存后', formType: 'WORKFLOW' },
] as const

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
 */
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
