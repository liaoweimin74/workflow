import http from '@/utils/http'
import type { R, PageResult, PageResponse } from '@/types/common'

export interface ProcessDraft {
  id: string
  tenantId: string
  name: string
  key: string
  categoryId: string | null
  bpmnXml: string
  status: string
  processDefinitionId: string | null
  deployId: string | null
  lastDeployedAt: string | null
  version: number
  createdBy: string | null
  createdAt: string
  updatedAt: string
}

export interface EditorData {
  id: string
  name: string
  key: string
  categoryId: string | null
  bpmnXml: string
  nodeConfigs: Record<string, string>
  status: string
}

export interface DesignSaveRequest {
  name: string
  key: string
  categoryId: string | null
  bpmnXml: string
  nodeConfigs: Record<string, string>
}

export interface ProcessDefinitionSummary {
  id: string
  key: string
  name: string
  version: number
}

/** 流程历史版本（GET /api/v1/deployed-processes/key/{key}/versions 列表项） */
export interface ProcessVersion {
  procDefId: string
  version: number
  name: string
  deploymentTime: string
  latest: boolean
}

/**
 * 已部署流程定义（Flowable ProcessDefinition 序列化形状）。
 * 对应 GET /api/v1/deployed-processes 列表项。
 */
export interface DeployedProcessDefinition {
  id: string
  key: string
  name: string
  version: number
  description: string | null
  deploymentId: string
  resourceName: string
  diagramResourceName: string | null
  tenantId: string
  category: string | null
  suspended: boolean
  /** 发起人节点字段级权限：field → EDIT/VIEW/HIDDEN。未配置时为 undefined。 */
  fieldPermissions?: Record<string, 'EDIT' | 'VIEW' | 'HIDDEN'>
}

export interface DeployedProcessQueryParams {
  page?: number
  size?: number
  categoryId?: string
  name?: string
  status?: string
}

/**
 * 已部署流程定义 API（对应 /api/v1/deployed-processes）。
 */
export const deployedProcessApi = {
  /** 已部署流程定义分页列表，支持 categoryId/name/status 筛选 */
  list(params: DeployedProcessQueryParams): Promise<R<PageResponse<DeployedProcessDefinition>>> {
    return http.get('/v1/deployed-processes', { params })
  },

  /** 已部署流程定义精简列表（按 key 去重取最新版本） */
  listSummaries(): Promise<R<ProcessDefinitionSummary[]>> {
    return http.get('/v1/deployed-processes/summaries')
  },

  /** 获取流程定义详情 */
  get(id: string): Promise<R<DeployedProcessDefinition>> {
    return http.get(`/v1/deployed-processes/${id}`)
  },

  /** 获取流程定义 BPMN XML */
  getXml(id: string): Promise<R<string>> {
    return http.get(`/v1/deployed-processes/${id}/xml`)
  },

  /** 挂起流程定义 */
  suspend(id: string): Promise<R<void>> {
    return http.post(`/v1/deployed-processes/${id}/suspend`)
  },

  /** 激活流程定义 */
  activate(id: string): Promise<R<void>> {
    return http.post(`/v1/deployed-processes/${id}/activate`)
  },

  /** 流程历史版本列表（按 key 查询全部已部署版本） */
  getVersions(key: string): Promise<R<ProcessVersion[]>> {
    return http.get(`/v1/deployed-processes/key/${key}/versions`)
  },

  /** 某版本的编辑器数据（该版本 BPMN XML + 配置快照） */
  getVersionEditor(procDefId: string): Promise<R<EditorData>> {
    return http.get(`/v1/deployed-processes/versions/${procDefId}/editor`)
  },
}

export const processDesignApi = {
  createDraft(name: string, key: string, categoryId?: string): Promise<R<ProcessDraft>> {
    return http.post('/v1/process-definitions/drafts', null, {
      params: { name, key, categoryId }
    })
  },

  listDrafts(params: {
    page?: number
    size?: number
    categoryId?: string
    name?: string
  }): Promise<R<PageResult<ProcessDraft>>> {
    return http.get('/v1/process-definitions/drafts', { params })
  },

  loadEditor(id: string): Promise<R<EditorData>> {
    return http.get(`/v1/process-definitions/${id}/editor`)
  },

  saveDesign(id: string, data: DesignSaveRequest): Promise<R<ProcessDraft>> {
    return http.put(`/v1/process-definitions/${id}/design`, data)
  },

  deploy(id: string): Promise<R<ProcessDraft>> {
    return http.post(`/v1/process-definitions/${id}/deploy`)
  },

  copyProcess(id: string): Promise<R<ProcessDraft>> {
    return http.post(`/v1/process-definitions/${id}/copy`)
  },

  deleteDraft(id: string): Promise<R<void>> {
    return http.delete(`/v1/process-definitions/${id}`)
  },

  /** 已部署流程定义精简列表（供调用活动子流程选择） */
  listSummaries(): Promise<R<ProcessDefinitionSummary[]>> {
    return http.get('/v1/deployed-processes/summaries')
  }
}
