import { Injectable } from '@nestjs/common'
import { BusinessException } from '../../common/exception/business-exception'
import { bitToBool } from '../../framework/database/types'
import { getTenantId } from '../../framework/tenant/tenant-context'
import { NotificationRepository } from '../repository/notification.repository'
import { NotificationSseManager } from '../sse/notification-sse.manager'

/** 渠道类型（对齐 Java `ChannelType`）。 */
export const CHANNELS = ['IN_APP', 'SMS', 'WECHAT_WORK', 'WECHAT_MINIPROGRAM', 'APP'] as const
export type ChannelType = (typeof CHANNELS)[number]

const IN_APP: ChannelType = 'IN_APP'
const STATUS_SENT = 'SENT'
const STATUS_PENDING = 'PENDING'
const ENABLED_KEY = '__enabled'

/** 内部发送接口的入参（对齐 Java `Message` 实体里调用方需要填的部分）。 */
export interface SendMessageRequest {
  tenantId: string | null
  templateCode: string
  eventCode: string | null
  senderId: number
  senderType: string
  title: string | null
  content: unknown
  linkJson: unknown
  contentType: string | null
  priority: string
  category: string
  messageType: string
}

/** 按模板发送的入参（对齐 Java `TemplateSendRequest`）。 */
export interface SendByTemplateRequest {
  senderId: number | null
  templateCode: string
  variables: Record<string, unknown> | null
  messageType: string | null
  eventCode: string | null
}

/**
 * 消息发送链路（对齐 Java 的 `MessageSender` + `MessageDispatcher` + `MessageServiceImpl.send`）。
 *
 * ## 层级关系（照抄 Java，不要合并）
 *   - `sendFree` 对应「自由内容」原语：调用方自己填好整个 Message；
 *   - `sendByTemplate` 对应门面：按模板代码加载模板、校验必填变量、渲染标题正文，
 *     再走同一条落库链路。
 *
 * ## 只迁移站内信渠道（IN_APP）
 *   Java 的 `MessageDispatcher` 对非 IN_APP 渠道会走 `ChannelAdapter`（短信 / 企业微信 /
 *   小程序 / APP 的出站调用），失败时写 `msg_delivery_retry`。这些适配器是**外部系统集成**，
 *   本批未迁移 —— 行为上等价于 Java 的「渠道适配器未注册 → 跳过」，即**静默不投递**。
 *   记入规格开放项；`/admin/notification/deliveries/{id}/retry` 因此也尚未实现。
 *
 * ## 订阅规则不在站内信链路上
 *   `MessageDispatcher.handleMessageEvent` 的注释写着「站内信收件人经订阅判定过滤」，
 *   但**代码里并没有对 IN_APP 调用 `eligibleRecipients`**（只对外部渠道调）。
 *   照抄代码而不是注释。
 */
@Injectable()
export class MessageSendService {
  constructor(
    private readonly repository: NotificationRepository,
    private readonly sseManager: NotificationSseManager,
  ) {}

  /**
   * 渠道是否启用（对齐 `ChannelConfigService.isEnabled`）。
   *
   * 规则：有 `__enabled` 配置行就以它为准；否则**站内信恒为启用**，
   * 外部渠道则看是否已有非空配置。`Boolean.parseBoolean` 语义：只有
   * 忽略大小写等于 "true" 才是启用（其余一律 false，包括空值）。
   */
  async isChannelEnabled(channel: string): Promise<boolean> {
    const configs = await this.repository.findChannelConfigs(channel)
    const flag = configs.find((c) => c.config_key === ENABLED_KEY)
    if (flag !== undefined) {
      return String(flag.config_value).toLowerCase() === 'true'
    }
    return channel === IN_APP || (await this.isChannelConfigured(channel))
  }

