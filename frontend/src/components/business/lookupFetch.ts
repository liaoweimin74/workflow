import http from '@/utils/http'
import type { LookupFetchConfig, QueryParams } from './types'

/**
 * 深层取值：按点分路径从对象取值。
 * 如 getByPath({ data: { records: [...] } }, 'data.records')
 */
export function getByPath(obj: any, path: string): any {
  if (!path) return obj
  return path.split('.').reduce((acc, key) => (acc == null ? acc : acc[key]), obj)
}

/**
 * 由可序列化的 fetch 配置构造 fetchApi 函数。
 * 响应约定：http 拦截器已解包 R 包装，业务数据在 res.data；
 * parse/totalParse 表达式基于业务数据层（如 'records' / 'content' / 'total'）。
 * 请求参数：固定 data 与分页/关键字 params 合并（params 优先）。
 */
export function buildFetchApiFromConfig(fetch: LookupFetchConfig) {
  return async (params: QueryParams & { keyword?: string }): Promise<{ rows: any[]; total: number }> => {
    const method = (fetch.method || 'GET').toUpperCase()
    const query: Record<string, unknown> = { ...(fetch.data || {}), ...params }
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