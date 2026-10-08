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
   * 当前租户的最大 sort_order（内联新建分类时自动排到最后）。
   * 空表返回 0，新分类 sort_order = max + 1 = 1。
   */
  async maxSortOrder(tenantId: string): Promise<number> {
    const row = await this.db
      .selectFrom('wf_category')
      .select((eb) => eb.fn.max('sort_order').as('maxSort'))
      .where('tenant_id', '=', tenantId)
      .executeTakeFirst()
    const v = row?.maxSort
    return v === null || v === undefined ? 0 : Number(v)
  }

  /**
   * 分类被流程草稿引用的数量（删除前保护：有引用时拒绝删除）。
   * 只查草稿表 `wf_process_draft`——已部署版本（wfe_process_def）的 category_id
   * 属历史快照，不阻止分类维护。
   */
  async countDraftsByCategoryId(categoryId: string): Promise<number> {
    const row = await this.db
      .selectFrom('wf_process_draft')
      .select((eb) => eb.fn.countAll<number>().as('c'))
      .where('category_id', '=', categoryId)
      .executeTakeFirst()
    return Number(row?.c ?? 0)
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
