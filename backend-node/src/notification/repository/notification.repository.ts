import { Inject, Injectable } from '@nestjs/common'
import { Kysely, type InsertObject, type Selectable, type UpdateObject } from 'kysely'
import type {
  DB,
  MsgChannelConfigTable,
  MsgEventDefinitionTable,
  MsgMessageTable,
  MsgRecipientTable,
  MsgSubscriptionRuleTable,
  MsgTemplateTable,
} from '../../framework/database/types'
import { KYSELY } from '../../framework/database/database.module'

/**
 * 查询结果行的类型。
 *
 * ⚠️ 必须用 `Selectable<T>` 而不是直接 `T`：这些表的主键声明为 `Generated<number>`
 *    （写入时省略、由自增生成），`SELECT` 回来的行里该列**一定**是 `number`。
 *    直接用表类型会得到 `Type 'number' is not assignable to type 'Generated<number>'`。
 */
export type ChannelConfigRow = Selectable<MsgChannelConfigTable>
export type EventDefinitionRow = Selectable<MsgEventDefinitionTable>
export type RecipientRow = Selectable<MsgRecipientTable>
export type TemplateRow = Selectable<MsgTemplateTable>
export type MessageRow = Selectable<MsgMessageTable>
export type SubscriptionRuleRow = Selectable<MsgSubscriptionRuleTable>

/** 分页结果：行 + 总数。 */
export interface PagedRows<T> {
  rows: T[]
  total: number
}

/**
 * 允许显式写 `null` 的补丁类型。
 *
 * 用于 Java 侧「无条件 setter」的更新方法：非 null 列也可以被写入 null，
 * 由数据库的 NOT NULL 约束拒绝 —— 那正是 Java 的行为。用 `Partial<T>`
 * 会在类型层掩盖这种可能，进而逼出 `as` 强转（把真实约束藏起来）。
 */
export type NullPatch<T> = { [K in keyof T]?: T[K] | null }

/** 业务事件定义列表的过滤条件。 */
export interface EventDefinitionFilter {
  keyword: string | null
  enabled: boolean | null
}

/**
 * 通知模块数据访问。
 *
 * 对齐 Java 侧的多个 Repository（NotificationEventDefinitionRepository /
 * ChannelConfigRepository / DeliveryRetryRepository / MessageRepository /
 * RecipientRepository / MessageTemplateRepository）。Java 按聚合拆了 6 个接口，
 * Node 这边先集中成一个 —— 它们查的是同一组 `msg_*` 表，
 * 拆成 6 个只有 1~2 个方法的类没有收益。
 * 若将来某个聚合长出真实行为（缓存、事务边界），再拆不迟。
 *
 * ⚠️ 本模块**不得**依赖 engine / system（eslint 边界规则）；
 *    因此角色查询在这里直接落到 `sys_role` / `sys_user_role`，
 *    而不是复用 system 模块的 AuthRepository。
 */
@Injectable()
export class NotificationRepository {
  constructor(@Inject(KYSELY) private readonly db: Kysely<DB>) {}

  // ------------------------------------------------------------ 管理端鉴权

  /**
   * 当前用户的角色编码列表。
   *
   * 对齐 Java `LoginUserService.buildLoginUser` 里
   * `roleRepository.findAllById(roleIds).map(SysRole::getRoleCode)` 这一段。
   */
  async findRoleCodesByUserId(userId: number): Promise<string[]> {
    const links = await this.db
      .selectFrom('sys_user_role')
      .select('role_id')
      .where('user_id', '=', userId)
      .execute()
    const roleIds = [...new Set(links.map((r) => r.role_id))]
    if (roleIds.length === 0) return []
    const roles = await this.db
      .selectFrom('sys_role')
      .select('role_code')
      .where('id', 'in', roleIds)
      .execute()
    return roles.map((r) => r.role_code)
  }

  // ------------------------------------------------------------ 渠道配置

  /** 某渠道的全部配置行（对齐 `ChannelConfigRepository.findByChannel`）。 */
  async findChannelConfigs(channel: string): Promise<ChannelConfigRow[]> {
    return this.db
      .selectFrom('msg_channel_config')
      .selectAll()
      .where('channel', '=', channel)
      .execute()
  }

  // ------------------------------------------------------------ 投递重试

