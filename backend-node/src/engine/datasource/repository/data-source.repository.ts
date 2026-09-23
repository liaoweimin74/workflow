import { Inject, Injectable } from '@nestjs/common'
import { Kysely, sql } from 'kysely'
import { normalizeColumnType, type ColumnInfo } from '../../../common/domain/column-config'
import type { DB, WfDataSourceTable } from '../../../framework/database/types'
import { KYSELY } from '../../../framework/database/database.module'

/** 数据源行（列名与表一致，出参时由服务层改名成 Java 的驼峰）。 */
export type DataSourceRow = WfDataSourceTable

/** 分页结果：行 + 总数（Java 侧由 Spring Data `Page` 提供）。 */
export interface PagedRows<T> {
  rows: T[]
  total: number
}

/**
 * 数据源数据访问，逐条对齐 Java `DataSourceDefinitionRepository`。
 *
 * ⚠️ **刻意不写 ORDER BY**：Java 侧这几个方法用的是 `@Query`（JPQL），
 *    Spring Data **只对派生查询（方法名解析）应用排序**，带 `@Query` 的方法名里的
 *    `OrderByUpdatedAtDesc` 会被忽略，落到 SQL 上并没有 ORDER BY，顺序由 MySQL 决定。
 *    这里保持一致 —— 自己加排序反而会和 Java 分叉。
 *    （`golden` 里 `$.data.content` 只比形状，`/enabled` 的数组顺序才是硬约束。）
 */
@Injectable()
export class DataSourceRepository {
  constructor(@Inject(KYSELY) private readonly db: Kysely<DB>) {}

  /** 当前租户的数据源 + SYSTEM 类型（跨租户可见）。 */
  async findByAccessibleTenant(
    tenantId: string,
    type: string | null,
    status: string | null,
    offset: number,
    limit: number,
  ): Promise<PagedRows<DataSourceRow>> {
    const base = this.db
      .selectFrom('wf_data_source')
      .where((eb) => eb.or([eb('tenant_id', '=', tenantId), eb('type', '=', 'SYSTEM')]))

    let filtered = base
    if (type !== null) filtered = filtered.where('type', '=', type)
    if (status !== null) filtered = filtered.where('status', '=', status)

    const rows = await filtered.selectAll().limit(limit).offset(offset).execute()
    const countRow = await filtered.select((eb) => eb.fn.countAll<number>().as('c')).executeTakeFirst()
    return { rows, total: Number(countRow?.c ?? 0) }
  }

  /** 仅已启用数据源；SYSTEM 类型跨租户可见。 */
  async findByStatusAndAccessibleTenant(
    status: string,
    tenantId: string,
  ): Promise<DataSourceRow[]> {
    return this.db
      .selectFrom('wf_data_source')
      .selectAll()
      .where('status', '=', status)
      .where((eb) => eb.or([eb('tenant_id', '=', tenantId), eb('type', '=', 'SYSTEM')]))
      .execute()
  }

  /**
   * 按 id 取数据源，SYSTEM 类型跨租户可见。
   * 对齐 Java `findByIdAccessible`：`WHERE id = ? AND (tenant_id = ? OR type = 'SYSTEM')`。
   */
  async findByIdAccessible(id: string, tenantId: string): Promise<DataSourceRow | null> {
    const row = await this.db
      .selectFrom('wf_data_source')
      .selectAll()
      .where('id', '=', id)
      .where((eb) => eb.or([eb('tenant_id', '=', tenantId), eb('type', '=', 'SYSTEM')]))
      .executeTakeFirst()
    return row ?? null
  }

  // ------------------------------------------- 表单事件驱动的数据源同步（写）

  /**
   * 按租户 + formKey 找数据源（对齐 Java `findByTenantIdAndFormKey`）。
   *
   * ⚠️ 与 `findByIdAccessible` 不同：这里**没有** `OR type = 'SYSTEM'` 那一段。
   *    同步监听器用的就是这一个 —— 两个查询不能互相替换。
   */
  async findByTenantIdAndFormKey(
    tenantId: string,
    formKey: string,
  ): Promise<DataSourceRow | null> {
    const row = await this.db
      .selectFrom('wf_data_source')
      .selectAll()
      .where('tenant_id', '=', tenantId)
      .where('form_key', '=', formKey)
      .executeTakeFirst()
    return row ?? null
  }

  /** 插入数据源（表单事件同步用）。 */
  async insertDataSource(row: DataSourceRow): Promise<void> {
    await this.db.insertInto('wf_data_source').values(row).execute()
  }

