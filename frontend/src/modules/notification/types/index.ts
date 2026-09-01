/**
 * 消息通知模块类型定义
 */

/** 消息优先级 */
export type MessagePriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT'

/** 消息分类（与后端 MessageCategory 枚举一致） */
export type MessageCategory = 'WORKFLOW' | 'SYSTEM' | 'NOTIFICATION' | 'TASK' | 'APPROVAL'

/** 消息类型（与后端 MessageType 枚举一致） */
export type MessageType = 'PUBLIC' | 'PRIVATE' | 'SYSTEM'

/** 内容渲染类型（与后端 TemplateContentType 一致）：正文按纯文本或 Markdown 展示 */
export type ContentType = 'TEXT' | 'MARKDOWN'

/** 消息状态：发送状态（保留 MessageStatus 枚举） */
export type MessageStatus = 'PENDING' | 'SENT' | 'READ' | 'DELETED' | 'FAILED'

/** 接收状态（已读语义）：PENDING=未读，SENT=已读 */
export type RecipientStatus = 'PENDING' | 'SENT' | 'DELIVERED' | 'FAILED' | 'READ'

/** 渠道类型 */
export type ChannelType = 'IN_APP' | 'SMS' | 'WECHAT_WORK' | 'WECHAT_MINIPROGRAM' | 'APP'

/** 用户订阅偏好（单渠道开关） */
export interface SubscriptionPreference {
  channel: ChannelType
  channelName: string
  subscribed: boolean
}

/** 消息实体 */
export interface Message {
  id: number
  tenantId: string
  templateCode: string
  senderId: number
  senderType: string
  title: string
  content: Record<string, any>
  linkJson?: Record<string, any>
  priority: MessagePriority
  category: MessageCategory
  messageType: MessageType
  contentType?: ContentType
  /** 消息发送状态 */
  status: MessageStatus
  /** 当前用户已读状态（列表/详情接口回填）：PENDING=未读，SENT=已读 */
  readStatus?: RecipientStatus
  createdAt: string
}

/** 消息筛选条件 */
export interface MessageFilter {
  page?: number
  size?: number
  keyword?: string
  category?: MessageCategory
  messageType?: MessageType
  unread?: boolean
  start?: string
  end?: string
}

/** 分页结果 */
export interface PageResult<T> {
  total: number
  page: number
  size: number
  rows: T[]
}

/** 未读数响应 */
export interface UnreadCountResponse {
  code: number
  msg: string
  data: number
}