  /**
   * 某渠道的重试记录（对齐 `DeliveryRetryRepository.findByChannel`）。
   * 只取判定成功率需要的 `status`，不整行拉回。
   */
  async findRetryStatusesByChannel(channel: string): Promise<string[]> {
    const rows = await this.db
      .selectFrom('msg_delivery_retry')
      .select('status')
      .where('channel', '=', channel)
      .execute()
    return rows.map((r) => r.status)
  }

  // ------------------------------------------------------------ 统计

  /** `messageRepository.count()` —— 全局计数，**不按租户过滤**（对齐 Java）。 */
  async countMessages(): Promise<number> {
    return this.countAll('msg_message')
  }

  /** `recipientRepository.count()` —— 全局计数，不按租户过滤。 */
  async countRecipients(): Promise<number> {
    return this.countAll('msg_recipient')
  }

  /** `deliveryRetryRepository.count()` —— 全局计数，不按租户过滤。 */
  async countDeliveryRetries(): Promise<number> {
    return this.countAll('msg_delivery_retry')
  }

  private async countAll(
    table: 'msg_message' | 'msg_recipient' | 'msg_delivery_retry',
  ): Promise<number> {
    const row = await this.db
      .selectFrom(table)
      .select((eb) => eb.fn.countAll<number>().as('c'))
      .executeTakeFirst()
    return Number(row?.c ?? 0)
  }

  // ------------------------------------------------------------ 用户端消息

  /** 某用户的收件人记录（对齐 `RecipientRepository.findByUserId`）。 */
  async findRecipientsByUserId(userId: number): Promise<RecipientRow[]> {
    return this.db.selectFrom('msg_recipient').selectAll().where('user_id', '=', userId).execute()
  }

  /** 某用户处于某状态的收件人记录数（对齐 `findByUserIdAndStatus(...).size()`）。 */
  async countRecipientsByUserIdAndStatus(userId: number, status: string): Promise<number> {
    const row = await this.db
      .selectFrom('msg_recipient')
      .select((eb) => eb.fn.countAll<number>().as('c'))
      .where('user_id', '=', userId)
      .where('status', '=', status)
      .executeTakeFirst()
    return Number(row?.c ?? 0)
  }

  /** 某消息的收件人记录（对齐 `RecipientRepository.findByMessageId`）。 */
  async findRecipientsByMessageId(messageId: number): Promise<RecipientRow[]> {
    return this.db
      .selectFrom('msg_recipient')
      .selectAll()
      .where('message_id', '=', messageId)
      .execute()
  }

  // ------------------------------------------------------------ 消息（管理端）

  /**
   * 按模板编码分页查消息（公告列表用）。
   * 对齐 AnnouncementController.list：模板编码精确匹配 + title 可选模糊，createdAt 倒序。
   */
  async findMessagesByTemplateCode(
    templateCode: string,
    keyword: string | null,
    offset: number,
    limit: number,
  ): Promise<PagedRows<MessageRow>> {
    let rowsQuery = this.db
      .selectFrom('msg_message')
      .where('template_code', '=', templateCode)
    let countQuery = this.db
      .selectFrom('msg_message')
      .where('template_code', '=', templateCode)

    if (keyword !== null) {
      const pattern = `%${keyword}%`
      rowsQuery = rowsQuery.where('title', 'like', pattern)
      countQuery = countQuery.where('title', 'like', pattern)
    }

    const rows = await rowsQuery
      .selectAll()
      .orderBy('created_at', 'desc')
      .limit(limit)
      .offset(offset)
      .execute()
    const countRow = await countQuery
      .select((eb) => eb.fn.countAll<number>().as('c'))
      .executeTakeFirst()
    return { rows, total: Number(countRow?.c ?? 0) }
  }

