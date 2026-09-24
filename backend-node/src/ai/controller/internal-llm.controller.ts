import { Body, Controller, Headers, Logger, Post, Res } from '@nestjs/common'
import { Response } from 'express'
import { Public } from '../../framework/security/jwt-auth.guard'
import { LlmMessage, ZaiLlmService } from '../service/zai-llm.service'

/**
 * 内部 LLM 网关：OpenAI 兼容端点，模型为平台内置 GLM（z-ai-web-dev-sdk）。
 *
 * 供 Java 后端 `OpenAiCompatibleChatModel` 直连（`workflow.ai.base-url` 默认指向
 * `http://127.0.0.1:8080/api/internal/llm/v1`），使 Java AI 模块零外部 API key
 * 配置即用平台内置模型；外部部署仍可用 `AI_BASE_URL`/`AI_API_KEY`/`AI_MODEL`
 * 环境变量覆盖接入其他 OpenAI 兼容服务。
 *
 * 协议：`POST /v1/chat/completions`（OpenAI chat.completions 语义）
 * - 鉴权：`Authorization: Bearer <key>`，key 须等于 `INTERNAL_LLM_KEY`（默认
 *   `internal-llm`）——Java 侧 `workflow.ai.api-key` 默认同值，零配置互通。
 * - 无 tools：透传平台内置模型（system/tool 角色按 SDK 约定映射）。
 * - 有 tools：平台 SDK 无原生 function calling，采用文本协议模拟（与
 *   `AiAgentService` 同款约定）：注入「{"tool":...,"args":{...}}」协议提示，
 *   模型输出该 JSON 时转换为 OpenAI `tool_calls` 响应，供 Java agent 循环消费。
 * - `stream=true`：非流式拿到全量后合成 OpenAI delta 帧 + `data: [DONE]`
 *   （消费方——Java `completeStream`/formgen——均为全量处理语义，攒帧等价）。
 */
@Controller('api/internal/llm')
export class InternalLlmController {
  private readonly logger = new Logger(InternalLlmController.name)

  /** 默认内部密钥（与 Java `workflow.ai.api-key` 默认值一致）。 */
  private static readonly DEFAULT_KEY = 'internal-llm'

  constructor(private readonly llm: ZaiLlmService) {}

  @Public()
  @Post('v1/chat/completions')
  async chatCompletions(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: ChatCompletionsBody | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const expected = process.env['INTERNAL_LLM_KEY']?.trim() || InternalLlmController.DEFAULT_KEY
    const provided = (authorization ?? '').replace(/^Bearer\s+/i, '').trim()
    if (provided !== expected) {
      res.status(401).json(errorBody('无效的内部 LLM 网关密钥', 'invalid_api_key'))
      return
    }

    const messages = body?.messages ?? []
    if (messages.length === 0) {
      res.status(400).json(errorBody('messages 不能为空', 'invalid_request_error'))
      return
    }

    const started = Date.now()
    try {
      const sdkMessages = this.toSdkMessages(messages, body?.tools, body?.response_format?.type)
      const content = await this.llm.complete(sdkMessages)
      const toolCall = body?.tools && body.tools.length > 0 ? parseToolCall(content) : null

      this.logger.log(
        `内部网关补全完成: messages=${messages.length} tools=${body?.tools?.length ?? 0} ` +
          `toolCall=${toolCall ? toolCall.name : '-'} chars=${content.length} ${Date.now() - started}ms`,
      )

      if (body?.stream) {
        res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
        res.setHeader('Cache-Control', 'no-cache')
        res.setHeader('X-Accel-Buffering', 'no')
        res.send(this.streamFrames(content, toolCall).join(''))
        return
      }
      res.json(this.completionBody(content, toolCall))
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      this.logger.warn(`内部网关补全失败: ${msg}`)
      res.status(502).json(errorBody(`模型服务调用失败: ${msg}`, 'model_error'))
    }
  }

  // ==================== 消息映射 ====================

  /**
   * OpenAI 消息 → SDK 消息（角色不含 'system'/'tool'，按 zai-llm 约定映射）：
   * - system → assistant（承载提示）
   * - tool → user（`TOOL_RESULT:` 前缀回灌，文本协议约定）
   * - assistant（含 tool_calls）→ assistant（工具调用还原为协议 JSON 文本）
   */
  private toSdkMessages(
    messages: OpenAiMessage[],
    tools: OpenAiTool[] | undefined,
    responseFormat: string | undefined,
  ): LlmMessage[] {
    const out: LlmMessage[] = []
    if (tools && tools.length > 0) {
      out.push({ role: 'assistant', content: this.toolProtocolPrompt(tools, responseFormat) })
    }
    for (const m of messages) {
      const content = typeof m.content === 'string' ? m.content : ''
      if (m.role === 'system') {
        if (content) out.push({ role: 'assistant', content })
      } else if (m.role === 'user') {
        out.push({ role: 'user', content })
      } else if (m.role === 'tool') {
        out.push({
          role: 'user',
          content:
            `TOOL_RESULT: ${content}\n请基于以上工具结果继续回复用户；` +
            '若还需调用工具，按约定只输出工具 JSON。',
        })
      } else {
        const calls = m.tool_calls ?? []
        if (calls.length > 0) {
          const callText = calls
            .map((tc) =>
              JSON.stringify({ tool: tc.function?.name ?? '', args: safeParseArgs(tc.function?.arguments) }),
            )
            .join('\n')
          out.push({ role: 'assistant', content: content ? `${content}\n${callText}` : callText })
        } else if (content) {
          out.push({ role: 'assistant', content })
        }
      }
    }
    return out
  }

