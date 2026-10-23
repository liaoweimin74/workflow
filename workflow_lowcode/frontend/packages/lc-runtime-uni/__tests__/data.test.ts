// ----- Task 5.2: @lc/runtime-uni/data —— 容器段 CRUD 数据层 -----
// 语义对位 web 产物 api/*.ts（emit.emitApi）：refId 构造期定死（首源），运行期不再查页面
// dataSources 表；URL/方法/参数与 web 完全同形（GET /v1/data-sources/:refId/data 及 /:id、
// POST、PUT）；update 的乐观锁 version 拼进 URL query——uni.request 的 PUT data 是请求体，
// query 参数只能进 URL（web axios params 同线格式 ?version=N）。
// 拆纯函数 buildUniDataCalls（单测无需 uni 全局），uniDataApi 只做请求器接线。
import { describe, expect, it } from 'vitest'

import { buildUniDataCalls, uniDataApi } from '../src/data'

describe('@lc/runtime-uni/data — buildUniDataCalls（纯函数）', () => {
  const calls = buildUniDataCalls('ref_ds_1')

  it('query：GET 列表端点，params 原样进 data（uni.request GET data 即 query）', () => {
    expect(calls.query({ page: 1, size: 5 })).toEqual({
      url: '/v1/data-sources/ref_ds_1/data',
      data: { page: 1, size: 5 },
    })
  })

  it('get：GET /data/:id', () => {
    expect(calls.get('id_9')).toEqual({ url: '/v1/data-sources/ref_ds_1/data/id_9' })
  })

  it('create：POST /data', () => {
    expect(calls.create({ name: 'x' })).toEqual({
      url: '/v1/data-sources/ref_ds_1/data',
      method: 'POST',
      data: { name: 'x' },
    })
  })

  it('update：PUT /data/:id；version 有值拼 URL query（web params 同线格式），无值不拼', () => {
    expect(calls.update('id_9', { name: 'y' }, 3)).toEqual({
      url: '/v1/data-sources/ref_ds_1/data/id_9?version=3',
      method: 'PUT',
      data: { name: 'y' },
    })
    expect(calls.update('id_9', { name: 'y' }, undefined).url).toBe('/v1/data-sources/ref_ds_1/data/id_9')
  })
})

describe('@lc/runtime-uni/data — uniDataApi（请求器接线）', () => {
  it('调用走注入的 request（缺省 uniRequest 构造），返回 R 包装原样放行', async () => {
    const seen: unknown[] = []
    const api = uniDataApi({
      refId: 'ref_ds_1',
      request: async (call) => {
        seen.push(call)
        return { code: 200, data: { id: 'id_9' } }
      },
    })
    const res = await api.get('id_9')
    expect(res.code).toBe(200)
    expect(seen[0]).toEqual({ url: '/v1/data-sources/ref_ds_1/data/id_9' })
  })
})
