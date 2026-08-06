import http from '@/utils/http'
import type { R, PageResponse } from '@/types/common'

// ── VO 接口（与后端 DTO 字段一一对应） ──

/**
 * 待办任务 VO。
 * 对应后端 com.workflow.api.dto.TaskTodoVO。
 */
export interface TaskTodoVO {
  taskId: string
  processInstanceId: string
  processDefinitionId: string
  processName: string
  businessKey: string
  initiator: string
  initiatorName: string
  currentNodeName: string
  assignee: string
  createTime: string
  reminded: boolean
}

/**
 * 已办任务 VO。
 * 继承 TaskTodoVO，增加结束时间和审批结果。
 * 对应后端 com.workflow.api.dto.TaskDoneVO。
 */
export interface TaskDoneVO extends TaskTodoVO {
  endTime: string
  approveResult: string
}

/**
 * 任务详情 VO。
 * 对应后端 com.workflow.api.dto.TaskDetailVO。
 */
export interface TaskDetailVO {
  taskId: string
  name: string
  description: string
  assignee: string
  assigneeName: string
  processInstanceId: string
  processDefinitionId: string
  processName: string
  businessKey: string
  initiator: string
  initiatorName: string
  formKey: string
  variables: Record<string, unknown>
  createTime: string
}

/**
 * 审批记录 VO。
 * 对应后端 com.workflow.api.dto.ApprovalRecordVO。
 * 由 ProcessHistoryService 组装，将 Flowable 历史活动节点与 wf_task_comment 聚合为时间线视图。
 */
export interface ApprovalRecordVO {
  activityId: string
  activityName: string
  assignee: string
  assigneeName: string
  startTime: string
  endTime: string
  action: string
  comment: string
}

// ── 请求参数 / Body 接口 ──

export interface TaskTodoQueryParams {
  assignee: string
  page?: number
  size?: number
  processName?: string
  initiator?: string
  createTimeStart?: string
  createTimeEnd?: string
}

export interface TaskDoneQueryParams {
  userId: string
  page?: number
  size?: number
  processName?: string
  initiator?: string
  endTimeStart?: string
  endTimeEnd?: string
  approveResult?: string
}

export interface CompleteTaskRequest {
  variables?: Record<string, unknown>
  userId?: string
  comment?: string
}

export interface CompleteTaskResponse {
  processInstanceId: string
  processFinished: boolean
  nextTaskId: string
  nextTaskName: string
  nextTaskAssignee: string
  nextTaskDefinitionKey: string
}

export interface RejectRequest {
  userId?: string
  reason?: string
}

export interface TransferRequest {
  fromUser?: string
  toUser?: string
  reason?: string
}

export interface DelegateRequest {
  delegateTo: string
  fromUser?: string
  comment?: string
}

export interface AddSignRequest {
  users: string[]
  userId?: string
  comment?: string
}

export interface ForwardSignRequest {
  toUser: string
  userId?: string
  comment?: string
}

// ── API ──

export const taskApi = {
  /** 待办任务列表 */
  listTodo(params: TaskTodoQueryParams): Promise<R<PageResponse<TaskTodoVO>>> {
    return http.get('/v1/tasks', { params })
  },

  /** 已办（历史）任务列表 */
  listHistoric(params: TaskDoneQueryParams): Promise<R<PageResponse<TaskDoneVO>>> {
    return http.get('/v1/tasks/historic', { params })
  },

  /** 任务详情 */
  getDetail(id: string): Promise<R<TaskDetailVO>> {
    return http.get(`/v1/tasks/${id}`)
  },

  /** 签收任务 */
  claim(id: string, userId: string): Promise<R<void>> {
    return http.post(`/v1/tasks/${id}/claim`, null, { params: { userId } })
  },

  /** 完成任务 */
  complete(id: string, data?: CompleteTaskRequest): Promise<R<CompleteTaskResponse>> {
    return http.post(`/v1/tasks/${id}/complete`, data)
  },

  /** 驳回任务 */
  reject(id: string, data?: RejectRequest): Promise<R<void>> {
    return http.post(`/v1/tasks/${id}/reject`, data)
  },

  /** 转办任务 */
  transfer(id: string, data?: TransferRequest): Promise<R<void>> {
    return http.post(`/v1/tasks/${id}/transfer`, data)
  },

  /** 委派任务 */
  delegate(id: string, data: DelegateRequest): Promise<R<void>> {
    return http.post(`/v1/tasks/${id}/delegate`, data)
  },

  /** 加签 */
  addSign(id: string, data: AddSignRequest): Promise<R<void>> {
    return http.post(`/v1/tasks/${id}/add-sign`, data)
  },

  /** 转签 */
  forwardSign(id: string, data: ForwardSignRequest): Promise<R<void>> {
    return http.post(`/v1/tasks/${id}/forward-sign`, data)
  },
}