  /**
   * 投递记录分页（对齐 DeliveryController.list 的消息侧查询）。
   *
   * 收件人/渠道过滤在 Java 侧是「先查收件人表得到 messageId 集合，再 IN 过滤」，
   * 调用方负责把 `messageIds` 传进来；`null` 表示不按消息过滤。
   */
  async findMessagesForDelivery(
    filter: {
      keyword: string | null
      start: Date | null
      end: Date | null
      messageIds: number[] | null
    },
    offset: number,
    limit: number,
  ): Promise<PagedRows<MessageRow>> {
    // ⚠️ 行查询与计数查询必须**分开构造**：曾经共用一个带 `selectAll()` 的工厂函数，
    //    计数那条就变成 `SELECT msg_message.*, count(*) ...`，MySQL 直接报
    //    `only_full_group_by` 违规（契约比对抓到的，不是猜的）。
    let rowsQuery = this.db.selectFrom('msg_message').selectAll()
    let countQuery = this.db.selectFrom('msg_message')

    if (filter.keyword !== null) {
      rowsQuery = rowsQuery.where('title', 'like', `%${filter.keyword}%`)
      countQuery = countQuery.where('title', 'like', `%${filter.keyword}%`)
    }
    if (filter.start !== null) {
      rowsQuery = rowsQuery.where('created_at', '>=', filter.start)
      countQuery = countQuery.where('created_at', '>=', filter.start)
    }
    if (filter.end !== null) {
      rowsQuery = rowsQuery.where('created_at', '<=', filter.end)
      countQuery = countQuery.where('created_at', '<=', filter.end)
    }
    if (filter.messageIds !== null) {
      rowsQuery = rowsQuery.where('id', 'in', filter.messageIds)
      countQuery = countQuery.where('id', 'in', filter.messageIds)
    }

    const rows = await rowsQuery.orderBy('created_at', 'desc').limit(limit).offset(offset).execute()
    const countRow = await countQuery
      .select((eb) => eb.fn.countAll<number>().as('c'))
      .executeTakeFirst()
    return { rows, total: Number(countRow?.c ?? 0) }
  }

  /** 按用户名模糊查收件人（对齐 `RecipientRepository.findByUsernameContaining`）。 */
  async findRecipientsByUsernameContaining(username: string): Promise<RecipientRow[]> {
    return this.db
      .selectFrom('msg_recipient')
      .selectAll()
      .where('username', 'like', `%${username}%`)
      .execute()
  }

  /** 按渠道查收件人（对齐 `RecipientRepository.findByChannel`）。 */
  async findRecipientsByChannel(channel: string): Promise<RecipientRow[]> {
    return this.db
      .selectFrom('msg_recipient')
      .selectAll()
      .where('channel', '=', channel)
      .execute()
  }

  /** 某消息的重试记录状态（对齐 `DeliveryRetryRepository.findByMessageId`，只要 status）。 */
  async findRetryStatusesByMessageId(messageId: number): Promise<string[]> {
    const rows = await this.db
      .selectFrom('msg_delivery_retry')
      .select('status')
      .where('message_id', '=', messageId)
      .execute()
    return rows.map((r) => r.status)
  }

  // ------------------------------------------------------------ 订阅规则

  /** 订阅规则分页（eventCode 可选模糊，createdAt 倒序）。 */
  async findSubscriptionRulesPage(
    eventCode: string | null,
    offset: number,
    limit: number,
  ): Promise<PagedRows<SubscriptionRuleRow>> {
    let rowsQuery = this.db.selectFrom('msg_subscription_rule')
    let countQuery = this.db.selectFrom('msg_subscription_rule')
    if (eventCode !== null) {
      rowsQuery = rowsQuery.where('event_code', 'like', `%${eventCode}%`)
      countQuery = countQuery.where('event_code', 'like', `%${eventCode}%`)
    }
    const rows = await rowsQuery
      .selectAll()
      .orderBy('created_at', 'desc')
      .limit(limit)
      .offset(offset)
      .execute()
    const countRow = await countQuery
      .select((eb) => eb.fn.countAll<number>().as('c'))
      .executeTakeFirst()
    return { rows, total: Number(countRow?.c ?? 0) }
  }

  // ------------------------------------------------------------ 业务事件定义

