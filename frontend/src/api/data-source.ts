import http from '@/utils/http'
import type { R, PageResponse } from '@/types/common'

/** 数据源定义 DTO（对齐后端 DataSourceDTO） */
export interface DataSourceDTO {
  id: string
  tenantId: string
  name: string
  type: string
  formKey: string | null
  sourceKey: string | null
  params: string | null
  status: string
  createdBy: string | null
  createdAt: string
  updatedAt: string
}

/** 数据源保存请求（创建/更新共用） */
export interface DataSourceSaveRequest {
  name: string
  type: string
  formKey?: string | null
  sourceKey?: string | null
  params?: string | null
}

export const dataSourceApi = {
  /** 分页查询数据源列表（type/status 过滤） */
  getDataSources(params: {
    page?: number
    size?: number
    type?: string
    status?: string
  }): Promise<R<PageResponse<DataSourceDTO>>> {
    return http.get('/v1/data-sources', { params })
  },

  /** 仅已启用数据源（页面设计器数据源下拉） */
  getEnabledDataSources(): Promise<R<DataSourceDTO[]>> {
    return http.get('/v1/data-sources/enabled')
  },

  /** 创建数据源（默认 DRAFT） */
  createDataSource(data: DataSourceSaveRequest): Promise<R<DataSourceDTO>> {
    return http.post('/v1/data-sources', data)
  },

  /** 获取数据源详情 */
  getDataSource(id: string): Promise<R<DataSourceDTO>> {
    return http.get(`/v1/data-sources/${id}`)
  },

  /** 更新数据源（原地更新） */
  updateDataSource(id: string, data: DataSourceSaveRequest): Promise<R<DataSourceDTO>> {
    return http.put(`/v1/data-sources/${id}`, data)
  },

  /** 删除数据源（仅 DRAFT 可删） */
  deleteDataSource(id: string): Promise<R<void>> {
    return http.delete(`/v1/data-sources/${id}`)
  },

  /** 启用数据源 */
  enableDataSource(id: string): Promise<R<DataSourceDTO>> {
    return http.post(`/v1/data-sources/${id}/enable`)
  },

  /** 禁用数据源 */
  disableDataSource(id: string): Promise<R<DataSourceDTO>> {
    return http.post(`/v1/data-sources/${id}/disable`)
  },
}