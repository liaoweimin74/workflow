import http from '@/utils/http'
import type { LookupFetchConfig, QueryParams, TableColumn } from './types'

/**
 * 深层取值：按点分路径从对象取值。
 * 如 getByPath({ data: { records: [...] } }, 'data.records')
 */
export function getByPath(obj: any, path: string): any {
  if (!path) return obj
  return path.split('.').reduce((acc, key) => (acc == null ? acc : acc[key]), obj)
}

/**
 * 行单元格取值：优先取 BizDataVO 内层（row.data[key]），回退取顶层（row[key]）。
 * 底表接口返回 { id, data: {...业务字段...}, version, ... }，业务字段在 data 内层；
 * 外部 API 平铺行直接取顶层。兼容两种结构。
 */
export function readCellValue(row: any, key?: string): any {
  if (row == null || !key) return undefined
  const inner = row.data != null && typeof row.data === 'object' ? row.data[key] : undefined
  return inner !== undefined ? inner : row[key]
}

/**
 * 页码是否按 0 起发送：显式 pageBase=0 优先；
 * 未配置时，若 action 指向系统底表接口（/v1/biz-data/，后端 0 起分页）则按 0 起，兼容旧配置。
 */
function isZeroBasedPage(fetch: LookupFetchConfig): boolean {
  if (fetch.pageBase !== undefined) return fetch.pageBase === 0
  return fetch.action.startsWith('/v1/biz-data/')
}

/**
 * 由可序列化的 fetch 配置构造 fetchApi 函数。
 * 响应约定：http 拦截器已解包 R 包装，业务数据在 res.data；
 * parse/totalParse 表达式基于业务数据层（如 'records' / 'content' / 'total'）。
 * 请求参数：固定 data 与分页/关键字 params 合并（params 优先）。
 * 页码基准：0 起（底表接口 /v1/biz-data/ 或显式 pageBase=0）时把 el-pagination 的 1 起页码减 1；默认 1 起原样透传。
 */
export function buildFetchApiFromConfig(fetch: LookupFetchConfig) {
  return async (params: QueryParams & { keyword?: string }): Promise<{ rows: any[]; total: number }> => {
    const method = (fetch.method || 'GET').toUpperCase()
    // 固定参数 + 分页/关键字；关键字映射到 searchParam（默认 keyword）
    const query: Record<string, unknown> = { ...(fetch.data || {}) }
    query.page = isZeroBasedPage(fetch) ? Math.max((params.page || 1) - 1, 0) : params.page
    query.size = params.size
    if (params.keyword) {
      query[fetch.searchParam || 'keyword'] = params.keyword
    }
    if (fetch.keywordColumn) {
      query.keywordColumn = fetch.keywordColumn
    }
    const res: any = method === 'POST'
      ? await http.post(fetch.action, fetch.data || {}, { params: query, headers: fetch.headers })
      : await http.get(fetch.action, { params: query, headers: fetch.headers })
    // http 拦截器返回 R 解包后的响应，业务数据在 res.data
    const biz = res?.data ?? res
    const rows = getByPath(biz, fetch.parse || 'rows') || getByPath(biz, 'records') || []
    const total = fetch.totalParse
      ? (getByPath(biz, fetch.totalParse) ?? rows.length)
      : (getByPath(biz, 'total') ?? rows.length)
    return { rows: Array.isArray(rows) ? rows : [], total: Number(total) || rows.length }
  }
}

/**
 * 构建引用快照：{ id, [displayField]: 值, ...配置列值 }。
 * 剔除 data/version/createdAt 等脏字段；displayField 值强制包含（tag 展示依赖）。
 * 所有取值走 readCellValue（兼容 BizDataVO 内层与平铺行）。
 */
export function buildSnapshot(
  row: Record<string, unknown>,
  displayField: string,
  columns?: TableColumn[],
): Record<string, unknown> {
  const snapshot: Record<string, unknown> = {}
  if (row.id !== undefined && row.id !== null) snapshot.id = row.id
  snapshot[displayField] = readCellValue(row, displayField)
  for (const col of columns || []) {
    if (!col.prop || col.prop === displayField || col.prop === 'id') continue
    snapshot[col.prop] = readCellValue(row, col.prop)
  }
  return snapshot
}