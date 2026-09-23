import { Injectable } from '@nestjs/common'
import { BusinessException } from '../../common/exception/business-exception'
import { bitToBool } from '../../framework/database/types'
import type { LoginUser } from '../../framework/security/jwt-auth.guard'
import { getTenantId } from '../../framework/tenant/tenant-context'
import {
  NotificationRepository,
  type EventDefinitionRow,
  type NullPatch,
  type SubscriptionRuleRow,
  type TemplateRow,
} from '../repository/notification.repository'
import {
  NotificationAdminService,
  toEventVO,
  toTemplateVO,
  type ChannelType,
  type MessageTemplateVO,
  type NotificationEventVO,
} from './notification-admin.service'
import { MessageSendService } from './message-send.service'
import { NotificationSseManager } from '../sse/notification-sse.manager'
import { toMessageVO, type MessageVO } from './notification.service'

/** 公告的标记模板代码（对齐 Java `AnnouncementController.ANNOUNCEMENT_TEMPLATE`）。 */
const ANNOUNCEMENT_TEMPLATE = 'ANNOUNCEMENT'

/** 渠道测试消息的模板代码（对齐 Java `ChannelController.TEST_TEMPLATE_CODE`）。 */
const CHANNEL_TEST_TEMPLATE = 'CHANNEL_TEST'

/** 新建/更新模板的入参（对齐 Java `MessageTemplate` 实体的可写字段）。 */
export interface TemplateWriteRequest {
  templateCode: string | null
  eventCode: string | null
  name: string | null
  title: string | null
  content: string | null
  contentType: string | null
  channel: string | null
  priority: string | null
  category: string | null
  enabled: boolean | null
}

/**
 * 管理端通知写路径（对齐 Java `TemplateService` 的写方法与 `AnnouncementController`）。
 *
 * 与读路径分成两个类，是因为写路径要注入 `NotificationAdminService` 做鉴权
 * （Java 每个 handler 首行都调 `NotificationAdminAuthorization.requireAdmin()`），
 * 再塞进读服务会形成互相依赖。
 */
@Injectable()
export class NotificationWriteService {
  constructor(
    private readonly repository: NotificationRepository,
    private readonly adminService: NotificationAdminService,
    private readonly sendService: MessageSendService,
    private readonly sseManager: NotificationSseManager,
  ) {}

  // ------------------------------------------------------------ 模板

  /**
   * 创建模板（`TemplateService.create`）。
   *
   * ⚠️ 三条容易漏的规则：
   *    ① 用户建的模板**一律 `isSystem = false`**（系统模板只能由初始化预置）；
   *    ② `enabled` 传 null 时默认 **true**；
   *    ③ 仅当「带 eventCode + enabled=true + channel 非空」时才做
   *       「同一事件和渠道已有启用模板」的唯一性检查 —— 少任何一个条件都不查。
   */
  async createTemplate(user: LoginUser, request: TemplateWriteRequest): Promise<MessageTemplateVO> {
    await this.adminService.requireAdmin(user)
    const tenantId = getTenantId()
    const templateCode = request.templateCode ?? ''
    if (await this.repository.existsTemplateByCode(templateCode, tenantId)) {
      throw new BusinessException(500, `模板代码已存在: ${templateCode}`)
    }
    const enabled = request.enabled ?? true
    const eventCode = blankToNullOf(request.eventCode)
    if (eventCode !== null) {
      await this.sendService.requireEnabledEvent(tenantId, eventCode)
      if (enabled && request.channel !== null) {
        const clash = await this.repository.existsEnabledTemplateForEventChannel(
          tenantId,
          eventCode,
          request.channel,
        )
        if (clash) throw new BusinessException(500, '同一事件和渠道已有启用模板')
      }
    }

    const id = await this.repository.insertTemplate({
      tenant_id: tenantId,
      template_code: templateCode,
      event_code: eventCode,
      // 不兜底成空串：Java 直接把入参存进去，NOT NULL 由数据库拒绝（见 insertTemplate 注释）
      name: request.name,
      title: request.title,
      content: request.content,
      // 实体字段默认值是 TEXT（Java 里 `contentType = TemplateContentType.TEXT`），
      // 所以 body 不传时落库的是 TEXT 而不是 NULL
      content_type: request.contentType ?? 'TEXT',
      channel: request.channel,
      priority: request.priority,
      category: request.category,
      is_system: 0,
      enabled: enabled ? 1 : 0,
      // 对齐实体上的 @PrePersist（契约库里这一列没有 DEFAULT，不写就是 NULL）
      created_at: new Date(),
    })
    const row = await this.repository.findTemplateById(id)
    if (row === null) throw new BusinessException(500, `模板不存在`)
    return toTemplateVO(row)
  }