  /** 渠道是否有非空配置（对齐 `isConfigured`；`__enabled` 是保留键，不算配置项）。 */
  async isChannelConfigured(channel: string): Promise<boolean> {
    const configs = await this.repository.findChannelConfigs(channel)
    return configs.some(
      (c) =>
        c.config_key !== ENABLED_KEY && c.config_value !== null && String(c.config_value) !== '',
    )
  }

  /**
   * 分发：`MessageEvent` → `MessageDispatcher.handleMessageEvent`。
   *
   * 站内信落库是**同步**的（`@EventListener` 非异步），所以 HTTP 响应返回时
   * 消息与收件人行已经可读 —— 契约场景正是依赖这一点（发送后紧接着查列表）。
   */
  async dispatch(
    message: SendMessageRequest,
    recipientIds: number[],
    channels: string[],
  ): Promise<void> {
    if (channels.includes(IN_APP) && (await this.isChannelEnabled(IN_APP)) && recipientIds.length > 0) {
      const sent = await this.persist(message, recipientIds)
      // SSE 推送（对齐 Java `MessageDispatcher`：站内信落库后逐个 `sendToUser(userId, "new-message", message)`）。
      // ⚠️ 离线用户静默跳过，且推送失败**不影响**「消息已落库」这个事实。
      for (const userId of recipientIds) {
        this.sseManager.sendToUser(userId, 'new-message', sent.payload)
      }
    }
    // 非 IN_APP 渠道：无适配器 ⇒ 与 Java 的「渠道不可用」分支一致，静默跳过。
  }

  /** 自由内容发送（`MessageServiceImpl.send`）。 */
  async sendFree(
    message: SendMessageRequest,
    recipientIds: number[],
    channels: string[],
  ): Promise<void> {
    await this.dispatch(message, recipientIds, channels)
  }

  /**
   * 直接落库（`MessageServiceImpl.send` 本身，**不经分发器**）。
   *
   * 公告发布与渠道测试走的是这条路（Java 里它们直接调 `messageService.send`）。
   * 与 `dispatch` 的差别只有 SSE 推送与外部渠道那一段 —— 对 IN_APP 落库结果相同。
   * ⚠️ 但它**保留 `send` 自己的渠道开关判断**：站内信被管理员禁用时，
   *    消息行仍然落库、收件人行不写（这是 Java 的行为，别改）。
   */
  async sendDirect(
    message: SendMessageRequest,
    recipientIds: number[],
  ): Promise<Record<string, unknown> | null> {
    if (!(await this.isChannelEnabled(IN_APP))) return null
    const sent = await this.persist(message, recipientIds)
    return sent.payload
  }

  /**
   * 按模板发送（`MessageSender.sendByTemplate`）。
   *
   * 校验顺序照抄 Java：**先校验事件**（若给了 eventCode），再找模板、再校验必填变量。
   * 顺序变了先报哪条错就变了，而错误消息是契约。
   */
  async sendByTemplate(
    request: SendByTemplateRequest,
    recipientIds: number[],
    channels: string[],
  ): Promise<void> {
    const tenantId = getTenantId()
    const eventCode = blankToNull(request.eventCode)
    if (eventCode !== null) {
      await this.requireEnabledEvent(tenantId, eventCode)
    }
    const template = await this.repository.findTemplateByCode(request.templateCode, tenantId)
    if (template === null) {
      throw new BusinessException(500, `模板不存在: ${request.templateCode}`)
    }
    // ⚠️ 必须用 bitToBool：`enabled` 是 BIT(1)，mysql2 返回 Buffer 而不是 number，
    //    写成 `template.enabled !== 1` 会**恒为真** ⇒ 永远报「模板已停用」。
    //    契约比对抓到的：`mscSendByTemplateDisabled` 因为错误的原因通过了，
    //    而紧随其后的 `mscSendByTemplateMissingVar` 才暴露出来。
    if (!bitToBool(template.enabled)) {
      throw new BusinessException(500, `模板已停用: ${request.templateCode}`)
    }

    const variables = request.variables ?? {}
    validateVariables(template.title, variables)
    validateVariables(template.content, variables)

    await this.dispatch(
      {
        tenantId,
        templateCode: request.templateCode,
        eventCode,
        senderId: request.senderId ?? 0,
        senderType: 'SYSTEM',
        title: render(template.title, variables),
        // 结构固定为 {text: 渲染后正文, variables: 原始变量}（供外部渠道二次渲染）
        content: { text: render(template.content, variables), variables: { ...variables } },
        linkJson: null,
        contentType: template.content_type,
        priority: template.priority ?? '',
        category: template.category ?? '',
        messageType: request.messageType ?? 'PRIVATE',
      },
      recipientIds,
      channels,
    )
  }

