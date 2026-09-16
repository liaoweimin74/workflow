/**
 * errors.ts — 异常体系，与 Java 端 GlobalExceptionHandler 精确对齐：
 *
 * | Java 异常                      | HTTP | body                        |
 * |--------------------------------|------|-----------------------------|
 * | BusinessException              | 200  | R.fail(code 默认 500, msg)   |
 * | MethodArgumentNotValidException| 200  | R.fail(400, 字段消息)        |
 * | TenantNotSetException          | 400  | R.fail(400, msg)            |
 * | FlowableException              | 400  | R.fail(400, "流程引擎错误: "+msg) |
 * | IllegalArgumentException       | 400  | R.fail(400, msg)            |
 * | 其他 Exception                 | 500  | R.fail(500, msg||类名)       |
 * | 未认证（过滤器层）              | 401  | R.unauthorized("未登录或Token已过期") |
 */

export class BusinessException extends Error {
  readonly code: number;
  /** HTTP 状态（Java 无 @ResponseStatus → 200） */
  readonly httpStatus = 200;
  constructor(message: string, code = 500) {
    super(message);
    this.name = 'BusinessException';
    this.code = code;
  }
}

export class IllegalArgumentError extends Error {
  readonly code = 400;
  readonly httpStatus = 400;
  constructor(message: string) {
    super(message);
    this.name = 'IllegalArgumentException';
  }
}

export class TenantNotSetError extends Error {
  readonly code = 400;
  readonly httpStatus = 400;
  constructor(message = '租户上下文未设置') {
    super(message);
    this.name = 'TenantNotSetException';
  }
}

/** 引擎语义错误 → 400 + 前缀（Java FlowableException 分支） */
export class EngineError extends Error {
  readonly code = 400;
  readonly httpStatus = 400;
  readonly prefix = '流程引擎错误: ';
  constructor(message: string) {
    super(message);
    this.name = 'FlowableException';
  }
}

/** R 信封（对齐 com.workflow.common.domain.R） */
export interface RShape<T = unknown> {
  code: number;
  msg: string;
  data: T | null;
}

export const R = {
  ok<T>(data: T | null = null): RShape<T> {
    return { code: 200, msg: 'success', data };
  },
  fail(code: number, msg: string): RShape<never> {
    return { code, msg, data: null };
  },
  unauthorized(msg = '未登录或Token已过期'): RShape<never> {
    return { code: 401, msg, data: null };
  },
};
