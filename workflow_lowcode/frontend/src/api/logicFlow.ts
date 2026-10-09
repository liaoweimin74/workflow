import http from '@/utils/http'
import type { R, PageResponse } from '@/types/common'

/**
 * 逻辑编排（LogicFlow）API 层 —— 与 worklog Task 2 契约逐字段对齐。
 *
 * 路径前缀 /v1/logic-flows（http.ts baseURL 已是 /api，vite proxy → 后端 8080）。
 * 后端统一返回 R<T> 包装，http.ts 拦截器已自动拆 R（code!==200 弹错并 reject）。
 */

/** 逻辑流列表/详情公共字段 */
export interface LogicFlowSummary {
  id: string
  /** 编排唯一键（同租户唯一，API/调度引用） */
  flowKey: string
  name: string
  description: string | null
  /** DRAFT=草稿 PUBLISHED=已发布 */
  status: 'DRAFT' | 'PUBLISHED'
  /** 已发布版本号（0 = 从未发布） */
  version: number
  updatedAt: string
}

/** 逻辑流详情（含画布 DSL JSON 字符串） */
export interface LogicFlowDetail extends LogicFlowSummary {
  /** DSL JSON 字符串：{ nodes:[{id,type,name,x,y,config,results?,errorAction?}], edges:[{id?,source,target,branch?}] } */
  dsl: string
}

/** 单节点执行轨迹 */
export interface NodeTrace {
  nodeId: string
  nodeName: string
  /** START|END|HTTP|BEAN|SCRIPT|CONDITION */
  type: string
  status: 'SUCCESS' | 'FAILED' | 'SKIPPED'
  result?: unknown
  error?: string
  durationMs: number
}

/** 运行结果（run 试运行 / runs 历史项） */
export interface RunResult {
  runId: string
  status: 'SUCCESS' | 'FAILED'
  outputVars: Record<string, unknown>
  traces: NodeTrace[]
  errorMessage?: string
  durationMs: number
}

/** 运行历史记录（GET /{id}/runs 列表项） */
export interface LogicFlowRunRecord extends RunResult {
  createdAt?: string
}

/** 表单字段节点（path 为相对 formData 根的完整点路径，children 为子字段树） */
export interface FlowFormFieldNode {
  path: string
  label: string | null
  type: string
  children: FlowFormFieldNode[] | null
}

/** 绑定表单字段组（同表单多触发点绑定聚合为一组） */
export interface FlowFormFieldGroup {
  formKey: string
  formName: string | null
  formType: 'BUSINESS' | 'WORKFLOW' | string
  /** 来源：columnConfig | schema | sampled | empty */
  source: string
  triggerTypes: string[] | null
  fields: FlowFormFieldNode[] | null
}

/** 已注册的后端 Bean 方法（GET /v1/backend-logic/beans 列表项，供 BEAN 节点面板下拉） */
export interface BackendBeanInfo {
  beanName: string
  methodName: string
  displayName: string
  parameterCount: number
}

export interface LogicFlowListParams {
  keyword?: string
  page?: number
  size?: number
}

export interface LogicFlowCreateRequest {
  key: string
  name: string
  description?: string
}

export interface LogicFlowUpdateRequest {
  name?: string
  description?: string
  /** DSL JSON 字符串 */
  dsl?: string
}

export const logicFlowApi = {
  /** 分页列表，keyword 模糊匹配名称/标识 */
  list(params: LogicFlowListParams): Promise<R<PageResponse<LogicFlowSummary>>> {
    return http.get('/v1/logic-flows', { params })
  },

  /** 创建（后端默认生成 开始→结束 DSL，DRAFT v0） */
  create(data: LogicFlowCreateRequest): Promise<R<LogicFlowSummary>> {
    return http.post('/v1/logic-flows', data)
  },

  /** 详情（含 dsl） */
  get(id: string): Promise<R<LogicFlowDetail>> {
    return http.get(`/v1/logic-flows/${id}`)
  },

  /** 更新名称/描述/DSL */
  update(id: string, data: LogicFlowUpdateRequest): Promise<R<LogicFlowSummary>> {
    return http.put(`/v1/logic-flows/${id}`, data)
  },

  /** 删除 */
  remove(id: string): Promise<R<void>> {
    return http.delete(`/v1/logic-flows/${id}`)
  },

  /** 发布：校验 DSL（可达性/条件分支出边/配置完整性）→ PUBLISHED + version+1 */
  publish(id: string): Promise<R<LogicFlowSummary>> {
    return http.post(`/v1/logic-flows/${id}/publish`)
  },

  /** 以当前已存 DSL 测试运行，入参为运行变量 */
  run(id: string, data: { vars: Record<string, unknown> }): Promise<R<RunResult>> {
    return http.post(`/v1/logic-flows/${id}/run`, data)
  },

  /** 运行历史（默认最近 20 条） */
  runs(id: string, limit = 20): Promise<R<LogicFlowRunRecord[]>> {
    return http.get(`/v1/logic-flows/${id}/runs`, { params: { limit } })
  },

  /** 已注册 Bean 方法清单（复用既有 backend-logic 接口） */
  listBeans(): Promise<R<BackendBeanInfo[]>> {
    return http.get('/v1/backend-logic/beans')
  },

  /**
   * 设计期表单字段发现：绑定表单（enabled）→ formData 字段树。
   * 来源：BUSINESS columnConfig / WORKFLOW schema rule 树 / 空 schema 实例采样（只取结构不取值）。
   */
  formFields(id: string): Promise<R<FlowFormFieldGroup[]>> {
    return http.get(`/v1/logic-flows/${id}/form-fields`)
  },
}
