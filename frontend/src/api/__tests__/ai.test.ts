import { describe, it, expect, vi, afterEach } from 'vitest'
import { generateForm } from '../ai'

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

describe('ai api — generateForm', () => {
  it('按序解析 meta/chunk/done 事件', async () => {
    const chunks = [
      'event:meta\ndata:{"taskId":"t1","model":"m"}\n\n',
      'event:chunk\ndata:{"delta":"{\\"rule\\":"}\n\n',
      'event:chunk\ndata:{"delta":"[]}"}\n\n',
      'event:done\ndata:{"schema":"{\\"rule\\":[]}","fields":[],"warnings":[]}\n\n',
    ]
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(streamResponse(chunks)))

    const meta: Array<{ taskId: string; model: string }> = []
    const deltas: string[] = []
    const done: any[] = []

    await new Promise<void>((resolve) => {
      generateForm('请假单', {
        onMeta: (m) => meta.push(m),
        onDelta: (d) => deltas.push(d),
        onDone: (r) => {
          done.push(r)
          resolve()
        },
      })
    })

    expect(meta).toHaveLength(1)
    expect(meta[0].taskId).toBe('t1')
    expect(deltas.join('')).toBe('{"rule":[]}')
    expect(done).toHaveLength(1)
    expect(done[0].schema).toBe('{"rule":[]}')
  })

  it('error 事件回调 onError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(streamResponse(['event:error\ndata:{"code":"CONFIG_MISSING","msg":"AI 服务未配置"}\n\n'])),
    )

    const errors: Array<{ code: string; msg: string }> = []
    await new Promise<void>((resolve) => {
      generateForm('x', {
        onError: (e) => {
          errors.push(e)
          resolve()
        },
      })
    })

    expect(errors).toHaveLength(1)
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
      generateForm('x', {
        onError: (e) => {
          errors.push(e)
          resolve()
        },
      })
    })

    expect(errors).toHaveLength(1)
    expect(errors[0].msg).toBe('AI 服务未配置')
  })
})
