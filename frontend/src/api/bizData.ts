import http from '@/utils/http'
import type { R } from '@/types/common'

/** 业务数据列映射项（与后端 ColumnConfig 对齐） */
export interface ColumnConfigItem {
  key: string
  label: string
  columnType: string
  length: number | null
  scale: number | null
  required: boolean
  unique: boolean
  indexed: boolean
}

/** 业务数据行 */
export interface BizDataVO {
  id: string
  data: Record<string, unknown>
  version: number
  createdAt: string
  updatedAt: string
}

/** 后端 BizDataPageVO 分页响应 */
export interface BizDataPageResult {
  records: BizDataVO[]
  total: number
  page: number
  size: number
}

export interface BizDataQueryParams {
  page?: number
  size?: number
  keyword?: string
  keywordColumn?: string
  sort?: string
  order?: string
  filter?: Record<string, unknown>
}

export const bizDataApi = {
  list(formKey: string, params: BizDataQueryParams): Promise<R<BizDataPageResult>> {
    const query: Record<string, unknown> = { ...params }
    // filter 对象序列化为 JSON 字符串（后端 BizDataQueryRequest.filter 为 String）
    if (query.filter && typeof query.filter === 'object') {
      query.filter = JSON.stringify(query.filter)
    }
    return http.get(`/v1/biz-data/${formKey}`, { params: query })
  },

  detail(formKey: string, id: string): Promise<R<BizDataVO>> {
    return http.get(`/v1/biz-data/${formKey}/${id}`)
  },

  create(formKey: string, data: Record<string, unknown>): Promise<R<BizDataVO>> {
    return http.post(`/v1/biz-data/${formKey}`, data)
  },

  update(formKey: string, id: string, data: Record<string, unknown>, version: number): Promise<R<BizDataVO>> {
    return http.put(`/v1/biz-data/${formKey}/${id}`, { ...data, version })
  },

  remove(formKey: string, id: string): Promise<R<void>> {
    return http.delete(`/v1/biz-data/${formKey}/${id}`)
  },

  /** 批量解析数据显示文本（data-picker 引用还原） */
  resolve(formKey: string, ids: string[], displayField?: string): Promise<R<Record<string, string>>> {
    return http.get(`/v1/biz-data/${formKey}/resolve`, {
      params: { ids: ids.join(','), displayField },
    })
  },
}