  /**
   * 更新模板（`TemplateService.update`）。
   *
   * ⚠️ **`priority` / `category` 对非系统模板是无条件覆盖的**（不判 null）——
   *    只传 name/title/content 的 PUT 会把这两个字段清成 **null**；
   *    之后按该模板发送时 `msg_message.priority/category` 是 NOT NULL 列，
   *    插入直接失败。契约场景 `mscTplUpdate` 因此必须把四个字段一起传。
   *    这是 Java 的既有行为，照抄。
   */
  async updateTemplate(
    user: LoginUser,
    id: number,
    request: TemplateWriteRequest,
  ): Promise<MessageTemplateVO> {
    await this.adminService.requireAdmin(user)
    const existing = await this.repository.findTemplateById(id)
    if (existing === null) throw new BusinessException(500, '模板不存在')
    // ⚠️ BIT(1) 经 mysql2 回来是 Buffer 不是 number —— 必须 bitToBool，
    //    写成 `existing.is_system === 1` 会恒为 false（即把所有模板都当普通模板）。
    const isSystem = bitToBool(existing.is_system)

    const patch: NullPatch<TemplateRow> = {
      name: request.name,
      title: request.title,
      content: request.content,
    }
    // contentType / enabled 是「非 null 才覆盖」
    if (request.contentType !== null) patch.content_type = request.contentType
    if (request.enabled !== null) patch.enabled = request.enabled ? 1 : 0
    // priority / category 对非系统模板无条件覆盖（见方法注释）
    if (!isSystem) {
      patch.priority = request.priority
      patch.category = request.category
    }

    await this.repository.updateTemplate(id, patch)
    const row = await this.repository.findTemplateById(id)
    if (row === null) throw new BusinessException(500, '模板不存在')
    return toTemplateVO(row)
  }

  /** 启用/停用模板（`TemplateService.toggle`）。 */
  async toggleTemplate(user: LoginUser, id: number): Promise<void> {
    await this.adminService.requireAdmin(user)
    const existing = await this.repository.findTemplateById(id)
    if (existing === null) throw new BusinessException(500, '模板不存在')
    // ⚠️ BIT(1) → Buffer，必须 bitToBool 才能拿到当前值（见 updateTemplate 的同类注释）
    await this.repository.updateTemplate(id, { enabled: bitToBool(existing.enabled) ? 0 : 1 })
  }

  // ------------------------------------------------------------ 公告

  /**
   * 发布公告（`AnnouncementController.publish`）。
   *
   * ⚠️ 入参走的是**查询参数**（Java 的 `@RequestParam`），不是 JSON body。
   * ⚠️ `tenantId` 是**硬编码 "default"**，不取租户上下文 —— 照抄。
   * ⚠️ 走的是 `messageService.send` 本身（不经分发器），所以站内信被禁用时
   *    消息行仍会落库、只是不写收件人行。
   */
  async publishAnnouncement(
    user: LoginUser,
    title: string,
    content: string,
    recipientIds: number[],
  ): Promise<void> {
    await this.adminService.requireAdmin(user)
    const payload = await this.sendService.sendDirect(
      {
        tenantId: 'default',
        templateCode: ANNOUNCEMENT_TEMPLATE,
        eventCode: null,
        senderId: user.userId,
        senderType: 'SYSTEM',
        title,
        // Map.of("text", content, "variables", Map.of()) —— 键序不重要（比对按 key 匹配）
        content: { text: content, variables: {} },
        linkJson: null,
        contentType: 'MARKDOWN',
        priority: 'NORMAL',
        category: 'SYSTEM',
        messageType: 'PUBLIC',
      },
      recipientIds,
    )
    // SSE 推送（对齐 Java `AnnouncementController`：`sendToUser(targetId, "new-message", message)`）。
    // ⚠️ Java 那条路径是单个 targetId；这里按收件人逐个推 —— 语义等价（在线收件人应立即看到）。
    //    频道被禁用时 payload 为 null ⇒ 不推（消息也没落库）。
    if (payload !== null) {
      for (const recipientId of recipientIds) {
        this.sseManager.sendToUser(recipientId, 'new-message', payload)
      }
    }
  }

