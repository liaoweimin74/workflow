import http from '@/utils/http'
import type { R, PageResult } from '@/types/common'

export interface FormDefinitionDTO {
  id: string
  name: string
  key: string
  type: string
  version: number
  status: string
  publishedVersion: number | null
  createdBy: string | null
  createdAt: string
  updatedAt: string
}

export interface FormDefinitionDetailDTO extends FormDefinitionDTO {
  schema: string
  columnConfig: string | null
}

export interface FormDefinitionSaveRequest {
  name: string
  key: string
  schema: string
  columnConfig?: string | null
}

export interface FormVersionDTO {
  id: string
  version: number
  status: string
  createdBy: string | null
  createdAt: string
}

export interface FormDataDTO {
  id: string
  formDefId: string
  formVersion: number
  processInstanceId: string | null
  taskId: string | null
  dataJson: string
  createdBy: string | null
  createdAt: string
  updatedAt: string
  isSnapshot: boolean
}

export interface FormDataSaveRequest {
  formDefId: string
  processInstanceId?: string
  taskId?: string
  dataJson: string
}

export const formApi = {
  createForm(name: string, key: string, type?: string): Promise<R<FormDefinitionDTO>> {
    return http.post('/v1/form-definitions', null, { params: { name, key, type } })
  },

  getFormDefinitions(params: {
    page?: number
    size?: number
    status?: string
    name?: string
    type?: string
  }): Promise<R<PageResult<FormDefinitionDTO>>> {
    return http.get('/v1/form-definitions', { params })
  },

  getFormDefinition(id: string): Promise<R<FormDefinitionDetailDTO>> {
    return http.get(`/v1/form-definitions/${id}`)
  },

  /** 按 key 获取表单定义详情（业务数据管理页用） */
  getFormDefinitionByKey(key: string): Promise<R<FormDefinitionDetailDTO>> {
    return http.get(`/v1/form-definitions/by-key/${key}`)
  },

  updateFormDefinition(id: string, data: FormDefinitionSaveRequest): Promise<R<FormDefinitionDTO>> {
    return http.put(`/v1/form-definitions/${id}`, data)
  },

  deleteFormDefinition(id: string): Promise<R<void>> {
    return http.delete(`/v1/form-definitions/${id}`)
  },

  publishFormDefinition(id: string): Promise<R<FormDefinitionDTO>> {
    return http.post(`/v1/form-definitions/${id}/publish`)
  },

  getFormVersions(id: string): Promise<R<FormVersionDTO[]>> {
    return http.get(`/v1/form-definitions/${id}/versions`)
  },

  getFormVersion(id: string, version: number): Promise<R<FormDefinitionDetailDTO>> {
    return http.get(`/v1/form-definitions/${id}/versions/${version}`)
  },

  saveFormData(data: FormDataSaveRequest): Promise<R<FormDataDTO>> {
    return http.post('/v1/form-data', data)
  },

  /** 保存审批快照（冻结当前表单数据） */
  saveSnapshot(data: FormDataSaveRequest): Promise<R<FormDataDTO>> {
    return http.post('/v1/form-data/snapshot', data)
  },

  /** 保存发起页草稿 */
  saveDraft(data: { formDefId: string; dataJson: string }): Promise<R<FormDataDTO>> {
    return http.post('/v1/form-data/draft', data)
  },

  /** 查询发起页草稿 */
  getDraft(formDefId: string): Promise<R<FormDataDTO | null>> {
    return http.get(`/v1/form-data/draft/${formDefId}`)
  },

  /** 清除发起页草稿（发起成功后调用） */
  clearDraft(formDefId: string): Promise<R<void>> {
    return http.delete(`/v1/form-data/draft/${formDefId}`)
  },

  getFormData(processInstanceId: string, formDefId: string): Promise<R<FormDataDTO | null>> {
    return http.get('/v1/form-data', { params: { processInstanceId, formDefId } })
  },

  /** 按 taskId 查询审批快照 */
  getFormDataByTask(taskId: string): Promise<R<FormDataDTO | null>> {
    return http.get(`/v1/form-data/task/${taskId}`)
  },

  /** 按流程实例查询所有审批快照（按时间倒序） */
  getSnapshots(processInstanceId: string): Promise<R<FormDataDTO[]>> {
    return http.get(`/v1/form-data/process-instance/${processInstanceId}/snapshots`)
  },

  getFormDataById(id: string): Promise<R<FormDataDTO>> {
    return http.get(`/v1/form-data/${id}`)
  },

  updateFormData(id: string, data: FormDataSaveRequest): Promise<R<FormDataDTO>> {
    return http.put(`/v1/form-data/${id}`, data)
  },

  getFormDataByProcessInstance(processInstanceId: string): Promise<R<FormDataDTO[]>> {
    return http.get(`/v1/form-data/process-instance/${processInstanceId}`)
  },
}
