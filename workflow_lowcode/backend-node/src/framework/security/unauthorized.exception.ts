/**
 * 未认证。映射为 HTTP 401 + R.unauthorized('未登录或Token已过期')，
 * 对齐 Java AuthenticationEntryPointImpl。
 */
export class UnauthorizedException extends Error {
  constructor(message = '未登录或Token已过期') {
    super(message)
    this.name = 'UnauthorizedException'
  }
}