  /**
   * 公告详情（`AnnouncementController.detail`）。
   *
   * ⚠️ 返回的是**消息实体**，没有回填 `readStatus`（那是用户端列表/详情才做的），
   *    所以这里 `readStatus` 恒为 null。golden `mscAnnDetail` 钉住了这一点。
   */
  async getAnnouncement(user: LoginUser, id: number): Promise<MessageVO> {
    await this.adminService.requireAdmin(user)
    const message = await this.repository.findMessageById(id)
    if (message === null) throw new BusinessException(500, `公告不存在: ${id}`)
    if (message.template_code !== ANNOUNCEMENT_TEMPLATE) {
      throw new BusinessException(500, `非公告消息: ${id}`)
    }
    return toMessageVO(message, null)
  }

  /**
   * 撤回公告（`AnnouncementController.recall`）：**硬删**收件人行 + 消息行。
   *
   * 与用户端的 `DELETE /notifications/{id}` 不同 —— 那个只删自己那一行收件人记录。
   */
  async recallAnnouncement(user: LoginUser, id: number): Promise<void> {
    await this.adminService.requireAdmin(user)
    const message = await this.repository.findMessageById(id)
    if (message === null) throw new BusinessException(500, `公告不存在: ${id}`)
    if (message.template_code !== ANNOUNCEMENT_TEMPLATE) {
      throw new BusinessException(500, `非公告消息，不可撤回: ${id}`)
    }
    await this.repository.deleteRecipientsByMessageId(id)
    await this.repository.deleteMessageById(id)
  }

  /**
   * 站内信渠道连通性测试：给**当前登录用户**发一条真实测试消息。
   *
   * 这条会落库（收件人行也写），所以它是一次真实的写入 —— 不是只读探测。
   */
  async sendChannelTest(user: LoginUser): Promise<void> {
    const payload = await this.sendService.sendDirect(
      {
        tenantId: 'default',
        templateCode: CHANNEL_TEST_TEMPLATE,
        eventCode: null,
        senderId: user.userId,
        senderType: 'SYSTEM',
        title: '【渠道测试】站内信连通性测试',
        content: {
          text: '这是一条渠道连通性**测试消息**，收到即表示站内信渠道正常。',
          variables: {},
        },
        linkJson: null,
        contentType: 'MARKDOWN',
        priority: 'NORMAL',
        category: 'SYSTEM',
        messageType: 'PRIVATE',
      },
      [user.userId],
    )
    // SSE 推送（对齐 Java `ChannelController`：测试消息发给**发起人自己**）
    if (payload !== null) {
      this.sseManager.sendToUser(user.userId, 'new-message', payload)
    }
  }

  // ------------------------------------------------------------ 业务事件定义

  /**
   * 创建业务事件定义（`NotificationEventService.create`）。
   *
   * ⚠️ 校验**顺序即契约**（顺序变了先报哪条错就变了）：
   *    ① 代码格式 → ② 名称非空 → ③ 代码唯一。
   * ⚠️ 三种错误码**特意不同**，不要统一：
   *    - 格式非法 → `BusinessException(400, ...)`（显式传了 400）
   *    - 名称为空 → `BusinessException(String)` → **code 500**（单参构造器默认 500）
   *    - 代码重复 → `BusinessException(409, ...)`
   */
  async createEvent(
    user: LoginUser,
    body: {
      eventCode: string | null
      eventName: string | null
      description: string | null
      businessDomain: string | null
    },
  ): Promise<NotificationEventVO> {
    await this.adminService.requireAdmin(user)
    const tenantId = getTenantId()
    validateEventCode(body.eventCode)
    if (blankToNullOf(body.eventName) === null) {
      throw new BusinessException(500, '事件名称不能为空')
    }
    const eventCode = body.eventCode ?? ''
    if (await this.repository.existsEventDefinition(tenantId, eventCode)) {
      throw new BusinessException(409, `事件代码已存在: ${eventCode}`)
    }
    // 操作人取 LoginUser.getUsername()（用户名，不是 id）；取不到回落 "system"
    const operator = user.username ?? 'system'
    const now = new Date()
    const id = await this.repository.insertEventDefinition({
      tenant_id: tenantId,
      event_code: eventCode,
      event_name: body.eventName ?? '',
      description: body.description,
      business_domain: body.businessDomain,
      enabled: 1,
      created_by: operator,
      created_at: now,
      updated_by: operator,
      updated_at: now,
    })
    return toEventVO(await this.requireEventRow(tenantId, id))
  }