  /**
   * 分页查询业务事件定义。
   * 对齐 `NotificationEventService.list`：tenant 过滤 + enabled/keyword 可选，
   * 按 `createdAt` 倒序，返回 `PageResult{total,page,size,rows}`。
   */
  async findEventDefinitionsPage(
    tenantId: string,
    filter: EventDefinitionFilter,
    offset: number,
    limit: number,
  ): Promise<PagedRows<EventDefinitionRow>> {
    let rowsQuery = this.db.selectFrom('msg_event_definition').where('tenant_id', '=', tenantId)
    let countQuery = this.db.selectFrom('msg_event_definition').where('tenant_id', '=', tenantId)

    if (filter.enabled !== null) {
      // MySQL BIT(1) 与 JS boolean：Kysely 会绑定成 1/0，与 JPA 的 Boolean 一致
      rowsQuery = rowsQuery.where('enabled', '=', filter.enabled ? 1 : 0)
      countQuery = countQuery.where('enabled', '=', filter.enabled ? 1 : 0)
    }
    if (filter.keyword !== null) {
      const pattern = `%${filter.keyword}%`
      // Java 侧是 cb.or(like(eventCode), like(eventName)) —— 两个字段都要匹配
      rowsQuery = rowsQuery.where((eb) =>
        eb.or([eb('event_code', 'like', pattern), eb('event_name', 'like', pattern)]),
      )
      countQuery = countQuery.where((eb) =>
        eb.or([eb('event_code', 'like', pattern), eb('event_name', 'like', pattern)]),
      )
    }

    const rows = await rowsQuery
      .selectAll()
      .orderBy('created_at', 'desc')
      .limit(limit)
      .offset(offset)
      .execute()

    const countRow = await countQuery
      .select((eb) => eb.fn.countAll<number>().as('c'))
      .executeTakeFirst()

    return { rows, total: Number(countRow?.c ?? 0) }
  }

  // ------------------------------------------------------------ 消息模板

  /**
   * 全部模板。
   *
   * ⚠️ Java `TemplateService.list(tenantId)` 的实现是 `templateRepository.findAll()`
   *    —— **完全忽略传进来的 tenantId**。这里照抄这个（可疑的）行为：
   *    自行「修好」会让两个后端的返回集不同，契约直接破损。
   *    已记入规格开放项，需与 Java 侧一起修。
   */
  async findAllTemplates(): Promise<TemplateRow[]> {
    return this.db.selectFrom('msg_template').selectAll().execute()
  }

  /** 按主键取模板（`templateRepository.findById`）。 */
  async findTemplateById(id: number): Promise<TemplateRow | null> {
    const row = await this.db
      .selectFrom('msg_template')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst()
    return row ?? null
  }

  /** 租户内模板代码是否已存在（`existsByTemplateCodeAndTenantId`）。 */
  async existsTemplateByCode(templateCode: string, tenantId: string): Promise<boolean> {
    const row = await this.db
      .selectFrom('msg_template')
      .select('id')
      .where('template_code', '=', templateCode)
      .where('tenant_id', '=', tenantId)
      .executeTakeFirst()
    return row !== undefined
  }

  /**
   * 租户内「同一事件 + 渠道」是否已有启用模板
   * （`existsByTenantIdAndEventCodeAndChannelAndEnabled`）。
   */
  async existsEnabledTemplateForEventChannel(
    tenantId: string,
    eventCode: string,
    channel: string,
  ): Promise<boolean> {
    const row = await this.db
      .selectFrom('msg_template')
      .select('id')
      .where('tenant_id', '=', tenantId)
      .where('event_code', '=', eventCode)
      .where('channel', '=', channel)
      .where('enabled', '=', 1)
      .executeTakeFirst()
    return row !== undefined
  }

  /**
   * 插入模板，返回自增主键。
   *
   * ⚠️ `name` 允许为 null（列是 NOT NULL）：Java 的 `create` 直接把
   *    `template.getName()` 存进去，不传 name 时由**数据库**拒绝（→ 500）。
   *    这里若擅自用 `?? ''` 兜底，就会出现「Java 报 500、Node 却成功存了空名」
   *    的分歧 —— 那正是契约网要抓的偏差。所以同样强转放行，让 DB 来拒绝。
   *
   * ⚠️ `created_at` 必须显式写入（对齐实体上的 `@PrePersist onCreate`）。
   *    迁移里这一列是 `DEFAULT CURRENT_TIMESTAMP`，但 **Hibernate 建的这一列没有默认值**，
   *    契约库正是 Hibernate 形状 —— 不显式赋值就会落成 NULL，
   *    响应里的 `createdAt` 变成 null（契约比对 `mscTplCreate` 当场抓到的）。
   *    同为 Hibernate 补列的坑，见迁移 V35 的说明。
   */
  async insertTemplate(row: {
    tenant_id: string
    template_code: string
    event_code: string | null
    name: string | null
    title: string | null
    content: string | null
    content_type: string | null
    channel: string | null
    priority: string | null
    category: string | null
    is_system: number
    enabled: number
    created_at: Date
  }): Promise<number> {
    const result = await this.db
      .insertInto('msg_template')
      .values(row as InsertObject<DB, 'msg_template'>)
      .executeTakeFirst()
    return Number(result.insertId)
  }

