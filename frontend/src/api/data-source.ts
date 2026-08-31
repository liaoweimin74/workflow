import http from '@/utils/http'
import type { R, PageResponse } from '@/types/common'
import type { ColumnConfigItem, BizDataVO, BizDataPageResult } from '@/api/bizData'

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

/** 数据源元数据（对齐后端 DataSourceMetadata） */
export interface DataSourceMetadataDTO {
  columns: ColumnConfigItem[]
  /** 是否支持增删改（只读数据源 false） */
  writable: boolean
}

/** 数据源数据查询参数（对齐后端 BizDataQueryRequest） */
export interface DataSourceQueryParams {
  page?: number
  size?: number
  keyword?: string
  keywordColumn?: string
  sort?: string
  order?: string
  /** 结构化筛选 JSON 字符串（{logic, conditions:[{column,op,value}]}），受 searchFields 白名单约束 */
  filter?: string
}

export const dataSourceApi = {
  /** 分页查询数据源列表（type/status/name 过滤） */
  getDataSources(params: {
    page?: number
    size?: number
    type?: string
    status?: string
    name?: string
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

  // ==================== 统一数据访问（经 DataSourceAdapter SPI，对齐后端六端点） ====================

  /** 数据源元数据：列定义 + 可写标记（设计器切换数据源刷新列用；稳定数据启用 30s 缓存） */
  getMetadata(id: string): Promise<R<DataSourceMetadataDTO>> {
    return http.get(`/v1/data-sources/${id}/metadata`, { cache: true })
  },

  /** 数据源列表分页查询 */
  queryData(id: string, params: DataSourceQueryParams): Promise<R<BizDataPageResult>> {
    return http.get(`/v1/data-sources/${id}/data`, { params })
  },

  /** 数据源单条查询 */
  getData(id: string, rowId: string): Promise<R<BizDataVO>> {
    return http.get(`/v1/data-sources/${id}/data/${rowId}`)
  },

  /** 数据源新增（只读数据源 → 400 不支持） */
  createData(id: string, data: Record<string, unknown>): Promise<R<string>> {
    return http.post(`/v1/data-sources/${id}/data`, data)
  },

  /** 数据源修改（version 乐观锁可空） */
  updateData(id: string, rowId: string, data: Record<string, unknown>, version?: number): Promise<R<void>> {
    return http.put(`/v1/data-sources/${id}/data/${rowId}`, data, {
      params: version === undefined ? {} : { version },
    })
  },

  /** 数据源删除 */
  deleteData(id: string, rowId: string): Promise<R<void>> {
    return http.delete(`/v1/data-sources/${id}/data/${rowId}`)
  },
}