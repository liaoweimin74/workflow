import { Inject, Injectable } from '@nestjs/common'
import { Kysely } from 'kysely'
import type { DB, WfFormDefTable } from '../../../framework/database/types'
import { KYSELY } from '../../../framework/database/database.module'
import type { PagedRows } from '../../datasource/repository/data-source.repository'

/** 表单定义行（列名与表一致，出参时由服务层改名成 Java 的驼峰）。 */
export type FormDefinitionRow = WfFormDefTable

/** 表单定义列表过滤条件。null 表示该维度不过滤（对齐 Java 的 `isBlank` 判定）。 */
export interface FormDefinitionFilter {
  status: string | null
  name: string | null
  type: string | null
}

/**
 * 表单定义数据访问，对齐 Java `FormDefinitionRepository` 的派生查询。
 *
 * 与 `PageDefinitionRepository` 同构：派生查询 → 真 ORDER BY updated_at DESC。
 * 这里**刻意不做**「抽公共分页查询」的抽象 —— 两个模块目前形状相同，
 * 但一旦某个模块改了 Java 侧的查询方式（例如改用 `@Query`，排序会被丢掉），
 * 共用抽象就会把这种差异抹平。宁可重复几行。
 */
@Injectable()
export class FormDefinitionRepository {
  constructor(@Inject(KYSELY) private readonly db: Kysely<DB>) {}

  /** 分页查询（tenant + 可选 status/name/type），按 updated_at 倒序。 */
  async findPage(
    tenantId: string,
    filter: FormDefinitionFilter,
    offset: number,
    limit: number,
  ): Promise<PagedRows<FormDefinitionRow>> {
    let rowsQuery = this.db.selectFrom('wf_form_def').where('tenant_id', '=', tenantId)
    let countQuery = this.db.selectFrom('wf_form_def').where('tenant_id', '=', tenantId)

    if (filter.name !== null) {
      rowsQuery = rowsQuery.where('name', 'like', `%${filter.name}%`)
      countQuery = countQuery.where('name', 'like', `%${filter.name}%`)
    }
    if (filter.status !== null) {
      rowsQuery = rowsQuery.where('status', '=', filter.status)
      countQuery = countQuery.where('status', '=', filter.status)
    }
    if (filter.type !== null) {
      rowsQuery = rowsQuery.where('type', '=', filter.type)
      countQuery = countQuery.where('type', '=', filter.type)
    }

    const rows = await rowsQuery
      .selectAll()
      .orderBy('updated_at', 'desc')
      .limit(limit)
      .offset(offset)
      .execute()

    const countRow = await countQuery
      .select((eb) => eb.fn.countAll<number>().as('c'))
      .executeTakeFirst()

    return { rows, total: Number(countRow?.c ?? 0) }
  }

  /** 按 id 取表单定义（租户内）；不存在返回 null。 */
  async findByIdAndTenantId(id: string, tenantId: string): Promise<FormDefinitionRow | null> {
    const row = await this.db
      .selectFrom('wf_form_def')
      .selectAll()
      .where('id', '=', id)
      .where('tenant_id', '=', tenantId)
      .executeTakeFirst()
    return row ?? null
  }

  /** 按 key 取最新版本（version 倒序取第一条）。 */
  async findLatestByKey(key: string, tenantId: string): Promise<FormDefinitionRow | null> {
    const row = await this.db
      .selectFrom('wf_form_def')
      .selectAll()
      .where('tenant_id', '=', tenantId)
      .where('key', '=', key)
      .orderBy('version', 'desc')
      .limit(1)
      .executeTakeFirst()
    return row ?? null
  }

  /**
   * 按 key 取**已发布**的最新版本（version 倒序取第一条）。
   *
   * ⚠️ 与 `findLatestByKey` 的区别不是可有可无：业务表单的列映射必须来自
   *    **已发布**版本（`getBusinessColumnsByKey`），草稿版本的列随时可能变。
   *    Java 侧是 `findFirstByTenantIdAndKeyAndStatusOrderByVersionDesc(tenantId, key, "PUBLISHED")`。
   */
  async findLatestPublishedByKey(
    key: string,
    tenantId: string,
  ): Promise<FormDefinitionRow | null> {
    const row = await this.db
      .selectFrom('wf_form_def')
      .selectAll()
      .where('tenant_id', '=', tenantId)
      .where('key', '=', key)
      .where('status', '=', 'PUBLISHED')
      .orderBy('version', 'desc')
      .limit(1)
      .executeTakeFirst()
    return row ?? null
  }

  /** 按 key 取全部版本（version 倒序）。 */
  async findAllVersionsByKey(key: string, tenantId: string): Promise<FormDefinitionRow[]> {    return this.db
      .selectFrom('wf_form_def')
      .selectAll()
      .where('tenant_id', '=', tenantId)
      .where('key', '=', key)
      .orderBy('version', 'desc')
      .execute()
  }

  /**
   * 按 key 取「最新的已发布版本」，**排除指定 id**。
   *
   * 用途只有一个：**重新发布**时的「schema 是否变化」比对 —— 当前记录自己已经是
   * PUBLISHED，不排除它就会与自己比、恒等，于是永远报「无需发布」。
   * 对齐 Java 的 `findFirstByTenantIdAndKeyAndStatusAndIdNotOrderByVersionDesc`。
   */
  async findLatestPublishedByKeyExcluding(
    key: string,
    tenantId: string,
    excludeId: string,
  ): Promise<FormDefinitionRow | null> {
    const row = await this.db
      .selectFrom('wf_form_def')
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

  /** 按 key + version 取单个版本。 */
  async findByKeyAndVersion(
    key: string,
    version: number,
    tenantId: string,
  ): Promise<FormDefinitionRow | null> {
    const row = await this.db
      .selectFrom('wf_form_def')
      .selectAll()
      .where('tenant_id', '=', tenantId)
      .where('key', '=', key)
      .where('version', '=', version)
      .executeTakeFirst()
    return row ?? null
  }

  /**
   * key 是否已存在（对齐 Java `existsByTenantIdAndKey`）。
   *
   * ⚠️ **不带 status / is_deleted 条件** —— 于是「已归档的表单仍会挡住同名新建」。
   *    `wf_form_def` 也没有逻辑删除列（删除是把 status 改成 ARCHIVED），所以这里
   *    连软删除都不用考虑。
   */
  async existsByKey(key: string, tenantId: string): Promise<boolean> {
    const row = await this.db
      .selectFrom('wf_form_def')
      .select('id')
      .where('tenant_id', '=', tenantId)
      .where('key', '=', key)
      .executeTakeFirst()
    return row !== undefined
  }

  /** 插入表单定义。 */
  async insert(row: FormDefinitionRow): Promise<void> {
    await this.db.insertInto('wf_form_def').values(row).execute()
  }

  /** 局部更新（`updated_at` 由调用方给）。 */
  async update(id: string, patch: Partial<FormDefinitionRow>): Promise<void> {
    await this.db.updateTable('wf_form_def').set(patch).where('id', '=', id).execute()
  }
}
