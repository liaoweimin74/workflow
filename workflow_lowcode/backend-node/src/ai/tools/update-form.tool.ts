import { Injectable, Logger } from '@nestjs/common'
import { AiTool, AiToolContext } from './ai-tool'
import { AiFormGenerationService } from '../service/ai-form-generation.service'
import { FormDefinitionService } from '../../engine/form/service/form-definition.service'
import { FormDefinitionWriteService } from '../../engine/form/form-definition-write.service'
import { extractFromSchema } from '../../engine/form/column/form-schema-column-extractor'
import { candidatesPayload, locateFormByName } from './locate'

/**
 * 工具：按名称/ID 定位已有表单，应用自然语言修改指令（真实落库）。
 *
 * 编排链：
 *   1. 定位：formId 优先；formName 走 list 匹配（精确 → 唯一模糊；多命中返回候选）
 *   2. 读现有 schema → AiFormGenerationService.reviseSync（修改模式 prompt：未提及字段原样保留）
 *   3. 字段级 diff（新增/删除/修改清单）
 *   4. writeService.update 落库（null=不改 patch 语义；BUSINESS 重提取 column_config）
 *
 * 与 create_form 一致：修改落在草稿层，发布仍走既有校验链（BUSINESS 发布建表）。
 * PUBLISHED 表单为原地更新（平台 update 语义），返回 warning 提醒重新发布。
 */
@Injectable()
export class UpdateFormTool implements AiTool {
  static readonly NAME = 'update_form'

  private readonly logger = new Logger(UpdateFormTool.name)

  name = UpdateFormTool.NAME

  description =
    '修改一个**已存在**的表单（真实保存修改）。当用户想修改、调整、增加/删除字段、重命名表单时调用。' +
    '参数：changeRequest=修改要求（必填，如「把请假类型加上出差选项」「增加一个附件字段」「删除热力度」）；' +
    'formName=表单名称（与 formId 二选一，建议先用 list_forms 确认名称）；formId=表单 ID（可选）；' +
    'newName=重命名的表单名称（可选）。'

  parametersSchema: Record<string, unknown> = {
    type: 'object',
    properties: {
      changeRequest: {
        type: 'string',
        description:
          '修改要求描述，例如：把「请假类型」的选项加上「调休」；新增「附件上传」字段；删除「紧急程度」字段；所有字段必填',
      },
      formName: {
        type: 'string',
        description: '要修改的表单名称（精确名称，可用 list_forms 先查询）',
      },
      formId: {
        type: 'string',
        description: '表单 ID（已知时优先使用，比名称更精确）',
      },
      newName: {
        type: 'string',
        description: '新的表单名称（仅在用户要求重命名时提供）',
      },
    },
    required: ['changeRequest'],
  }

  constructor(
    private readonly generation: AiFormGenerationService,
    private readonly formService: FormDefinitionService,
    private readonly writeService: FormDefinitionWriteService,
  ) {}

  async execute(args: Record<string, unknown>, _context: AiToolContext): Promise<string> {
    const changeRequest = String(args?.['changeRequest'] ?? '').trim()
    const formName = String(args?.['formName'] ?? '').trim()
    const formId = String(args?.['formId'] ?? '').trim()
    const newName = String(args?.['newName'] ?? '').trim()

    if (!changeRequest) {
      return JSON.stringify({ error: '缺少 changeRequest 参数（修改要求描述）' })
    }
    if (!formName && !formId) {
      return JSON.stringify({
        error: '缺少目标表单：请提供 formName（可先调用 list_forms 查询）或 formId',
      })
    }

    try {
      // 1. 定位表单
      let target: { id: string; name: string }
      if (formId !== '') {
        try {
          const detail = await this.formService.getById(formId)
          target = { id: String(detail.id), name: detail.name }
        } catch {
          return JSON.stringify({ error: `未找到 ID 为 ${formId} 的表单` })
        }
      } else {
        const located = await locateFormByName(this.formService, formName)
        if (located.status === 'none') {
          return JSON.stringify({
            error: `未找到名称包含「${formName}」的表单，可先调用 list_forms 查询现有表单`,
          })
        }
        if (located.status === 'multiple') {
          return candidatesPayload('表单', located.candidates)
        }
        target = { id: String(located.target.id), name: located.target.name }
      }

      // 2. 读现有 schema（空表单按空 rule 处理）
      const detail = await this.formService.getById(target.id)
      const currentSchema = detail.schema && detail.schema.trim() !== '' ? detail.schema : '{"rule":[]}'

      // 3. LLM 修改（修改模式 prompt + 校验清洗）
      const revised = await this.generation.reviseSync(currentSchema, changeRequest)

      // 5. diff 摘要
      const changes = diffFormSchema(currentSchema, revised.schema)

      const totalChanges = changes.added.length + changes.removed.length + changes.modified.length
      if (totalChanges === 0) {
        // 无变更必须显式失败，防止 LLM 向用户幻报「修改成功」
        this.logger.log(`[update_form] 未产生变更: id=${target.id}`)
        return JSON.stringify({
          ok: false,
          noChanges: true,
          error:
            '修改未产生任何字段变更：AI 生成的表单结构与当前一致。请检查修改要求是否已经满足，' +
            '或换更具体的描述（指明字段名与期望）重试',
          formId: target.id,
          formKey: detail.key,
          name: newName !== '' ? newName : target.name,
          status: detail.status,
        })
      }

      // 6. 落库（patch 语义：仅 schema 与可选 newName；key/processKey 不动）
      // update(id, name, key, schema, columnConfig, processKey) —— null=不改
      const columnConfig = detail.type === 'BUSINESS' ? JSON.stringify(extractFromSchema(revised.schema)) : null
      await this.writeService.update(target.id, newName !== '' ? newName : null, null, revised.schema, columnConfig, null)

      const warnings = [...revised.warnings]
      if (detail.status === 'PUBLISHED') {
        warnings.push('该表单已发布，本次为原地修改；需到设计器重新「发布」才会生效到线上，且可能影响已关联流程与存量数据')
      }

      this.logger.log(
        `[update_form] 已修改表单: id=${target.id} name=${newName || target.name} +${changes.added.length} -${changes.removed.length} ~${changes.modified.length}`,
      )

      return JSON.stringify({
        ok: true,
        formId: target.id,
        formKey: detail.key,
        name: newName !== '' ? newName : target.name,
        type: detail.type,
        status: detail.status,
        fieldCount: revised.fields.length,
        changes,
        warnings,
        designerUrl: `/form/designer?id=${target.id}`,
        hint:
          '表单修改已保存。' +
          (detail.status === 'PUBLISHED'
            ? '表单处于已发布状态，修改需在设计器中重新发布后生效。'
            : '表单为草稿状态，可在设计器中进一步调整并发布。'),
      })
    } catch (e) {
      const msg = (e instanceof Error ? e.message : String(e)) || '表单修改失败'
      this.logger.warn(`[update_form] 修改失败: ${msg}`)
      return JSON.stringify({ error: `表单修改失败：${msg}` })
    }
  }
}

