/**
 * AI 工具抽象（对齐 Java `com.workflow.ai.tool.AiTool`）。
 *
 * 工具以「声明（发给模型）+ 执行（服务端分派）」双面形态存在。
 * 平台内置 LLM（z-ai-web-dev-sdk / GLM）无原生 function calling，
 * 工具调用经由 agent 的文本协议模拟（见 ai-agent.service.ts）。
 */

/** 页面引用（导航白名单项，对齐 Java `PageRef`）。 */
export interface PageRef {
  path: string
  label: string
}

/** 工具执行上下文。 */
export interface AiToolContext {
  /** 当前用户可访问页面（open_page 白名单）。 */
  pages: PageRef[]
}

/** AI 工具接口。 */
export interface AiTool {
  /** 工具名（模型侧标识）。 */
  name: string
  /** 工具描述（模型侧理解用途）。 */
  description: string
  /** 参数 JSON Schema。 */
  parametersSchema: Record<string, unknown>
  /**
   * 执行工具（支持异步实现，如表单生成需等待 LLM）。
   * @returns JSON 字符串结果；未知参数、执行异常一律返回 `{"error": ...}` 而不抛出。
   */
  execute(args: Record<string, unknown>, context: AiToolContext): string | Promise<string>
}

/** 工具注册表：汇总声明与执行分派（对齐 Java `AiToolRegistry`）。 */
export class AiToolRegistry {
  private readonly tools = new Map<string, AiTool>()

  constructor(tools: AiTool[]) {
    for (const tool of tools) {
      this.tools.set(tool.name, tool)
    }
  }

  /** 工具声明列表（拼入系统提示）。 */
  specs(): AiTool[] {
    return [...this.tools.values()]
  }

  has(name: string): boolean {
    return this.tools.has(name)
  }

  /** 执行工具；未知工具或执行异常返回错误 JSON，不抛出。 */
  async execute(name: string, args: Record<string, unknown>, context: AiToolContext): Promise<string> {
    const tool = this.tools.get(name)
    if (!tool) {
      return JSON.stringify({ error: `未知工具: ${escape(name)}` })
    }
    try {
      return await tool.execute(args ?? {}, context)
    } catch (e) {
      return JSON.stringify({ error: escape(e instanceof Error ? e.message : String(e)) })
    }
  }
}

function escape(s: string): string {
  return s == null ? '' : s.replace(/"/g, '\\"')
}
