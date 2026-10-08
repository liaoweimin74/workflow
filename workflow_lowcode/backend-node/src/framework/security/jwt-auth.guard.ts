import { CanActivate, ExecutionContext, Injectable, SetMetadata } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import type { Request } from 'express'
import { ACCESS_TOKEN_TYPE, JwtTokenProvider } from './jwt-token.provider'
import { UnauthorizedException } from './unauthorized.exception'

/** 标记无需认证的端点（对齐 Java SecurityConfig 的 permitAll 列表）。 */
export const IS_PUBLIC_KEY = 'isPublic'

/** 用法：@Public() 加在 handler 或 controller 上。 */
export const Public = (): MethodDecorator & ClassDecorator =>
  SetMetadata(IS_PUBLIC_KEY, true) as unknown as MethodDecorator & ClassDecorator

/** 已认证用户，挂到 request.user 上（对齐 Java LoginUser）。 */
export interface LoginUser {
  userId: number
  username: string
}

/**
 * JWT 认证守卫。
 *
 * 行为对齐 Java：认证失败时返回 HTTP 401 + R.unauthorized('未登录或Token已过期')，
 * 由 JwtAuthenticationFilter + AuthenticationEntryPointImpl 组合实现。
 *
 * ⚠️ 抛的是本项目的 UnauthorizedException（而非 @nestjs/common 的同名类），
 * 这样 GlobalExceptionFilter 才能输出与 Java 完全一致的固定消息。
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtTokenProvider: JwtTokenProvider,
    private readonly reflector: Reflector,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ])
    if (isPublic === true) return true

    const request = context.switchToHttp().getRequest<Request & { user?: LoginUser }>()
    const header = request.headers.authorization
    if (typeof header !== 'string' || !header.startsWith('Bearer ')) {
      throw new UnauthorizedException()
    }
    const token = header.slice(7)
    if (!this.jwtTokenProvider.validateToken(token)) {
      throw new UnauthorizedException()
    }
    // refresh token 不能当 access token 用
    if (this.jwtTokenProvider.getTokenType(token) !== ACCESS_TOKEN_TYPE) {
      throw new UnauthorizedException()
    }
    request.user = {
      userId: this.jwtTokenProvider.getUserIdFromToken(token),
      username: this.jwtTokenProvider.getUsernameFromToken(token),
    }
    return true
  }
}
