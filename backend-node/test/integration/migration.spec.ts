import { cpSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { Kysely, MysqlDialect, sql } from 'kysely'
import { createPool } from 'mysql2'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { loadEnv } from '../../src/framework/config/env'
import {
  MigrationChecksumError,
  Migrator,
  discoverMigrations,
} from '../../src/framework/database/migrator'
import { parseDeclaredSchema } from '../../tools/lib/kysely-types'

/**
 * 迁移集成测试：对独立测试库执行全部迁移，断言 schema 正确。
 *
 * 需要 MySQL 可用。运行：pnpm test:integration
 * 测试库名固定为 workflow_node_test —— 不会碰开发库。
 *
 * ⚠️ 注意这里用 process.cwd() 而非 __dirname：vitest 以 ESM 运行测试文件，
 *    __dirname 在 ESM 下不存在。vitest 从项目根目录启动，因此 cwd 即 backend-node。
 */
const TEST_DB = 'workflow_node_test'
const MIGRATIONS_DIR = join(process.cwd(), 'migrations')

function makeDb(database?: string): Kysely<unknown> {
  const env = loadEnv()
  return new Kysely<unknown>({
    dialect: new MysqlDialect({
      pool: createPool({
        host: env.db.host,
        port: env.db.port,
        user: env.db.user,
        password: env.db.password,
        database,
        multipleStatements: false,
      }),
    }),
  })
}

describe('schema 迁移', () => {
  let admin: Kysely<unknown>
  let db: Kysely<unknown>

  beforeAll(async () => {
    expect(existsSync(MIGRATIONS_DIR), `迁移目录不存在: ${MIGRATIONS_DIR}`).toBe(true)
    admin = makeDb()
    await sql`DROP DATABASE IF EXISTS ${sql.id(TEST_DB)}`.execute(admin)
    await sql`CREATE DATABASE ${sql.id(TEST_DB)} CHARACTER SET utf8mb4`.execute(admin)
    db = makeDb(TEST_DB)
  }, 60_000)

  afterAll(async () => {
    await db?.destroy()
    await admin?.destroy()
  })

  it('能对空库应用全部迁移且不报错', async () => {
    const migrator = new Migrator(db, MIGRATIONS_DIR)
    const result = await migrator.run()

    // 用「目录里的迁移文件数」派生期望值，避免硬编码随文件增删而漂移。
    // 当前实际为 38 个：V1 + V2..V31（其中 V10 不存在，共 29 个）
    //   + V32 引擎运行时表 + V33 target_namespace + V34 微秒精度
    //   + V35 对齐 Hibernate 补出来的表与列 + V36 委派侧表
    //   + V37 实例乐观锁 lock_version + V38 修 wf_node_config 唯一键
    //   + V39 内建数据源预置（seeder 迁入，双端同源）= 38。
    // 这里显式断言一个数值，是为了在文件被误删时能立刻发现（派生值单独用会掩盖丢失）。
    const expectedCount = discoverMigrations(MIGRATIONS_DIR).length
    expect(expectedCount).toBe(38)
    expect(result.applied.length).toBe(expectedCount)
    expect(result.skipped).toEqual([])

    // 关键里程碑脚本必须在列
    expect(result.applied).toContain('V1__baseline_schema.sql') // sys_* 基线（无其它脚本来源）
    expect(result.applied).toContain('V2__init_data.sql') // 既有脚本起始
    expect(result.applied).toContain('V31__add_source_key_unique.sql') // 既有脚本末尾
    expect(result.applied).toContain('V32__create_engine_runtime_tables.sql') // 引擎运行时表
    expect(result.applied).toContain('V35__align_hibernate_added_schema.sql') // 对齐 Hibernate 补列
  }, 120_000)

  it('重复运行迁移不重复应用', async () => {
    const migrator = new Migrator(db, MIGRATIONS_DIR)
    const result = await migrator.run()
    expect(result.applied).toEqual([])
    expect(result.skipped.length).toBe(discoverMigrations(MIGRATIONS_DIR).length)
  }, 60_000)

  it('sys_* 系统表已建立（V1 基线覆盖，无其它迁移脚本来源）', async () => {
    // 显式取别名：MySQL 8 的 information_schema 列名是大写 TABLE_NAME，
    // 直接读 table_name 会得到 undefined。
    const rows = await sql<{ name: string }>`
      SELECT table_name AS name FROM information_schema.tables
      WHERE table_schema = ${TEST_DB} AND table_name LIKE 'sys\\_%'
    `.execute(db)
    expect(rows.rows.map((r) => r.name).sort()).toEqual([
      'sys_dict_data',
      'sys_dict_type',
      'sys_menu',
      'sys_organization',
      'sys_role',
      'sys_role_menu',
      'sys_user',
      'sys_user_role',
    ])
  })

  it('引擎运行时表全部建立', async () => {
    const rows = await sql<{ name: string }>`
      SELECT table_name AS name FROM information_schema.tables
      WHERE table_schema = ${TEST_DB} AND table_name LIKE 'wfe\\_%'
    `.execute(db)
    expect(rows.rows.map((r) => r.name).sort()).toEqual([
      'wfe_activity',
      'wfe_execution',
      'wfe_process_def',
      'wfe_process_instance',
      'wfe_task',
      'wfe_task_candidate',
      'wfe_task_delegation',
      'wfe_variable',
    ])
  })

  it('既有 wf_* / msg_* 业务表也已建立（V2–V31 迁移生效）', async () => {
    const rows = await sql<{ name: string }>`
      SELECT table_name AS name FROM information_schema.tables
      WHERE table_schema = ${TEST_DB}
        AND (table_name LIKE 'wf\\_%' OR table_name LIKE 'msg\\_%')
    `.execute(db)
    const names = rows.rows.map((r) => r.name)
    for (const expected of [
      'wf_category',
      'wf_data_source',
      'wf_form_data',
      'wf_form_def',
      'wf_node_config',
      'wf_page_def',
      'wf_process_draft',
      'wf_task_comment',
      'wf_task_remind',
      'wf_task_transfer',
      'msg_message',
      'msg_template',
      'msg_delivery_retry',
      'msg_event_definition',
      'msg_subscription_rule',
      'msg_user_subscription',
      'msg_recipient',
      // V35：Java 侧整张表都由 Hibernate 补出来的渠道配置表
      'msg_channel_config',
    ]) {
      expect(names, `缺少表 ${expected}`).toContain(expected)
    }
  })

  it('不创建任何 Flowable / Modulith 引擎表（迁移决策 C2：绿地）', async () => {
    const rows = await sql<{ name: string }>`
      SELECT table_name AS name FROM information_schema.tables
      WHERE table_schema = ${TEST_DB}
        AND (table_name LIKE 'act\\_%' OR table_name LIKE 'flw\\_%')
    `.execute(db)
    expect(rows.rows).toEqual([])
  })

  /**
   * 迁移自足性对账。
   *
   * Java 侧 `spring.jpa.hibernate.ddl-auto=update` 会在启动时自动补列补表，
   * 所以「迁移文件」并不等于 Java 实际运行的 schema —— 契约库 workflow_v6 是
   * **Hibernate 形状**，Node 跑在上面一直是对的，但只跑迁移的全新库会缺对象，
   * 也就是 Node 后端无法独立部署。
   *
   * 实测缺口：Node 声明的 31 张表 / 344 个列里，有 1 张表（msg_channel_config）
   * 与 8 个列（wf_process_draft.process_key/deployed_xml、
   * wf_node_config.process_definition_id、wf_task_comment.target_user_id、
   * wf_form_data.is_snapshot、msg_template.content_type/enabled、
   * msg_delivery_retry.message_id）是迁移没有的 —— 由 V35 补齐。
   *
   * 这里以 types.ts 为权威清单逐列对账：手写清单会过期，而过期正是要防的失败模式。
   */
  it('Node 声明的每一列都由迁移创建（迁移自足性）', async () => {
    const declared = parseDeclaredSchema(
      readFileSync(join(process.cwd(), 'src', 'framework', 'database', 'types.ts'), 'utf8'),
    )
    const rows = await sql<{ table_name: string; column_name: string }>`
      SELECT table_name AS table_name, column_name AS column_name
      FROM information_schema.columns
      WHERE table_schema = ${TEST_DB}
    `.execute(db)
    const existing = new Map<string, Set<string>>()
    for (const r of rows.rows) {
      // ⚠️ 必须显式 AS 别名：MySQL 8 的 information_schema 原样返回大写列名
      //    （TABLE_NAME），不加别名时 r.table_name 会是 undefined ——
      //    那样 existing 里只有一个 "undefined" 键，31 张表会被全部误判为缺失。
      const set = existing.get(r.table_name) ?? new Set<string>()
      set.add(r.column_name)
      existing.set(r.table_name, set)
    }

    const missingTables: string[] = []
    const missingColumns: string[] = []
    for (const t of declared) {
      const have = existing.get(t.table)
      if (have === undefined) {
        missingTables.push(t.table)
        continue
      }
      for (const col of t.columns) {
        if (!have.has(col)) missingColumns.push(`${t.table}.${col}`)
      }
    }
    // 分成两个断言，失败信息能直接区分「缺表」与「缺列」
    expect(missingTables, '以下表 Node 要用但迁移没有创建').toEqual([])
    expect(missingColumns, '以下列 Node 要用但迁移没有创建').toEqual([])

    // 顺带证明对账确实覆盖了 V35 补的那批对象 —— 否则「全绿」可能只是没检查到
    expect(declared.length).toBe(33)
    expect(existing.get('msg_channel_config')?.size).toBe(7)
  })

  it('wfe_process_def 有 (tenant_id, process_key, version) 唯一约束', async () => {
    // SHOW INDEX 的列名是 Non_unique / Key_name（MySQL 8 原样返回定义中的大小写）
    const rows = await sql<{ Non_unique: number }>`
      SHOW INDEX FROM wfe_process_def WHERE Key_name = 'uk_tenant_key_version'
    `.execute(db)
    // 三列组成一个复合唯一索引 → 三行，且 Non_unique 全为 0
    expect(rows.rows.length).toBe(3)
    expect(rows.rows.every((r) => Number(r.Non_unique) === 0)).toBe(true)
  })

  it('迁移历史表沿用 Flyway 的表名与列结构', async () => {
    const rows = await sql<{ name: string }>`
      SELECT column_name AS name FROM information_schema.columns
      WHERE table_schema = ${TEST_DB} AND table_name = 'flyway_schema_history'
      ORDER BY ORDINAL_POSITION
    `.execute(db)
    expect(rows.rows.map((r) => r.name)).toEqual([
      'installed_rank',
      'version',
      'description',
      'type',
      'script',
      'checksum',
      'installed_by',
      'installed_on',
      'execution_time',
      'success',
    ])
  })

  it('历史表里的 checksum 是本算法的值（能被后续 validate 通过）', async () => {
    const rows = await sql<{ version: string; checksum: number | null }>`
      SELECT version, checksum FROM flyway_schema_history WHERE success = 1
    `.execute(db)
    const byVersion = new Map(rows.rows.map((r) => [String(r.version), r.checksum]))
    for (const file of discoverMigrations(MIGRATIONS_DIR)) {
      expect(Number(byVersion.get(file.version)), file.script).toBe(file.checksum)
    }
  })

  it('已应用脚本被事后修改 → 校验失败并指出是哪个版本（U6）', async () => {
    // 复制一份迁移目录，改动其中一个**已应用**的脚本，再对同一个库跑一次
    const tmpDir = join(process.cwd(), '.tmp-migrations-tampered')
    rmSync(tmpDir, { recursive: true, force: true })
    cpSync(MIGRATIONS_DIR, tmpDir, { recursive: true })
    const target = join(tmpDir, 'V13__create_wf_task_comment.sql')
    writeFileSync(target, `${readFileSync(target, 'utf8')}\n-- 事后改动\n`)

    try {
      const migrator = new Migrator(db, tmpDir)
      const error = await migrator.run().then(
        () => null,
        (e: unknown) => e as Error,
      )
      expect(error).toBeInstanceOf(MigrationChecksumError)
      expect((error as MigrationChecksumError).mismatches.map((m) => m.version)).toEqual(['13'])
      // 错误信息必须能指导操作（告诉用户跑 --repair），否则现场只会看到一句「失败」
      expect(String(error?.message)).toContain('--repair')

      // repair 后校验通过（等价于 flyway repair：只改历史表的 checksum，不动 DDL）
      const fixed = await migrator.repair()
      expect(fixed.map((m) => m.version)).toEqual(['13'])
      const after = await migrator.run()
      expect(after.applied).toEqual([])

      // 收尾：把历史表恢复到**真实文件**的 checksum，避免污染后面的用例
      const restored = await new Migrator(db, MIGRATIONS_DIR).repair()
      expect(restored.map((m) => m.version)).toEqual(['13'])
    } finally {
      rmSync(tmpDir, { recursive: true, force: true })
    }
  })
})
