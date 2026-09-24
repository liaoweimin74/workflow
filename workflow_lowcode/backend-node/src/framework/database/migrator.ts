import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { crc32 } from 'node:zlib'
import type { Kysely, RawBuilder } from 'kysely'
import { sql } from 'kysely'

/** 迁移历史表名 —— 与 Flyway 一致，以便直接接管已有开发库。 */
export const HISTORY_TABLE = 'flyway_schema_history'

export interface MigrationFile {
  version: string
  description: string
  script: string
  checksum: number
  sql: string
}

export interface MigrationResult {
  applied: string[]
  skipped: string[]
  baselineCreated: boolean
  /** 校验通过（checksum 与历史表一致）的版本；`null` 表示历史表里该行 checksum 为空（baseline）。 */
  validated: string[]
}

/** checksum 校验失败的详情（供 CLI 打印与 `--repair` 使用）。 */
export interface ChecksumMismatch {
  version: string
  script: string
  expected: number
  actual: number
}

export class MigrationChecksumError extends Error {
  constructor(readonly mismatches: ChecksumMismatch[]) {
    const detail = mismatches
      .map((m) => `  V${m.version} ${m.script}: 历史表 ${m.expected} ≠ 文件 ${m.actual}`)
      .join('\n')
    super(
      `迁移脚本 checksum 校验失败（已应用的脚本被事后修改）：\n${detail}\n` +
        '这与 Flyway 的行为一致：已应用的迁移**不允许**再改动。\n' +
        '如需确认「文件才是最新的」并更新历史表，请执行 `pnpm migrate --repair`' +
        '（等价于 `flyway repair`）。',
    )
    this.name = 'MigrationChecksumError'
  }
}

/**
 * 迁移文件的 checksum —— **与 Flyway 算法逐字节兼容**。
 *
 * Flyway 9/10 的 `ChecksumCalculator`：按行读（`BufferedReader.readLine` ⇒ 去掉 `\r\n`/`\n`），
 * 首行先滤掉 BOM，把每行的 **UTF-8 字节**（不含换行）依次喂给 CRC32，取 `(int) crc32.getValue()`。
 *
 * ⚠️ 为什么必须兼容而不是「自己算一个稳定的值」：
 *    历史表 `flyway_schema_history` **与 Java 的 Flyway 共用**。Java 写进去的是 CRC32，
 *    如果 Node 写 md5（本文件早期实现就是 `md5` 前 4 字节），那么：
 *      ① Node 无法校验 Java 应用过的迁移；② Java 的 Flyway 反过来也无法校验 Node 写的行
 *      （Flyway 会报 checksum mismatch 并拒绝启动）。
 *    实测确认：对 V2..V31（由 Java 应用）本算法与历史表**逐行一致**（29/29）。
 *
 * ⚠️ V32..V36 是早期 Node 迁移器用 md5 写的，需要跑一次 `--repair` 才对齐（见 CLI 说明）。
 */
export function computeChecksum(sqlText: string): number {
  let lines = sqlText.split(/\r?\n/)
  // `String.split` 会为「以换行结尾的文件」多产出一个尾空串，而 `readLine` 不会
  if (lines.length > 0 && lines[lines.length - 1] === '') lines = lines.slice(0, -1)
  const buffers: Buffer[] = []
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i]
    if (i === 0 && line.charCodeAt(0) === 0xfeff) line = line.slice(1)
    buffers.push(Buffer.from(line, 'utf8'))
  }
  // CRC32 是无符号 32 位；Flyway 存进 INT 列，所以这里转成有符号
  return crc32(Buffer.concat(buffers)) | 0
}

/** 解析 `V<n>__<desc>.sql`；不匹配返回 null。 */
export function parseMigrationFileName(
  name: string,
): { version: string; description: string } | null {
  const m = /^V(\d+)__(.+)\.sql$/i.exec(name)
  if (!m) return null
  return { version: m[1], description: m[2].replace(/_/g, ' ') }
}

/**
 * 按分号切分 SQL 语句。
 *
 * 需要正确处理：行注释（--）、块注释、单引号、双引号、反引号标识符。
 * 注释内容不进入语句文本。
 */
