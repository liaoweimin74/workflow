import { Inject, Injectable } from '@nestjs/common'
import { Kysely } from 'kysely'
import { KYSELY } from '../../framework/database/database.module'
import type { DB } from '../../framework/database/types'

/**
 * 客户端（sys_client / sys_client_channel）数据访问。
 *
 * ⚠️ 约定：本仓储**不做任何加解密**，config_json 原样存取。
 *   secret 的加解密只在 service 边界发生（对齐简报「加密只发生在 service 边界」）。
 *
 * Kysely 用法对齐 system.repository.ts（selectFrom / insertInto / where 组合）。
 * 渠道 upsert 用 MySQL 的 `onDuplicateKeyUpdate()`（Kysely 的 `onConflict().doUpdateSet()`
 *   会编译成 Postgres 的 `ON CONFLICT ... DO UPDATE`，MySQL 直接语法报错；
 *   `on duplicate key update` 命中 uk_client_channel 唯一键即更新）。
 */

/** 客户端主表行（camel 列名映射到 VO 在 service 层做）。 */
export interface ClientRow {
  id: number
  code: string
  name: string
  icon: string | null
  status: number
  default_role_id: number | null
  default_member_group_id: number | null
}

/** 客户端渠道行（config_json 为原文，secret 字段可能是密文——由 service 处理）。 */
export interface ClientChannelRow {
  client_id: number
  channel_type: string
  enabled: number
  config_json: string | null
}

/** options 扁平行：一个「客户端 × 已开通渠道」一行，无渠道时 channelType 为 null。 */
export interface ClientOptionRow {
  id: number
  code: string
  name: string
  status: number
  channelType: string | null
}

/** 分页过滤条件。 */
export interface ClientFilter {
  keyword?: string | null
  status?: number | null
}

@Injectable()
export class ClientRepository {
  constructor(@Inject(KYSELY) private readonly db: Kysely<DB>) {}

  // ------------------------------------------------------------ 客户端（读）

  async listPage(offset: number, limit: number, filter: ClientFilter): Promise<{ rows: ClientRow[]; total: number }> {
    const keyword = filter.keyword ?? null
    const status = filter.status ?? null

    let rowsQuery = this.db.selectFrom('sys_client').selectAll()
    let countQuery = this.db
      .selectFrom('sys_client')
      .select((eb) => eb.fn.countAll<number>().as('c'))

    if (keyword !== null) {
      const pattern = `%${keyword}%`
      rowsQuery = rowsQuery.where((eb) =>
        eb.or([eb('name', 'like', pattern), eb('code', 'like', pattern)]),
      )
      countQuery = countQuery.where((eb) =>
        eb.or([eb('name', 'like', pattern), eb('code', 'like', pattern)]),
      )
    }
    if (status !== null) {
      rowsQuery = rowsQuery.where('status', '=', status)
      countQuery = countQuery.where('status', '=', status)
    }

    const rows = await rowsQuery.orderBy('id', 'asc').limit(limit).offset(offset).execute()
    const countRow = await countQuery.executeTakeFirst()
    return { rows: rows as unknown as ClientRow[], total: Number(countRow?.c ?? 0) }
  }

  async findClientById(id: number): Promise<ClientRow | null> {
    const row = await this.db
      .selectFrom('sys_client')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst()
    return (row as unknown as ClientRow | undefined) ?? null
  }

  /** code 是否被占用（唯一键 uk_client_code）。 */
  async codeExists(code: string, excludeId?: number): Promise<boolean> {
    let query = this.db.selectFrom('sys_client').select('id').where('code', '=', code)
    if (excludeId !== undefined) query = query.where('id', '!=', excludeId)
    const row = await query.executeTakeFirst()
    return row !== undefined
  }

  /** 批量取渠道（列表/详情组装用），按 channel_type 升序稳定输出。 */
  async listChannelsByClientIds(clientIds: number[]): Promise<ClientChannelRow[]> {
    const ids = [...new Set(clientIds)]
    if (ids.length === 0) return []
    const rows = await this.db
      .selectFrom('sys_client_channel')
      .select(['client_id', 'channel_type', 'enabled', 'config_json'])
      .where('client_id', 'in', ids)
      .orderBy('channel_type', 'asc')
      .execute()
    return rows as ClientChannelRow[]
  }

