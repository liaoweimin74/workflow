/** 数据库连接配置。 */
export interface DbEnv {
  host: string
  port: number
  user: string
  password: string
  database: string
}

/** Redis 连接配置。 */
export interface RedisEnv {
  host: string
  port: number
  db: number
  password: string | null
}

/** JWT 配置。secret 为 base64 字符串（对齐 Java 侧 Decoders.BASE64.decode）。 */
export interface JwtEnv {
  secret: string
  accessTokenExpireMinutes: number
  refreshTokenExpireMinutes: number
}

export interface Env {
  port: number
  db: DbEnv
  redis: RedisEnv
  jwt: JwtEnv
}

const DEFAULTS: Env = {
  // 8081：保留 8080 给 DSH Web GUI，8082 给 Java 基准。
  port: 8081,
  db: {
    host: 'localhost',
    port: 3306,
    user: 'root',
    password: '740130',
    // workflow_v6 而不是 workflow：
    //   原开发库 workflow 的 Flyway 历史与仓库文件不一致（V2 被改名/改内容），
    //   Java 后端无法启动；按用户要求不修改该库，另建了历史自洽的 workflow_v6 承接。
    //   详见 docs/superpowers/specs/2026-09-16-nodejs-backend-migration-design.md 的 U7。
    database: 'workflow_v6',
  },
  redis: {
    host: 'localhost',
    port: 6379,
    db: 0,
    password: null,
  },
  jwt: {
    secret: 'YnJfRFdpbjQ5dU5hZzJ4c0VvN0s2bUx4R0R4aUZ3cG1WeU9yS3F6RXhDdVN4V0E=',
    accessTokenExpireMinutes: 30,
    refreshTokenExpireMinutes: 10080,
  },
}

function readInt(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === '') return fallback
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

/**
 * 读取环境变量并与默认值合并。默认值对齐 Java 侧 application.yml 与
 * JwtTokenProvider 的 @Value 默认值，保证两个后端可指向同一个库做比对。
 *
 * 环境变量名：PORT / DB_HOST / DB_PORT / DB_USER / DB_PASSWORD / DB_NAME /
 *            REDIS_HOST / REDIS_PORT / REDIS_DB / REDIS_PASSWORD /
 *            JWT_SECRET / JWT_ACCESS_EXPIRE_MINUTES / JWT_REFRESH_EXPIRE_MINUTES
 */
export function loadEnv(overrides: Partial<Env> = {}): Env {
  const e = process.env
  const fromEnv: Env = {
    port: readInt(e.PORT, DEFAULTS.port),
    db: {
      host: e.DB_HOST ?? DEFAULTS.db.host,
      port: readInt(e.DB_PORT, DEFAULTS.db.port),
      user: e.DB_USER ?? DEFAULTS.db.user,
      password: e.DB_PASSWORD ?? DEFAULTS.db.password,
      database: e.DB_NAME ?? DEFAULTS.db.database,
    },
    redis: {
      host: e.REDIS_HOST ?? DEFAULTS.redis.host,
      port: readInt(e.REDIS_PORT, DEFAULTS.redis.port),
      db: readInt(e.REDIS_DB, DEFAULTS.redis.db),
      password: e.REDIS_PASSWORD ?? DEFAULTS.redis.password,
    },
    jwt: {
      secret: e.JWT_SECRET ?? DEFAULTS.jwt.secret,
      accessTokenExpireMinutes: readInt(
        e.JWT_ACCESS_EXPIRE_MINUTES,
        DEFAULTS.jwt.accessTokenExpireMinutes,
      ),
      refreshTokenExpireMinutes: readInt(
        e.JWT_REFRESH_EXPIRE_MINUTES,
        DEFAULTS.jwt.refreshTokenExpireMinutes,
      ),
    },
  }

  return {
    ...fromEnv,
    ...overrides,
    db: { ...fromEnv.db, ...(overrides.db ?? {}) },
    redis: { ...fromEnv.redis, ...(overrides.redis ?? {}) },
    jwt: { ...fromEnv.jwt, ...(overrides.jwt ?? {}) },
  }
}
