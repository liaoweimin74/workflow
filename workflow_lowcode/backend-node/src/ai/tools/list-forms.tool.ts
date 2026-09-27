import { Injectable, Logger } from '@nestjs/common'
import { AiTool, AiToolContext } from './ai-tool'
import { FormDefinitionService } from '../../engine/form/service/form-definition.service'

/**
 * 工具：查询现有表单清单（只读，不落库）。
 *
 * 为修改/删除类操作提供「先看后改」的定位能力：AI 在修改表单前
 * 可用它确认目标名称、ID 与状态，避免误改。
 */
@Injectable()
export class ListFormsTool implements AiTool {
  static readonly NAME = 'list_forms'

  private readonly logger = new Logger(ListFormsTool.name)

  name = ListFormsTool.NAME

  description =
    '查询系统里现有的表单列表（只读）。当用户问「有哪些表单」「找一下某个表单」，' +
    '或在修改/创建前需要确认表单是否已存在、查看表单状态时调用。' +
    '参数：keyword=名称关键字（可选）；type=表单类型 BUSINESS/WORKFLOW（可选）；' +
    'status=状态 DRAFT/PUBLISHED/ARCHIVED（可选）。'

  parametersSchema: Record<string, unknown> = {
    type: 'object',
    properties: {
      keyword: { type: 'string', description: '表单名称/标识关键字（可选）' },
      type: { type: 'string', description: '表单类型过滤：BUSINESS 或 WORKFLOW（可选）' },
      status: { type: 'string', description: '状态过滤：DRAFT/PUBLISHED/ARCHIVED（可选，默认查全部）' },
    },
    required: [],
  }

  constructor(private readonly formService: FormDefinitionService) {}

  async execute(args: Record<string, unknown>, _context: AiToolContext): Promise<string> {
    const keyword = String(args?.['keyword'] ?? '').trim()
    const rawType = String(args?.['type'] ?? '').trim().toUpperCase()
    const rawStatus = String(args?.['status'] ?? '').trim().toUpperCase()

    const type = rawType === 'BUSINESS' || rawType === 'WORKFLOW' ? rawType : null
    const status = ['DRAFT', 'PUBLISHED', 'ARCHIVED'].includes(rawStatus) ? rawStatus : null

    try {
      const res = await this.formService.list(1, 20, status, keyword || null, type)
      return JSON.stringify({
        ok: true,
        total: res.totalElements,
        showing: res.content.length,
        forms: res.content.map((f) => ({
          id: f.id,
          name: f.name,
          key: f.key,
          type: f.type,
          status: f.status,
          version: f.version,
          updatedAt: f.updatedAt ?? null,
        })),
        hint:
          '向用户展示表单清单（名称/类型/状态）。若用户要修改某个表单，用其精确 name 调用 update_form；' +
          '列表最多展示 20 条，用户要找的表单不在列表时可让用户缩小关键字。',
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      this.logger.warn(`[list_forms] 查询失败: ${msg}`)
      return JSON.stringify({ error: `表单查询失败：${msg}` })
    }
  }
}
