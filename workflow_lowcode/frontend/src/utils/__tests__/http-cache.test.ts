import { describe, it, expect, afterEach } from 'vitest'
import type { AxiosAdapter, InternalAxiosRequestConfig, AxiosResponse } from 'axios'
import http from '@/utils/http'
import type { R } from '@/types/common'

/**
 * 计数 mock adapter：记录网络请求次数，按调用序号返回 handler 结果。
 * handler 返回 Error 时模拟网络失败。
 */
function createCountingAdapter(handler: (call: number) => unknown) {
  const state = { calls: 0 }
  const adapter: AxiosAdapter = async (config: InternalAxiosRequestConfig) => {
    state.calls++
    const result = handler(state.calls)
    if (result instanceof Error) throw result
    return { data: result, status: 200, statusText: 'OK', headers: {}, config } as AxiosResponse
  }
  return { adapter, state }
}

const okBody = (call: number): R<{ n: number }> => ({ code: 200, data: { n: call }, msg: 'ok' })

afterEach(() => {
  vi.useRealTimers()
})

describe('http GET in-flight 去重', () => {
  it('并发同键 GET 仅发起 1 次网络请求且共享同一结果', async () => {
    const { adapter, state } = createCountingAdapter(okBody)
    const p1 = http.get('/dedup/x', { adapter })
    const p2 = http.get('/dedup/x', { adapter })
    const [r1, r2] = await Promise.all([p1, p2])
    expect(state.calls).toBe(1)
    expect(r2).toBe(r1)
  })

  it('请求完成后清理去重键，后续同键调用重新发起真实请求', async () => {
    const { adapter, state } = createCountingAdapter(okBody)
    await http.get('/cleanup/x', { adapter })
    await http.get('/cleanup/x', { adapter })
    expect(state.calls).toBe(2)
  })

  it('请求失败后清理去重键，允许后续重试成功', async () => {
    const { adapter, state } = createCountingAdapter((call) => (call === 1 ? new Error('boom') : okBody(call)))
    const config = { adapter, headers: { 'X-Skip-Error-Toast': 'true' } }
    await expect(http.get('/retry/x', config)).rejects.toThrow('boom')
    const second = await http.get('/retry/x', config)
    expect(state.calls).toBe(2)
    expect(second.data.n).toBe(2)
  })

  it('序列化参数一致的数组/undefined/null 参数视为同键（数组重复键、跳过空值）', async () => {
    const { adapter, state } = createCountingAdapter(okBody)
    const p1 = http.get('/params/x', { adapter, params: { ids: [1, 2, 3], q: undefined } })
    const p2 = http.get('/params/x', { adapter, params: { q: null, ids: [1, 2, 3] } })
    await Promise.all([p1, p2])
    expect(state.calls).toBe(1)
  })
})

describe('http GET 短 TTL 缓存', () => {
  it('cache:true 的请求 TTL 内第二次调用命中缓存，不发起网络请求', async () => {
    const { adapter, state } = createCountingAdapter(okBody)
    const first = await http.get('/cache/x', { adapter, cache: true })
    const second = await http.get('/cache/x', { adapter, cache: true })
    expect(state.calls).toBe(1)
    expect(second).toBe(first)
  })

  it('cache 过期后重新发起请求并以新响应更新缓存', async () => {
    vi.useFakeTimers()
    const { adapter, state } = createCountingAdapter(okBody)
    const first = await http.get('/ttl/x', { adapter, cache: true })
    expect(first.data.n).toBe(1)
    vi.advanceTimersByTime(29_999)
    const stillCached = await http.get('/ttl/x', { adapter, cache: true })
    expect(state.calls).toBe(1)
    expect(stillCached.data.n).toBe(1)
    vi.advanceTimersByTime(1)
    const refreshed = await http.get('/ttl/x', { adapter, cache: true })
    expect(state.calls).toBe(2)
    expect(refreshed.data.n).toBe(2)
  })

  it('未声明 cache 的 GET 不读写缓存，每次真实请求', async () => {
    const { adapter, state } = createCountingAdapter(okBody)
    await http.get('/nocache/x', { adapter })
    await http.get('/nocache/x', { adapter })
    expect(state.calls).toBe(2)
  })
})

describe('非 GET 方法不受影响', () => {
  it('POST 不去重不缓存，每次真实请求', async () => {
    const { adapter, state } = createCountingAdapter(okBody)
    await http.post('/post/x', { a: 1 }, { adapter })
    await http.post('/post/x', { a: 1 }, { adapter })
    expect(state.calls).toBe(2)
  })
})
