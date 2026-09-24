import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common'
import type { Response } from 'express'
import { R } from '../../common/domain/r'
import { BusinessException } from '../../common/exception/business-exception'
import { EngineException } from '../../common/exception/engine-exception'
import { ValidationError } from '../../common/exception/validation-error'
import { TenantNotSetException } from '../../common/exception/tenant-not-set.exception'
import { UnauthorizedException } from '../security/unauthorized.exception'

/**
 * 全局异常过滤器，逐字复刻 Java 侧 GlobalExceptionHandler 的映射矩阵。
 *
 * 最易错的三条：
 *  - BusinessException 与参数校验失败返回 **HTTP 200**，错误码放在 body 的 code 字段里；
 *  - EngineException（原 FlowableException）的消息必须带「流程引擎错误: 」前缀；
 *  - 未认证返回 HTTP 401 + 固定消息「未登录或Token已过期」。
 */
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name)

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp()
    const response = ctx.getResponse<Response>()

    const { httpStatus, body } = GlobalExceptionFilter.map(exception)
    if (httpStatus >= 500) {
      this.logger.error(
        `未预期的错误 url=${ctx.getRequest<{ url?: string }>().url ?? '-'}`,
        exception instanceof Error ? exception.stack : String(exception),
      )
    }
    response.status(httpStatus).json(body)
  }

  /** 纯函数映射，便于单测直接断言，不依赖 HTTP 上下文。 */
  static map(exception: unknown): { httpStatus: number; body: R<null> } {
    if (exception instanceof UnauthorizedException) {
      return { httpStatus: 401, body: R.unauthorized(exception.message) }
    }
    if (exception instanceof BusinessException) {
      return { httpStatus: 200, body: R.fail(exception.code, exception.message) }
    }
    if (exception instanceof TenantNotSetException) {
      return { httpStatus: 400, body: R.fail(400, exception.message) }
    }
    if (exception instanceof EngineException) {
      return { httpStatus: 400, body: R.fail(400, `流程引擎错误: ${exception.message}`) }
    }
    if (exception instanceof ValidationError) {
      return { httpStatus: 200, body: R.fail(400, exception.message) }
    }

    // 框架自身的 HttpException 必须保留其 HTTP 状态码。
    // 最关键的是 NotFoundException：未映射路径必须返回 404 ——
    //   1) 与 Java 后端（Spring 默认 404）的行为一致；
    //   2) 契约对比器靠 404 区分「Node 尚未实现该端点」与「响应不一致」，
    //      若被吞成 500，所有未实现端点都会被误报为契约破裂。
    if (exception instanceof HttpException) {
      const status = exception.getStatus()
      const response = exception.getResponse()
      const rawMessage =
        typeof response === 'string'
          ? response
          : ((response as { message?: string | string[] }).message ?? exception.message)
      const message = Array.isArray(rawMessage) ? rawMessage[0] : String(rawMessage)
      if (status === 401) return { httpStatus: 401, body: R.unauthorized(message) }
      if (status === 403) return { httpStatus: 403, body: R.forbidden(message) }
      return { httpStatus: status, body: R.fail(status, message) }
    }

    const err = exception instanceof Error ? exception : new Error(String(exception))
    // Java 侧 IllegalArgumentException / IllegalStateException 都映射 400。
    if (err.name === 'IllegalArgumentException' || err.name === 'IllegalStateException') {
      return { httpStatus: 400, body: R.fail(400, err.message) }
    }
    // Java 无权限 → HTTP 403 + 「没有权限访问」
    if (err.name === 'ForbiddenException') {
      return { httpStatus: 403, body: R.forbidden(err.message) }
    }
    const msg = err.message && err.message.length > 0 ? err.message : err.constructor.name
    return { httpStatus: 500, body: R.fail(500, msg) }
  }
}
