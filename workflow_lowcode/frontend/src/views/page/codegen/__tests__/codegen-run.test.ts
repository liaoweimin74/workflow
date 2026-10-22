/**
 * 出码按钮的客户端流程（RED 先行）。
 *
 * 一条链：设计器当前定义 → generatePage → POST 给 dev 中间件落盘 → 给出产物路由。
 * 用例要钉住的是「没生成成功就绝不发请求」「发出去的正点就是 generatePage 的那份」，
 * 以及空 pageKey 这种点不出东西的情况不能静默。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import cardlistSchema from './fixtures/corpus/cardlist_test.json'
import { generatePage } from '../generate'
import { PROBE_WRITE_URL, runCodegenAndWrite } from '../codegen-run'

const FILES = { pageKey: 'cardlist_test', pageName: '卡片列表', schema: cardlistSchema as any }

function reply(status: number, body: unknown) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

beforeEach(() => {
  vi.unstubAllGlobals()
})

describe('runCodegenAndWrite', () => {
  it('成功：落盘两个文件并给出产物全屏路由', async () => {
    const fetchMock = reply(200, { written: ['CardlistTest.vue', 'api/cardlist-test.ts'] })
    const out = await runCodegenAndWrite(FILES)
    expect(out.written).toEqual(['CardlistTest.vue', 'api/cardlist-test.ts'])
    expect(out.probeHref).toBe('/codegen-probe/cardlist_test')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe(PROBE_WRITE_URL)
  })

  it('POST 的正文就是 generatePage 那两份文件，逐字节不加工', async () => {
    reply(200, { written: [] })
    await runCodegenAndWrite(FILES)
    const init = (globalThis.fetch as any).mock.calls[0][1]
    expect(init.method).toBe('POST')
    expect(String(init.headers['content-type'] ?? init.headers.get?.('content-type'))).toContain('application/json')
    const body = JSON.parse(init.body)
    const gen = generatePage(cardlistSchema as any, {
      pageKey: 'cardlist_test',
      pageName: '卡片列表',
      exportedAt: body.exportedAt,
    })
    expect(body.files).toEqual(gen.files)
    expect(Object.keys(body.files).sort()).toEqual(['CardlistTest.vue', 'api/cardlist-test.ts'])
  })

  it('报告随结果带出来，按钮要能当场念出可出码数与 C 桶', async () => {
    reply(200, { written: [] })
    const out = await runCodegenAndWrite(FILES)
    expect(out.report.pageKey).toBe('cardlist_test')
    expect(out.report.codegenRate.totalNodes).toBeGreaterThan(0)
    expect(out.report.codegenRate.emittableNodes).toBeGreaterThan(0)
    expect(out.report.buckets).toEqual(expect.objectContaining({ A: expect.any(Number), B: expect.any(Number), C: expect.any(Number) }))
  })

  it('pageKey 为空：不生成也不发请求', async () => {
    const fetchMock = reply(200, { written: [] })
    await expect(runCodegenAndWrite({ ...FILES, pageKey: '  ' })).rejects.toThrow(/页面标识为空/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('生成阶段就炸（schema 不合规）：不发请求，错误原样抛', async () => {
    const fetchMock = reply(200, { written: [] })
    await expect(runCodegenAndWrite({ ...FILES, schema: undefined as any })).rejects.toThrow()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('中间件非 2xx：带状态码与服务端归因抛出，不给路由', async () => {
    reply(400, { error: '非法产物文件名：../evil.vue' })
    await expect(runCodegenAndWrite(FILES)).rejects.toThrow(/400.*非法产物文件名/)
  })

  it('中间件没装上（dev SPA fallback 会把 POST 回成 200 + index.html）：抛可读事实', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => '<!doctype html>',
        json: async () => {
          throw new SyntaxError('Unexpected token <')
        },
      }),
    )
    await expect(runCodegenAndWrite(FILES)).rejects.toThrow(/不是 JSON/)
  })

  it('200 但没有 written 清单：不假装成功', async () => {
    reply(200, {})
    await expect(runCodegenAndWrite(FILES)).rejects.toThrow(/written/)
  })
})
