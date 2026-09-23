import { Injectable } from '@nestjs/common'
import { BusinessException } from '../../common/exception/business-exception'
import { PageResult } from '../../common/domain/page-result'
import { assertPageSize } from '../../framework/http/query-params'
import { NotificationRepository, type MessageRow, type RecipientRow } from '../repository/notification.repository'

/** 收件人状态：PENDING=未读，SENT=已读（对齐 Java `RecipientStatus`）。 */
export const STATUS_PENDING = 'PENDING'
export const STATUS_SENT = 'SENT'

/** 用户端消息查询条件（对齐 Java `NotificationController.list` 的入参）。 */
export interface UserMessageQuery {
  keyword: string | null
  category: string | null
  unread: boolean | null
  start: Date | null
  end: Date | null
  messageType: string | null
}

/**
 * 消息出参。
 *
 * 键集合照抄 Java `Message` 实体的可序列化属性（16 个）：
 * id / tenantId / templateCode / senderId / senderType / title / content /
 * linkJson / priority / category / messageType / status / createdAt /
 * contentType / eventCode / readStatus。
 *
 * ⚠️ `readStatus` 是 `@Transient`（不落库），只在**列表与详情**里由收件人行回填；
 *    没有收件人行时它是 `null` 且**键仍然存在** —— golden `mscGetAfterDelete`
 *    正是这一形态（消息已从该用户的列表里删掉，但 admin 还是发送者，所以能查看）。
 *    漏掉这个键会被比对器判为 missing。
 *
 * ⚠️ `content` / `linkJson` 是 MySQL `json` 列，DatabaseModule 的 typeCast 让它们
 *    保持**原文本**，所以这里必须 JSON.parse 回对象。
 */
export interface MessageVO {
  id: number
  tenantId: string
  templateCode: string
  senderId: number
  senderType: string
  title: string | null
  content: unknown
  linkJson: unknown
  priority: string | null
  category: string | null
  messageType: string | null
  status: string | null
  createdAt: Date | null
  contentType: string | null
  eventCode: string | null
  readStatus: string | null
}

/**
 * 用户端消息服务（对齐 Java `MessageServiceImpl`）。
 *
 * ⚠️ 未迁移：Java 的 `NotificationCache`（进程内未读数缓存）。
 *    这里**只查库**：缓存是性能优化、不改契约取值；两侧各持一份进程内缓存
 *    反而会制造「同一份数据两个后端读数不同」的假差异。见规格开放项。
 */
@Injectable()
export class NotificationService {
  constructor(private readonly repository: NotificationRepository) {}

  /** 未读消息数（对齐 `getUnreadCount`）。 */
  async getUnreadCount(userId: number): Promise<number> {
    return this.repository.countRecipientsByUserIdAndStatus(userId, STATUS_PENDING)
  }

  /**
   * 当前用户的消息分页列表（对齐 `listByUserId`）。
   *
   * ⚠️ **两处 `size` 用法不一致，是刻意的照抄**：
   *    空集分支返回 `size = Math.max(size, 1)`，而非空分支返回**原始的 `size`**
   *    （`new PageResult<>(total, normalizedPage, size, content)`）。
   *    统一成一种写法就会与 Java 分页外壳不一致 —— 契约比对的正是这些字段。
   */
  async listByUserId(
    userId: number,
    page: number,
    size: number,
    query: UserMessageQuery,
  ): Promise<PageResult<MessageVO>> {
    // 1. 按用户 + 已读状态过滤收件人记录，得到消息 ID 集合
    const recipients =
      query.unread === null
        ? await this.repository.findRecipientsByUserId(userId)
        : await this.repository.findRecipientsByUserIdAndStatus(
            userId,
            query.unread ? STATUS_PENDING : STATUS_SENT,
          )

    if (recipients.length === 0) {
      return new PageResult<MessageVO>(0, Math.max(page, 1), Math.max(size, 1), [])
    }

    // ⚠️ 守卫只在**非空分支**：Java 在 `recipients.isEmpty()` 时直接返回（`size` 被归一成 ≥1），
    //    只有走到 `PageRequest.of(normalizedPage - 1, size, ...)` 才会因 `size < 1` 抛
    //    IllegalArgumentException → HTTP 400 `Page size must not be less than one`。
    //    所以同一个 `?size=0` 在「该用户没有消息」时是 200、在「有消息」时是 400 ——
    //    契约场景「非法查询参数与分页边界」的 `qiNotifSizeZero` 实测到的就是这个分支差异。
    assertPageSize(size)

    const messageIds = [...new Set(recipients.map((r) => r.message_id))]
    const normalizedPage = Math.max(page, 1)
    const { rows, total } = await this.repository.findUserMessagesPage(
      messageIds,
      query,
      (normalizedPage - 1) * size,
      size,
    )

    const statusByMessage = statusMapOf(recipients)
    return new PageResult<MessageVO>(
      total,
      normalizedPage,
      size,
      rows.map((m) => toMessageVO(m, statusByMessage.get(m.id) ?? null)),
    )
  }

