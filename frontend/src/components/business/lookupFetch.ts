import http from '@/utils/http'
import type { LookupFetchConfig, LookupFilterConfig, QueryParams } from './types'

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
 * 全部外部调用统一使用 1-based 页码。
 */
/**
 * 由可序列化的 fetch 配置构造 fetchApi 函数。
 * 响应约定：http 拦截器已解包 R 包装，业务数据在 res.data；
 * parse/totalParse 表达式基于业务数据层（如 'records' / 'content' / 'total'）。
 * 请求参数：固定 data 与分页/关键字 params 合并（params 优先）。
 * 页码基准：统一使用 1 起页码，直接透传给后端。
 */
export function buildFetchApiFromConfig(fetch: LookupFetchConfig) {
  return async (params: QueryParams & { keyword?: string }): Promise<{ rows: any[]; total: number }> => {
    const method = (fetch.method || 'GET').toUpperCase()
    // 固定参数 + 分页/关键字；关键字映射到 searchParam（默认 keyword）
    const query: Record<string, unknown> = { ...(fetch.data || {}) }
    query.page = Math.max(params.page || 1, 1)
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
 * 解析筛选配置为底表 filter JSON 对象（供 params.filter）。
 * - 静态条件：value 用固定值；动态条件：经 getFieldValue 读取当前表单字段值
 * - 动态字段值缺失（null/undefined/''）→ value 置 null（等值恒不匹配，列表为空）
 * - isEmpty/isNotEmpty 条件不含 value 键
 * - 无任何条件返回 undefined
 */
export function resolveFilter(
  filter: LookupFilterConfig | undefined,
  getFieldValue: (field: string) => unknown,
): Record<string, unknown> | undefined {
  if (!filter || !Array.isArray(filter.conditions) || filter.conditions.length === 0) {
    return undefined
  }
  const conditions = filter.conditions
    .filter(c => c && c.column)
    .map(c => {
      const cond: Record<string, unknown> = { column: c.column, op: c.op || 'eq' }
      const op = (c.op || 'eq').toLowerCase()
      if (op !== 'isempty' && op !== 'isnotempty') {
        cond.value = c.field ? (getFieldValue(c.field) ?? null) : c.value
      }
      return cond
    })
  if (conditions.length === 0) {
    return undefined
  }
  return { logic: filter.logic || 'AND', conditions }
}
