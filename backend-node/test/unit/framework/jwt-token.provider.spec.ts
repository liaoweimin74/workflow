import { decode, verify } from 'jsonwebtoken'
import { describe, expect, it } from 'vitest'
import {
  ACCESS_TOKEN_TYPE,
  JwtTokenProvider,
  REFRESH_TOKEN_TYPE,
} from '../../../src/framework/security/jwt-token.provider'
import { loadEnv } from '../../../src/framework/config/env'

const jwtEnv = loadEnv().jwt
const provider = new JwtTokenProvider(jwtEnv)
const secretBuffer = Buffer.from(jwtEnv.secret, 'base64')

describe('JwtTokenProvider', () => {
  it('access token 用 HS256 签发（47 字节密钥）', () => {
    const token = provider.createAccessToken(7, 'admin')
    const header = JSON.parse(Buffer.from(token.split('.')[0], 'base64url').toString())
    expect(header.alg).toBe('HS256')
    expect(() => verify(token, secretBuffer, { algorithms: ['HS256'] })).not.toThrow()
  })

  it('sub 是 userId 的字符串形式', () => {
    const token = provider.createAccessToken(42, 'admin')
    expect(decode(token)!.sub).toBe('42')
  })

  it('claims 恰为 sub / username / type / iat / exp', () => {
    const token = provider.createAccessToken(1, 'admin')
    const payload = decode(token) as Record<string, unknown>
    expect(Object.keys(payload).sort()).toEqual(['exp', 'iat', 'sub', 'type', 'username'])
    expect(payload.username).toBe('admin')
  })

  it('access / refresh 的 type 分别为 access_token / refresh_token', () => {
    expect(provider.getTokenType(provider.createAccessToken(1, 'a'))).toBe(ACCESS_TOKEN_TYPE)
    expect(provider.getTokenType(provider.createRefreshToken(1, 'a'))).toBe(REFRESH_TOKEN_TYPE)
    expect(ACCESS_TOKEN_TYPE).toBe('access_token')
    expect(REFRESH_TOKEN_TYPE).toBe('refresh_token')
  })

  it('access token 有效期为 30 分钟', () => {
    const payload = decode(provider.createAccessToken(1, 'a')) as { iat: number; exp: number }
    expect(payload.exp - payload.iat).toBe(30 * 60)
  })

  it('refresh token 有效期为 10080 分钟', () => {
    const payload = decode(provider.createRefreshToken(1, 'a')) as { iat: number; exp: number }
    expect(payload.exp - payload.iat).toBe(10080 * 60)
  })

  it('validateToken 对合法 token 返回 true', () => {
    expect(provider.validateToken(provider.createAccessToken(1, 'a'))).toBe(true)
  })

  it('validateToken 对篡改 / 垃圾 token 返回 false', () => {
    const token = provider.createAccessToken(1, 'a')
    expect(provider.validateToken(`${token}x`)).toBe(false)
    expect(provider.validateToken('not-a-token')).toBe(false)
    expect(provider.validateToken('')).toBe(false)
  })

  it('validateToken 对其它密钥签发的 token 返回 false', () => {
    const other = new JwtTokenProvider({
      ...jwtEnv,
      secret: Buffer.alloc(47, 9).toString('base64'),
    })
    expect(provider.validateToken(other.createAccessToken(1, 'a'))).toBe(false)
  })

  it('能取回 userId（数字）与 username', () => {
    const token = provider.createAccessToken(123, 'zhangsan')
    expect(provider.getUserIdFromToken(token)).toBe(123)
    expect(provider.getUsernameFromToken(token)).toBe('zhangsan')
  })

  it('过期 token 校验失败', () => {
    const past = new JwtTokenProvider({ ...jwtEnv, accessTokenExpireMinutes: -1 })
    expect(past.validateToken(past.createAccessToken(1, 'a'))).toBe(false)
  })
})