  /**
   * 原地更新模板字段（`templateRepository.save(existing)` 的等价写法）。
   *
   * ⚠️ 补丁类型是 `NullPatch<TemplateRow>` 而不是 `Partial<TemplateRow>`：
   *    Java 的 `TemplateService.update` 对若干字段是**无条件 setter**
   *    （`priority` / `category` 非系统模板必覆盖；`name` / `title` / `content` 一律覆盖），
   *    所以 `null` 是真实可写入的值 —— NOT NULL 列由数据库拒绝，与 Java 一致。
   *    用 `Partial` 会在类型层把这个可能抹掉，逼出无意义的强转。
   */
  async updateTemplate(id: number, patch: NullPatch<TemplateRow>): Promise<void> {
    // ⚠️ 这里必须强转：Kysely 在类型层拒绝给 NOT NULL 列绑定 null，而 Java 会照写，
    //    由数据库的 NOT NULL 约束抛错（→ 500）。两种实现的可观察结果一致，
    //    差别只在「谁拒绝」—— 照抄 Java 就必须让 DB 拒绝，所以要把这个 null 放行。
    //    这是本文件唯一一处绕过 Kysely 类型检查的地方，改动前请先读上面 updateTemplate 的注释。
    await this.db
      .updateTable('msg_template')
      .set(patch as UpdateObject<DB, 'msg_template', 'msg_template'>)
      .where('id', '=', id)
      .execute()
  }

  // ------------------------------------------------------------ 消息写入与状态变更

  /** 插入消息，返回自增主键（Java 的 `messageRepository.save` 靠 IDENTITY 回填 id）。 */
  async insertMessage(row: {
    tenant_id: string
    template_code: string
    event_code: string | null
    sender_id: number
    sender_type: string
    title: string | null
    content: string | null
    link_json: string | null
    content_type: string | null
    priority: string
    category: string
    message_type: string
    status: string
    created_at: Date
  }): Promise<number> {
    const result = await this.db.insertInto('msg_message').values(row).executeTakeFirst()
    return Number(result.insertId)
  }

  /** 按主键取消息（`messageRepository.findById`）。 */
  async findMessageById(id: number): Promise<MessageRow | null> {
    const row = await this.db
      .selectFrom('msg_message')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst()
    return row ?? null
  }

  /**
   * 更新消息的发送状态（重发用）。
   *
   * ⚠️ Java 的 `send` 对已存在实体走的是 JPA `merge` —— 会把**整行**按 load 出来的值
   *    重写一遍。那条 UPDATE 的可见效果与本方法**完全等价**（其余列写的都是它们
   *    刚从库里读出来的同一个值），所以这里只写真正会变的那一列。
   */
  async updateMessageStatus(id: number, status: string): Promise<void> {
    await this.db.updateTable('msg_message').set({ status }).where('id', '=', id).execute()
  }

  /** 删除消息行（公告撤回用）。 */
  async deleteMessageById(id: number): Promise<void> {
    await this.db.deleteFrom('msg_message').where('id', '=', id).execute()
  }

  /** 批量插入收件人行。 */
  async insertRecipients(
    rows: Array<{
      tenant_id: string
      message_id: number
      user_id: number
      username: string
      nickname: string | null
      email: string | null
      phone: string | null
      channel: string
      status: string
      created_at: Date
    }>,
  ): Promise<void> {
    if (rows.length === 0) return
    await this.db.insertInto('msg_recipient').values(rows).execute()
  }

  /** 按 (消息, 用户) 取收件人行（`findByMessageIdAndUserId`）。 */
  async findRecipientByMessageAndUser(
    messageId: number,
    userId: number,
  ): Promise<RecipientRow | null> {
    const row = await this.db
      .selectFrom('msg_recipient')
      .selectAll()
      .where('message_id', '=', messageId)
      .where('user_id', '=', userId)
      .executeTakeFirst()
    return row ?? null
  }

  /** 某用户处于某状态的收件人行（`findByUserIdAndStatus`）。 */
  async findRecipientsByUserIdAndStatus(
    userId: number,
    status: string,
  ): Promise<RecipientRow[]> {
    return this.db
      .selectFrom('msg_recipient')
      .selectAll()
      .where('user_id', '=', userId)
      .where('status', '=', status)
      .execute()
  }

