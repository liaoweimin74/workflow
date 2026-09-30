/**
 * jwt.ts — 与 Java JwtTokenProvider 完全同源：
 *  - key = base64decode(secret)（48 字节）作 HMAC-SHA256
 *  - claims: { sub: String(userId), username, type: access_token|refresh_token, iat, exp }
 *  - access 30min / refresh 10080min
 */
import jwt from 'jsonwebtoken';
import { config, TOKEN_TYPE } from '../config';

const SECRET_KEY = Buffer.from(config.jwtSecretB64, 'base64');

export interface TokenClaims {
  sub: string;
  username: string;
  type: (typeof TOKEN_TYPE)[keyof typeof TOKEN_TYPE];
  iat: number;
  exp: number;
}

function sign(userId: number | string, username: string, type: string, expireMinutes: number): string {
  return jwt.sign({ username, type }, SECRET_KEY, {
    subject: String(userId),
    algorithm: 'HS256',
    expiresIn: expireMinutes * 60,
  });
}

export function createAccessToken(userId: number | string, username: string): string {
  return sign(userId, username, TOKEN_TYPE.access, config.accessTokenExpireMin);
}

export function createRefreshToken(userId: number | string, username: string): string {
  return sign(userId, username, TOKEN_TYPE.refresh, config.refreshTokenExpireMin);
}

/** 返回 null 表示无效（签名错/过期/格式错），不抛异常（对齐 validateToken 布尔语义） */
export function verifyToken(token: string): TokenClaims | null {
  try {
    const payload = jwt.verify(token, SECRET_KEY, { algorithms: ['HS256'] });
    if (typeof payload === 'string') return null;
    const { sub, username, type } = payload as jwt.JwtPayload & {
      username?: string;
      type?: string;
    };
    if (!sub || type !== TOKEN_TYPE.access && type !== TOKEN_TYPE.refresh) return null;
    return {
      sub,
      username: String(username ?? ''),
      type: type as TokenClaims['type'],
      iat: Number(payload.iat ?? 0),
      exp: Number(payload.exp ?? 0),
    };
  } catch {
    return null;
  }
}