  /**
   * 更新业务事件定义（`update`）。
   *
   * ⚠️ **不接收 eventCode**（Java 的签名里没有它 —— 事件代码不可改）；
   *    且 `description` / `businessDomain` 是**无条件覆盖**，不传就清成 NULL。
   */
  async updateEvent(
    user: LoginUser,
    id: number,
    body: { eventName: string | null; description: string | null; businessDomain: string | null },
  ): Promise<NotificationEventVO> {
    await this.adminService.requireAdmin(user)
    const tenantId = getTenantId()
    await this.requireEventRow(tenantId, id)
    if (blankToNullOf(body.eventName) === null) {
      throw new BusinessException(500, '事件名称不能为空')
    }
    await this.repository.updateEventDefinition(id, {
      event_name: body.eventName,
      description: body.description,
      business_domain: body.businessDomain,
      updated_by: user.username ?? 'system',
      // 对齐实体上的 @PreUpdate：updatedAt 无条件刷新（createdAt 不动）
      updated_at: new Date(),
    })
    return toEventVO(await this.requireEventRow(tenantId, id))
  }

  /** 删除业务事件定义；被模板或订阅规则引用时拒绝（409）。 */
  async deleteEvent(user: LoginUser, id: number): Promise<void> {
    await this.adminService.requireAdmin(user)
    const tenantId = getTenantId()
    const row = await this.requireEventRow(tenantId, id)
    const referenced =
      (await this.repository.existsTemplateByEventCode(tenantId, row.event_code)) ||
      (await this.repository.existsSubscriptionRuleByEventCode(tenantId, row.event_code))
    if (referenced) {
      throw new BusinessException(409, '事件已被模板或订阅规则引用，不能删除')
    }
    await this.repository.deleteEventDefinition(id)
  }

  /** 启用/停用业务事件定义（`toggle`：取反，不接收目标状态）。 */
  async toggleEvent(user: LoginUser, id: number): Promise<void> {
    await this.adminService.requireAdmin(user)
    const tenantId = getTenantId()
    const row = await this.requireEventRow(tenantId, id)
    await this.repository.updateEventDefinition(id, {
      // ⚠️ BIT(1) → Buffer，必须 bitToBool（见 updateTemplate 的同类注释）
      enabled: bitToBool(row.enabled) ? 0 : 1,
      updated_by: user.username ?? 'system',
      updated_at: new Date(),
    })
  }

  /** 取事件定义行（含租户校验）；不存在 → 404。 */
  private async requireEventRow(tenantId: string, id: number): Promise<EventDefinitionRow> {
    const row = await this.repository.findEventDefinitionById(id)
    // 对齐 Java `findById(id).filter(e -> tenantId.equals(e.getTenantId()))`：
    // 别的租户的行等价于「不存在」，不区分 403
    if (row === null || row.tenant_id !== tenantId) {
      throw new BusinessException(404, `事件不存在: ${id}`)
    }
    return row
  }

  // ------------------------------------------------------------ 订阅规则

  /**
   * 创建订阅规则（`SubscriptionController.create`）。
   *
   * ⚠️ Java **不做业务校验**，直接把入参映射到实体存库：`event_code` / `channel` /
   *    `enable` / `action` 在库里都是 NOT NULL，而 JPA 会把未设置的字段**显式插入
   *    NULL** ⇒ 数据库报错 ⇒ HTTP 500。照抄这个行为（不提前校验、不填默认值），
   *    让 DB 来拒绝 —— 提前校验会让「Java 500、Node 成功」的分歧出现。
   * ⚠️ `channel` / `priority` / `action` 用 `valueOf` 解析：非法枚举值在 Java 抛
   *    `IllegalArgumentException` → **HTTP 500**；`enable` 用 `Boolean.valueOf`
   *    （**不抛**，只认忽略大小写的 "true"）。
   */
  async createSubscription(user: LoginUser, body: Record<string, unknown>): Promise<void> {
    await this.adminService.requireAdmin(user)
    const tenantId = getTenantId()
    const fields = parseSubscriptionFields(body)
    await this.repository.insertSubscriptionRule({
      tenant_id: tenantId,
      event_code: fields.eventCode ?? '',
      channel: fields.channel ?? '',
      priority: fields.priority,
      enable: fields.enable === true ? 1 : 0,
      action: fields.action ?? '',
      condition_expr: fields.conditionExpr,
      created_by: user.username ?? 'system',
      created_at: new Date(),
    })
  }

