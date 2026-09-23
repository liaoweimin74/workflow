import { createParamDecorator, type ExecutionContext } from '@nestjs/common'
import type { LoginUser } from '../../framework/security/jwt-auth.guard'

/**
 * 取当前已认证用户（由 JwtAuthGuard 挂在 request.user 上）。
 *
 * 用法：`getCurrentUser(@CurrentUser() user: LoginUser)`。
 * 对齐 Java 侧的 `@AuthenticationPrincipal LoginUser`。
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): LoginUser => {
    const request = context.switchToHttp().getRequest<{ user?: LoginUser }>()
    if (request.user === undefined) {
      // 走到这里说明路由没有经过 JwtAuthGuard（通常是漏了认证）
      throw new Error('当前请求没有已认证用户：请确认该路由受 JwtAuthGuard 保护')
    }
    return request.user
  },
)