  /** 更新单条收件人行的状态与送达时间（`toggleRead` 用）。 */
  async updateRecipient(
    id: number,
    patch: { status: string; sent_at: Date | null },
  ): Promise<void> {
    await this.db.updateTable('msg_recipient').set(patch).where('id', '=', id).execute()
  }

  /**
   * 标记单条已读，返回受影响行数。
   *
   * ⚠️ Java 的 `@Query` UPDATE **不带 status 条件**（`WHERE messageId AND userId`），
   *    所以「已读再标已读」也算命中、返回 1；只有**没有收件人行**时才是 0。
   *    因此下面这个「受影响 0 行 → 抛『消息不存在或已读』」的措辞是**误导性的** ——
   *    但它就是契约（golden `mscReadUnknown` 证明了这点），照抄。
   *    不要"顺手"加上 `status = 'PENDING'` 条件：那会让重复标记变成错误。
   */
  async markAsRead(messageId: number, userId: number, now: Date): Promise<number> {
    const result = await this.db
      .updateTable('msg_recipient')
      .set({ status: 'SENT', sent_at: now })
      .where('message_id', '=', messageId)
      .where('user_id', '=', userId)
      .executeTakeFirst()
    return Number(result.numUpdatedRows)
  }

  /** 批量标记已读（`markBatchAsRead`：只动该用户的、且 id 在列表里的行）。 */
  async markBatchAsRead(userId: number, messageIds: number[], now: Date): Promise<number> {
    if (messageIds.length === 0) return 0
    const result = await this.db
      .updateTable('msg_recipient')
      .set({ status: 'SENT', sent_at: now })
      .where('user_id', '=', userId)
      .where('message_id', 'in', messageIds)
      .executeTakeFirst()
    return Number(result.numUpdatedRows)
  }

  /** 全部标记已读（`markAllAsRead`：只动 PENDING 行）。 */
  async markAllAsRead(userId: number, now: Date): Promise<number> {
    const result = await this.db
      .updateTable('msg_recipient')
      .set({ status: 'SENT', sent_at: now })
      .where('user_id', '=', userId)
      .where('status', '=', 'PENDING')
      .executeTakeFirst()
    return Number(result.numUpdatedRows)
  }

  /** 删除某用户对某消息的收件人行（`deleteByUserIdAndMessageId`）。 */
  async deleteRecipientByUserAndMessage(userId: number, messageId: number): Promise<void> {
    await this.db
      .deleteFrom('msg_recipient')
      .where('user_id', '=', userId)
      .where('message_id', '=', messageId)
      .execute()
  }

  /** 删除某消息的全部收件人行（公告撤回用）。 */
  async deleteRecipientsByMessageId(messageId: number): Promise<void> {
    await this.db.deleteFrom('msg_recipient').where('message_id', '=', messageId).execute()
  }

  /**
   * 用户端消息分页（对齐 `MessageServiceImpl.listByUserId` 第 2 步）。
   *
   * ⚠️ 排序是 `createdAt DESC`，与 Java 的 `Sort.by(DESC, "createdAt")` 一致。
   * ⚠️ 行查询与计数查询分开构造（历史踩坑：共用带 `selectAll()` 的工厂会生成
   *    `SELECT msg_message.*, count(*)`，MySQL only_full_group_by 直接报错）。
   */
  async findUserMessagesPage(
    messageIds: number[],
    filter: {
      keyword: string | null
      category: string | null
      messageType: string | null
      start: Date | null
      end: Date | null
    },
    offset: number,
    limit: number,
  ): Promise<PagedRows<MessageRow>> {
    let rowsQuery = this.db.selectFrom('msg_message').where('id', 'in', messageIds)
    let countQuery = this.db.selectFrom('msg_message').where('id', 'in', messageIds)

    if (filter.keyword !== null) {
      const pattern = `%${filter.keyword}%`
      rowsQuery = rowsQuery.where('title', 'like', pattern)
      countQuery = countQuery.where('title', 'like', pattern)
    }
    if (filter.category !== null) {
      rowsQuery = rowsQuery.where('category', '=', filter.category)
      countQuery = countQuery.where('category', '=', filter.category)
    }
    if (filter.messageType !== null) {
      rowsQuery = rowsQuery.where('message_type', '=', filter.messageType)
      countQuery = countQuery.where('message_type', '=', filter.messageType)
    }
    if (filter.start !== null) {
      rowsQuery = rowsQuery.where('created_at', '>=', filter.start)
      countQuery = countQuery.where('created_at', '>=', filter.start)
    }
    if (filter.end !== null) {
      rowsQuery = rowsQuery.where('created_at', '<=', filter.end)
      countQuery = countQuery.where('created_at', '<=', filter.end)
    }

    const rows = await rowsQuery
      .selectAll()
      .orderBy('created_at', 'desc')
      .limit(limit)
      .offset(offset)
      .execute()
    const countRow = await countQuery
      .select((eb) => eb.fn.countAll<number>().as('c'))
      .executeTakeFirst()
    return { rows, total: Number(countRow?.c ?? 0) }
  }

