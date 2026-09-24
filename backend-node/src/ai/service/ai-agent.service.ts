import { Injectable, Logger } from '@nestjs/common'
import { AiToolContext, AiToolRegistry, PageRef } from '../tools/ai-tool'
import { OpenPageTool } from '../tools/open-page.tool'
import { AiError } from './ai-error'
import { LlmMessage, ZaiLlmService } from './zai-llm.service'

/**
 * AI 助手编排：多轮对话 + 工具调用循环（对齐 Java `AiAgentService`）。
 *
 * 平台内置 LLM 无原生 function calling，采用文本协议模拟：
 * 系统提示约定「需要调工具时整条回复只输出 {"tool":..., "args":{...}} JSON」，
 * agent 解析响应 → 执行工具 → 以 TOOL_RESULT 消息回灌 → 循环（≤ MAX_STEPS 轮）。
 */
@Injectable()
export class AiAgentService {
  static readonly MODULE = 'assistant'

  /** 单次请求最大工具调用步数。 */
  private static readonly MAX_STEPS = 5


  private readonly logger = new Logger(AiAgentService.name)

  private readonly toolRegistry: AiToolRegistry

  /** 系统提示固定段（协议与规则）。 */
  private readonly basePrompt: string

  constructor(
    private readonly llm: ZaiLlmService,
    toolRegistry: AiToolRegistry,
  ) {
    this.toolRegistry = toolRegistry
    this.basePrompt = [
      '你是「工作流管理平台」的智能助手，通过对话帮助用户完成平台内的任务。',
      '你的可用能力以“工具”形式提供（调用协议见下）：',
      '- create_form：当用户想要新建、创建一个表单时调用（**真实创建表单草稿并保存**）。参数：',
      '  name=表单名称；description=字段需求描述；formType=表单类型。',
      '- 表单类型语义（formType）：BUSINESS=业务表单，纯数据填报，**不关联审批流程**；',
      '  WORKFLOW=工作流表单，用于挂接审批流程。用户说“业务表单/登记表/信息表”用 BUSINESS，',
      '  只有用户明确说“审批/流程/工作流表单”才用 WORKFLOW。',
      '- generate_form_schema：仅当用户想先看表单结构（不创建）时调用，只返回结构 JSON，不落库。',
      '- open_page：提供一个可点击的页面入口，引导用户前往平台内页面；path 必须来自下方',
      '  「用户可访问页面」列表，禁止编造或使用未列出的路径。',
      '',
      '工具调用协议（严格遵守）：',
      '- 需要调用工具时，你的整条回复必须只包含一个 JSON 对象，格式（禁止输出任何其他文字或代码围栏）：',
      '  {"tool": "工具名", "args": { ...参数... }}',
      '- 工具执行结果会以 TOOL_RESULT 开头的消息返回给你，收到后基于结果继续回复用户；',
      '  若还需调用其他工具，继续按上述 JSON 格式输出。',
      '- 不需要调用工具时，直接输出给用户的中文回复正文，禁止输出 JSON。',
      '',
      '重要规则：',
      '- **如实描述工具结果**：只有 create_form 返回 ok=true 后才能说“已创建”；',
      '  generate_form_schema 只生成了结构，**不是**创建完成，禁止说“已创建/已保存”。',
      '- create_form 成功后：说明表单已创建为**草稿（未发布）**，附内联链接',
      '  [在设计器中打开](/form/designer?id=<formId>)，提示可在设计器中调整并发布；',
      '  业务表单发布后即可在业务表单数据页面录入数据。',
      '- **表单与流程的关系**：业务表单（BUSINESS）没有审批流程；只有工作流表单（WORKFLOW）',
      '  才可配置审批流程。创建业务表单后**禁止**提及“进入相关流程/提交审批/发起审批”；',
      '  应引导用户在设计器调整发布后录入数据。',
      '- 你**无法替用户打开页面**，只能提供可点击的入口。**禁止**说“已为你打开/已跳转/已进入某页面”。',
      '  应使用“可点击下方入口前往 X”这类措辞。',
      '- 当回答涉及平台页面时，**优先在正文中内联 Markdown 链接**，格式 `[页面名](/路径)`',
      '  （路径必须取自下方「用户可访问页面」列表，例如 `[用户管理](/system/user)`），',
      '  让用户可直接在文字中点击跳转；可在多处内联。',
      '- 当用户询问“怎么做某事 / 在哪里配置 / 如何管理”等答案位于某个页面的问题时，',
      '  除内联链接外也可调用 open_page 补充入口。',
      '- 用户要求生成表单时，必须调用 create_form 或 generate_form_schema 工具，不要凭空编造表单结构。',
      '- 工具执行后，用简洁的中文说明结果或操作步骤。',
      '- 与平台操作无关的问题，礼貌说明你只能协助平台内的操作。',
      '- 始终使用中文，回复简洁；列表用 `-`，不要输出多余空行。',
    ].join('\n')
  }

