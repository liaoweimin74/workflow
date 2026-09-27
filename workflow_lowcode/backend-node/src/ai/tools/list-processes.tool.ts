import { Injectable, Logger } from '@nestjs/common'
import { AiTool, AiToolContext } from './ai-tool'
import { ProcessDesignService } from '../../engine/process/process-design.service'

/**
 * 工具：查询现有流程草稿清单（只读，不落库）。
 *
 * 为 update_process 提供「先看后改」的定位能力；已部署流程版本
 * 不在草稿列表（提示用户到流程定义页面查看）。
 */
@Injectable()
export class ListProcessesTool implements AiTool {
  static readonly NAME = 'list_processes'

  private readonly logger = new Logger(ListProcessesTool.name)

  name = ListProcessesTool.NAME

  description =
    '查询系统里现有的审批流程（草稿）列表（只读）。当用户问「有哪些流程」「找一下某个流程」，' +
    '或在修改流程前需要确认流程名称、查看部署状态时调用。参数：keyword=名称关键字（可选）。'

  parametersSchema: Record<string, unknown> = {
    type: 'object',
    properties: {
      keyword: { type: 'string', description: '流程名称/标识关键字（可选）' },
    },
    required: [],
  }

  constructor(private readonly processDesignService: ProcessDesignService) {}

  async execute(args: Record<string, unknown>, _context: AiToolContext): Promise<string> {
    const keyword = String(args?.['keyword'] ?? '').trim()

    try {
      const res = await this.processDesignService.listDrafts(1, 20)
      const rows = res.content
        .filter((d) => keyword === '' || d.name.includes(keyword) || d.key.includes(keyword))
        .map((d) => ({
          draftId: d.id,
          name: d.name,
          key: d.key,
          status: d.status,
          version: d.version,
          deployed: d.status === 'DEPLOYED',
          updatedAt: d.updatedAt ?? null,
        }))
      return JSON.stringify({
        ok: true,
        total: res.totalElements,
        showing: rows.length,
        processes: rows,
        hint:
          '向用户展示流程清单（名称/状态）。已部署的流程（DEPLOYED）修改草稿后需重新部署生效；' +
          '若用户要修改某个流程，用其精确 name 调用 update_process；' +
          '已部署流程的版本管理可在 [流程定义](/process/definition) 页面查看。',
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      this.logger.warn(`[list_processes] 查询失败: ${msg}`)
      return JSON.stringify({ error: `流程查询失败：${msg}` })
    }
  }
}
