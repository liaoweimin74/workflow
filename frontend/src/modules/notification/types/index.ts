/**
 * 消息通知模块类型定义
 */

/** 消息优先级 */
export type MessagePriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT'

/** 消息分类 */
export type MessageCategory = 'WORKFLOW' | 'SYSTEM' | 'USER' | 'EXTERNAL'

/** 消息类型 */
export type MessageType = 'PUBLIC' | 'PRIVATE'

/** 消息状态 */
export type MessageStatus = 'PENDING' | 'SENT' | 'READ' | 'DELETED' | 'FAILED'

/** 渠道类型 */
export type ChannelType = 'IN_APP' | 'SMS' | 'WECHAT_WORK' | 'WECHAT_MINIPROGRAM' | 'APP'

/** 消息实体 */
export interface Message {
  id: number
  tenantId: number
  templateCode: string
  senderId: number
  senderType: string
  title: string
  content: Record<string, any>
  linkJson?: Record<string, any>
  priority: MessagePriority
  category: MessageCategory
  messageType: MessageType
  status: MessageStatus
  createdAt: string
}

/** 消息筛选条件 */
export interface MessageFilter {
  page?: number
  size?: number
  category?: MessageCategory
  keyword?: string
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
