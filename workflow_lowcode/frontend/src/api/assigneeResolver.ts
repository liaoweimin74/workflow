import http from '@/utils/http'
import type { R } from '@/types/common'

/**
 * 选人函数参数声明（业务系统注册时声明，面板按此渲染参数配置表单）。
 * 与后端 AssigneeParamDef（backend-node / Java）同构。
 */
export interface AssigneeParamDef {
  /** 参数键（保存进 approval.external.params；运行时 fn(ctx, params) 取同名字段） */
  key: string
  /** 参数中文名（面板显示） */
  label: string
  /** 控件类型，缺省 string */
  type?: 'string' | 'number' | 'boolean' | 'select'
  /** 是否必填（面板标红星） */
  required?: boolean
  /** 输入占位提示 */
  placeholder?: string
  /** 缺省值（首次配置时预填） */
  defaultValue?: string | number | boolean
  /** type='select' 时的候选项 */
  options?: { label: string; value: string }[]
  /** 参数说明 */
  description?: string
}

/** 选人函数元数据（注册名 / 中文名 / 描述 / 参数声明） */
export interface AssigneeResolverMeta {
  /** 注册名（唯一，节点配置 approval.external.resolver 引用键） */
  name: string
  /** 中文名（唯一，面板下拉展示） */
  displayName: string
  /** 功能说明 */
  description?: string
  /** 参数声明 */
  params?: AssigneeParamDef[]
}

/** 选人函数清单（后端进程内注册表快照，按注册名排序） */
export function getAssigneeResolvers() {
  return http.get<any, R<AssigneeResolverMeta[]>>('/v1/assignee-resolvers', { cache: true })
}