export function splitStatements(sqlText: string): string[] {
  const out: string[] = []
  let buf = ''
  let i = 0
  let inSingle = false
  let inDouble = false
  let inBacktick = false
  let inLineComment = false
  let inBlockComment = false

  while (i < sqlText.length) {
    const ch = sqlText[i]
    const next = sqlText[i + 1]

    if (inLineComment) {
      // 注释内容不进入语句；保留换行以便语句文本可读
      if (ch === '\n') {
        inLineComment = false
        buf += ch
      }
      i++
      continue
    }
    if (inBlockComment) {
      if (ch === '*' && next === '/') {
        inBlockComment = false
        i += 2
        continue
      }
      i++
      continue
    }
    if (inSingle) {
      if (ch === '\\') {
        buf += ch + (next ?? '')
        i += 2
        continue
      }
      if (ch === "'") inSingle = false
      buf += ch
      i++
      continue
    }
    if (inDouble) {
      if (ch === '\\') {
        buf += ch + (next ?? '')
        i += 2
        continue
      }
      if (ch === '"') inDouble = false
      buf += ch
      i++
      continue
    }
    if (inBacktick) {
      if (ch === '`') inBacktick = false
      buf += ch
      i++
      continue
    }

    if (ch === '-' && next === '-') {
      inLineComment = true
      i += 2
      continue
    }
    if (ch === '/' && next === '*') {
      inBlockComment = true
      i += 2
      continue
    }
    if (ch === "'") {
      inSingle = true
      buf += ch
      i++
      continue
    }
    if (ch === '"') {
      inDouble = true
      buf += ch
      i++
      continue
    }
    if (ch === '`') {
      inBacktick = true
      buf += ch
      i++
      continue
    }

    if (ch === ';') {
      const stmt = buf.trim()
      if (stmt.length > 0) out.push(stmt)
      buf = ''
      i++
      continue
    }

    buf += ch
    i++
  }

  const tail = buf.trim()
  if (tail.length > 0) out.push(tail)
  return out
}

/** 扫描目录下的 `V<n>__*.sql`，按版本号数值升序返回。 */
export function discoverMigrations(dir: string): MigrationFile[] {
  const files = readdirSync(dir)
    .map((name) => ({ name, parsed: parseMigrationFileName(name) }))
    .filter(
      (f): f is { name: string; parsed: { version: string; description: string } } =>
        f.parsed !== null,
    )

  return files
    .map((f) => {
      const sqlText = readFileSync(join(dir, f.name), 'utf8')
      return {
        version: f.parsed.version,
        description: f.parsed.description,
        script: f.name,
        checksum: computeChecksum(sqlText),
        sql: sqlText,
      }
    })
    .sort((a, b) => Number(a.version) - Number(b.version))
}

/**
 * Flyway 兼容的迁移运行器。
 *
 * 设计要点：**沿用 Flyway 的 flyway_schema_history 表与语义**。
 * 指向已有开发库时 V2–V31 会被识别为已应用而跳过，不会重复执行。
 * 同时支持 out-of-order（对齐 spring.flyway.out-of-order: true）：
 * 允许应用版本号低于当前最大已应用版本的脚本，但会显式告警。
 */
export class Migrator {
  constructor(
    private readonly db: Kysely<unknown>,
    private readonly migrationsDir: string,
    private readonly log: (msg: string) => void = () => {},
  ) {}

  async run(): Promise<MigrationResult> {
    const migrations = discoverMigrations(this.migrationsDir)
    const baselineCreated = await this.ensureHistoryTable()
    const applied = await this.loadApplied()

    const result: MigrationResult = { applied: [], skipped: [], baselineCreated, validated: [] }
    // applied 是 Map（version → checksum），没有 reduce；取已应用版本的最大值用于 out-of-order 判定。
    const maxApplied = [...applied.keys()].reduce((max, v) => Math.max(max, Number(v)), 0)

    // 先校验再动手：**已应用的脚本被改动**必须立刻失败（对齐 Flyway 的 validate）
    const mismatches = this.findChecksumMismatches(migrations, applied)
    if (mismatches.length > 0) throw new MigrationChecksumError(mismatches)
    result.validated = migrations
      .filter((m) => applied.has(m.version) && applied.get(m.version) !== null)
      .map((m) => m.script)

    for (const m of migrations) {
      if (applied.has(m.version)) {
        result.skipped.push(m.script)
        continue
      }
      if (Number(m.version) < maxApplied) {
        this.log(`out-of-order 迁移：${m.script}（当前最大已应用版本 ${maxApplied}）`)
      }
      await this.applyOne(m)
      result.applied.push(m.script)
      this.log(`已应用 ${m.script}`)
    }
    return result
  }

