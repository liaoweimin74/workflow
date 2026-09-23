import { Injectable } from '@nestjs/common'
import { BusinessException } from '../../common/exception/business-exception'
import { PageResult } from '../../common/domain/page-result'
import type { LoginUser } from '../../framework/security/jwt-auth.guard'
import { getTenantId } from '../../framework/tenant/tenant-context'
import { assertPageSize } from '../../framework/http/query-params'
import { bitToBool } from '../../framework/database/types'
import {
  NotificationRepository,
  type ChannelConfigRow,
  type EventDefinitionRow,
  type TemplateRow,
} from '../repository/notification.repository'

/** 渠道类型枚举，逐条对齐 Java `com.workflow.notification.model.ChannelType`。 */
export type ChannelType = 'IN_APP' | 'SMS' | 'WECHAT_WORK' | 'WECHAT_MINIPROGRAM' | 'APP'

/**
 * 渠道 ID → 类型。ID 是**对外契约的一部分**（前端按 ID 调
 * `/channels/{id}/enable|disable|config|test`），因此顺序与取值都不能改。
 * 对齐 Java `ChannelController.CHANNEL_BY_ID`（LinkedHashMap，按 ID 有序）。
 */
const CHANNEL_BY_ID: ReadonlyArray<readonly [number, ChannelType]> = [
  [1, 'IN_APP'],
  [2, 'SMS'],
  [3, 'WECHAT_WORK'],
  [4, 'WECHAT_MINIPROGRAM'],
  [5, 'APP'],
]

/** 管理员对渠道的启停开关在配置表里的保留键名（对齐 ChannelConfigService.ENABLED_KEY）。 */
const ENABLED_KEY = '__enabled'

/** 渠道列表元素，对齐 Java 里手搓的 `LinkedHashMap`（键序 id/name/type/enabled/successRate）。 */
export interface ChannelVO {
  id: number
  name: string
  type: string
  enabled: boolean
  successRate: number | null
}

/** 业务事件定义 VO，字段名取 Java 实体属性的驼峰形式。 */
export interface NotificationEventVO {
  id: number
  tenantId: string
  eventCode: string
  eventName: string
  description: string | null
  businessDomain: string | null
  enabled: boolean
  createdBy: string
  createdAt: Date | null
  updatedBy: string | null
  updatedAt: Date | null
}

/** 消息模板 VO，字段名取 Java `MessageTemplate` 实体属性的驼峰形式。 */
export interface MessageTemplateVO {
  id: number
  tenantId: string
  templateCode: string
  eventCode: string | null
  name: string
  title: string | null
  content: string | null
  contentType: string | null
  channel: string | null
  priority: string | null
  category: string | null
  isSystem: boolean
  enabled: boolean
  createdAt: Date | null
}

/** 统计概览，对齐 Java `StatsController.overview` 的三个键。 */
export interface NotificationOverviewVO {
  totalMessages: number
  totalRecipients: number
  failedRetries: number
}

/**
 * 管理端「三个列表」共用的分页外壳。
 *
 * Java 侧是手搓的 `LinkedHashMap`（键序 rows/total/page/size），
 * 与 `PageResult`（total/page/size/rows）**键集相同、键序不同**。
 * 契约比对按 key 比较，看不出差别；但这里的类型单独起名，
 * 是为了让读代码的人知道它来自另一处实现，而不是把两者当成同一个 DTO。
 */
export interface AdminPageVO<T> {
  rows: T[]
  total: number
  page: number
  size: number
}

/** 公告列表行：`{id,title,senderId,recipientCount,createdAt}`。 */
export interface AnnouncementRowVO {
  id: number
  title: string | null
  senderId: number
  recipientCount: number
  createdAt: Date | null
}

/** 投递列表行：`{id,title,recipientCount,recipients,channel,status,createdAt}`。 */
export interface DeliveryRowVO {
  id: number
  title: string | null
  recipientCount: number
  recipients: Array<{ userId: number; username: string | null; status: string }>
  channel: string
  status: string
  createdAt: Date | null
}

/** 订阅规则列表行。 */
export interface SubscriptionRowVO {
  id: number
  eventCode: string
  channel: string
  priority: string | null
  enable: boolean
  action: string
  condition: string | null
  createdBy: string | null
  createdAt: Date | null
}

/** 公告消息以该 templateCode 标记（对齐 Java `ANNOUNCEMENT_TEMPLATE`）。 */
const ANNOUNCEMENT_TEMPLATE = 'ANNOUNCEMENT'

