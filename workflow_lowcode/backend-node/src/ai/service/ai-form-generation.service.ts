import { Injectable, Logger } from '@nestjs/common'
import { AiError } from './ai-error'
import { buildFormSchemaMessages, buildFormSchemaReviseMessages } from './form-schema-prompt-builder'
import { AiFormGenerateResult, FormSchemaValidator } from './form-schema-validator'
import { ZaiLlmService } from './zai-llm.service'

/**
 * AI 表单生成服务（对齐 Java `AiFormGenerationService`）。
 *
 * 编排：prompt 组装 → LLM 调用（平台内置模型）→ 校验清洗 → 结果。
 * 结果不落库：schema 交由前端在设计器内应用（aiActionBus 回填画布），
 * 或由 create_form / update_form 工具落库。
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

  /**
   * 同步修改：基于现有 schema 应用自然语言修改指令，输出完整新 schema。
   * 与 generateSync 共用校验清洗管线（类型白名单/字段归一/重名去重）。
   *
   * 修改场景对用户成本高（预期「已保存」），LLM 偶发输出跑飞/截断时
   * 自动重试一次，将偶发失败率降为平方级。
   */
  async reviseSync(currentSchema: string, changeRequest: string): Promise<AiFormGenerateResult> {
    const messages = buildFormSchemaReviseMessages(currentSchema, changeRequest)
    let lastError: unknown = null
    for (let attempt = 0; attempt < 2; attempt++) {
      let raw = ''
      try {
        raw = await this.llm.complete(messages)
        const result = this.validator.validate(raw)
        this.logger.log(
          `[${AiFormGenerationService.MODULE}] 修改成功（第 ${attempt + 1} 次尝试）：${result.fields.length} 字段，warnings=${result.warnings.length}`,
        )
        return result
      } catch (e) {
        lastError = e
        this.logger.warn(
          `[${AiFormGenerationService.MODULE}] 修改第 ${attempt + 1} 次尝试失败: ${e instanceof Error ? e.message : String(e)}（raw len=${String(raw ?? '').length}）`,
        )
        if (attempt === 0) {
          await new Promise((resolve) => setTimeout(resolve, 300))
        }
      }
    }
    throw lastError
  }
}

// AiError 重导出便于同层引用
export { AiError }
