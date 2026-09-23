import { Inject, Injectable } from '@nestjs/common'
import { Kysely } from 'kysely'
import type { DB, WfCategoryTable } from '../../../framework/database/types'
import { KYSELY } from '../../../framework/database/database.module'

/** 分类行（列名与表一致，出参时由服务层改名成 Java 的驼峰）。 */
export type CategoryRow = WfCategoryTable

/** 流程分类数据访问（对齐 Java `CategoryRepository`）。 */
@Injectable()
export class CategoryRepository {
  constructor(@Inject(KYSELY) private readonly db: Kysely<DB>) {}

  /**
   * 租户下的全部分类，按 sort_order 升序。
   *
   * ⚠️ MySQL 的 `ORDER BY` 对 NULL 排在最前（升序），Java 侧同样是 MySQL，
   *    所以这里不带 `NULLS LAST` 之类的修饰 —— 加了就分叉。
   */
  async findByTenantIdOrderBySortOrderAsc(tenantId: string): Promise<CategoryRow[]> {
    return this.db
      .selectFrom('wf_category')
      .selectAll()
      .where('tenant_id', '=', tenantId)
      .orderBy('sort_order', 'asc')
      .execute()
  }

  /** 按 id 取（不带租户条件；租户校验由调用方做，对齐 Java `findById` + filter）。 */
  async findById(id: string): Promise<CategoryRow | null> {
    const row = await this.db
      .selectFrom('wf_category')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst()
    return row ?? null
  }

  /**
   * 某分类的直接子分类（对齐 Java `findByParentId`）。
   *
   * ⚠️ Java 这里**不带租户条件** —— 删除前的「有子分类则拒绝」检查是跨租户的。
   *    看着像缺陷，但照抄：自行加租户条件会让两个后端在跨租户数据下分叉。
   */
  async findByParentId(parentId: string): Promise<CategoryRow[]> {
    return this.db
      .selectFrom('wf_category')
      .selectAll()
      .where('parent_id', '=', parentId)
      .execute()
  }

  /** 插入。 */
  async insert(row: CategoryRow): Promise<void> {
    await this.db.insertInto('wf_category').values(row).execute()
  }

  /** 局部更新。 */
  async update(id: string, patch: Partial<CategoryRow>): Promise<void> {
    await this.db.updateTable('wf_category').set(patch).where('id', '=', id).execute()
  }

  /** 删除。 */
  async deleteById(id: string): Promise<void> {
    await this.db.deleteFrom('wf_category').where('id', '=', id).execute()
  }
}
