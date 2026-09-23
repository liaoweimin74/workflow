import { Inject, Injectable } from '@nestjs/common'
import { Kysely } from 'kysely'
import type { DB, WfPageDefTable } from '../../../framework/database/types'
import { KYSELY } from '../../../framework/database/database.module'
import type { PagedRows } from '../../datasource/repository/data-source.repository'

/** 页面定义行（列名与表一致，出参时由服务层改名成 Java 的驼峰）。 */
export type PageDefinitionRow = WfPageDefTable

/** 页面定义列表的过滤条件。null 表示该维度不过滤（对齐 Java 的 `isBlank` 判定）。 */
export interface PageDefinitionFilter {
  status: string | null
  name: string | null
  type: string | null
  /**
   * 按引用的数据源过滤（可选）。
   *
   * 用途只有一个：`DELETE /api/v1/data-sources/{id}` 的引用统计要看
   * 「有多少页面绑了这个数据源」。null / 缺省表示不过滤。
   */
  dataSourceId?: string | null
}

/**
 * 页面定义数据访问，对齐 Java `PageDefinitionRepository` 的派生查询。
 *
 * ⚠️ 与 `DataSourceRepository` 不同，这里的排序是**真的**有 ORDER BY：
 *    Java 侧全是 Spring Data 派生查询（方法名解析），`OrderByUpdatedAtDesc` 会落到 SQL。
 *    两个模块的写法不同不是疏忽 —— 一边是 `@Query`、一边是派生查询，必须分别照抄。
 */
@Injectable()
export class PageDefinitionRepository {
  constructor(@Inject(KYSELY) private readonly db: Kysely<DB>) {}

  /** 分页查询（tenant + 可选 status/name/type），按 updated_at 倒序。 */
  async findPage(
    tenantId: string,
    filter: PageDefinitionFilter,
    offset: number,
    limit: number,
  ): Promise<PagedRows<PageDefinitionRow>> {
    let query = this.db.selectFrom('wf_page_def').where('tenant_id', '=', tenantId)
    if (filter.name !== null) query = query.where('name', 'like', `%${filter.name}%`)
    if (filter.status !== null) query = query.where('status', '=', filter.status)
    if (filter.type !== null) query = query.where('type', '=', filter.type)
    if (filter.dataSourceId !== null && filter.dataSourceId !== undefined) {
      query = query.where('data_source_id', '=', filter.dataSourceId)
    }

    const rows = await query
      .selectAll()
      .orderBy('updated_at', 'desc')
      .limit(limit)
      .offset(offset)
      .execute()

    // count 查询不能带 orderBy/limit/offset，必须另起一条链
    let countQuery = this.db.selectFrom('wf_page_def').where('tenant_id', '=', tenantId)
    if (filter.name !== null) countQuery = countQuery.where('name', 'like', `%${filter.name}%`)
    if (filter.status !== null) countQuery = countQuery.where('status', '=', filter.status)
    if (filter.type !== null) countQuery = countQuery.where('type', '=', filter.type)
    if (filter.dataSourceId !== null && filter.dataSourceId !== undefined) {
      countQuery = countQuery.where('data_source_id', '=', filter.dataSourceId)
    }

    const countRow = await countQuery
      .select((eb) => eb.fn.countAll<number>().as('c'))
      .executeTakeFirst()

    return { rows, total: Number(countRow?.c ?? 0) }
  }

  /** 按 id 取页面定义（租户内）；不存在返回 null。 */
  async findByIdAndTenantId(id: string, tenantId: string): Promise<PageDefinitionRow | null> {
    const row = await this.db
      .selectFrom('wf_page_def')
      .selectAll()
      .where('id', '=', id)
      .where('tenant_id', '=', tenantId)
      .executeTakeFirst()
    return row ?? null
  }

