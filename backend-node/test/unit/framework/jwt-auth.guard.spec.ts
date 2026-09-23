import type { ExecutionContext } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { describe, expect, it } from 'vitest'
import { IS_PUBLIC_KEY, JwtAuthGuard } from '../../../src/framework/security/jwt-auth.guard'
import { JwtTokenProvider } from '../../../src/framework/security/jwt-token.provider'
import { UnauthorizedException } from '../../../src/framework/security/unauthorized.exception'
import { loadEnv } from '../../../src/framework/config/env'

const provider = new JwtTokenProvider(loadEnv().jwt)
const reflector = new Reflector()

/** 构造一个假的 ExecutionContext：元数据放在 handler 上，由 reflector 读取。 */
function makeContext(authorization: string | undefined, isPublic = false) {
  const request: { headers: Record<string, string | undefined>; user?: unknown } = {
    headers: { authorization },
  }
  const handler = (): void => {}
  if (isPublic) {
    Reflect.defineMetadata(IS_PUBLIC_KEY, true, handler)
  }
  const context = {
    getHandler: () => handler,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext
  return { context, request }
}

describe('JwtAuthGuard', () => {
  const guard = new JwtAuthGuard(provider, reflector)

  it('缺少 Authorization 头 → 抛 UnauthorizedException', () => {
    const { context } = makeContext(undefined)
    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException)
  })

  it('非 Bearer 前缀 → 抛 UnauthorizedException', () => {
    const { context } = makeContext('Basic abc')
    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException)
  })

  it('token 非法 → 抛 UnauthorizedException', () => {
    const { context } = makeContext('Bearer not-a-token')
    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException)
  })

  it('refresh token 不能当 access token 用', () => {
    const { context } = makeContext(`Bearer ${provider.createRefreshToken(1, 'admin')}`)
    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException)
  })

  it('合法 access token → 放行并把 LoginUser 挂到 request.user', () => {
    const { context, request } = makeContext(`Bearer ${provider.createAccessToken(7, 'admin')}`)
    expect(guard.canActivate(context)).toBe(true)
    expect(request.user).toEqual({ userId: 7, username: 'admin' })
  })

  it('@Public() 标记的 handler 直接放行，无需 token', () => {
    const { context } = makeContext(undefined, true)
    expect(guard.canActivate(context)).toBe(true)
  })

  it('抛出的异常消息与 Java 一致', () => {
    const { context } = makeContext(undefined)
    try {
      guard.canActivate(context)
      throw new Error('应当抛出异常')
    } catch (err) {
      expect(err).toBeInstanceOf(UnauthorizedException)
      expect((err as Error).message).toBe('未登录或Token已过期')
    }
  })
})
