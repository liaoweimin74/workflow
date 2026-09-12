/**
 * AI 表单生成 API（SSE 流式客户端）。
 *
 * POST /api/v1/ai/forms/generate 以 text/event-stream 返回事件序列：
 * meta → chunk* → done（或 error）。EventSource 无法携带 POST body，
 * 故使用 fetch + ReadableStream 手动解析。
 */

export interface AiFieldInfo {
  field: string
  title: string
  componentType: string
}

export interface AiFormGenerateResult {
  schema: string
  fields: AiFieldInfo[]
  warnings: string[]
}

export interface AiFormHandlers {
  onMeta?: (m: { taskId: string; model: string }) => void
  onDelta?: (delta: string) => void
  onDone?: (result: AiFormGenerateResult) => void
  onError?: (e: { code: string; msg: string }) => void
}

const GENERATE_URL = '/api/v1/ai/forms/generate'

/**
 * 发起流式表单生成。
 *
 * @returns AbortController（调用 abort() 取消生成）
 */
export function generateForm(description: string, handlers: AiFormHandlers): AbortController {
  const controller = new AbortController()
  void (async () => {
    try {
      const response = await fetch(GENERATE_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
          Authorization: `Bearer ${localStorage.getItem('access_token') ?? ''}`,
          'X-Tenant-Id': 'default',
        },
        body: JSON.stringify({ description }),
        signal: controller.signal,
      })

      if (!response.ok) {
        let msg = `请求失败（${response.status}）`
        try {
          const data = await response.json()
          if (data?.msg) msg = data.msg
        } catch {
          // 忽略非 JSON 响应体
        }
        handlers.onError?.({ code: String(response.status), msg })
        return
      }

      if (!response.body) {
        handlers.onError?.({ code: 'NO_BODY', msg: '响应内容为空' })
        return
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder('utf-8')
      let buffer = ''
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const blocks = buffer.split('\n\n')
        buffer = blocks.pop() ?? ''
        for (const block of blocks) {
          dispatchBlock(block, handlers)
        }
      }
      if (buffer.trim()) {
        dispatchBlock(buffer, handlers)
      }
    } catch (error) {
      const err = error as { name?: string; message?: string }
      if (err?.name === 'AbortError') return
      handlers.onError?.({ code: 'NETWORK', msg: err?.message ?? '网络错误' })
    }
  })()
  return controller
}

function dispatchBlock(block: string, handlers: AiFormHandlers): void {
  let event = 'message'
  const dataLines: string[] = []
  for (const line of block.split('\n')) {
    if (line.startsWith('event:')) {
      event = line.slice('event:'.length).trim()
    } else if (line.startsWith('data:')) {
      dataLines.push(line.slice('data:'.length).trim())
    }
  }
  if (dataLines.length === 0) return

  const dataStr = dataLines.join('\n')
  let payload: any = dataStr
  try {
    payload = JSON.parse(dataStr)
  } catch {
    // 保留原始文本
  }

  if (event === 'meta') {
    handlers.onMeta?.(payload)
  } else if (event === 'chunk') {
    handlers.onDelta?.(typeof payload?.delta === 'string' ? payload.delta : '')
  } else if (event === 'done') {
    handlers.onDone?.(payload)
  } else if (event === 'error') {
    handlers.onError?.(payload)
  }
}
