import { Injectable } from '@nestjs/common'
import { AiTool, AiToolContext } from './ai-tool'
import { AiFormGenerationService } from '../service/ai-form-generation.service'

/**
 * 工具：根据自然语言描述生成低代码表单 schema（对齐 Java `GenerateFormSchemaTool`）。
 *
 * 底层复用 AiFormGenerationService（prompt 工程 + 校验清洗）。
 */
@Injectable()
export class GenerateFormSchemaTool implements AiTool {
  static readonly NAME = 'generate_form_schema'

  name = GenerateFormSchemaTool.NAME

  description =
    '根据自然语言描述生成低代码表单结构（form-create rule JSON）。' +
    '当用户想要新建、生成或创建一个表单时调用；参数 description 为该表单的中文需求描述。'

  parametersSchema: Record<string, unknown> = {
    type: 'object',
    properties: {
      description: {
        type: 'string',
        description: '表单的自然语言描述，例如：员工请假单，包含姓名、部门、请假类型、起止日期、请假原因',
      },
    },
    required: ['description'],
  }

  constructor(private readonly service: AiFormGenerationService) {}

  async execute(args: Record<string, unknown>, _context: AiToolContext): Promise<string> {
    const description = String(args?.['description'] ?? '')
    if (!description.trim()) {
      return JSON.stringify({ error: '缺少 description 参数' })
    }
    const result = await this.service.generateSync(description)
    return JSON.stringify(result)
  }
}
