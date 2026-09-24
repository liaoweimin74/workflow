import { Global, Inject, Logger, Module, OnApplicationShutdown } from '@nestjs/common'
import { Kysely, MysqlDialect } from 'kysely'
import { createPool } from 'mysql2'
import type { Env } from '../config/env'
import { loadEnv } from '../config/env'
import type { DB } from './types'

/** Kysely 实例的注入令牌。 */
export const KYSELY = Symbol('KYSELY')
/** 环境配置的注入令牌。 */
export const ENV = Symbol('ENV')
/**
 * 原始 mysql2 连接池的注入令牌。
 *
 * ⚠️ 只有「需要**字段元数据**」的场景才用得到它（SQL 列元数据探测）：
 *    Kysely 的查询接口把结果集元数据丢掉了，而探测要的恰恰是
 *    `FieldPacket[]`（列名/类型码/长度/flags）—— 对应 Java 的 JDBC `ResultSetMetaData`。
 *    与 Kysely **共用同一个池**，不额外开连接。
 */
export const MYSQL_POOL = Symbol('MYSQL_POOL')

@Global()
@Module({
  providers: [
    { provide: ENV, useFactory: () => loadEnv() },
    {
      provide: MYSQL_POOL,
      inject: [ENV],
      useFactory: (env: Env) =>
        createPool({
          host: env.db.host,
          port: env.db.port,
          user: env.db.user,
          password: env.db.password,
          database: env.db.database,
          // 与 Java 侧 JDBC URL 的参数对齐，避免中文/时区行为差异。
          charset: 'utf8mb4',
          timezone: '+08:00',
          connectionLimit: 10,
          /**
           * JSON / 文本列统一返回**原始文本**。
           *
           * ⚠️ 这里刻意改成返回**原始文本**：Java 侧把 json 列映射成 String，
           *    响应里返回的就是库里的原始 JSON 文本（保留空白与键顺序）。
           *    若让 mysql2 解析再由我们序列化，会丢掉空白、并让字段类型从 string 变成 object
           *    —— 实测踩到过：`editor` 的 `nodeConfigs` 值因此与 Java 不一致。
           *
           * ⚠️ MariaDB 差异（publish 表单实测踩到）：MariaDB 把 JSON 别名列在
           *    wire protocol 里标记为 **BLOB**（MySQL 8 标记为 JSON），
           *    mysql2 对 BLOB 载荷里的合法 JSON 会自动 parse 成 JS 对象 ——
           *    导致下游 `columnConfig.trim()` / `JSON.parse()` 类逻辑崩溃。
           *    本库无二进制列，JSON 与 BLOB 系（TEXT/LONGTEXT 等均走 BLOB 类型）
           *    统一还原为原始文本，等价于 MySQL 8 的默认文本行为。
           */
          typeCast: (field, next) => {
            if (
              field.type === 'JSON' ||
              field.type === 'BLOB' ||
              field.type === 'TINY_BLOB' ||
              field.type === 'MEDIUM_BLOB' ||
              field.type === 'LONG_BLOB'
            ) {
              return field.string('utf8')
            }
            return next()
          },
          /**
           * DECIMAL/NEWDECIMAL 按**数字**返回（mysql2 默认给字符串）。
           *
           * ⚠️ 这是对齐 Java 的必需项，不是风格偏好：JDBC 把 DECIMAL 映射成
           *    `BigDecimal`，Jackson 序列化成 **JSON number**（`amount: 12.34`）；
           *    mysql2 默认给字符串（`"12.34"`）—— 契约比对会直接报
           *    「类型不符（Java number vs Node string）」。实测在「FORM 数据源
           *    config 与 sql 查询模式」的 `amount` / `doubleAmount` 上炸出来。
           *
           * ⚠️ 精度取舍：JS number 是双精度（约 15~16 位有效数字），而 BigDecimal
           *    是任意精度。但**契约工具本身把两边响应都 `JSON.parse` 成 JS 值再比**，
           *    所以超过双精度的位在观测层面本来就不存在 —— 两边落在同一个 double 上，
           *    比较结果一致。
           */
          decimalNumbers: true,
        }),
    },
    {
      provide: KYSELY,
      inject: [ENV, MYSQL_POOL],
      useFactory: (env: Env, pool: ReturnType<typeof createPool>): Kysely<DB> => {
        const logger = new Logger('Kysely')
        logger.log(`连接 MySQL ${env.db.host}:${env.db.port}/${env.db.database}`)
        return new Kysely<DB>({ dialect: new MysqlDialect({ pool }) })
      },
    },
  ],
  exports: [KYSELY, ENV, MYSQL_POOL],
})
export class DatabaseModule implements OnApplicationShutdown {
  constructor(@Inject(KYSELY) private readonly db: Kysely<DB>) {}

  async onApplicationShutdown(): Promise<void> {
    await this.db.destroy()
  }
}
