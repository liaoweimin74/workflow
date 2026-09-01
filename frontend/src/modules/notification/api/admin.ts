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
