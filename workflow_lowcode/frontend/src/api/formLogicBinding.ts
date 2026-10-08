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
  { value: 'AFTER_SNAPSHOT', label: '快照保存后', formType: 'WORKFLOW' },
] as const

export type FormLogicTrigger = (typeof FORM_LOGIC_TRIGGERS)[number]['value']

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