/** 收件人状态 PENDING 既表示「未读」也表示「重试中」（对齐 Java `MessageStatus.PENDING`）。 */
const STATUS_PENDING = 'PENDING'

/** 收件人状态 FAILED（对齐 Java `MessageStatus.FAILED`）。 */
const STATUS_FAILED = 'FAILED'

function channelName(type: ChannelType): string {
  switch (type) {
    case 'IN_APP':
      return '站内信'
    case 'SMS':
      return '短信'
    case 'WECHAT_WORK':
      return '企业微信'
    case 'WECHAT_MINIPROGRAM':
      return '小程序'
    case 'APP':
      return 'APP'
  }
}

/**
 * 通知管理端服务（对齐 Java `notification.admin` 包下的若干 Controller + Service）。
 *
 * ⚠️ 目前只迁移契约场景已覆盖的读端点：
 *    `/templates`（列表）· `/channels`（列表）· `/events`（列表）· `/stats/overview`。
 *    写端点（模板增改/启停、渠道启停与配置、事件增删改、订阅规则、公告、投递重试）
 *    按「补场景 → 录 golden → 按 golden 实现」的顺序在 P6 的后续增量补齐。
 */
@Injectable()
export class NotificationAdminService {
  constructor(private readonly repository: NotificationRepository) {}

  /**
   * 管理端统一鉴权，对齐 Java `NotificationAdminAuthorization.requireAdmin`。
   *
   * ⚠️ 与 Java 的差异（**刻意且已知**）：
   *    Java 在 JWT 过滤器里就把角色装进 `LoginUser`，`requireAdmin` 只是读内存；
   *    Node 这边 `LoginUser` 只有 userId / username（对齐 JWT 里**实际存在**的 claim），
   *    所以这里按需查一次库取角色。
   *    两者对**这些端点**的判定结果等价（都是「请求时从库里取角色」），
   *    代价是每个管理端请求多一次查询。等管理端端点铺开后再考虑把角色放进
   *    请求作用域缓存，而不是放进模块级变量（那会串用户）。
   */
  async requireAdmin(user: LoginUser): Promise<void> {
    const roles = await this.repository.findRoleCodesByUserId(user.userId)
    const isAdmin = roles.some((role) => role === 'ROLE_ADMIN' || role === 'admin')
    if (!isAdmin) {
      throw new BusinessException(403, '需要管理员权限')
    }
  }

  /** 模板列表。 */
  async listTemplates(user: LoginUser): Promise<MessageTemplateVO[]> {
    await this.requireAdmin(user)
    const rows = await this.repository.findAllTemplates()
    return rows.map(toTemplateVO)
  }

  /**
   * 渠道列表。
   *
   * `enabled`：站内信恒可用；外部渠道看管理员开关，历史已有配置默认视为启用。
   * `successRate`：站内信恒 100；外部渠道按该渠道重试记录估算。
   */
  async listChannels(user: LoginUser): Promise<ChannelVO[]> {
    await this.requireAdmin(user)
    const result: ChannelVO[] = []
    for (const [id, type] of CHANNEL_BY_ID) {
      const configs = await this.repository.findChannelConfigs(type)
      result.push({
        id,
        name: channelName(type),
        type,
        enabled: isChannelEnabled(type, configs),
        successRate: await this.successRate(type, configs),
      })
    }
    return result
  }

  /**
   * 渠道成功率：站内信 100%；外部渠道按重试记录估算 ——
   * 有 FAILED 记 0%，只有 PENDING（重试中）记 50%，无异常记录且已配置记 100%。
   */
  private async successRate(
    type: ChannelType,
    configs: ChannelConfigRow[],
  ): Promise<number | null> {
    if (type === 'IN_APP') return 100
    const statuses = await this.repository.findRetryStatusesByChannel(type)
    if (statuses.length === 0) {
      return isConfigured(configs) ? 100 : null
    }
    if (statuses.includes(STATUS_FAILED)) return 0
    return statuses.includes(STATUS_PENDING) ? 50 : 100
  }

