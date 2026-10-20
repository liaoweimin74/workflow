// lc:module=api page=cardlist_test source=schema.dataSources[0]（ds_mvck4gv9 → refId 25e8df2b1f1241d0a79ef33d819d0f54）
// 出码把「数据源标识」解析成固定 refId，运行期不再查页面 dataSources 表（原链路：resolveRefId，PageDataTable.vue:800-806）
import http from '@lc/runtime/http'

const REF_ID = '25e8df2b1f1241d0a79ef33d819d0f54'

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
export const getData = (id: string) => http.get(`/v1/data-sources/${REF_ID}/data/${id}`)
export const createData = (data: Record<string, unknown>) => http.post(`/v1/data-sources/${REF_ID}/data`, data)
export const updateData = (id: string, data: Record<string, unknown>, version?: number) =>
  http.put(`/v1/data-sources/${REF_ID}/data/${id}`, data, { params: { version } })
export const deleteData = (id: string) => http.delete(`/v1/data-sources/${REF_ID}/data/${id}`)
