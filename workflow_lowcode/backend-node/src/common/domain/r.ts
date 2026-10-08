/**
 * 统一响应封装，逐字对齐 Java 侧 com.workflow.common.domain.R。
 *
 * 字段名与取值必须保持一致：前端与后端契约依赖 {code, msg, data} 三个字段，
 * 且成功时的 code 固定为 200、msg 固定为 'success'。
 */
export class R<T> {
  code: number
  msg: string
  data: T | null

  constructor(code: number, msg: string, data: T | null) {
    this.code = code
    this.msg = msg
    this.data = data
  }

  static ok(): R<null>
  static ok<T>(data: T): R<T>
  static ok<T>(data?: T): R<T | null> {
    return new R<T | null>(200, 'success', data ?? null)
  }

  static fail(code: number, msg: string): R<null> {
    return new R<null>(code, msg, null)
  }

  static forbidden(msg: string): R<null> {
    return new R<null>(403, msg, null)
  }

  static unauthorized(msg: string): R<null> {
    return new R<null>(401, msg, null)
  }
}

/**
 * 单参 fail，code 取 500 —— 对齐 Java 侧 R.fail(String)。
 *
 * TypeScript 的静态方法无法像 Java 那样按参数个数重载同名方法并保持调用点一致，
 * 因此把单参形式拆成独立函数。语义与 Java 完全一致。
 */
export function fail(msg: string): R<null> {
  return R.fail(500, msg)
}
