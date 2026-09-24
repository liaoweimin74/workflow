import { Body, Controller, Logger, Post, Res } from '@nestjs/common'
import { Response } from 'express'
import { PageRef } from '../tools/ai-tool'
import { AiAgentService } from '../service/ai-agent.service'

/**
 * AI 助手对话 Controller（对齐 Java `AiChatController`）。
 *
 * {@code POST /api/v1/ai/chat} 返回 {@code text/event-stream} 文本，事件序列：
 * meta → (tool_call → tool_result)* → message → done（或 error）。
 *
 * 采用同步响应体而非逐块写出：当前 agent 为非流式产出（工具循环完成后
 * 一次性产生事件），与 Java 侧行为一致，可避免 chunked 收尾兼容问题。
 */
@Controller('api/v1/ai')
export class AiChatController {
  private readonly logger = new Logger(AiChatController.name)

  constructor(private readonly agentService: AiAgentService) {}

  /** 对话（SSE 文本）。 */
  @Post('chat')
  async chat(
    @Body() request: ChatRequest | undefined,
    @Res() res: Response,
  ): Promise<void> {
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('X-Accel-Buffering', 'no')

    const message = request?.message?.trim()
    if (!message) {
      res.send(sse('error', { code: 'BAD_REQUEST', msg: '消息不能为空' }))
      return
    }

    const pages: PageRef[] = Array.isArray(request?.context?.menus) ? request.context.menus : []
    this.logger.log(`AI 对话：len=${message.length}，pages=${pages.length}`)

    const body = await this.agentService.chatSse(toHistory(request?.history), message, pages)
    res.send(body)
  }
}

/** 对话请求（对齐 Java `ChatRequest`）。 */
export interface ChatRequest {
  /** 本轮用户输入。 */
  message: string
  /** 历史消息（user/assistant）。 */
  history?: ChatTurn[]
  /** 客户端上下文（路由/表单 id/可用菜单，供服务端感知）。 */
  context?: ChatContext
}

export interface ChatTurn {
  role: string
  content: string
}

export interface ChatContext {
  route?: string
  formId?: string
  /** 用户可访问菜单页面（供 open_page 白名单）。 */
  menus?: PageRef[]
}

function toHistory(turns?: ChatTurn[]): { role: string; content: string }[] {
  if (!Array.isArray(turns)) {
    return []
  }
  return turns
    .filter((t) => t && typeof t.content === 'string')
    .filter((t) => t.role === 'user' || t.role === 'assistant')
    .map((t) => ({ role: t.role, content: t.content }))
}

/** 构造一条 SSE 事件帧。 */
function sse(event: string, data: unknown): string {
  let json: string
  try {
    json = JSON.stringify(data)
  } catch {
    json = '{}'
  }
  return `event:${event}\ndata:${json}\n\n`
}