  /**
   * 业务事件定义分页列表。
   *
   * ⚠️ `page`/`size` 用 `Math.max(..., 1)` 归一 —— 这是 Java
   *    `NotificationEventService.list` 里的显式写法（与 Spring Data 的
   *    `PageRequest.of` 不同，它自己夹了下限）。
   *
   * ⚠️ 租户 ID 在**鉴权之后**才读取：Java 的 handler 是
   *    `requireAdmin(); return service.list(tenantProvider.getTenantId(), ...)`。
   *    若两者顺序颠倒，就会出现「未登录/非管理员 + 缺租户头」时
   *    返回 400 而不是 403 的分歧。
   */
  async listEvents(
    user: LoginUser,
    page: number,
    size: number,
    keyword: string | null,
    enabled: boolean | null,
  ): Promise<PageResult<NotificationEventVO>> {
    await this.requireAdmin(user)
    const tenantId = getTenantId()
    const normalizedPage = Math.max(page, 1)
    const normalizedSize = Math.max(size, 1)
    const { rows, total } = await this.repository.findEventDefinitionsPage(
      tenantId,
      { keyword, enabled },
      (normalizedPage - 1) * normalizedSize,
      normalizedSize,
    )
    const vos = rows.map(toEventVO)
    return new PageResult<NotificationEventVO>(total, normalizedPage, normalizedSize, vos)
  }

  /** 统计概览。三个计数都是**全局**的（不按租户过滤，对齐 Java）。 */
  async overview(user: LoginUser): Promise<NotificationOverviewVO> {
    await this.requireAdmin(user)
    const [totalMessages, totalRecipients, failedRetries] = await Promise.all([
      this.repository.countMessages(),
      this.repository.countRecipients(),
      this.repository.countDeliveryRetries(),
    ])
    return { totalMessages, totalRecipients, failedRetries }
  }

  // ------------------------------------------------------------ 公告

  /**
   * 公告列表（`templateCode = ANNOUNCEMENT` 的消息，按发布时间倒序）。
   *
   * ⚠️ `page`/`size` 用 `Math.max(..., 1)` 归一 —— 与 `listEvents` 同理，
   *    这是 Java handler 里的显式写法，不是 Spring Data 的行为。
   */
  async listAnnouncements(
    user: LoginUser,
    page: number,
    size: number,
    keyword: string | null,
  ): Promise<AdminPageVO<AnnouncementRowVO>> {
    // Java 的 `AnnouncementController` 用 `PageRequest.of(Math.max(page,1)-1, size)` ⇒
    // size < 1 → HTTP 400（异常发生在归一化**之前**，契约场景已钉住）
    assertPageSize(size)
    await this.requireAdmin(user)
    const normalizedPage = Math.max(page, 1)
    const normalizedSize = Math.max(size, 1)
    const { rows, total } = await this.repository.findMessagesByTemplateCode(
      ANNOUNCEMENT_TEMPLATE,
      keyword,
      (normalizedPage - 1) * normalizedSize,
      normalizedSize,
    )

    const out: AnnouncementRowVO[] = []
    for (const message of rows) {
      const recipients = await this.repository.findRecipientsByMessageId(message.id)
      out.push({
        id: message.id,
        title: message.title,
        senderId: message.sender_id,
        recipientCount: recipients.length,
        createdAt: message.created_at,
      })
    }
    return { rows: out, total, page: normalizedPage, size: normalizedSize }
  }

  /**
   * 投递记录列表。
   *
   * 对齐 Java `DeliveryController.list`：收件人/渠道过滤是**先查收件人表得到
   * messageId 集合再 IN 过滤**；两个过滤条件同时给出时取**并集**（addAll），
   * 不是交集 —— 这是 Java 的既有行为，照抄，不擅自「修正」。
   */
  async listDeliveries(
    user: LoginUser,
    page: number,
    size: number,
    keyword: string | null,
    recipient: string | null,
    channel: ChannelType | null,
  ): Promise<AdminPageVO<DeliveryRowVO>> {
    // 同 listAnnouncements：Java 在控制器层就 `PageRequest.of(..., size)` ⇒ size < 1 → 400
    assertPageSize(size)
    await this.requireAdmin(user)
    const normalizedPage = Math.max(page, 1)
    const normalizedSize = Math.max(size, 1)

    let messageIds: number[] | null = null
    if (recipient !== null || channel !== null) {
      const matched: number[] = []
      if (recipient !== null) {
        const rows = await this.repository.findRecipientsByUsernameContaining(recipient)
        matched.push(...rows.map((r) => r.message_id))
      }
      if (channel !== null) {
        const rows = await this.repository.findRecipientsByChannel(channel)
        matched.push(...rows.map((r) => r.message_id))
      }
      messageIds = [...new Set(matched)]
      // 无匹配：直接空结果（Java 显式提前返回，避免 `id IN ()` 这种无效 SQL）
      if (messageIds.length === 0) {
        return { rows: [], total: 0, page: normalizedPage, size: normalizedSize }
      }
    }

    const { rows, total } = await this.repository.findMessagesForDelivery(
      { keyword, start: null, end: null, messageIds },
      (normalizedPage - 1) * normalizedSize,
      normalizedSize,
    )

    const out: DeliveryRowVO[] = []
    for (const message of rows) {
      const recipients = await this.repository.findRecipientsByMessageId(message.id)
      out.push({
        id: message.id,
        title: message.title,
        recipientCount: recipients.length,
        recipients: recipients.map((r) => ({
          userId: r.user_id,
          username: r.username,
          status: r.status ?? STATUS_PENDING,
        })),
        channel: recipients.length === 0 ? 'IN_APP' : recipients[0].channel,
        status: await this.deliveryStatus(message.id, message.status),
        createdAt: message.created_at,
      })
    }
    return { rows: out, total, page: normalizedPage, size: normalizedSize }
  }