  /**
   * 按 key 取**已发布**的最新版本（version 倒序取第一条）。
   * 对齐 Java `findFirstByTenantIdAndKeyAndStatusOrderByVersionDesc`。
   */
  async findPublishedByKey(key: string, tenantId: string): Promise<PageDefinitionRow | null> {
    const row = await this.db
      .selectFrom('wf_page_def')
      .selectAll()
      .where('tenant_id', '=', tenantId)
      .where('key', '=', key)
      .where('status', '=', 'PUBLISHED')
      .orderBy('version', 'desc')
      .limit(1)
      .executeTakeFirst()
    return row ?? null
  }

  // ==================== 写路径 ====================

  /**
   * 租户内 key 是否已存在（对齐 Java `existsByTenantIdAndKey`）。
   *
   * ⚠️ **不过滤 status** —— 软删除（ARCHIVED）的行照样占着 key。
   *    照抄这条：加上 `status <> 'ARCHIVED'` 会让「删掉后用同一个 key 重建」变得可行，
   *    而 Java 侧是 400「页面 key 已存在」。
   */
  async existsByTenantIdAndKey(tenantId: string, key: string): Promise<boolean> {
    const row = await this.db
      .selectFrom('wf_page_def')
      .select('id')
      .where('tenant_id', '=', tenantId)
      .where('key', '=', key)
      .executeTakeFirst()
    return row !== undefined
  }

  /** 按 id 取并加行锁（对齐 Java `findByIdForUpdate` 的 `PESSIMISTIC_WRITE`）。 */
  async findByIdForUpdate(id: string, tenantId: string): Promise<PageDefinitionRow | null> {
    const row = await this.db
      .selectFrom('wf_page_def')
      .selectAll()
      .where('id', '=', id)
      .where('tenant_id', '=', tenantId)
      .forUpdate()
      .executeTakeFirst()
    return row ?? null
  }

  /**
   * 同 key 的最新已发布版本，**排除指定 id**（对齐 Java
   * `findFirstByTenantIdAndKeyAndStatusAndIdNotOrderByVersionDesc`）。
   *
   * 用途只有一个：发布时与自己比较会让「内容未变化」恒成立，所以要把自己排除掉。
   */
  async findPublishedByKeyExcluding(
    tenantId: string,
    key: string,
    excludeId: string,
  ): Promise<PageDefinitionRow | null> {
    const row = await this.db
      .selectFrom('wf_page_def')
      .selectAll()
      .where('tenant_id', '=', tenantId)
      .where('key', '=', key)
      .where('status', '=', 'PUBLISHED')
      .where('id', '!=', excludeId)
      .orderBy('version', 'desc')
      .limit(1)
      .executeTakeFirst()
    return row ?? null
  }

  /** 按 key 取最新版本（不限状态；对齐 `findFirstByTenantIdAndKeyOrderByVersionDesc`）。 */
  async findLatestByKey(tenantId: string, key: string): Promise<PageDefinitionRow | null> {
    const row = await this.db
      .selectFrom('wf_page_def')
      .selectAll()
      .where('tenant_id', '=', tenantId)
      .where('key', '=', key)
      .orderBy('version', 'desc')
      .limit(1)
      .executeTakeFirst()
    return row ?? null
  }

  /** 插入一条页面定义（`create` 用）。 */
  async insert(row: PageDefinitionRow): Promise<void> {
    await this.db.insertInto('wf_page_def').values(row).execute()
  }

  /**
   * 原地保存（`update` / `publish` / `delete` 用，对齐 JPA 的 `save` 语义）。
   *
   * ⚠️ 只更新 JPA 实体上被 setter 改过的那些列 + `updated_at`，
   *    **不动** `created_at` / `created_by` / `tenant_id` / `version` ——
   *    Java 侧 `update`/`publish`/`delete` 都不改 `version`（`publish` 只写
   *    `published_version`），照抄。
   */
  async save(row: PageDefinitionRow, now: Date): Promise<void> {
    await this.db
      .updateTable('wf_page_def')
      .set({
        name: row.name,
        key: row.key,
        type: row.type,
        form_key: row.form_key,
        data_source_id: row.data_source_id,
        schema: row.schema,
        status: row.status,
        published_version: row.published_version,
        updated_at: now,
      })
      .where('id', '=', row.id)
      .execute()
  }
}