  async findChannel(clientId: number, channelType: string): Promise<ClientChannelRow | null> {
    const row = await this.db
      .selectFrom('sys_client_channel')
      .select(['client_id', 'channel_type', 'enabled', 'config_json'])
      .where('client_id', '=', clientId)
      .where('channel_type', '=', channelType)
      .executeTakeFirst()
    return row ?? null
  }

  /** options 全量（含停用端；LEFT JOIN 已开通渠道）。 */
  async listOptions(): Promise<ClientOptionRow[]> {
    const rows = await this.db
      .selectFrom('sys_client as c')
      .leftJoin('sys_client_channel as ch', (join) =>
        join.onRef('ch.client_id', '=', 'c.id').on('ch.enabled', '=', 1),
      )
      .select(['c.id', 'c.code', 'c.name', 'c.status', 'ch.channel_type as channelType'])
      .orderBy('c.id', 'asc')
      .execute()
    return rows as unknown as ClientOptionRow[]
  }

  // ------------------------------------------------------------ 角色（只读，defaultRoleId 归属校验用）

  /**
   * 角色摘要（V52 后 sys_role 带 client_id）。
   * ClientService 校验「注册默认角色必须属于本端」（tasks 3.3）用的最小查询。
   */
  async findRoleBrief(roleId: number): Promise<{ id: number; client_id: number } | null> {
    const row = await this.db
      .selectFrom('sys_role')
      .select(['id', 'client_id'])
      .where('id', '=', roleId)
      .executeTakeFirst()
    return row ?? null
  }

  // ------------------------------------------------------------ 客户端（写）

  async insertClient(row: {
    code: string
    name: string
    icon: string | null
    status: number
    default_role_id: number | null
    default_member_group_id: number | null
  }): Promise<number> {
    const result = await this.db
      .insertInto('sys_client')
      .values({ ...row, created_at: new Date(), updated_at: new Date() })
      .executeTakeFirst()
    return Number(result.insertId)
  }

  async updateClient(id: number, patch: Partial<ClientRow>): Promise<void> {
    await this.db
      .updateTable('sys_client')
      .set({ ...patch, updated_at: new Date() })
      .where('id', '=', id)
      .execute()
  }

  async updateStatus(id: number, status: number): Promise<void> {
    await this.db
      .updateTable('sys_client')
      .set({ status, updated_at: new Date() })
      .where('id', '=', id)
      .execute()
  }

  /** 渠道开通矩阵 upsert（依赖 uk_client_channel 唯一键）。 */
  async upsertChannel(
    clientId: number,
    channelType: string,
    data: { enabled: number; config_json: string | null },
  ): Promise<void> {
    await this.db
      .insertInto('sys_client_channel')
      .values({
        client_id: clientId,
        channel_type: channelType,
        enabled: data.enabled,
        config_json: data.config_json,
        created_at: new Date(),
        updated_at: new Date(),
      })
      .onDuplicateKeyUpdate({
        enabled: data.enabled,
        config_json: data.config_json,
        updated_at: new Date(),
      })
      .execute()
  }

  // ------------------------------------------------------------ 移动形态分区根（tasks 4.4 零代码链）

  /** 该端是否已有指定 component 的分区根（根级、未删）。 */
  async countZoneRoot(clientId: number, component: string): Promise<number> {
    const row = await this.db
      .selectFrom('sys_menu')
      .select((eb) => eb.fn.countAll<number>().as('c'))
      .where('client_id', '=', clientId)
      .where('component', '=', component)
      .where('parent_id', 'is', null)
      .where('is_deleted', '=', 0)
      .executeTakeFirst()
    return Number(row?.c ?? 0)
  }

  /**
   * 插入形态分区根（locked 目录，component 约定见 menu-shape.ts）。
   *
   * 与 sys_menu 其他写入一样走显式全列；zone 根不经 createMenu 的
   * assertPlacement（移动端 parentId=null 会被形态校验拒绝——分区根本身
   * 就是区域的原点，由渠道开通这一「采用移动形态」的动作触发）。
   */
  async insertZoneRoot(
    clientId: number,
    component: string,
    menuName: string,
    sortOrder: number,
  ): Promise<number> {
    const result = await this.db
      .insertInto('sys_menu')
      .values({
        client_id: clientId,
        parent_id: null,
        menu_name: menuName,
        menu_type: 0,
        path: null,
        component,
        permission: null,
        icon: null,
        sort_order: sortOrder,
        status: 1,
        is_deleted: 0,
        created_at: new Date(),
        updated_at: new Date(),
      })
      .executeTakeFirst()
    return Number(result.insertId)
  }
}
