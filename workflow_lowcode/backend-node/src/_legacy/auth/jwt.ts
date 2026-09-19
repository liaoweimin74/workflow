// ---------------------------------------------------------------------
// JWT：对齐 JwtTokenProvider —— HMAC（48 字节密钥 → HS384）、
// claims: sub(userId)/username/type/iat/exp，access 30min、refresh 7d
// ---------------------------------------------------------------------
import jwt from 'jsonwebtoken'
import { BizError } from '../contract'

const SECRET_B64 = 'YnJfRFdpbjQ5dU5hZzJ4c0VvN0s2bUx4R0R4aUZ3cG1WeU9yS3F6RXhDdVN4V0E='
const SECRET = Buffer.from(SECRET_B64, 'base64') // 48 字节 → HS384
export const ALG: jwt.Algorithm = 'HS384'

export const ACCESS_TTL_SEC = 30 * 60 // 30 分钟
export const REFRESH_TTL_SEC = 7 * 24 * 60 * 60 // 10080 分钟

export const TYPE_ACCESS = 'access_token'
export const TYPE_REFRESH = 'refresh_token'

export interface TokenPayload {
  sub: string
  username: string
  type: string
  iat?: number
  exp?: number
}

export function signToken(userId: string, username: string, type: string, ttlSec: number): string {
  return jwt.sign({ username, type }, SECRET, {
    algorithm: ALG,
    subject: userId,
    expiresIn: ttlSec,
  })
}

export function signAccess(userId: string, username: string): string {
  return signToken(userId, username, TYPE_ACCESS, ACCESS_TTL_SEC)
}

export function signRefresh(userId: string, username: string): string {
  return signToken(userId, username, TYPE_REFRESH, REFRESH_TTL_SEC)
}

/**
 * 校验并解析 token。无效/过期/类型不符 → null（调用方决定 401 或忽略）。
 * 复刻 JwtAuthenticationFilter：Authorization 头只认 access_token。
 */
export function verifyToken(token: string, expectType?: string): TokenPayload | null {
  try {
    const p = jwt.verify(token, SECRET, { algorithms: [ALG] }) as TokenPayload
    if (expectType && p.type !== expectType) return null
    return p
  } catch {
    return null
  }
}

/** 校验 refresh token（/api/auth/refresh 用），无效抛 401 语义 BizError */
export function requireRefreshToken(token: string | undefined): TokenPayload {
  if (!token) throw new BizError(401, '未登录或Token已过期')
  const p = verifyToken(token, TYPE_REFRESH)
  if (!p) throw new BizError(401, '未登录或Token已过期')
  return p
}
