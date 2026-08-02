import http from '@/utils/http'
import type { R, PageResult } from '@/types/common'

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