  /** 只改名称（同步时表单改名要跟着改数据源名）。 */
  async updateDataSourceName(id: string, name: string, updatedAt: Date): Promise<void> {
    await this.db
      .updateTable('wf_data_source')
      .set({ name, updated_at: updatedAt })
      .where('id', '=', id)
      .execute()
  }

  /** **硬删除**数据源（对齐 Java 的 `dsRepository.delete(ds)` —— 不是软删除）。 */
  async deleteDataSource(id: string): Promise<void> {
    await this.db.deleteFrom('wf_data_source').where('id', '=', id).execute()
  }

  // ------------------------------------------- 数据源 CRUD（写）

  /**
   * 按 id 取（**带租户条件，不含 SYSTEM 跨租户**）。
   *
   * ⚠️ 与 `findByIdAccessible` 的区别：Java 的 `create/update/enable/disable/delete`
   *    走的是 `getById(id)` → `findByIdAccessible`（**含** SYSTEM 跨租户），
   *    而这个方法只按租户取。CRUD 路径要用 `findByIdAccessible`，别用错。
   */
  async findByIdAndTenantId(id: string, tenantId: string): Promise<DataSourceRow | null> {
    const row = await this.db
      .selectFrom('wf_data_source')
      .selectAll()
      .where('id', '=', id)
      .where('tenant_id', '=', tenantId)
      .executeTakeFirst()
    return row ?? null
  }

  /** 租户内名称是否已存在（对齐 `existsByTenantIdAndName`）。 */
  async existsByTenantIdAndName(tenantId: string, name: string): Promise<boolean> {
    const row = await this.db
      .selectFrom('wf_data_source')
      .select('id')
      .where('tenant_id', '=', tenantId)
      .where('name', '=', name)
      .executeTakeFirst()
    return row !== undefined
  }

  /** 租户内 sourceKey 是否已存在（对齐 `existsByTenantIdAndSourceKey`）。 */
  async existsByTenantIdAndSourceKey(
    tenantId: string,
    sourceKey: string,
  ): Promise<boolean> {
    const row = await this.db
      .selectFrom('wf_data_source')
      .select('id')
      .where('tenant_id', '=', tenantId)
      .where('source_key', '=', sourceKey)
      .executeTakeFirst()
    return row !== undefined
  }

  /** 插入（CRUD 用；与 `insertDataSource` 是同一个动作，只是命名区分调用来源）。 */
  async insertDefinition(row: DataSourceRow): Promise<void> {
    await this.db.insertInto('wf_data_source').values(row).execute()
  }

  /** 整行更新（对齐 JPA 的 `save`：把实体全部字段写回）。 */
  async replaceDefinition(
    id: string,
    patch: Partial<DataSourceRow>,
    updatedAt: Date,
  ): Promise<void> {
    await this.db
      .updateTable('wf_data_source')
      .set({ ...patch, updated_at: updatedAt })
      .where('id', '=', id)
      .execute()
  }

  /**
   * 物理表列信息（information_schema.COLUMNS）。
   *
   * ⚠️ 与 `listTableNames` 同理：MySQL 8 的 information_schema 列名在结果集里是大写，
   *    必须显式起别名。
   *
   * ⚠️ `LONGTEXT` 的 `CHARACTER_MAXIMUM_LENGTH` 是 4294967295，**超出 int 范围**；
   *    Java 侧 `getNullableInt` 遇到超界值返回 null（语义：「没有固定长度」）。
   *    这里照做 —— 直接返回 4294967295 会让契约在 longtext 列上直接不符。
   */
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

  /**
   * 当前库全部基础表名（排除信息架构之外的表由调用方过滤）。
   *
   * ⚠️ MySQL 8 的 information_schema 列名在结果集里是**大写**的，
   *    必须显式 `AS name` 起别名，否则 mysql2 给出的键是 `TABLE_NAME`，
   *    上层取 `row.name` 会拿到 undefined（实测踩到过）。
   */
  async listTableNames(): Promise<string[]> {
    const result = await sql<{ name: string }>`
      SELECT TABLE_NAME AS name FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE'
      ORDER BY TABLE_NAME
    `.execute(this.db)
    return result.rows.map((r) => r.name)
  }
}

/** 对齐 Java `DynamicTableManager.getNullableInt`：超 int 范围返回 null。 */
function toNullableInt(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return null
  return n > 2147483647 ? null : n
}