  /** 事件必须存在且启用（`NotificationEventService.requireEnabled`）。 */
  async requireEnabledEvent(tenantId: string, eventCode: string): Promise<void> {
    const event = await this.repository.findEnabledEventDefinition(tenantId, eventCode)
    if (event === null) {
      throw new BusinessException(400, `事件不存在或已停用: ${eventCode}`)
    }
  }

  /**
   * 重发一条**已存在**的消息（`DeliveryController.retry` 经分发器走的那条路）。
   *
   * ⚠️ 这是「UPDATE 消息 + 重新插入收件人行」，**不是**新建消息：
   *    Java 把库里 load 出来的实体（id 非空）交给 `send`，JPA 的 `save()`
   *    对带 id 的实体执行 **merge → UPDATE**；`send()` 里
   *    `if (message.getCreatedAt() == null)` 也不命中（load 出来就有值），
   *    所以 `created_at` 保持不变。**收件人行则是全新增的** ——
   *    因此站内信重发会让该消息的 recipient 行**翻倍**。这是 Java 的既有行为。
   */
  async resendExisting(
    row: {
      id: number
      tenant_id: string
      created_at: Date | null
    },
    recipientIds: number[],
    channels: string[],
  ): Promise<void> {
    if (!channels.includes(IN_APP)) return
    if (!(await this.isChannelEnabled(IN_APP))) return

    // merge：整行按 load 出来的值重写，只有 status 被 send() 置为 SENT
    await this.repository.updateMessageStatus(row.id, STATUS_SENT)
    await this.persistRecipients(row.id, row.tenant_id, recipientIds, row.created_at ?? new Date())
  }

  /**
   * 落库：写消息行 + 为每个收件人写一行收件人快照。
   *
   * 收件人的 username/nickname/email/phone 是**发送当时的快照**：
   * 查得到用户就用真实值，查不到就回退 `user_<id>`（对齐 Java）。
   */
  /**
   * 落库并返回「新消息 + 推送载荷」。
   *
   * ⚠️ 返回值是为了 SSE 推送：Java 推的是**内存里的 Message 实体**（还没落库完就有 id），
   *    所以这里也把刚写入的那一行按**列表同形状**（`MessageVO`）组装出来 ——
   *    前端 `new-message` 处理器直接 `JSON.parse(event.data)` 后 `unshift` 进列表，
   *    形状必须与 `GET /api/v1/notifications` 的元素一致，否则前端插进去的是半条消息。
   */
  private async persist(
    message: SendMessageRequest,
    recipientIds: number[],
  ): Promise<{ messageId: number; payload: Record<string, unknown> }> {
    const now = new Date()
    const messageId = await this.repository.insertMessage({
      tenant_id: message.tenantId ?? '',
      template_code: message.templateCode,
      event_code: message.eventCode,
      sender_id: message.senderId,
      sender_type: message.senderType,
      title: message.title,
      content: message.content === null ? null : JSON.stringify(message.content),
      link_json: message.linkJson === null ? null : JSON.stringify(message.linkJson),
      content_type: message.contentType,
      priority: message.priority,
      category: message.category,
      message_type: message.messageType,
      status: STATUS_SENT,
      created_at: now,
    })

    await this.persistRecipients(messageId, message.tenantId ?? '', recipientIds, now)

    // 推送载荷：与 `GET /api/v1/notifications` 的元素同形状（见方法注释）。
    // 新落库的站内信对收件人而言是**未读**（`msg_recipient.status='PENDING'`）。
    const payload: Record<string, unknown> = {
      id: messageId,
      tenantId: message.tenantId ?? '',
      templateCode: message.templateCode,
      eventCode: message.eventCode,
      senderId: message.senderId,
      senderType: message.senderType,
      title: message.title,
      content: message.content,
      linkJson: message.linkJson,
      contentType: message.contentType,
      priority: message.priority,
      category: message.category,
      messageType: message.messageType,
      status: STATUS_SENT,
      readStatus: STATUS_PENDING,
      createdAt: now,
      updatedAt: now,
    }
    return { messageId, payload }
  }