  /**
   * 投递状态：任一条重试记录为 FAILED → FAILED；否则有 PENDING → PENDING；
   * 都没有则取消息自身状态，为空时兜底 'SENT'。
   */
  private async deliveryStatus(messageId: number, messageStatus: string | null): Promise<string> {
    const statuses = await this.repository.findRetryStatusesByMessageId(messageId)
    if (statuses.includes(STATUS_FAILED)) return 'FAILED'
    if (statuses.includes(STATUS_PENDING)) return 'PENDING'
    return messageStatus ?? 'SENT'
  }

  /** 订阅规则列表（eventCode 可选模糊，按创建时间倒序）。 */
  async listSubscriptions(
    user: LoginUser,
    page: number,
    size: number,
    eventCode: string | null,
  ): Promise<AdminPageVO<SubscriptionRowVO>> {
    // 同 listAnnouncements：Java 在控制器层就 `PageRequest.of(..., size)` ⇒ size < 1 → 400
    assertPageSize(size)
    await this.requireAdmin(user)
    const normalizedPage = Math.max(page, 1)
    const normalizedSize = Math.max(size, 1)
    const { rows, total } = await this.repository.findSubscriptionRulesPage(
      eventCode,
      (normalizedPage - 1) * normalizedSize,
      normalizedSize,
    )
    const out: SubscriptionRowVO[] = rows.map((r) => ({
      id: r.id,
      eventCode: r.event_code,
      channel: r.channel,
      priority: r.priority,
      enable: bitToBool(r.enable),
      action: r.action,
      condition: r.condition_expr,
      createdBy: r.created_by,
      createdAt: r.created_at,
    }))
    return { rows: out, total, page: normalizedPage, size: normalizedSize }
  }
}

export function toEventVO(row: EventDefinitionRow): NotificationEventVO {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    eventCode: row.event_code,
    eventName: row.event_name,
    description: row.description,
    businessDomain: row.business_domain,
    enabled: bitToBool(row.enabled),
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedBy: row.updated_by,
    updatedAt: row.updated_at,
  }
}

/** 管理员开关优先；没有开关行时：站内信恒启用，其余看是否已有配置。 */
function isChannelEnabled(type: ChannelType, configs: ChannelConfigRow[]): boolean {
  const flag = configs.find((c) => c.config_key === ENABLED_KEY)
  if (flag !== undefined) {
    // 对齐 Java `Boolean.parseBoolean(...)`：只有（忽略大小写的）"true" 为真
    return flag.config_value?.trim().toLowerCase() === 'true'
  }
  return type === 'IN_APP' || isConfigured(configs)
}

/** 是否有非空配置（`__enabled` 开关不算配置内容）。 */
function isConfigured(configs: ChannelConfigRow[]): boolean {
  return configs.some(
    (c) => c.config_key !== ENABLED_KEY && c.config_value !== null && c.config_value !== '',
  )
}

/**
 * 模板行 → 出参。
 *
 * 导出给写路径复用（`create` / `update` / `toggle` 都返回模板实体）——
 * 读写的出参形状必须一致，复制一份映射迟早会漂移。
 */
export function toTemplateVO(row: TemplateRow): MessageTemplateVO {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    templateCode: row.template_code,
    eventCode: row.event_code,
    name: row.name,
    title: row.title,
    content: row.content,
    contentType: row.content_type,
    channel: row.channel,
    priority: row.priority,
    category: row.category,
    isSystem: bitToBool(row.is_system),
    enabled: bitToBool(row.enabled),
    createdAt: row.created_at,
  }
}