  /**
   * 消息详情（对齐 `getById`）。
   *
   * ⚠️ 权限判定是「收件人 **或** 发送者」，且发送者分支不要求有收件人行 ——
   *    所以用户把自己发的消息从列表里删掉之后，**仍然能查看详情**
   *    （此时 `readStatus` 为 null）。
   */
  async getById(id: number, userId: number): Promise<MessageVO> {
    const message = await this.repository.findMessageById(id)
    if (message === null) throw new BusinessException(500, '消息不存在')

    const recipients = await this.repository.findRecipientsByMessageId(id)
    const isRecipient = recipients.some((r) => r.user_id === userId)
    if (!isRecipient && message.sender_id !== userId) {
      throw new BusinessException(403, '无权查看此消息')
    }

    const own = await this.repository.findRecipientByMessageAndUser(id, userId)
    return toMessageVO(message, own?.status ?? null)
  }

  /**
   * 标记单条已读（对齐 `markAsRead`）。
   *
   * ⚠️ 「受影响 0 行 → 抛『消息不存在或已读』」的措辞是**误导性**的：
   *    Java 的 UPDATE 不带 status 条件，所以已读再标已读照样命中、不报错；
   *    真正触发这里的是**没有收件人行**。golden `mscReadUnknown` 与
   *    `mscReadNewestAgain` 两个步骤把这两条路径都钉住了，别照着文案改逻辑。
   */
  async markAsRead(messageId: number, userId: number): Promise<void> {
    const updated = await this.repository.markAsRead(messageId, userId, new Date())
    if (updated === 0) throw new BusinessException(500, '消息不存在或已读')
  }

  /** 批量标记已读（对齐 `batchMarkAsRead`：空列表直接返回，不报错）。 */
  async batchMarkAsRead(messageIds: number[], userId: number): Promise<void> {
    if (messageIds.length === 0) return
    await this.repository.markBatchAsRead(userId, messageIds, new Date())
  }

  /**
   * 切换已读状态（对齐 `toggleRead`），返回**切换后**的状态。
   *
   * ⚠️ 置为未读时 `sentAt` 被清成 null（Java `setSentAt(unread ? now : null)`）。
   */
  async toggleRead(messageId: number, userId: number): Promise<string> {
    const recipient = await this.repository.findRecipientByMessageAndUser(messageId, userId)
    if (recipient === null) throw new BusinessException(500, '消息不存在')
    const wasUnread = recipient.status === STATUS_PENDING
    const next = wasUnread ? STATUS_SENT : STATUS_PENDING
    await this.repository.updateRecipient(recipient.id, {
      status: next,
      sent_at: wasUnread ? new Date() : null,
    })
    return next
  }

  /** 全部已读（对齐 `markAllAsRead`）。 */
  async markAllAsRead(userId: number): Promise<void> {
    await this.repository.markAllAsRead(userId, new Date())
  }

  /**
   * 删除消息（对齐 `delete`）。
   *
   * ⚠️ **只删收件人行，不删消息行** —— 共享同一条消息的其他收件人不受影响。
   *    因此「删除」后 admin 作为发送者仍能查详情（见 `getById`）。
   * ⚠️ 非收件人 → **403**（不是 404）：`mscDeleteUnknown` 钉住了这条。
   */
  async delete(id: number, userId: number): Promise<void> {
    const recipients = await this.repository.findRecipientsByMessageId(id)
    const isRecipient = recipients.some((r) => r.user_id === userId)
    if (!isRecipient) throw new BusinessException(403, '无权删除此消息')
    await this.repository.deleteRecipientByUserAndMessage(userId, id)
  }
}

/**
 * 收件人列表 → `消息ID → 状态` 映射。
 *
 * 对齐 Java 的 `Collectors.toMap(..., (a, b) -> a)`：同一消息出现多条收件人行时
 * **保留先遇到的那条**（正常情况下同用户同消息只有一行，这条只是防御）。
 */
function statusMapOf(recipients: RecipientRow[]): Map<number, string> {
  const out = new Map<number, string>()
  for (const r of recipients) {
    if (!out.has(r.message_id)) out.set(r.message_id, r.status)
  }
  return out
}

/** 把消息行映射为出参。`readStatus` 由调用方按是否有收件人行传入。 */
export function toMessageVO(row: MessageRow, readStatus: string | null): MessageVO {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    templateCode: row.template_code,
    senderId: row.sender_id,
    senderType: row.sender_type,
    title: row.title,
    content: parseJsonColumn(row.content),
    linkJson: parseJsonColumn(row.link_json),
    priority: row.priority,
    category: row.category,
    messageType: row.message_type,
    status: row.status,
    createdAt: row.created_at,
    contentType: row.content_type,
    eventCode: row.event_code,
    readStatus,
  }
}

/**
 * JSON 列还原。
 *
 * ⚠️ DatabaseModule 的 typeCast 把 `json` 列保持为**原文本**，所以要手动 parse。
 *    解析失败时**原样返回字符串**而不是抛错：宁可让契约比对报出差异，
 *    也不要在读接口上因为一条脏数据整个 500。
 */
export function parseJsonColumn(value: string | null): unknown {
  if (value === null) return null
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}