  /** 为指定消息插入收件人行（快照语义，见 `persist` 的说明）。 */
  private async persistRecipients(
    messageId: number,
    tenantId: string,
    recipientIds: number[],
    now: Date,
  ): Promise<void> {
    const users = await this.repository.findUsersByIds(recipientIds)
    const byId = new Map(users.map((u) => [u.id, u]))
    await this.repository.insertRecipients(
      recipientIds.map((userId) => {
        const user = byId.get(userId)
        return {
          tenant_id: tenantId,
          message_id: messageId,
          user_id: userId,
          username: user?.username ?? `user_${userId}`,
          nickname: user?.nickname ?? null,
          email: user?.email ?? null,
          phone: user?.phone ?? null,
          channel: IN_APP,
          status: STATUS_PENDING,
          created_at: now,
        }
      }),
    )
  }
}

/** 模板变量占位符（对齐 `TemplateService.VARIABLE_PATTERN`）。 */
const VARIABLE_PATTERN = /\$\{([^}]+)\}/g

/**
 * 渲染模板：把 `${name}` 换成变量值，取不到就换成空串。
 *
 * ⚠️ 必须用**替换函数**而不是替换字符串：Java 用 `Matcher.quoteReplacement` 保证
 *    变量值里的 `$` / `\` 不被当成反向引用；JS 里用 `replace(str)` 同样会解释
 *    `$&`、`$1` 之类，只有函数形式是字面替换。
 */
export function render(template: string | null, variables: Record<string, unknown>): string | null {
  if (template === null) return null
  return template.replace(VARIABLE_PATTERN, (_m, name: string) => {
    const value = variables[name]
    return value === null || value === undefined ? '' : String(value)
  })
}

/**
 * 校验模板里的每个 `${var}` 都有非空变量（`TemplateService.validateVariables`）。
 *
 * ⚠️ Java 里 `variables` 为 null 会在 `containsKey` 处 NPE → 500，
 *    这里的报错文案不同（那条路径没有 golden 覆盖）。调用方已把 null 归一成 `{}`，
 *    所以实际不可达 —— 保留此说明以免有人误以为语义已对齐。
 */
export function validateVariables(
  template: string | null,
  variables: Record<string, unknown>,
): void {
  if (template === null) return
  VARIABLE_PATTERN.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = VARIABLE_PATTERN.exec(template)) !== null) {
    const name = m[1]
    if (!(name in variables) || variables[name] === null || variables[name] === undefined) {
      throw new BusinessException(500, `缺少必填变量: ${name}`)
    }
  }
}

/** 空串/空白视作 null（对齐 Java 的 `isBlank()` 判断）。 */
export function blankToNull(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null
  return value.trim() === '' ? null : value
}

/** 解析渠道枚举参数；无法识别返回 null（不抛错，静默不过滤 —— 记入规格开放项）。 */
export function parseChannelType(value: string | null | undefined): ChannelType | null {
  const normalized = blankToNull(value)
  if (normalized === null) return null
  const upper = normalized.toUpperCase()
  return (CHANNELS as readonly string[]).includes(upper) ? (upper as ChannelType) : null
}
