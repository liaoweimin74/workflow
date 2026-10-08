import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common'
import { Observable } from 'rxjs'
import type { LoginUser } from '../../framework/security/jwt-auth.guard'
import { runWithUser } from '../../framework/security/user-context'

/**
 * 用户上下文拦截器：把 JwtAuthGuard 挂在 `request.user` 上的登录人
 * 转入 AsyncLocalStorage 作用域（模式对齐 `TenantInterceptor`）。
 *
 * 执行顺序（Nest 请求链）：Guard（挂 user）→ TenantInterceptor → 本拦截器 → Handler。
 * 因此 handler 及 downstream（engine 适配器等）里 `tryGetUser()` 都能取到当前登录人。
 *
 * 未认证请求（`@Public()` 端点、登录/健康检查）`request.user` 为空 → 不设置作用域，
 * `tryGetUser()` 返回 null，由消费方按需报错（如待办任务数据源要求登录上下文）。
 *
 * ⚠️ 作用域必须包住整条 downstream 处理链（与 TenantInterceptor 同理）：
 * 在拦截器里 set / finally clear 会在 await 跨越后丢失。
 */
@Injectable()
export class UserContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<{ user?: LoginUser }>()
    return runWithUser(request.user, () => next.handle())
  }
}