  /**
   * 按 id 批量取用户的姓名/昵称/邮箱/手机号，用于填充收件人快照。
   *
   * 对齐 Java `MessageServiceImpl.send` 里的 `sysUserRepository.findAllById(recipientIds)`。
   * 直接查 `sys_user` 而不复用 system 模块（eslint 禁止 notification → system 依赖）。
   */
  async findUsersByIds(
    ids: number[],
  ): Promise<Array<{ id: number; username: string; nickname: string | null; email: string | null; phone: string | null }>> {
    if (ids.length === 0) return []
    return this.db
      .selectFrom('sys_user')
      .select(['id', 'username', 'nickname', 'email', 'phone'])
      .where('id', 'in', ids)
      .execute()
  }

  /** 租户内事件定义是否已存在该 eventCode（`existsByTenantIdAndEventCode`）。 */
  async existsEventDefinition(tenantId: string, eventCode: string): Promise<boolean> {
    const row = await this.db
      .selectFrom('msg_event_definition')
      .select('id')
      .where('tenant_id', '=', tenantId)
      .where('event_code', '=', eventCode)
      .executeTakeFirst()
    return row !== undefined
  }

  /** 某租户下按 eventCode 取启用的事件定义（`findByTenantIdAndEventCode` + enabled 过滤）。 */
  async findEnabledEventDefinition(
    tenantId: string,
    eventCode: string,
  ): Promise<EventDefinitionRow | null> {
    const row = await this.db
      .selectFrom('msg_event_definition')
      .selectAll()
      .where('tenant_id', '=', tenantId)
      .where('event_code', '=', eventCode)
      .where('enabled', '=', 1)
      .executeTakeFirst()
    return row ?? null
  }

  /**
   * 某租户下按 (eventCode, channel) 取启用模板
   * （`findByTenantIdAndEventCodeAndChannelAndEnabled`）。
   */
  async findEnabledTemplateForEventChannel(
    tenantId: string,
    eventCode: string,
    channel: string,
  ): Promise<TemplateRow | null> {
    const row = await this.db
      .selectFrom('msg_template')
      .selectAll()
      .where('tenant_id', '=', tenantId)
      .where('event_code', '=', eventCode)
      .where('channel', '=', channel)
      .where('enabled', '=', 1)
      .executeTakeFirst()
    return row ?? null
  }

  /** 按代码 + 租户取模板（`findByTemplateCodeAndTenantId`）。 */
  async findTemplateByCode(templateCode: string, tenantId: string): Promise<TemplateRow | null> {
    const row = await this.db
      .selectFrom('msg_template')
      .selectAll()
      .where('template_code', '=', templateCode)
      .where('tenant_id', '=', tenantId)
      .executeTakeFirst()
    return row ?? null
  }

  /** 模板是否被事件代码引用（事件定义的删除守卫用）。 */
  async existsTemplateByEventCode(tenantId: string, eventCode: string): Promise<boolean> {
    const row = await this.db
      .selectFrom('msg_template')
      .select('id')
      .where('tenant_id', '=', tenantId)
      .where('event_code', '=', eventCode)
      .executeTakeFirst()
    return row !== undefined
  }

  /** 订阅规则是否引用该事件代码（事件定义的删除守卫用）。 */
  async existsSubscriptionRuleByEventCode(
    tenantId: string,
    eventCode: string,
  ): Promise<boolean> {
    const row = await this.db
      .selectFrom('msg_subscription_rule')
      .select('id')
      .where('tenant_id', '=', tenantId)
      .where('event_code', '=', eventCode)
      .executeTakeFirst()
    return row !== undefined
  }

  // ------------------------------------------------------------ 业务事件定义（写）

