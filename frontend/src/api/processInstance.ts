import http from '@/utils/http'
import type { R, PageResponse } from '@/types/common'
import type { ApprovalRecordVO } from '@/api/task'

// ── VO / 请求接口 ──

/**
 * 流程实例列表项（对应后端 ProcessInstanceController.toMap 序列化形状）。
 */
export interface ProcessInstanceVO {
  id: string
  processDefinitionId: string
  processDefinitionKey: string
  processDefinitionName: string
  businessKey: string
  tenantId: string
  suspended: boolean
  ended: boolean
  currentNode: string
  /** running | suspended | completed */
  status: string
}

/**
 * 流程实例列表查询参数。
 * 支持按发起人、状态、流程名称筛选。
 */
export interface ProcessInstanceQueryParams {
  page?: number
  size?: number
  initiator?: string
  status?: string
  processName?: string
}

/** 启动流程请求 */
export interface StartProcessRequest {
  processKey: string
  businessKey?: string
  formDefId?: string
  variables?: Record<string, unknown>
}

/** 启动流程响应 */
export interface StartProcessResponse {
  id: string
  processDefinitionId: string
  processDefinitionKey: string
  businessKey: string
  tenantId: string
}

/** 流程高亮信息（节点 + 连线高亮 ID） */
export interface ProcessHighlight {
  [key: string]: unknown
}

// ── API ──

/**
 * 流程实例 API（对应 /api/v1/process-instances）。
 *
 * list: 支持 initiator/status/processName 筛选。
 * history: 审批历史时间线（由 ProcessHistoryController 提供）。
 */
export const processInstanceApi = {
  /** 启动流程 */
  start(data: StartProcessRequest): Promise<R<StartProcessResponse>> {
    return http.post('/v1/process-instances', data)
  },

  /** 流程实例分页列表，支持 initiator/status/processName 筛选 */
  list(params: ProcessInstanceQueryParams): Promise<R<PageResponse<ProcessInstanceVO>>> {
    return http.get('/v1/process-instances', { params })
  },

  /** 获取流程实例详情 */
  get(id: string): Promise<R<ProcessInstanceVO>> {
    return http.get(`/v1/process-instances/${id}`)
  },

  /** 挂起流程实例 */
  suspend(id: string): Promise<R<void>> {
    return http.post(`/v1/process-instances/${id}/suspend`)
  },

  /** 恢复流程实例 */
  resume(id: string): Promise<R<void>> {
    return http.post(`/v1/process-instances/${id}/resume`)
  },

  /** 终止流程实例 */
  terminate(id: string, reason?: string): Promise<R<void>> {
    return http.post(`/v1/process-instances/${id}/terminate`, null, {
      params: { reason }
    })
  },

  /** 获取流程图高亮信息（已走节点 + 当前节点） */
  highlight(id: string): Promise<R<ProcessHighlight>> {
    return http.get(`/v1/process-instances/${id}/highlight`)
  },

  /** 获取流程实例的审批历史记录（时间线） */
  history(id: string): Promise<R<ApprovalRecordVO[]>> {
    return http.get(`/v1/process-instances/${id}/history`)
  },
}