  /**
   * 更新订阅规则；不存在 → 500「订阅规则不存在」。
   *
   * ⚠️ 与模板 update 相反：这里**只在入参非 null 时才覆盖**（Java `applyFields`
   *    每个字段都套了 `if (rule.get(...) != null)`）。别把两种语义搞混。
   */
  async updateSubscription(
    user: LoginUser,
    id: number,
    body: Record<string, unknown>,
  ): Promise<void> {
    await this.adminService.requireAdmin(user)
    if ((await this.repository.findSubscriptionRuleById(id)) === null) {
      throw new BusinessException(500, `订阅规则不存在: ${id}`)
    }
    const fields = parseSubscriptionFields(body)
    const patch: NullPatch<SubscriptionRuleRow> = {}
    if (fields.eventCode !== null) patch.event_code = fields.eventCode
    if (fields.channel !== null) patch.channel = fields.channel
    if (fields.priority !== null) patch.priority = fields.priority
    if (fields.enable !== null) patch.enable = fields.enable ? 1 : 0
    if (fields.action !== null) patch.action = fields.action
    if (fields.conditionExpr !== null) patch.condition_expr = fields.conditionExpr
    await this.repository.updateSubscriptionRule(id, patch)
  }

  /** 删除订阅规则；不存在 → 500「订阅规则不存在」（Java 用 `existsById`）。 */
  async deleteSubscription(user: LoginUser, id: number): Promise<void> {
    await this.adminService.requireAdmin(user)
    if ((await this.repository.findSubscriptionRuleById(id)) === null) {
      throw new BusinessException(500, `订阅规则不存在: ${id}`)
    }
    await this.repository.deleteSubscriptionRule(id)
  }

  // ------------------------------------------------------------ 渠道配置

  /** 启用渠道；未知 ID → **code 500**（Java `R.fail("未知渠道 ID: ...")`）。 */
  async enableChannel(user: LoginUser, id: number): Promise<void> {
    await this.adminService.requireAdmin(user)
    await this.setChannelEnabledById(id, true)
  }

  /** 禁用渠道。 */
  async disableChannel(user: LoginUser, id: number): Promise<void> {
    await this.adminService.requireAdmin(user)
    await this.setChannelEnabledById(id, false)
  }

  /**
   * 更新渠道配置（`ChannelConfigService.save`）。
   *
   * ⚠️ 语义是**整批覆盖**：先删该渠道的全部非 `__enabled` 行，再按入参逐条插入。
   *    所以传 `{}` 就等于「清空配置」—— 契约场景正是靠这一点把状态复原。
   * ⚠️ 键名含 key/secret/password/token 的算敏感字段，Java 会 AES-GCM 加密后落库。
   *    **本实现不加密**（理由见 `isSensitiveKey` 的注释），只把 `is_encrypted` 标记照写。
   */
  async updateChannelConfig(
    user: LoginUser,
    id: number,
    config: Record<string, unknown>,
  ): Promise<void> {
    await this.adminService.requireAdmin(user)
    const type = requireChannelType(id)
    await this.repository.deleteChannelConfigsExceptEnabled(type)
    const now = new Date()
    for (const [key, value] of Object.entries(config)) {
      // 对齐 Java：键为空白、值为 null 的条目直接跳过（不报错）
      if (key.trim() === '') continue
      if (value === null || value === undefined) continue
      await this.repository.insertChannelConfig({
        channel: type,
        config_key: key.trim(),
        config_value: typeof value === 'string' ? value : String(value),
        is_encrypted: isSensitiveKey(key) ? 1 : 0,
        created_at: now,
      })
    }
  }

  /**
   * 渠道连通性测试。
   *
   * ⚠️ IN_APP 测试会**落库一条 `templateCode=CHANNEL_TEST` 的消息**，而该消息
   *    **没有撤回端点**（撤回要求 templateCode=ANNOUNCEMENT）⇒ 会在契约库里留下
   *    **永久残留**，污染 `notifStats.totalMessages` 与 `deliveryList`（两者都是全局
   *    计数/全局列表）。因此契约场景**只覆盖它的错误分支**（未知渠道 ID），
   *    落库行为由单测 + 集成测试覆盖。外部渠道要走真实网关，结果不确定，同样不进 golden。
   */
  async testChannel(user: LoginUser, id: number): Promise<void> {
    await this.adminService.requireAdmin(user)
    const type = requireChannelType(id)
    if (type === 'IN_APP') {
      await this.sendChannelTest(user)
      return
    }
    // 外部渠道适配器未迁移（见 MessageSendService 的类注释）：Java 侧走
    // `adapter.test()`，失败时 R.fail("渠道测试失败: " + error)
    throw new BusinessException(500, `渠道测试失败: 渠道适配器未注册: ${type}`)
  }

