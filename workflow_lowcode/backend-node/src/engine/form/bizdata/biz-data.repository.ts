import { Inject, Injectable } from '@nestjs/common'
import { Kysely, sql, type RawBuilder } from 'kysely'
import type { DB } from '../../../framework/database/types'
import { KYSELY } from '../../../framework/database/database.module'

/** 一行业务数据（列名 → 值）。 */
export type BizRow = Record<string, unknown>

/**
 * 业务数据的裸 SQL 访问层。
 *
 * 业务表名是**运行期从 formKey 推导**的（`wf_biz_<key>`），Kysely 的静态 `DB`
 * 类型映射不到它们，所以这里只能用片段查询。片段里的表名/列名由
 * `sql.table()` / `sql.ref()` 承载，值由 Kysely 绑定 —— 见 `biz-data-query-builder.ts`
 * 顶部的安全模型说明。
 */
@Injectable()
export class BizDataRepository {
  constructor(@Inject(KYSELY) private readonly db: Kysely<DB>) {}

  /** 物理表是否存在（对齐 Java `DynamicTableManager.tableExists`）。 */
  async tableExists(tableName: string): Promise<boolean> {
    const result = await sql<{ c: number | string }>`
      SELECT COUNT(1) AS c FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ${tableName}
    `.execute(this.db)
    return Number(result.rows[0]?.c ?? 0) > 0
  }

  /**
   * 执行 SELECT，返回全部行。
   *
   * ⚠️ Kysely 的 `execute()` 会对结果集做一次浅拷贝（`{...row}`），
   *    mysql2 给的正是普通对象，所以列名大小写原样保留 —— `SELECT *` 出来的
   *    列名与库里一致（MySQL 存的是小写），`toVO` 才能按 column_config 的 key 取值。
   */
  async selectRows(fragment: RawBuilder<unknown>): Promise<BizRow[]> {
    const result = await fragment.execute(this.db)
    return result.rows as BizRow[]
  }

  /** 执行 COUNT 查询，返回数值。计数查询必须带 `AS total` 别名。 */
  async selectCount(fragment: RawBuilder<unknown>): Promise<number> {
    const rows = await this.selectRows(fragment)
    return Number(rows[0]?.total ?? 0)
  }

  // ==================== 写路径 ====================

  /** 执行一条写语句（INSERT/UPDATE/DELETE），返回**受影响行数**。 */
  async executeWrite(fragment: RawBuilder<unknown>): Promise<number> {
    const result = await fragment.execute(this.db)
    return Number(result.numAffectedRows ?? 0)
  }

  /** 主表行是否存在（`updateGeneric` 用它区分 404 与 409）。 */
  async rowExists(tableName: string, tenantId: string, id: string): Promise<boolean> {
    const result = await sql<{ c: number | string }>`
      SELECT COUNT(1) AS c FROM ${sql.table(tableName)}
      WHERE id = ${id} AND tenant_id = ${tenantId}
    `.execute(this.db)
    return Number(result.rows[0]?.c ?? 0) > 0
  }

  /** 插入一行子表数据（`id/biz_id/tenant_id/sort_no/version` + 子业务列）。 */
  async insertSubRow(
    tableName: string,
    subKeys: string[],
    rowId: string,
    bizId: string,
    tenantId: string,
    sortNo: number,
    row: Record<string, unknown>,
  ): Promise<void> {
    const columns: RawBuilder<unknown>[] = [
      sql`id`,
      sql`biz_id`,
      sql`tenant_id`,
      sql`sort_no`,
      sql`version`,
    ]
    const values: unknown[] = [rowId, bizId, tenantId, sortNo, 1]
    for (const key of subKeys) {
      columns.push(sql.ref(key))
      values.push(row[key] ?? null)
    }
    await sql`INSERT INTO ${sql.table(tableName)} (${sql.join(columns, sql`, `)})
              VALUES (${sql.join(
                values.map((v) => sql`${v}`),
                sql`, `,
              )})`.execute(this.db)
  }

  /**
   * 更新独立子表行（乐观锁：`WHERE tenant_id AND biz_id AND id AND version`）。
   * 返回受影响行数，供调用方判断 409。
   */
  async updateSubRow(
    tableName: string,
    values: Record<string, unknown>,
    tenantId: string,
    bizId: string,
    rowId: string,
    version: number,
  ): Promise<number> {
    const assignments: RawBuilder<unknown>[] = Object.entries(values).map(
      ([key, value]) => sql`${sql.ref(key)} = ${value}`,
    )
    assignments.push(sql`version = version + 1`, sql`updated_at = NOW()`)
    const result = await sql`UPDATE ${sql.table(tableName)} SET ${sql.join(assignments, sql`, `)}
      WHERE tenant_id = ${tenantId} AND biz_id = ${bizId} AND id = ${rowId} AND version = ${version}`.execute(
      this.db,
    )
    return Number(result.numAffectedRows ?? 0)
  }

  /**
   * 全量覆盖一行子表数据（`diffSubRows` 的更新分支）。
   *
   * ⚠️ 与 `updateSubRow` 的差别：**不带乐观锁**（`WHERE` 只有 tenant/biz/id），
   *    而且会把**所有**子业务列都写一遍（包括入参里没有的、写成 null 的），
   *    再额外写 `sort_no` —— 这正是 Java `diffSubRows` 里那段 UPDATE 的语义。
   */
  async updateSubRowFull(
    tableName: string,
    subKeys: string[],
    row: Record<string, unknown>,
    sortNo: number,
    tenantId: string,
    bizId: string,
    rowId: string,
  ): Promise<void> {
    const assignments: RawBuilder<unknown>[] = subKeys.map(
      (key) => sql`${sql.ref(key)} = ${row[key] ?? null}`,
    )
    assignments.push(sql`sort_no = ${sortNo}`)
    await sql`UPDATE ${sql.table(tableName)} SET ${sql.join(assignments, sql`, `)}
      WHERE tenant_id = ${tenantId} AND biz_id = ${bizId} AND id = ${rowId}`.execute(this.db)
  }

  /** 删除单行子表数据。 */
  async deleteSubRow(
    tableName: string,
    tenantId: string,
    bizId: string,
    rowId: string,
  ): Promise<void> {
    await sql`DELETE FROM ${sql.table(tableName)}
      WHERE tenant_id = ${tenantId} AND biz_id = ${bizId} AND id = ${rowId}`.execute(this.db)
  }

  /** 删除某个主表行下的**全部**子表行（`deleteGeneric` 的级联删除）。 */
  async deleteSubRows(tableName: string, tenantId: string, bizId: string): Promise<void> {
    await sql`DELETE FROM ${sql.table(tableName)}
      WHERE tenant_id = ${tenantId} AND biz_id = ${bizId}`.execute(this.db)
  }

  /** 按 id 批量删除子表行（`diffSubRows` 的删除分支）。 */
  async deleteSubRowIds(
    tableName: string,
    tenantId: string,
    bizId: string,
    rowIds: string[],
  ): Promise<void> {
    if (rowIds.length === 0) return
    await sql`DELETE FROM ${sql.table(tableName)}
      WHERE tenant_id = ${tenantId} AND biz_id = ${bizId}
        AND id IN (${sql.join(
          rowIds.map((id) => sql`${id}`),
          sql`, `,
        )})`.execute(this.db)
  }
}
