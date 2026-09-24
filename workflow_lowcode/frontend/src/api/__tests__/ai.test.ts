import { describe, it, expect, vi, afterEach } from 'vitest'
import { chat } from '../ai'

function streamResponse(chunks: string[], status = 200): Response {
  const encoder = new TextEncoder()
  let i = 0
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (i < chunks.length) {
        controller.enqueue(encoder.encode(chunks[i++]))
      } else {
        controller.close()
      }
    },
  })
  return new Response(stream, { status, headers: { 'Content-Type': 'text/event-stream' } })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('ai api — chat', () => {
  it('按序解析 meta/tool_call/tool_result/message/done', async () => {
    const chunks = [
      'event:meta\ndata:{"model":"m"}\n\n',
      'event:tool_call\ndata:{"name":"generate_form_schema","args":{"description":"x"}}\n\n',
      'event:tool_result\ndata:{"name":"generate_form_schema","result":{"schema":"{\\"rule\\":[]}"}}\n\n',
      'event:message\ndata:{"text":"已生成","navigations":[{"path":"/form","label":"表单管理"}]}\n\n',
      'event:done\ndata:{}\n\n',
    ]
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(streamResponse(chunks)))

    const events: string[] = []
    await new Promise<void>((resolve) => {
      chat(
        { message: 'hi', history: [] },
        {
          onMeta: () => events.push('meta'),
          onToolCall: (name) => events.push(`call:${name}`),
          onToolResult: (name) => events.push(`result:${name}`),
          onMessage: (t, navs) => events.push(`msg:${t}:${navs.length}`),
          onDone: () => {
            events.push('done')
            resolve()
          },
        },
      )
    })

    expect(events).toEqual([
      'meta',
      'call:generate_form_schema',
      'result:generate_form_schema',
      'msg:已生成:1',
      'done',
    ])
  })

  it('error 事件回调 onError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(streamResponse(['event:error\ndata:{"code":"CONFIG_MISSING","msg":"AI 服务未配置"}\n\n'])),
    )

    const errors: Array<{ code: string; msg: string }> = []
    await new Promise<void>((resolve) => {
      chat({ message: 'x', history: [] }, {
        onError: (e) => {
          errors.push(e)
          resolve()
        },
      })
    })

    expect(errors[0].code).toBe('CONFIG_MISSING')
    expect(errors[0].msg).toBe('AI 服务未配置')
  })

  it('非 200 响应读取 R.msg 并回调 onError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ code: 503, msg: 'AI 服务未配置' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    )

    const errors: Array<{ code: string; msg: string }> = []
    await new Promise<void>((resolve) => {
      chat({ message: 'x', history: [] }, {
        onError: (e) => {
          errors.push(e)
          resolve()
        },
      })
    })

    expect(errors[0].msg).toBe('AI 服务未配置')
  })
})
