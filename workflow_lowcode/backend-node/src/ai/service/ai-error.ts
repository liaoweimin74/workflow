/**
 * AI 统一错误（对齐 Java `AiException`，HTTP 语义由 controller 落到 SSE error 事件）。
 */
export type AiErrorCode = 'CONFIG_MISSING' | 'EMPTY_RESPONSE' | 'MODEL_ERROR' | 'STREAM_ERROR' | 'MAX_STEPS'

export class AiError extends Error {
  constructor(
    readonly code: AiErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'AiError'
  }
}