  /** 文本协议提示（与 `AiAgentService` 约定一致）；含工具清单与响应格式约束。 */
  private toolProtocolPrompt(tools: OpenAiTool[], responseFormat: string | undefined): string {
    const lines: string[] = [
      '[内部 LLM 网关补充协议]',
      '你可以使用以下工具：',
    ]
    for (const t of tools) {
      lines.push(`- ${t.function?.name ?? ''}：${t.function?.description ?? ''}`)
      if (t.function?.parameters !== undefined) {
        lines.push(`  参数 schema：${JSON.stringify(t.function.parameters)}`)
      }
    }
    lines.push(
      '需要调用工具时，整条回复必须只输出如下 JSON（不要包含任何其他文字或代码围栏）：',
      '  {"tool": "工具名", "args": { ...参数... }}',
      '工具执行结果会以 TOOL_RESULT 开头的消息返回给你，收到后基于结果继续回复用户；',
      '不需要调用工具时，直接用自然语言回复用户。',
    )
    if (responseFormat === 'json_object') {
      lines.push('另外：本轮回复必须是合法 JSON。')
    }
    return lines.join('\n')
  }

  // ==================== 响应合成 ====================

  /** OpenAI 非流式响应体。 */
  private completionBody(content: string, toolCall: ParsedToolCall | null): Record<string, unknown> {
    const id = `chatcmpl-${Date.now().toString(36)}`
    const created = Math.floor(Date.now() / 1000)
    const model = this.llm.getModel()
    if (toolCall) {
      return {
        id,
        object: 'chat.completion',
        created,
        model,
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [
                {
                  id: `call_${Date.now().toString(36)}`,
                  type: 'function',
                  function: { name: toolCall.name, arguments: toolCall.arguments },
                },
              ],
            },
            finish_reason: 'tool_calls',
          },
        ],
      }
    }
    return {
      id,
      object: 'chat.completion',
      created,
      model,
      choices: [
        {
          index: 0,
          message: { role: 'assistant', content },
          finish_reason: 'stop',
        },
      ],
    }
  }

  /** OpenAI delta 流帧（tool_calls 单帧携带全量 arguments；content 等长切片）。 */
  private streamFrames(content: string, toolCall: ParsedToolCall | null): string[] {
    const frames: string[] = []
    if (toolCall) {
      frames.push(
        'data: ' +
          JSON.stringify({
            choices: [
              {
                delta: {
                  role: 'assistant',
                  tool_calls: [
                    {
                      index: 0,
                      id: `call_${Date.now().toString(36)}`,
                      type: 'function',
                      function: { name: toolCall.name, arguments: toolCall.arguments },
                    },
                  ],
                },
              },
            ],
          }) +
          '\n\n',
      )
    } else {
      for (let i = 0; i < content.length; i += 100) {
        frames.push(
          'data: ' +
            JSON.stringify({ choices: [{ delta: { content: content.slice(i, i + 100) } }] }) +
            '\n\n',
        )
      }
    }
    frames.push('data: [DONE]\n\n')
    return frames
  }
}

// ==================== 请求/响应类型 ====================

interface OpenAiMessage {
  role?: 'system' | 'user' | 'assistant' | 'tool'
  content?: string | null
  tool_calls?: Array<{ id?: string; type?: string; function?: { name?: string; arguments?: string } }>
}

interface OpenAiTool {
  type?: string
  function?: { name?: string; description?: string; parameters?: unknown }
}

interface ChatCompletionsBody {
  model?: string
  messages?: OpenAiMessage[]
  temperature?: number
  max_tokens?: number
  stream?: boolean
  tools?: OpenAiTool[]
  response_format?: { type?: string }
}

interface ParsedToolCall {
  name: string
  arguments: string
}

function errorBody(message: string, type: string): Record<string, unknown> {
  return { error: { message, type, code: type } }
}

/** 解析工具调用 arguments（非法/缺失按空对象兜底）。 */
function safeParseArgs(raw: string | undefined): Record<string, unknown> {
  if (!raw) return {}
  try {
    const v = JSON.parse(raw)
    return v && typeof v === 'object' ? v : {}
  } catch {
    return {}
  }
}

/**
 * 从模型回复解析文本协议工具调用（{"tool":...,"args":{...}}）。
 *
 * 兼容 ```json 围栏；非 JSON 或缺 tool 字段返回 null（按普通文本处理）。
 */
function parseToolCall(content: string): ParsedToolCall | null {
  const text = stripJsonFence(content).trim()
  if (!text.startsWith('{')) return null
  try {
    const obj = JSON.parse(text) as { tool?: unknown; args?: unknown }
    if (typeof obj['tool'] !== 'string' || !obj['tool']) return null
    const args = obj['args'] && typeof obj['args'] === 'object' ? (obj['args'] as Record<string, unknown>) : {}
    return { name: obj['tool'], arguments: JSON.stringify(args) }
  } catch {
    return null
  }
}

/** 去除模型输出中的 ```/```json 围栏（仅包裹整段时）。 */
function stripJsonFence(text: string): string {
  const t = text.trim()
  const m = /^```(?:json)?\s*\n([\s\S]*?)\n\s*```$/.exec(t)
  return m ? m[1] : t
}
