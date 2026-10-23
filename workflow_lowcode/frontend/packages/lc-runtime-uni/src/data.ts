/**
 * @lc/runtime-uni/data：出码容器段 CRUD 数据层（Task 5.2）。
 *
 * 语义对位 web 产物 api/*.ts（emit.emitApi）：refId 构造期定死（首源），运行期不再查
 * 页面 dataSources 表（原链路 resolveRefId 的出码期等价）；URL/方法/参数与 web 完全同形：
 *  · query：GET  /v1/data-sources/:refId/data（params 走 uni.request GET data 即 query）
 *  · get：  GET  /v1/data-sources/:refId/data/:id
 *  · create：POST /v1/data-sources/:refId/data
 *  · update：PUT  /v1/data-sources/:refId/data/:id，乐观锁 version 拼进 URL query——
 *    uni.request 的 PUT data 是请求体，query 参数只能进 URL（web axios params 同线格式
 *    ?version=N，无值不拼对位 axios 省略 undefined）。
 * 拆纯函数 buildUniDataCalls（单测无需 uni 全局），uniDataApi 只做请求器接线。
 */
import { uniRequest, type R, type UniRequestCall } from './http'

/** CRUD 调用描述（纯函数产物）：直接喂 uniRequest 构造的请求器 */
export interface UniDataCalls {
  query: (params: Record<string, unknown>) => UniRequestCall
  get: (id: string) => UniRequestCall
  create: (data: Record<string, unknown>) => UniRequestCall
  update: (id: string, data: Record<string, unknown>, version?: number) => UniRequestCall
}

export function buildUniDataCalls(refId: string): UniDataCalls {
  const base = `/v1/data-sources/${refId}`
  return {
    query: (params) => ({ url: `${base}/data`, data: params }),
    get: (id) => ({ url: `${base}/data/${id}` }),
    create: (data) => ({ url: `${base}/data`, method: 'POST', data }),
    update: (id, data, version) => ({
      url: version === undefined ? `${base}/data/${id}` : `${base}/data/${id}?version=${version}`,
      method: 'PUT',
      data,
    }),
  }
}

export interface UniDataApiOptions {
  refId: string
  /** 请求器注入（缺省 uniRequest 缺省配置：token + 租户头，baseURL 同源） */
  request?: <T>(call: UniRequestCall) => Promise<R<T>>
}

export interface UniDataApi {
  query: (params: Record<string, unknown>) => Promise<R<unknown>>
  get: (id: string) => Promise<R<unknown>>
  create: (data: Record<string, unknown>) => Promise<R<unknown>>
  update: (id: string, data: Record<string, unknown>, version?: number) => Promise<R<unknown>>
}

/** 容器段 CRUD 门面：openContainer 回填 / confirmSave 提交共用同一 refId 门面 */
export function uniDataApi(options: UniDataApiOptions): UniDataApi {
  const request = options.request ?? uniRequest({ tenantHeader: 'X-Tenant-Id' })
  const calls = buildUniDataCalls(options.refId)
  return {
    query: (params) => request(calls.query(params)),
    get: (id) => request(calls.get(id)),
    create: (data) => request(calls.create(data)),
    update: (id, data, version) => request(calls.update(id, data, version)),
  }
}
