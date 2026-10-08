import { Kysely, MysqlDialect } from 'kysely'
import { createPool } from 'mysql2'
import { join } from 'node:path'
import { loadEnv } from '../config/env'
import { Migrator } from './migrator'

/**
 * 迁移命令行入口：`pnpm migrate`（可用 `DB_NAME=... pnpm migrate` 指定库）。
 *
 * `--repair` 等价于 `flyway repair`：把历史表里已应用迁移的 checksum 更新为当前文件的值。
 * 只在两种情况用：① 迁移算法升级（Node 侧早期写的是 md5，现已改为与 Flyway 兼容的 CRC32，
 * 见 `migrator.ts` 的 `computeChecksum`）；② 确认「文件才是权威」后修表。
 * ⚠️ 它**不回滚任何 DDL**。
 */
async function main(): Promise<void> {
  const env = loadEnv()
  const repair = process.argv.includes('--repair')
  const db = new Kysely<unknown>({
    dialect: new MysqlDialect({
      pool: createPool({
        host: env.db.host,
        port: env.db.port,
        user: env.db.user,
        password: env.db.password,
        database: env.db.database,
        multipleStatements: false,
      }),
    }),
  })

  console.log(`[migrate] 目标库 ${env.db.host}:${env.db.port}/${env.db.database}`)
  try {
    const migrator = new Migrator(db, join(__dirname, '..', '..', '..', 'migrations'), (m) =>
      console.log(`[migrate] ${m}`),
    )
    if (repair) {
      const fixed = await migrator.repair()
      console.log(
        fixed.length === 0
          ? '[migrate] repair 完成：没有 checksum 需要修复'
          : `[migrate] repair 完成：修复 ${fixed.length} 个（${fixed.map((m) => `V${m.version}`).join(', ')}）`,
      )
      return
    }
    const result = await migrator.run()
    console.log(
      `[migrate] 完成：应用 ${result.applied.length} 个，跳过 ${result.skipped.length} 个，` +
        `checksum 校验通过 ${result.validated.length} 个，新建历史表=${result.baselineCreated}`,
    )
    if (result.applied.length > 0) {
      console.log(`[migrate] 已应用：${result.applied.join(', ')}`)
    }
  } finally {
    await db.destroy()
  }
}

main().catch((err) => {
  console.error('[migrate] 失败:', err instanceof Error ? err.message : err)
  // 用 process.exitCode 而非 process.exit()：强制退出可能在 Windows 上触发
  // libuv 断言并让进程以崩溃码结束，从而丢失「失败」这一语义。
  process.exitCode = 1
})
