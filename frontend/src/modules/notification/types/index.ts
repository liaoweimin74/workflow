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

/** 消息状态：列表接口返回当前用户的已读状态（PENDING=未读，SENT=已读） */
export type MessageStatus = 'PENDING' | 'SENT' | 'READ' | 'DELETED' | 'FAILED'

/** 渠道类型 */
export type ChannelType = 'IN_APP' | 'SMS' | 'WECHAT_WORK' | 'WECHAT_MINIPROGRAM' | 'APP'

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
  status: MessageStatus
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
