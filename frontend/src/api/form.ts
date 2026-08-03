import http from '@/utils/http'
import type { R, PageResult } from '@/types/common'

export interface FormDefinitionDTO {
  id: string
  name: string
  key: string
  version: number
  status: string
  publishedVersion: number | null
  createdBy: string | null
  createdAt: string
  updatedAt: string
}

export interface FormDefinitionDetailDTO extends FormDefinitionDTO {
  schema: string
}

export interface FormDefinitionSaveRequest {
  name: string
  key: string
  schema: string
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
}

export interface FormDataSaveRequest {
  formDefId: string
  processInstanceId?: string
  taskId?: string
  dataJson: string
}

export const formApi = {
  createForm(name: string, key: string): Promise<R<FormDefinitionDTO>> {
    return http.post('/v1/form-definitions', null, { params: { name, key } })
  },

  getFormDefinitions(params: {
    page?: number
    size?: number
    status?: string
    name?: string
  }): Promise<R<PageResult<FormDefinitionDTO>>> {
    return http.get('/v1/form-definitions', { params })
  },

  getFormDefinition(id: string): Promise<R<FormDefinitionDetailDTO>> {
    return http.get(`/v1/form-definitions/${id}`)
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

  getFormData(processInstanceId: string, formDefId: string): Promise<R<FormDataDTO | null>> {
    return http.get('/v1/form-data', { params: { processInstanceId, formDefId } })
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