  /**
   * 执行一轮对话（含工具循环），产出 SSE 事件帧序列。
   *
   * @param history     历史消息（不含本轮 user 消息）
   * @param userMessage 本轮用户输入
   * @param pages       当前用户可访问页面（open_page 白名单与系统提示）
   * @returns SSE 文本（meta → (tool_call → tool_result)* → message → done/error）
   */
  async chatSse(
    history: { role: string; content: string }[],
    userMessage: string,
    pages: PageRef[],
  ): Promise<string> {
    const frames: string[] = []
    frames.push(sse('meta', { model: this.llm.getModel() }))

    const context: AiToolContext = { pages: pages ?? [] }
    const messages: LlmMessage[] = []
    messages.push({ role: 'assistant', content: this.buildSystemPrompt(pages) })
    for (const turn of history ?? []) {
      if (!turn?.content) continue
      if (turn.role === 'user') messages.push({ role: 'user', content: turn.content })
      else if (turn.role === 'assistant') messages.push({ role: 'assistant', content: turn.content })
    }
    messages.push({ role: 'user', content: userMessage })

    const navigations = new Map<string, PageRef>()

    try {
      for (let step = 0; step < AiAgentService.MAX_STEPS; step++) {
        const reply = await this.llm.complete(messages)

        const toolCall = parseToolCall(reply)
        if (!toolCall) {
          const text = reply.trim() || '（没有更多内容）'
          // 兜底：模型未主动提供入口时，按回复中出现的页面名补全入口
          if (navigations.size === 0) {
            for (const page of matchPages(text, pages)) {
              navigations.set(page.path, page)
            }
          }
          frames.push(sse('message', { text, navigations: [...navigations.values()] }))
          frames.push(sse('done', {}))
          return frames.join('')
        }

        // 工具调用：广播 → 执行 → 结果回灌 → 下一轮
        frames.push(sse('tool_call', { name: toolCall.tool, args: toolCall.args }))
        const resultJson = await this.toolRegistry.execute(toolCall.tool, toolCall.args, context)
        let resultForEvent: unknown = resultJson
        try {
          resultForEvent = JSON.parse(resultJson)
        } catch {
          // 保留原始文本
        }
        frames.push(sse('tool_result', { name: toolCall.tool, result: resultForEvent }))
        collectNavigation(toolCall.tool, resultForEvent, navigations)

        messages.push({ role: 'assistant', content: reply })
        messages.push({
          role: 'user',
          content: `TOOL_RESULT: ${resultJson}\n请基于以上工具结果继续回复用户；若还需调用工具，按约定只输出工具 JSON。`,
        })
      }

      frames.push(
        sse('message', {
          text: '抱歉，处理步骤过多，请把需求拆分为更小的请求后再试。',
          navigations: [...navigations.values()],
        }),
      )
      frames.push(sse('done', {}))
      return frames.join('')
    } catch (e) {
      const code = e instanceof AiError ? e.code : 'STREAM_ERROR'
      const msg = (e instanceof Error ? e.message : String(e)) || '对话失败'
      this.logger.warn(`[${AiAgentService.MODULE}] 对话失败: ${msg}`)
      frames.push(sse('error', { code, msg }))
      return frames.join('')
    }
  }

  /** 组装系统提示：固定约束 + 工具清单 + 当前用户可访问页面列表。 */
  private buildSystemPrompt(pages: PageRef[]): string {
    let prompt = `${this.basePrompt}\n\n可用工具（名称 → 参数）：\n`
    for (const t of this.toolRegistry.specs()) {
      prompt += `- ${t.name}：${t.description}\n`
    }
    if (pages && pages.length > 0) {
      prompt += '\n用户可访问页面（open_page 的 path 必须取自此处）：\n'
      for (const page of pages) {
        prompt += `- ${page.label} : ${page.path}\n`
      }
    }
    return prompt
  }
}

/** 解析后的工具调用。 */
interface ParsedToolCall {
  tool: string
  args: Record<string, unknown>
}

/**
 * 解析模型响应中的工具调用 JSON。
 *
 * 兼容：裸 JSON、markdown 代码围栏、前后杂散空白。
 * 仅当响应整体是一个含 `tool` 字符串字段的对象时认定为工具调用。
 */
export function parseToolCall(text: string): ParsedToolCall | null {
  if (!text) return null
  let s = text.trim()
  if (!s.startsWith('{')) return null
  s = s.replace(/^```(?:json)?/, '').replace(/```$/, '').trim()
  if (!s.startsWith('{')) return null
  try {
    const obj = JSON.parse(s) as { tool?: unknown; args?: unknown }
    if (typeof obj?.['tool'] !== 'string' || !obj['tool']) return null
    const args = (obj['args'] ?? {}) as Record<string, unknown>
    return { tool: obj['tool'] as string, args: args && typeof args === 'object' ? args : {} }
  } catch {
    return null
  }
}

/** open_page 成功结果 → 记录页面入口（对齐 Java `collectNavigation`）。 */
function collectNavigation(toolName: string, result: unknown, navigations: Map<string, PageRef>): void {
  if (toolName !== OpenPageTool.NAME || result == null || typeof result !== 'object') {
    return
  }
  const r = result as Record<string, unknown>
  const path = String(r['path'] ?? '')
  if (!path) {
    return
  }
  const label = String(r['label'] ?? path)
  navigations.set(path, { path, label })
}

/** 单条回复最多附带的页面入口数（对齐 Java MAX_NAVIGATIONS）。 */
const MAX_NAVIGATIONS = 3

/** 兜底：按白名单页面名在回复文本中的出现顺序匹配入口（最多 MAX_NAVIGATIONS 个）。 */
function matchPages(text: string, pages: PageRef[]): PageRef[] {
  const matched: PageRef[] = []
  if (!text || !pages || pages.length === 0) {
    return matched
  }
  for (const page of pages) {
    if (page.label && page.label.trim() && text.includes(page.label)) {
      matched.push(page)
      if (matched.length >= MAX_NAVIGATIONS) {
        break
      }
    }
  }
  return matched
}

/** 构造一条 SSE 事件帧（对齐 Java `AiChatController.sse`）。 */
function sse(event: string, data: unknown): string {
  let json: string
  try {
    json = JSON.stringify(data)
  } catch {
    json = '{}'
  }
  return `event:${event}\ndata:${json}\n\n`
}
