/**
 * config.ts — 运行配置（与 Java 端 application.yml 契约对齐）
 *
 * 端口：Node 后端监听 8081（8080 仍归 Java jar；切换期由 service-supervisor 决定谁上 8080）
 * JWT：与 JwtTokenProvider 完全同源 —— base64 secret 解码后作 HMAC-SHA256 key
 */

function num(v: string | undefined, dflt: number): number {
  const n = v == null || v === '' ? NaN : Number(v);
  return Number.isFinite(n) ? n : dflt;
}

export const config = {
  env: process.env.NODE_ENV ?? 'development',
  port: num(process.env.PORT, 8081),

  /** 与 Java 端 @Value("${jwt.secret:...}") 同一默认值（base64 编码的 48 字节 key） */
  jwtSecretB64:
    process.env.JWT_SECRET ??
    'YnJfRFdpbjQ5dU5hZzJ4c0VvN0s2bUx4R0R4aUZ3cG1WeU9yS3F6RXhDdVN4V0E=',
  /** 分钟（Java: jwt.access-token-expire:30） */
  accessTokenExpireMin: num(process.env.JWT_ACCESS_TOKEN_EXPIRE, 30),
  /** 分钟（Java: jwt.refresh-token-expire:10080 = 7 天） */
  refreshTokenExpireMin: num(process.env.JWT_REFRESH_TOKEN_EXPIRE, 10080),

  /** SQLite 库文件（相对 backend-node 根） */
  dbPath: process.env.DB_PATH ?? new URL('../data/workflow.db', import.meta.url).pathname,

  /** 全站租户头（v1 业务接口要求；Java 端 TenantFilter 校验） */
  defaultTenantId: process.env.DEFAULT_TENANT_ID ?? 'default',
} as const;

export const TOKEN_TYPE = {
  access: 'access_token',
  refresh: 'refresh_token',
} as const;
