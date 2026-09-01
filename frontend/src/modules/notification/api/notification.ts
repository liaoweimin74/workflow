/**
 * 用户端消息 API
 */
import http from '@/utils/http'
import type { Message, MessageCategory, MessageType, PageResult, SubscriptionPreference } from '../types'

/** 获取消息列表（支持筛选） */
export function getNotifications(params: {
  page?: number
  size?: number
  keyword?: string
  category?: MessageCategory
  messageType?: MessageType
  unread?: boolean
  start?: string
  end?: string
}) {
  return http.get<PageResult<Message>>('/v1/notifications', { params })
}

/** 获取当前用户全部渠道的订阅偏好（未设置的渠道默认 subscribed=true） */
export function getSubscriptionPreferences() {
  return http.get<SubscriptionPreference[]>('/v1/notifications/subscriptions')
}

/** 批量更新当前用户订阅偏好（[{channel, subscribed}]） */
export function updateSubscriptionPreferences(items: { channel: string; subscribed: boolean }[]) {
  return http.put('/v1/notifications/subscriptions', items)
}

/** 获取消息详情 */
export function getNotification(id: number) {
  return http.get<Message>(`/v1/notifications/${id}`)
}

/** 标记已读 */
export function markAsRead(id: number) {
  return http.put(`/v1/notifications/${id}/read`)
}

/** 批量标记已读 */
export function markBatchAsRead(messageIds: number[]) {
  return http.post('/v1/notifications/read-batch', messageIds)
}

/** 切换已读状态（未读↔已读），返回新状态 */
export function toggleRead(id: number) {
  return http.post(`/v1/notifications/${id}/toggle-read`)
}

/** 全部已读 */
export function markAllAsRead() {
  return http.post('/v1/notifications/read-all')
}

/** 删除消息 */
export function deleteNotification(id: number) {
  return http.delete(`/v1/notifications/${id}`)
}

/** 获取未读数 */
export function getUnreadCount() {
  return http.get<number>('/v1/notifications/unread-count')
}