  /** 写 `__enabled` 开关行（`ChannelConfigService.setEnabled`）。 */
  private async setChannelEnabledById(id: number, enabled: boolean): Promise<void> {    const type = requireChannelType(id)
    const configs = await this.repository.findChannelConfigs(type)
    const flag = configs.find((c) => c.config_key === '__enabled')
    const value = enabled ? 'true' : 'false'
    if (flag !== undefined) {
      await this.repository.updateChannelEnabledFlag(flag.id, value)
      return
    }
    await this.repository.insertChannelConfig({
      channel: type,
      config_key: '__enabled',
      config_value: value,
      is_encrypted: 0,
      created_at: new Date(),
    })
  }

  // ------------------------------------------------------------ 投递重发

  /**
   * 手动重发（`DeliveryController.retry`）。
   *
   * ⚠️ 两条错误都用 code **500**，但文案不同：
   *    - 消息不存在 → `BusinessException("消息不存在: " + id)`
   *    - 无收件人 → `R.fail("该消息无收件人记录，无法重发")`
   *
   * ⚠️ 重发**不新建消息**：Java 把从库里 load 出来的 `Message`（id 非空）交给
   *    `messageService.send`，而 JPA 的 `save()` 对带 id 的实体走 **merge → UPDATE**。
   *    所以原消息行只是被重新写了一遍（`status` 仍是 SENT、`createdAt` 不变 ——
   *    `send()` 只在它为空时才赋值），**而收件人行会被重新插入一遍**。
   *    即：站内信场景下「重发」会让该消息的 recipient 数**翻倍**。
   *    这是 Java 的既有行为，照抄并用契约场景钉住。
   */
  async retryDelivery(user: LoginUser, id: number): Promise<void> {
    await this.adminService.requireAdmin(user)
    const message = await this.repository.findMessageById(id)
    if (message === null) throw new BusinessException(500, `消息不存在: ${id}`)

    const recipients = await this.repository.findRecipientsByMessageId(id)
    if (recipients.length === 0) {
      throw new BusinessException(500, '该消息无收件人记录，无法重发')
    }
    const recipientIds = [...new Set(recipients.map((r) => r.user_id))]
    const channelSet = [...new Set(recipients.map((r) => r.channel))]
    const channels = channelSet.length > 0 ? channelSet : ['IN_APP']

    await this.sendService.resendExisting(message, recipientIds, channels)
  }
}

/** 渠道 ID → 类型（对齐 Java `ChannelController.CHANNEL_BY_ID` 的 LinkedHashMap，按 ID 有序）。 */
const CHANNEL_BY_ID = new Map<number, ChannelType>([
  [1, 'IN_APP'],
  [2, 'SMS'],
  [3, 'WECHAT_WORK'],
  [4, 'WECHAT_MINIPROGRAM'],
  [5, 'APP'],
])

/** 解析渠道 ID；未知 → code 500「未知渠道 ID: N」。 */
function requireChannelType(id: number): ChannelType {
  const type = CHANNEL_BY_ID.get(id)
  if (type === undefined) throw new BusinessException(500, `未知渠道 ID: ${id}`)
  return type
}

/** 事件代码格式（`NotificationEventService.CODE_REGEX`）。 */
function validateEventCode(code: string | null): void {
  if (code === null || !/^[A-Z][A-Z0-9_]{0,63}$/.test(code)) {
    throw new BusinessException(400, '事件代码必须为大写字母、数字和下划线，且首字符为大写字母')
  }
}

/** 订阅规则入参的归一结果（`SubscriptionController.applyFields`）。 */
interface SubscriptionFields {
  eventCode: string | null
  channel: string | null
  priority: string | null
  enable: boolean | null
  action: string | null
  conditionExpr: string | null
}

