import { Body, Controller, Logger, Post, Res } from '@nestjs/common'
import { Response } from 'express'
import { ZaiLlmService } from '../service/zai-llm.service'

/**
 * form-create 内置 AI 面板（AiPanel）兼容端点。
 *
 * 替代 form-create 官方外部云服务（api.form-create.com），改用平台内置模型。
 * 协议（AiPanel.callAiApi 约定）：
 * - 请求：{ ui, basic, form: { rule, option }, messages: [{role, content}] }
 * - 响应：text/event-stream，OpenAI chat.completions delta 帧 + `data: [DONE]`
 * - 特殊指令：delta 内容以 `[FC_TOOL]` 开头 → 面板思考步骤；正文含
 *   ```fcRuleDiff 围栏 → 面板转为 DIFF 块（可导入回填画布）
 */
@Controller('api/v1/ai')
export class FcChatController {
  private readonly logger = new Logger(FcChatController.name)

  constructor(private readonly llm: ZaiLlmService) {}

  @Post('fc-chat')
  async fcChat(@Body() body: FcChatRequest | undefined, @Res() res: Response): Promise<void> {
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('X-Accel-Buffering', 'no')

    const frames: string[] = []
    const push = (content: string) => {
      frames.push(`data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`)
    }

    try {
      const last = body?.messages?.[body.messages.length - 1]
      const userContent = typeof last?.content === 'string' ? last.content : ''
      if (!userContent.trim()) {
        push('请输入你的需求，例如「添加一个邮箱字段」。')
        frames.push('data: [DONE]\n\n')
        res.send(frames.join(''))
        return
      }

      // 思考步骤（面板 UI 展示一致性）
      push('[FC_TOOL]' + JSON.stringify({ id: 'step-1', title: '分析表单结构', status: 'done' }))

      const currentRule = safeStringify(body?.form?.rule)
      const messages = [
        { role: 'assistant' as const, content: buildFcSystemPrompt() },
        {
          role: 'user' as const,
          content: `当前表单规则 JSON：\n${currentRule}\n\n用户需求：${userContent}`,
        },
      ]

      const text = await this.llm.complete(messages)
      // AiPanel 对每个 delta chunk 检查 content.trim().startsWith('```fcRuleDiff')
      // 来触发 DIFF 包装（newJson/oldJson），因此必须按围栏边界拆包：
      // 说明文字与完整围栏各自成独立 chunk，围栏格式严格为 ```fcRuleDiff\n<JSON>\n```
      for (const part of splitByDiffFence(text)) {
        push(part)
      }
      frames.push('data: [DONE]\n\n')
    } catch (e) {
      this.logger.warn(`fc-chat 失败: ${e instanceof Error ? e.message : String(e)}`)
      push('抱歉，AI 服务暂时不可用，请稍后重试。')
      frames.push('data: [DONE]\n\n')
    }

    res.send(frames.join(''))
  }
}

interface FcChatRequest {
  ui?: string
  basic?: boolean
  form?: { rule?: unknown; option?: unknown }
  messages?: { role: string; content: unknown }[]
}

/**
 * 表单设计助手系统提示：约束 fcRuleDiff 输出格式
 * （AiPanel 以 content.startsWith('```fcRuleDiff') + slice(13,-3) 截取 JSON，
 * 因此围栏必须严格为三反引号开头/结尾且 JSON 独占行）。
 */
function buildFcSystemPrompt(): string {
  return [
    '你是低代码表单设计器中的「智能助理」，帮助用户通过自然语言修改当前表单。',
    '',
    '当前表单的 rule JSON 会随用户消息给出。form-create rule 是一个对象数组，',
    '常用组件 type：input、inputTextarea、inputNumber、select、radio、checkbox、',
    'date、datetime、time、dateRange、switch、editor、rate、upload、divider。',
    '字段对象形如：',
    '{"type":"input","field":"snake_case_english","title":"中文标题","value":null,',
    ' "validate":[{"required":true,"message":"请填写XX"}],',
    ' "options":[{"label":"选项一","value":"选项一"}]}',
    '',
    '回复规则：',
    '- 需要修改表单时，除简要中文说明外，必须输出一个代码围栏，格式严格如下（JSON 独占一行）：',
    '```fcRuleDiff',
    '[完整的修改后 rule JSON，包含所有原有字段与新增/修改字段]',
    '```',
    '- 输出的 JSON 必须是完整的新 rule 数组（不要省略未修改的字段），以便用户一键导入。',
    '- field 命名必须为 snake_case 英文；title 用中文；枚举类字段用 select/radio/checkbox 并带 options。',
    '- 只回答与表单设计相关的问题；使用中文，回复简洁。',
  ].join('\n')
}

function safeStringify(v: unknown): string {
  if (v == null) return '[]'
  if (typeof v === 'string') return v
  try {
    return JSON.stringify(v, null, 0)
  } catch {
    return '[]'
  }
}

/**
 * 按 fcRuleDiff 围栏边界拆分回复：
 * - 围栏外的说明文字：按 120 字符切块输出
 * - ```fcRuleDiff\n<JSON>\n``` 围栏：整体归一为单个独立 chunk
 *   （AiPanel 以 slice(13,-3) 截取 JSON，故围栏必须三反引号开头 + 换行 +
 *   JSON + 换行 + 三反引号结尾）
 */
function splitByDiffFence(text: string): string[] {
  const out: string[] = []
  const re = /```fcRuleDiff\s*\n?([\s\S]*?)\n?\s*```/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      out.push(...chunkText(text.slice(last, m.index), 120))
    }
    out.push('```fcRuleDiff\n' + m[1].trim() + '\n```')
    last = m.index + m[0].length
  }
  if (last < text.length) {
    out.push(...chunkText(text.slice(last), 120))
  }
  return out.length ? out : [text]
}

/** 把文本切成等长块（尾块可能短）。 */
function chunkText(text: string, size: number): string[] {
  if (!text) return []
  const out: string[] = []
  for (let i = 0; i < text.length; i += size) {
    out.push(text.slice(i, i + size))
  }
  return out
}
