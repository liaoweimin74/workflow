import { sign, verify, decode, type JwtPayload } from 'jsonwebtoken'
import type { JwtEnv } from '../config/env'

/** 对齐 Java GlobalConstant.ACCESS_TOKEN_KEY。 */
export const ACCESS_TOKEN_TYPE = 'access_token'
/** 对齐 Java GlobalConstant.REFRESH_TOKEN_KEY。 */
export const REFRESH_TOKEN_TYPE = 'refresh_token'

/**
 * JWT 签发与校验，逐字对齐 Java com.workflow.framework.security.jwt.JwtTokenProvider。
 *
 * 关键对齐点：
 *  - 密钥是 base64 字符串，需解码为 Buffer 后作为 HMAC 密钥。默认密钥解码后 47 字节，
 *    落在 jjwt 的 HMAC 分级区间（>=32 且 <48 字节 → HS256），因此算法是 **HS256**。
 *  - claims 恰为 sub（userId 的字符串形式）、username、type、iat、exp。
 *  - access 30 分钟 / refresh 10080 分钟，由配置决定。
 */
export class JwtTokenProvider {
  private readonly secret: Buffer
  private readonly accessTokenExpireSeconds: number
  private readonly refreshTokenExpireSeconds: number

  constructor(env: JwtEnv) {
    this.secret = Buffer.from(env.secret, 'base64')
    this.accessTokenExpireSeconds = env.accessTokenExpireMinutes * 60
    this.refreshTokenExpireSeconds = env.refreshTokenExpireMinutes * 60
  }

  createAccessToken(userId: number, username: string): string {
    return sign({ username, type: ACCESS_TOKEN_TYPE }, this.secret, {
      algorithm: 'HS256',
      subject: String(userId),
      expiresIn: this.accessTokenExpireSeconds,
    })
  }

  createRefreshToken(userId: number, username: string): string {
    return sign({ username, type: REFRESH_TOKEN_TYPE }, this.secret, {
      algorithm: 'HS256',
      subject: String(userId),
      expiresIn: this.refreshTokenExpireSeconds,
    })
  }

  validateToken(token: string): boolean {
    try {
      verify(token, this.secret, { algorithms: ['HS256'] })
      return true
    } catch {
      return false
    }
  }

  getUserIdFromToken(token: string): number {
    return Number(this.payload(token).sub)
  }

  getUsernameFromToken(token: string): string {
    return this.payload(token).username as string
  }

  getTokenType(token: string): string {
    return this.payload(token).type as string
  }

  private payload(token: string): JwtPayload & { username?: string; type?: string } {
    const decoded = decode(token)
    if (decoded === null || typeof decoded === 'string') {
      throw new Error('非法的 JWT')
    }
    return decoded as JwtPayload & { username?: string; type?: string }
  }
}