/** 单字段的 diff 摘要（可序列化子集）。 */
interface FieldSnapshot {
  title: string
  type: string
  required: boolean
  options: string
}

/** 对比新旧 schema，产出字段级变更清单（供 AI 向用户如实描述）。 */
export function diffFormSchema(oldSchema: string, newSchema: string): {
  added: { field: string; title: string; type: string }[]
  removed: { field: string; title: string }[]
  modified: { field: string; changes: string[] }[]
} {
  const oldMap = extractFieldMap(oldSchema)
  const newMap = extractFieldMap(newSchema)
  const added: { field: string; title: string; type: string }[] = []
  const removed: { field: string; title: string }[] = []
  const modified: { field: string; changes: string[] }[] = []

  for (const [field, snap] of newMap) {
    if (!oldMap.has(field)) {
      added.push({ field, title: snap.title, type: snap.type })
      continue
    }
    const prev = oldMap.get(field)!
    const changeList: string[] = []
    if (prev.title !== snap.title) changeList.push(`标题 ${prev.title}→${snap.title}`)
    if (prev.type !== snap.type) changeList.push(`组件 ${prev.type}→${snap.type}`)
    if (prev.required !== snap.required) changeList.push(`必填 ${prev.required ? '是' : '否'}→${snap.required ? '是' : '否'}`)
    if (prev.options !== snap.options) changeList.push('选项已变更')
    if (changeList.length > 0) modified.push({ field, changes: changeList })
  }
  for (const [field, snap] of oldMap) {
    if (!newMap.has(field)) {
      removed.push({ field, title: snap.title })
    }
  }
  return { added, removed, modified }
}

/** 解析 schema（{"rule":[...]} 或裸数组）为 field → 快照 Map；解析失败返回空 Map。 */
function extractFieldMap(schema: string): Map<string, FieldSnapshot> {
  const map = new Map<string, FieldSnapshot>()
  let rule: unknown[] = []
  try {
    const parsed = JSON.parse(schema) as unknown
    if (Array.isArray(parsed)) {
      rule = parsed
    } else if (parsed && typeof parsed === 'object' && Array.isArray((parsed as Record<string, unknown>)['rule'])) {
      rule = (parsed as Record<string, unknown>)['rule'] as unknown[]
    }
  } catch {
    return map
  }
  for (const item of rule) {
    if (item === null || typeof item !== 'object') continue
    const f = item as Record<string, unknown>
    const field = typeof f['field'] === 'string' ? f['field'] : ''
    if (field === '') continue
    const validate = Array.isArray(f['validate']) ? (f['validate'] as Record<string, unknown>[]) : []
    map.set(field, {
      title: typeof f['title'] === 'string' ? f['title'] : field,
      type: typeof f['type'] === 'string' ? f['type'] : '',
      required: validate.some((v) => v && typeof v === 'object' && v['required'] === true),
      options: Array.isArray(f['options']) ? JSON.stringify(f['options']) : '',
    })
  }
  return map
}