/**
 * 解析订阅规则入参（对齐 `applyFields`）。
 *
 * ⚠️ 三个枚举字段用「白名单」模拟 `Enum.valueOf` 的抛错行为：非法值必须**抛错**，
 *    静默存进去会让两侧数据不同。
 */
function parseSubscriptionFields(body: Record<string, unknown>): SubscriptionFields {
  return {
    eventCode: rawOrNull(body.eventCode),
    channel: enumOrNull(body.channel, CHANNEL_TYPES, 'ChannelType'),
    priority: enumOrNull(body.priority, MESSAGE_PRIORITIES, 'MessagePriority'),
    action: enumOrNull(body.action, RULE_ACTIONS, 'SubscriptionRuleAction'),
    // 对齐 Boolean.valueOf(String)：只有忽略大小写的 "true" 为真，其余一律 false（不抛）
    enable:
      body.enable === null || body.enable === undefined
        ? null
        : String(body.enable).toLowerCase() === 'true',
    // Java 先看 `condition`，没有再退回 `conditionExpr`
    conditionExpr:
      body.condition !== null && body.condition !== undefined
        ? String(body.condition)
        : rawOrNull(body.conditionExpr),
  }
}

const CHANNEL_TYPES = ['IN_APP', 'SMS', 'WECHAT_WORK', 'WECHAT_MINIPROGRAM', 'APP']
const MESSAGE_PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'URGENT']
const RULE_ACTIONS = ['ALLOW', 'DENY', 'FORCE']

/** 保留原值（只把 null/undefined 归一成 null），不做类型转换 —— 对齐 `String.valueOf`。 */
function rawOrNull(value: unknown): string | null {
  if (value === null || value === undefined) return null
  return String(value)
}

/**
 * 枚举解析；非法值模拟 Java 的 `Enum.valueOf` 抛错。
 *
 * ⚠️ **必须是 `IllegalArgumentException`，不是普通 Error**：
 *    普通 Error 会被全局过滤器映射成 **HTTP 500**，而 Java 侧这里是
 *    `IllegalArgumentException` → **HTTP 400**（契约场景 nweSubCreateBadChannel /
 *    BadAction 实测确认：HTTP 400 + body `{code:400, ...}`）。两者在契约里不同。
 *
 * ⚠️ 消息必须带**枚举的全限定名**：Java 的 `Enum.valueOf` 抛的是
 *    `No enum constant com.workflow.notification.model.ChannelType.EMAIL`，
 *    逐字出现在响应 body 里。少了包名就对不上。
 */
function enumOrNull(value: unknown, allowed: string[], enumName: string): string | null {
  const text = rawOrNull(value)
  if (text === null) return null
  if (!allowed.includes(text)) {
    const err = new Error(
      `No enum constant com.workflow.notification.model.${enumName}.${text}`,
    )
    err.name = 'IllegalArgumentException'
    throw err
  }
  return text
}

/**
 * 是否敏感配置键（`ChannelConfigService.isSensitive`）。
 *
 * ⚠️ 本实现**只写标记、不加密**。理由：Java 的 `EncryptionUtil` 在未配置
 *    `notification.encryption.key` 时**每次调用都 `new SecureRandom()` 生成新密钥**
 *    （见其 `getSecretKey`），所以密文既不可复现、也**永远解不回原文**
 *    —— 那串值是**不可用的**，照抄只会让 Node 侧也存一串谁也读不了的数据。
 *    而加密结果与 `is_encrypted` 标记都**不出现在任何响应里**
 *    （`GET /channels` 只返回 id/name/type/enabled/successRate），对契约没有影响。
 *    已记入规格开放项（U24）；真要加密应当两侧共用同一密钥来源。
 */
function isSensitiveKey(key: string): boolean {
  const lower = key.toLowerCase()
  return (
    lower.includes('key') ||
    lower.includes('secret') ||
    lower.includes('password') ||
    lower.includes('token')
  )
}

/**
 * 空串/空白视作 null（对齐 Java `isBlank()`）。
 *
 * ⚠️ **必须同时接受 `undefined`**：请求体里没写的字段在 JS 里是 `undefined`
 *    而不是 `null`。第一版只判了 `=== null`，于是 `POST /templates` 不带
 *    `eventCode` 时直接在对 `undefined` 调 `.trim()` 上崩成
 *    「Cannot read properties of undefined (reading 'trim')」→ 500。
 *    是契约比对（mscTplCreate）当场抓到的，不是猜的。
 */
function blankToNullOf(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null
  return value.trim() === '' ? null : value
}
