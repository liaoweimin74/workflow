import { Inject, Injectable } from '@nestjs/common'
import { Kysely, sql } from 'kysely'
import type { DB } from '../../../framework/database/types'
import { KYSELY } from '../../../framework/database/database.module'
import type { ColumnConfig } from '../../../common/domain/column-config'
import {
  buildAlterStatements,
  buildAlterSubTable,
  buildCreateSubTable,
  buildCreateTable,
  subTableName,
  tableName,
  validateFormKey,
  validateSubField,
  type ColumnInfo,
} from './ddl-builder'

/**
 * 动态物理表管理器（对齐 Java `com.workflow.engine.form.column.DynamicTableManager`）。
 *
 * 基于 `column_config` 创建/变更业务表单底表 `wf_biz_<formKey>`（子表 `wf_biz_<formKey>_<field>`）：
 *   - 表不存在 → 执行 `DdlBuilder` 生成的 `CREATE TABLE`；
 *   - 表已存在 → 跑差异变更（加列 / 改宽 / 改必填 / 加索引）。
 *
 * ## 为什么自己持有 information_schema 查询
 * Java 的 `DynamicTableManager` 自带 `tableExists` / `findTableColumns`，是一份**自洽**的能力。
 * Node 侧 `DataSourceRepository` 里也有一份等价查询（它对齐的正是这个方法，注释也这么写），
 * 但那份属于**数据源模块**；把两者合并会让表单模块反向依赖数据源模块的仓库，
 * 而它们对齐的是 Java 里两个不同的类。这里保持与 Java 同构：各自持有自己的内省。
 * （查询语句逐字一致，包括 `COLUMN_NAME AS name` 这类**显式别名** ——
 *  MySQL 8 的 information_schema 返回大写列名，不加别名会读到 undefined。）
 *
 * ## 为什么用 sql.raw 执行 DDL
 * DDL 无法参数化（表名/列名是标识符）。安全性由 `DdlBuilder` 的白名单正则保证：
 * 表名后缀、列名、子表字段名都必须是 `^[a-zA-Z][a-zA-Z0-9_]{0,63}$` ——
 * 任一不合法就直接抛错，**不会走到执行**。这与 Java 用 `JdbcTemplate.execute` 的信任边界相同。
 */
@Injectable()
export class DynamicTableManager {
  constructor(@Inject(KYSELY) private readonly db: Kysely<DB>) {}

  /**
   * 确保物理表存在且结构与 `column_config` 一致。
   *
   * ⚠️ 幂等：结构无变化时不执行任何 SQL（契约场景会重复发布，靠的就是这一点）。
   */
  async ensureTable(formKey: string, columns: ColumnConfig[]): Promise<void> {
    validateFormKey(formKey)
    const table = tableName(formKey)

    if (!(await this.tableExists(table))) {
      await this.execute(buildCreateTable(formKey, columns))
      return
    }
    const existing = await this.findTableColumns(table)
    const statements = buildAlterStatements(formKey, columns, existing)
    for (const statement of statements) {
      await this.execute(statement)
    }
  }

  /** 确保子表物理表存在且结构与 `subColumns` 一致。 */
  async ensureSubTable(
    formKey: string,
    field: string,
    subColumns: ColumnConfig[],
  ): Promise<void> {
    validateFormKey(formKey)
    validateSubField(field)
    const table = subTableName(formKey, field)

    if (!(await this.tableExists(table))) {
      await this.execute(buildCreateSubTable(formKey, field, subColumns))
      return
    }
    const existing = await this.findTableColumns(table)
    const statements = buildAlterSubTable(formKey, field, subColumns, existing)
    for (const statement of statements) {
      await this.execute(statement)
    }
  }

  /** 物理表是否存在。 */
  async tableExists(table: string): Promise<boolean> {
    const result = await sql<{ c: number | string }>`
      SELECT COUNT(1) AS c FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ${table}
    `.execute(this.db)
    return Number(result.rows[0]?.c ?? 0) > 0
  }

  /** 读物理表列信息。 */
  async findTableColumns(table: string): Promise<ColumnInfo[]> {
    const result = await sql<{
      name: string
      dataType: string | null
      charLength: number | string | null
      numPrecision: number | string | null
      numScale: number | string | null
      isNullable: string | null
      columnKey: string | null
    }>`
      SELECT COLUMN_NAME AS name, DATA_TYPE AS dataType,
             CHARACTER_MAXIMUM_LENGTH AS charLength, NUMERIC_PRECISION AS numPrecision,
             NUMERIC_SCALE AS numScale, IS_NULLABLE AS isNullable, COLUMN_KEY AS columnKey
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ${table}
      ORDER BY ORDINAL_POSITION
    `.execute(this.db)

    return result.rows.map((row) => {
      let length = toNullableInt(row.charLength)
      if (length === null) length = toNullableInt(row.numPrecision)
      const columnKey = row.columnKey
      return {
        key: row.name,
        columnType: normalizeColumnType(row.dataType),
        length,
        scale: toNullableInt(row.numScale),
        nullable: (row.isNullable ?? '').toUpperCase() === 'YES',
        unique: columnKey !== null && columnKey.includes('UNI'),
      }
    })
  }

  /** 执行一条 DDL（语句由 `DdlBuilder` 生成，标识符已过白名单）。 */
  private async execute(statement: string): Promise<void> {
    await sql.raw(statement).execute(this.db)
  }
}

/**
 * `information_schema.DATA_TYPE` 归一化为大写白名单类型
 * （对齐 Java `DynamicTableManager.normalizeType`）。
 */
export function normalizeColumnType(dataType: string | null): string {
  if (dataType === null) return 'UNKNOWN'
  switch (dataType.toLowerCase()) {
    case 'varchar':
      return 'VARCHAR'
    case 'text':
    case 'mediumtext':
    case 'tinytext':
      return 'TEXT'
    case 'longtext':
      return 'LONGTEXT'
    case 'int':
    case 'integer':
    case 'bigint':
    case 'smallint':
    case 'mediumint':
      return 'INT'
    case 'decimal':
    case 'numeric':
      return 'DECIMAL'
    case 'date':
      return 'DATE'
    case 'datetime':
    case 'timestamp':
      return 'DATETIME'
    case 'tinyint':
      return 'TINYINT'
    case 'json':
      return 'JSON'
    default:
      return dataType.toUpperCase()
  }
}

/**
 * 读可空整数。
 *
 * ⚠️ `LONGTEXT` 的 `CHARACTER_MAXIMUM_LENGTH` 是 4294967295，**超出 int 范围** ——
 * Java 侧 `getNullableInt` 对超范围返回 null（视为「没有固定长度」），
 * 不照抄的话 `LONGTEXT` 列会被当成"长度 4294967295"，与 column_config 一比就判为变更。
 */
function toNullableInt(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return null
  return n > 2147483647 ? null : n
}