  /**
   * `--repair`（对齐 `flyway repair`）：把历史表里已应用迁移的 checksum 更新为**当前文件**的值。
   *
   * 用途只有一个：**迁移算法升级**（本文件早期用 md5，现改为与 Flyway 兼容的 CRC32）或
   * 确认「文件才是权威」。⚠️ 它**不会**回滚任何 DDL —— 只是让历史表重新承认当前文件，
   * 所以「改了已应用脚本」这件事仍然需要人工确认，不要拿它当万能修复。
   */
  async repair(): Promise<ChecksumMismatch[]> {
    const migrations = discoverMigrations(this.migrationsDir)
    await this.ensureHistoryTable()
    const applied = await this.loadApplied()
    const mismatches = this.findChecksumMismatches(migrations, applied)

    for (const m of mismatches) {
      await this.query(
        sql`UPDATE ${sql.id(HISTORY_TABLE)} SET checksum = ${m.actual}
            WHERE version = ${m.version} AND success = 1`,
      )
      this.log(`已修复 checksum V${m.version} ${m.script}: ${m.expected} → ${m.actual}`)
    }
    return mismatches
  }

  /** 已应用且历史表里记了 checksum 的行，与当前文件比对；`NULL`（baseline）跳过 —— Flyway 同样忽略。 */
  private findChecksumMismatches(
    migrations: MigrationFile[],
    applied: Map<string, number | null>,
  ): ChecksumMismatch[] {
    const out: ChecksumMismatch[] = []
    for (const m of migrations) {
      if (!applied.has(m.version)) continue
      const expected = applied.get(m.version)
      if (expected === null || expected === undefined) continue
      if (expected !== m.checksum) {
        out.push({ version: m.version, script: m.script, expected, actual: m.checksum })
      }
    }
    return out
  }

  private async ensureHistoryTable(): Promise<boolean> {
    const existing = await this.query<{ table_name: string }>(
      sql`SELECT table_name FROM information_schema.tables
          WHERE table_schema = DATABASE() AND table_name = ${HISTORY_TABLE}`,
    )
    if (existing.length > 0) return false

    await this.query(
      sql`CREATE TABLE ${sql.id(HISTORY_TABLE)} (
        installed_rank INT NOT NULL,
        version VARCHAR(50),
        description VARCHAR(200) NOT NULL,
        type VARCHAR(20) NOT NULL,
        script VARCHAR(1000) NOT NULL,
        checksum INT,
        installed_by VARCHAR(100) NOT NULL,
        installed_on TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        execution_time INT NOT NULL,
        success TINYINT(1) NOT NULL,
        PRIMARY KEY (installed_rank),
        KEY flyway_schema_history_s_idx (success)
      ) ENGINE=InnoDB`,
    )
    return true
  }

  /** 已应用迁移：`version → checksum`（`NULL` 表示 baseline 行，Flyway 不校验它）。 */
  private async loadApplied(): Promise<Map<string, number | null>> {
    const rows = await this.query<{ version: string | null; checksum: number | null }>(
      sql`SELECT version, checksum FROM ${sql.id(HISTORY_TABLE)} WHERE success = 1`,
    )
    const out = new Map<string, number | null>()
    for (const row of rows) {
      if (row.version === null) continue
      out.set(row.version, row.checksum === null ? null : Number(row.checksum))
    }
    return out
  }

  private async applyOne(m: MigrationFile): Promise<void> {
    const startedAt = Date.now()
    const rankRows = await this.query<{ next_rank: number | null }>(
      sql`SELECT MAX(installed_rank) + 1 AS next_rank FROM ${sql.id(HISTORY_TABLE)}`,
    )
    const rank = rankRows[0]?.next_rank ?? 1

    const recordHistory = async (success: number): Promise<void> => {
      await this.query(
        sql`INSERT INTO ${sql.id(HISTORY_TABLE)}
              (installed_rank, version, description, type, script, checksum,
               installed_by, execution_time, success)
            VALUES (${rank}, ${m.version}, ${m.description}, ${'SQL'}, ${m.script},
                    ${m.checksum}, ${'node-migrator'}, ${Date.now() - startedAt}, ${success})`,
      )
    }

    try {
      for (const statement of splitStatements(m.sql)) {
        await this.query(sql.raw(statement))
      }
      await recordHistory(1)
    } catch (err) {
      await recordHistory(0)
      throw new Error(`迁移失败 ${m.script}: ${err instanceof Error ? err.message : String(err)}`, {
        cause: err,
      })
    }
  }

  /**
   * 执行一段 Kysely `sql` 片段并返回行。
   *
   * 迁移全是 DDL 与固定 DML，无法走 Kysely 的类型层，因此统一用 sql 模板。
   * 需要拼接标识符时用 sql.id()，需要插入值时必须用 ${} 占位（Kysely 会参数化），
   * **绝不手工拼字符串**。
   */
  private async query<T>(fragment: RawBuilder<unknown>): Promise<T[]> {
    const result = await fragment.execute(this.db)
    return (result.rows ?? []) as T[]
  }
}