  /** 插入事件定义，返回自增主键。 */
  async insertEventDefinition(row: {
    tenant_id: string
    event_code: string
    event_name: string
    description: string | null
    business_domain: string | null
    enabled: number
    created_by: string
    created_at: Date
    updated_by: string | null
    updated_at: Date
  }): Promise<number> {
    const result = await this.db
      .insertInto('msg_event_definition')
      .values(row as InsertObject<DB, 'msg_event_definition'>)
      .executeTakeFirst()
    return Number(result.insertId)
  }

  /** 按主键取事件定义（租户过滤由调用方做，对齐 Java 的 `findById(...).filter(tenantId)`）。 */
  async findEventDefinitionById(id: number): Promise<EventDefinitionRow | null> {
    const row = await this.db
      .selectFrom('msg_event_definition')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst()
    return row ?? null
  }

  /**
   * 更新事件定义。
   *
   * 用 `NullPatch` 而不是 `Partial`：Java 的 `update` 对 description / businessDomain
   * 是**无条件 setter**，传 null 就会把已有值清成 NULL（NOT NULL 列由数据库拒绝）。
   */
  async updateEventDefinition(id: number, patch: NullPatch<EventDefinitionRow>): Promise<void> {
    await this.db
      .updateTable('msg_event_definition')
      .set(patch as UpdateObject<DB, 'msg_event_definition', 'msg_event_definition'>)
      .where('id', '=', id)
      .execute()
  }

  /** 删除事件定义（`repository.delete(event)` → 真删，不是软删）。 */
  async deleteEventDefinition(id: number): Promise<void> {
    await this.db.deleteFrom('msg_event_definition').where('id', '=', id).execute()
  }

  // ------------------------------------------------------------ 订阅规则（写）

  /** 插入订阅规则，返回自增主键。 */
  async insertSubscriptionRule(row: {
    tenant_id: string
    event_code: string
    channel: string
    priority: string | null
    enable: number
    action: string
    condition_expr: string | null
    created_by: string | null
    created_at: Date
  }): Promise<number> {
    const result = await this.db
      .insertInto('msg_subscription_rule')
      .values(row as InsertObject<DB, 'msg_subscription_rule'>)
      .executeTakeFirst()
    return Number(result.insertId)
  }

  /** 按主键取订阅规则。 */
  async findSubscriptionRuleById(id: number): Promise<SubscriptionRuleRow | null> {
    const row = await this.db
      .selectFrom('msg_subscription_rule')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst()
    return row ?? null
  }

  /** 更新订阅规则（同 updateEventDefinition：用 NullPatch 表达"可以写 null"）。 */
  async updateSubscriptionRule(id: number, patch: NullPatch<SubscriptionRuleRow>): Promise<void> {
    await this.db
      .updateTable('msg_subscription_rule')
      .set(patch as UpdateObject<DB, 'msg_subscription_rule', 'msg_subscription_rule'>)
      .where('id', '=', id)
      .execute()
  }

  /** 删除订阅规则（`deleteById`）。 */
  async deleteSubscriptionRule(id: number): Promise<void> {
    await this.db.deleteFrom('msg_subscription_rule').where('id', '=', id).execute()
  }

  // ------------------------------------------------------------ 渠道配置（写）

  /**
   * 删除某渠道的全部配置行，但**保留 `__enabled` 开关行**。
   *
   * 对齐 `ChannelConfigService.save`：它就是这个「先删后插」的覆盖语义，
   * 且删除时会过滤掉 `__enabled`（管理员开关不因保存凭据而丢失）。
   */
  async deleteChannelConfigsExceptEnabled(channel: string): Promise<void> {
    await this.db
      .deleteFrom('msg_channel_config')
      .where('channel', '=', channel)
      .where('config_key', '!=', '__enabled')
      .execute()
  }

  /** 插入一行渠道配置。 */
  async insertChannelConfig(row: {
    channel: string
    config_key: string
    config_value: string | null
    is_encrypted: number
    created_at: Date
  }): Promise<void> {
    await this.db
      .insertInto('msg_channel_config')
      .values(row as InsertObject<DB, 'msg_channel_config'>)
      .execute()
  }

  /** 更新某渠道 `__enabled` 开关行的值。 */
  async updateChannelEnabledFlag(id: number, value: string): Promise<void> {
    await this.db
      .updateTable('msg_channel_config')
      .set({ config_value: value, is_encrypted: 0 })
      .where('id', '=', id)
      .execute()
  }
}
