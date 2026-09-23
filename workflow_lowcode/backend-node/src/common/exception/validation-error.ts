/**
 * 参数校验失败，对齐 Java MethodArgumentNotValidException 的处理结果：
 * HTTP 200 + body 内 code 400。
 *
 * message 取「第一个字段错误消息」，与 Java 侧 FieldError.getDefaultMessage() 行为一致。
 */
export class ValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ValidationError'
  }
}
