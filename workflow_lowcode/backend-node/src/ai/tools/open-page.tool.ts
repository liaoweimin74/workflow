import { Injectable } from '@nestjs/common'
import { AiTool, AiToolContext } from './ai-tool'

/**
 * 工具：在回复中提供可点击的页面入口（对齐 Java `OpenPageTool`）。
 *
 * 安全：仅接受当前用户可访问页面白名单中的路径，不接受任意 URL，
 * 避免提示注入诱导跳转。
 */
@Injectable()
export class OpenPageTool implements AiTool {
  static readonly NAME = 'open_page'

  name = OpenPageTool.NAME

  description =
    '在回复中提供一个可点击的页面入口，引导用户直接跳转到平台内某页面。' +
    '仅当用户需要前往某页面（如配置、查看、管理）时调用；' +
    'path 必须是系统提示中列出的「用户可访问页面」之一的路径。'

  parametersSchema: Record<string, unknown> = {
    type: 'object',
    properties: {
      path: { type: 'string', description: '目标页面的路由路径，必须来自系统提示中列出的可用页面' },
    },
    required: ['path'],
  }

  execute(args: Record<string, unknown>, context: AiToolContext): string {
    const requested = String(args?.['path'] ?? '').trim()
    if (!requested) {
      return JSON.stringify({ error: '缺少 path 参数' })
    }
    const pages = context?.pages ?? []
    const page = pages.find((p) => p.path === requested)
    if (!page) {
      return JSON.stringify({ error: '未找到该页面' })
    }
    return JSON.stringify({ path: page.path, label: page.label })
  }
}
