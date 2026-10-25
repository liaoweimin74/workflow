import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common'
import { Observable } from 'rxjs'
import { parseClientIdHeader, runWithClient } from '../../framework/security/client-context'

/**
 * 客户端上下文拦截器：解析 `X-Client-Id` 请求头并转入 AsyncLocalStorage 作用域
 * （模式对齐 `UserContextInterceptor`，执行顺序：Guard → Tenant → UserContext → 本拦截器）。
 *
 * 【P0 端识别方式】多端交付一期以请求头携带端上下文（design D4 决策）；
 * 非法/缺失按缺省 portal(1) 处理 —— 存量请求不带头时行为与迁移前逐字节一致（零破坏）。
 *
 * ⚠️ 作用域必须包住整条 downstream 处理链（与 user/tenant 同理）：
 * 在拦截器里 set / finally clear 会在 await 跨越后丢失。
 */
@Injectable()
export class ClientContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context
      .switchToHttp()
      .getRequest<{ headers: Record<string, unknown> }>()
    const clientId = parseClientIdHeader(request.headers['x-client-id'])
    return runWithClient(clientId, () => next.handle())
  }
}
