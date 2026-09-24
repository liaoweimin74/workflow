import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common'
import ZAI from 'z-ai-web-dev-sdk'
import { AiError } from './ai-error'

/**
 * 平台内置 LLM 封装（z-ai-web-dev-sdk / GLM）。
 *
 * 替代旧 Java 侧的 OpenAI 兼容外部配置（DeepSeek）：模型由平台内置提供，
 * 无需 apiKey / baseUrl 等外部配置，天然 `isConfigured() === true`。
 *
 * 角色映射：SDK 消息角色不含 'system'，skill 指引以 'assistant' 承载系统提示。
 */
export interface LlmMessage {
  role: 'assistant' | 'user'
  content: string
}

/** 平台内置模型展示名（首调用后以 SDK 实际返回校准）。 */
const FALLBACK_MODEL = 'glm-4-plus'

@Injectable()
export class ZaiLlmService implements OnModuleDestroy {
  private readonly logger = new Logger(ZaiLlmService.name)
  private clientPromise: Promise<ZAI> | null = null
  private model = FALLBACK_MODEL

  /** 当前模型名（meta 事件展示用）。 */
  getModel(): string {
    return this.model
  }

  /** 平台内置模型，永远视为已配置。 */
  isConfigured(): boolean {
    return true
  }

  /**
   * 单轮补全。
   * @throws AiError(MODEL_ERROR) 调用失败或输出为空
   */
  async complete(messages: LlmMessage[]): Promise<string> {
    const client = await this.getClient()
    try {
      const completion = await client.chat.completions.create({
        messages: messages as never,
        thinking: { type: 'disabled' },
      })
      const model = (completion as { model?: string }).model
      if (model && this.model === FALLBACK_MODEL) {
        this.model = model
      }
      const content = completion.choices[0]?.message?.content
      if (!content || !content.trim()) {
        throw new AiError('MODEL_ERROR', '模型返回为空')
      }
      return content
    } catch (e) {
      if (e instanceof AiError) {
        throw e
      }
      const msg = e instanceof Error ? e.message : String(e)
      this.logger.warn(`LLM 调用失败: ${msg}`)
      throw new AiError('MODEL_ERROR', '模型服务调用失败，请稍后重试')
    }
  }

  private getClient(): Promise<ZAI> {
    if (!this.clientPromise) {
      this.clientPromise = ZAI.create().catch((e) => {
        this.clientPromise = null
        throw e
      })
    }
    return this.clientPromise
  }

  onModuleDestroy(): void {
    this.clientPromise = null
  }
}
