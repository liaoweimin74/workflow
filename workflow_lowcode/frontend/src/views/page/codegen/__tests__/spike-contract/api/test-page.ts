// lc:module=api source=schema.dataSources[0] (ds_mu2jhb3n → refId 20f476f047ca4386bfd1365ea5516832)
// 出码把「数据源标识」解析成固定 refId，运行期不再查页面 dataSources 表（原链路：resolveRefId，PageDataTable.vue:800-806）
import http from '@lc/runtime/http'

const REF_ID = '20f476f047ca4386bfd1365ea5516832'

export interface QueryParams {
  page?: number
  size?: number
  keyword?: string
  keywordColumn?: string
  sort?: string
  order?: string
  /** 结构化筛选 JSON 字符串，受 searchFields 白名单约束 */
  filter?: string
  params?: string
}

export const queryData = (params: QueryParams) => http.get(`/v1/data-sources/${REF_ID}/data`, { params })
export const getData = (refId: string, id: string) => http.get(`/v1/data-sources/${refId}/data/${id}`)
export const createData = (refId: string, data: Record<string, unknown>) =>
  http.post(`/v1/data-sources/${refId}/data`, data)
export const updateData = (refId: string, id: string, data: Record<string, unknown>, version?: number) =>
  http.put(`/v1/data-sources/${refId}/data/${id}`, data, { params: { version } })
export const deleteData = (refId: string, id: string) => http.delete(`/v1/data-sources/${refId}/data/${id}`)
