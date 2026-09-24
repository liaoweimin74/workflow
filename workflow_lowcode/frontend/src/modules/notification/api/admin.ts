/**
 * 管理端 API
 */
import http from '@/utils/http'

/** 模板列表 */
export function getTemplates(params?: { page?: number; size?: number }) {
  return http.get('/v1/admin/notification/templates', { params })
}

/** 创建模板 */
export function createTemplate(data: any) {
  return http.post('/v1/admin/notification/templates', data)
}

/** 更新模板 */
export function updateTemplate(id: number, data: any) {
  return http.put(`/v1/admin/notification/templates/${id}`, data)
}

/** 启用/停用模板 */
export function toggleTemplate(id: number) {
  return http.post(`/v1/admin/notification/templates/${id}/toggle`)
}

/** 渠道列表 */
export function getChannels() {
  return http.get('/v1/admin/notification/channels')
}

/** 更新渠道配置 */
export function updateChannelConfig(id: number, data: any) {
  return http.put(`/v1/admin/notification/channels/${id}/config`, data)
}

/** 测试渠道连通性 */
export function testChannel(id: number) {
  return http.post(`/v1/admin/notification/channels/${id}/test`)
}

export function enableChannel(id: number) {
  return http.post(`/v1/admin/notification/channels/${id}/enable`)
}

export function disableChannel(id: number) {
  return http.post(`/v1/admin/notification/channels/${id}/disable`)
}

/** 订阅规则列表 */
export function getSubscriptionRules(params?: Record<string, any>) {
  return http.get('/v1/admin/notification/subscriptions', { params })
}

/** 创建订阅规则 */
export function createSubscriptionRule(data: any) {
  return http.post('/v1/admin/notification/subscriptions', data)
}

/** 更新订阅规则 */
export function updateSubscriptionRule(id: number, data: any) {
  return http.put(`/v1/admin/notification/subscriptions/${id}`, data)
}

/** 删除订阅规则 */
export function deleteSubscriptionRule(id: number) {
  return http.delete(`/v1/admin/notification/subscriptions/${id}`)
}

/** 发送记录 */
export interface DeliveryLogParams {
  page?: number
  size?: number
  /** 标题关键字（模糊） */
  keyword?: string
  /** 收件人用户名（模糊） */
  recipient?: string
  /** 渠道 */
  channel?: string
  /** 开始时间 yyyy-MM-dd HH:mm:ss */
  start?: string
  /** 结束时间 yyyy-MM-dd HH:mm:ss */
  end?: string
}

export function getDeliveryLogs(params?: DeliveryLogParams) {
  return http.get('/v1/admin/notification/deliveries', { params })
}

/** 手动重发 */
export function retryDelivery(id: number) {
  return http.post(`/v1/admin/notification/deliveries/${id}/retry`)
}

/** 公告列表 */
export function getAnnouncements(params?: { page?: number; size?: number; keyword?: string }) {
  return http.get('/v1/admin/notification/announcements', { params })
}

/** 公告详情（管理员查看完整 Markdown 内容） */
export function getAnnouncement(id: number) {
  return http.get(`/v1/admin/notification/announcements/${id}`)
}

/** 发布公告 */
export function publishAnnouncement(data: { title: string; content: string; recipientIds: number[] }) {
  return http.post('/v1/admin/notification/announcements', null, { params: data })
}

/** 撤回公告 */
export function recallAnnouncement(id: number) {
  return http.delete(`/v1/admin/notification/announcements/${id}`)
}
