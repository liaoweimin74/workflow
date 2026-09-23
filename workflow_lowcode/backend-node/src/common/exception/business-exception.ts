/**
 * 业务异常，对齐 Java com.workflow.common.exception.BusinessException。
 *
 * 注意：映射到 HTTP 200 + body 内的 code，而不是 HTTP 错误状态码
 * （Java 侧的 @ExceptionHandler(BusinessException.class) 没有 @ResponseStatus）。
 */
export class BusinessException extends Error {
  readonly code: number

  constructor(code: number, message: string)
  constructor(message: string)
  constructor(codeOrMessage: number | string, message?: string) {
    if (typeof codeOrMessage === 'number') {
      super(message as string)
      this.code = codeOrMessage
    } else {
      super(codeOrMessage)
      this.code = 500
    }
    this.name = 'BusinessException'
  }
}
