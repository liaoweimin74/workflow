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
   *
   * 加固：
   *   - 显式 max_tokens，避免平台默认输出上限过低导致长 JSON 被截断；
   *   - finish_reason=length（截断）与空输出视为失败，并**重建 SDK 客户端**
   *     （服务进程内复用 client 时偶发返回不完整内容，重建连接可自愈）。
   *
   * @throws AiError(MODEL_ERROR) 调用失败、输出为空或被截断
   */
  async complete(messages: LlmMessage[]): Promise<string> {
    const client = await this.getClient()
    try {
      const completion = await client.chat.completions.create({
        messages: messages as never,
        thinking: { type: 'disabled' },
        max_tokens: 2048,
      } as never)
      const model = (completion as { model?: string }).model
      if (model && this.model === FALLBACK_MODEL) {
        this.model = model
      }
      const choice = completion.choices[0]
      const finish = (choice as { finish_reason?: string } | undefined)?.finish_reason
      const content = choice?.message?.content
      if (!content || !content.trim()) {
        this.logger.warn(`LLM 输出为空（finish=${finish ?? 'n/a'}），已重建客户端连接`)
        this.clientPromise = null
        throw new AiError('MODEL_ERROR', '模型返回为空')
      }
      if (finish === 'length') {
        this.logger.warn(`LLM 输出被截断（finish=length, len=${content.length}），已重建客户端连接`)
        this.clientPromise = null
        throw new AiError('MODEL_ERROR', '模型输出被截断')
      }
      return content
    } catch (e) {
      if (e instanceof AiError) {
        throw e
      }
      const msg = e instanceof Error ? e.message : String(e)
      this.logger.warn(`LLM 调用失败: ${msg}`)
      this.clientPromise = null
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
