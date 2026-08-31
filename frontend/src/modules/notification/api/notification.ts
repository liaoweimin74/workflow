/**
 * 用户端消息 API
 */
import http from '@/api/http'
import type { Message, PageResult } from '../types'

/** 获取消息列表 */
export function getNotifications(params: { page?: number; size?: number }) {
  return http.get<PageResult<Message>>('/v1/notifications', { params })
}

/** 获取消息详情 */
export function getNotification(id: number) {
  return http.get<Message>(`/v1/notifications/${id}`)
}

/** 标记已读 */
export function markAsRead(id: number) {
  return http.put(`/v1/notifications/${id}/read`)
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
