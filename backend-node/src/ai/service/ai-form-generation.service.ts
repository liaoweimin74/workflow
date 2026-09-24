import { Injectable, Logger } from '@nestjs/common'
import { AiError } from './ai-error'
import { buildFormSchemaMessages } from './form-schema-prompt-builder'
import { AiFormGenerateResult, FormSchemaValidator } from './form-schema-validator'
import { ZaiLlmService } from './zai-llm.service'

/**
 * AI 表单生成服务（对齐 Java `AiFormGenerationService`）。
 *
 * 编排：prompt 组装 → LLM 调用（平台内置模型）→ 校验清洗 → 结果。
 * 结果不落库：schema 交由前端在设计器内应用（aiActionBus 回填画布）。
 */
@Injectable()
export class AiFormGenerationService {
  static readonly MODULE = 'form-gen'

  private readonly logger = new Logger(AiFormGenerationService.name)

  constructor(
    private readonly llm: ZaiLlmService,
    private readonly validator: FormSchemaValidator,
  ) {}

  /** 同步生成：返回清洗后的 schema（JSON 字符串）与字段清单、修正项。 */
  async generateSync(description: string): Promise<AiFormGenerateResult> {
    const raw = await this.llm.complete(buildFormSchemaMessages(description))
    const result = this.validator.validate(raw)
    this.logger.log(
      `[${AiFormGenerationService.MODULE}] 生成成功：${result.fields.length} 字段，warnings=${result.warnings.length}`,
    )
    return result
  }
}

// AiError 重导出便于同层引用
export { AiError }
