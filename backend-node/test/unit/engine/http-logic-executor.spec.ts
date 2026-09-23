import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  HttpLogicExecutor,
  javaUrlEncode,
  resolveVars,
} from '../../../src/engine/logic/http-logic-executor'
import { inferColumns } from '../../../src/engine/form/bizdata/api-metadata-probe'

/**
 * 出站 HTTP 执行器与 API 列推断的单测（规格 U30）。
 *
 * 契约场景「API 元数据探测」覆盖了三条错误形态（缺 action / 不可达 / 未授权），
 * 但**覆盖不到成功路径** —— 出站请求不带认证头，而本项目的安全配置只放行
 * `/api/auth/login` 与 SSE，没有任何「公开且返回 JSON 数组」的端点。所以：
 *   - `inferColumns`（这个端点**唯一的业务逻辑**）只能在这里验证；
 *   - 执行器的 URL 变量解析、query 编码、body 构造、重试策略同样只能在这里验证
 *     （golden 只碰到「不可达」那一条）。
 */

const executor = new HttpLogicExecutor()

afterEach(() => {
  vi.unstubAllGlobals()
})

function stubFetch(
  impl: (url: string, init: RequestInit) => Promise<Response> | Response,
): Array<{ url: string; init: RequestInit }> {
  const calls: Array<{ url: string; init: RequestInit }> = []
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    calls.push({ url, init })
    return impl(url, init)
  })
  return calls
}

function jsonResponse(status: number, body: string, statusText = ''): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    text: async () => body,
  } as unknown as Response
}

describe('resolveVars / javaUrlEncode', () => {
  it('{{ name }} 允许空格、取不到给空串（不是报错）', () => {
    expect(resolveVars('http://x/{{page}}?s={{ size }}', { page: 1, size: 20 })).toBe(
      'http://x/1?s=20',
    )
    expect(resolveVars('a{{missing}}b', {})).toBe('ab')
  })

  it('javaUrlEncode 与 encodeURIComponent 不同：空格编成 +、保留 -_.*', () => {
    expect(javaUrlEncode('a b')).toBe('a+b')
    expect(javaUrlEncode('a-b_c.d*e')).toBe('a-b_c.d*e')
    // 中文按 UTF-8 逐字节百分号编码（大写十六进制）
    expect(javaUrlEncode('中')).toBe('%E4%B8%AD')
  })
})

describe('HttpLogicExecutor.execute', () => {
  it('拼 query（Java 编码）与 JSON body，返回响应体字符串', async () => {
    const calls = stubFetch(() => jsonResponse(200, '{"ok":true}'))
    const body = await executor.execute(
      'http://x/{{path}}',
      'post',
      { 'x-tag': '{{tag}}' },
      [{ source: 'kw', target: 'q' }],
      [{ source: 'name', target: 'userName' }],
      { path: 'p', tag: 't', kw: 'a b', name: '张三' },
      1000,
      1000,
      0,
    )
    expect(body).toBe('{"ok":true}')
    expect(calls).toHaveLength(1)
    expect(calls[0].url).toBe('http://x/p?q=a+b')
    expect(calls[0].init.method).toBe('POST')
    expect(calls[0].init.body).toBe('{"userName":"张三"}')
    expect((calls[0].init.headers as Record<string, string>)['x-tag']).toBe('t')
    expect((calls[0].init.headers as Record<string, string>)['content-type']).toBe(
      'application/json',
    )
  })

  it('无 body 映射时不带 body、也不设 content-type', async () => {
    const calls = stubFetch(() => jsonResponse(200, 'x'))
    await executor.execute('http://x/', 'GET', {}, [], [], {}, 0, 0, 0)
    expect(calls[0].init.body).toBeUndefined()
    expect((calls[0].init.headers as Record<string, string>)['content-type']).toBeUndefined()
  })

  it('非 2xx → 抛 Spring 形态的消息（`<码> <原因>: "<响应体>"`，内层引号不转义）', async () => {
    stubFetch(() => jsonResponse(401, '{"code":401,"msg":"未登录或Token已过期","data":null}', 'Unauthorized'))
    const error = await executor
      .execute('http://x/', 'GET', {}, [], [], {}, 0, 0, 0)
      .catch((e: unknown) => e)
    expect((error as Error).message).toBe(
      '401 Unauthorized: "{"code":401,"msg":"未登录或Token已过期","data":null}"',
    )
  })

  it('4xx **不重试**（确定性结果），网络错误才重试，全失败后给尝试次数', async () => {
    const notFound = stubFetch(() => jsonResponse(404, 'nope', 'Not Found'))
    await executor.execute('http://x/', 'GET', {}, [], [], {}, 0, 0, 3).catch(() => undefined)
    expect(notFound).toHaveLength(1)

    let attempts = 0
    stubFetch(() => {
      attempts += 1
      throw new TypeError('fetch failed')
    })
    const error = await executor
      .execute('http://x/', 'GET', {}, [], [], {}, 0, 0, 2)
      .catch((e: unknown) => e)
    expect(attempts).toBe(3) // 1 + retryCount
    expect((error as Error).message).toBe('HTTP request failed after 3 attempts')
  })
})

describe('inferColumns', () => {
  it('找**第一个数组**（可嵌套在对象里），按首元素字段推类型', () => {
    const raw = JSON.stringify({
      code: 200,
      data: {
        records: [
          {
            id: 'a',
            count: 3,
            ratio: 1.5,
            active: true,
            note: null,
            tags: ['x'],
            nested: { k: 1 },
          },
        ],
        total: 1,
      },
    })
    expect(inferColumns(raw)).toEqual([
      { key: 'id', label: 'id', columnType: 'VARCHAR', length: null, scale: null, nullable: true },
      { key: 'count', label: 'count', columnType: 'INT', length: null, scale: null, nullable: true },
      { key: 'ratio', label: 'ratio', columnType: 'DECIMAL', length: null, scale: null, nullable: true },
      { key: 'active', label: 'active', columnType: 'TINYINT', length: null, scale: null, nullable: true },
      { key: 'note', label: 'note', columnType: 'VARCHAR', length: null, scale: null, nullable: true },
      { key: 'tags', label: 'tags', columnType: 'JSON', length: null, scale: null, nullable: true },
      { key: 'nested', label: 'nested', columnType: 'JSON', length: null, scale: null, nullable: true },
    ])
  })

  it('数组元素不是对象（如字符串数组）→ **空列表**，不是报错', () => {
    expect(inferColumns('{"data":["a","b"]}')).toEqual([])
  })

  it('没有数组 → 400「接口返回中未找到数组数据，无法推断字段」', () => {
    expect(() => inferColumns('{"a":1}')).toThrow('接口返回中未找到数组数据，无法推断字段')
  })

  it('非 JSON 文本 → 400「接口返回解析失败」（消息带底层原因）', () => {
    expect(() => inferColumns('not json')).toThrow(/^接口返回解析失败: /)
  })
})
