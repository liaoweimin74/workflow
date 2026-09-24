import { Injectable, Logger } from '@nestjs/common'
import { AiTool, AiToolContext } from './ai-tool'
import { AiFormGenerationService } from '../service/ai-form-generation.service'
import { FormDefinitionWriteService } from '../../engine/form/form-definition-write.service'
import { extractFromSchema } from '../../engine/form/column/form-schema-column-extractor'

/**
 * 工具：根据自然语言描述**真实创建**表单（落库为草稿）。
 *
 * 与 generate_form_schema 的区别：后者只生成结构 JSON（不落库，供设计器内
 * 预览/回填）；本工具走完整创建链 —— formgen 生成 schema → 写入
 * wf_form_def（DRAFT，含 BUSINESS 类型的 column_config）→ 返回表单 id/key
 * 与设计器入口。发布仍需用户在设计器中确认后手动触发（DDL 在 publish）。
 */
@Injectable()
export class CreateFormTool implements AiTool {
  static readonly NAME = 'create_form'

  private readonly logger = new Logger(CreateFormTool.name)

  name = CreateFormTool.NAME

  description =
    '真实创建一个表单（保存为草稿，可在设计器中调整并发布）。' +
    '当用户想要新建、创建一个表单时调用。参数：name=表单名称；' +
    'description=字段需求描述；formType=表单类型（BUSINESS=业务表单，纯数据填报、不关联审批流程；' +
    'WORKFLOW=工作流表单，用于挂接审批流程）。'

  parametersSchema: Record<string, unknown> = {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: '表单名称，例如：员工请假单',
      },
      description: {
        type: 'string',
        description: '表单的自然语言描述，例如：包含姓名、部门、请假类型、起止日期、请假原因',
      },
      formType: {
        type: 'string',
        description:
          '表单类型：BUSINESS=业务表单（纯数据填报，不关联审批流程）；WORKFLOW=工作流表单（可配置审批流程）。用户说“业务表单”时必须用 BUSINESS。',
      },
    },
    required: ['name', 'description', 'formType'],
  }

  constructor(
    private readonly generation: AiFormGenerationService,
    private readonly writeService: FormDefinitionWriteService,
  ) {}

  async execute(args: Record<string, unknown>, _context: AiToolContext): Promise<string> {
    const name = String(args?.['name'] ?? '').trim()
    const description = String(args?.['description'] ?? '').trim()
    const formType = normalizeFormType(args?.['formType'])
    if (!name) {
      return JSON.stringify({ error: '缺少 name 参数（表单名称）' })
    }
    if (!description) {
      return JSON.stringify({ error: '缺少 description 参数（字段需求描述）' })
    }

    // 1. formgen 管线生成 schema（prompt 工程 + 类型白名单 + 字段归一化）
    const generated = await this.generation.generateSync(description)

    // 2. 生成唯一 key（FORM_KEY_PATTERN：^[a-zA-Z][a-zA-Z0-9_]{0,63}$）
    const key = `ai_${Date.now().toString(36)}${Math.floor(Math.random() * 90 + 10)}`

    // 3. 落库：DRAFT 草稿（对齐 Java create(name,key,type,processKey)）
    const created = await this.writeService.create(name, key, formType, null)
    const formId = String(created['id'])

    // 4. 回填 schema；BUSINESS 额外生成 column_config（发布建表依赖它；
    //    WORKFLOW 表单列在设计器保存/发布时从 schema 提取，保持 null）
    const columnConfig = formType === 'BUSINESS' ? JSON.stringify(extractFromSchema(generated.schema)) : null
    await this.writeService.update(formId, null, null, generated.schema, columnConfig, null)

    this.logger.log(`[create_form] 已创建表单草稿: name=${name} key=${key} type=${formType} fields=${generated.fields.length}`)

    return JSON.stringify({
      ok: true,
      formId,
      formKey: key,
      name,
      type: formType,
      status: 'DRAFT',
      fieldCount: generated.fields.length,
      fields: generated.fields.map((f) => ({ label: f.title, key: f.field, type: f.componentType })),
      warnings: generated.warnings,
      designerUrl: `/form/designer?id=${formId}`,
      hint:
        formType === 'BUSINESS'
          ? '业务表单已创建为草稿（未发布），不关联审批流程；用户可在设计器中调整并发布，发布后可在业务表单数据页面录入数据。'
          : '工作流表单已创建为草稿（未发布），可在设计器中调整并发布，发布后可为其配置审批流程。',
    })
  }
}

/** 表单类型归一化：兼容中文/英文表述；缺省 BUSINESS（平台主场景）。 */
function normalizeFormType(raw: unknown): string {
  const v = String(raw ?? '').trim().toUpperCase()
  if (v === 'WORKFLOW' || v.includes('工作流') || v.includes('流程') || v.includes('审批')) {
    return 'WORKFLOW'
  }
  return 'BUSINESS'
}
