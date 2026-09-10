import http from '@/utils/http'
import type { EventDefinition, PageResult } from '../types'

export function getEventDefinitions(params?: {
  page?: number
  size?: number
  keyword?: string
  enabled?: boolean
}) {
  return http.get<PageResult<EventDefinition>>('/v1/admin/notification/events', { params })
}

export function createEventDefinition(data: {
  eventCode: string
  eventName: string
  description?: string
  businessDomain?: string
}) {
  return http.post<EventDefinition>('/v1/admin/notification/events', data)
}

export function updateEventDefinition(id: number, data: {
  eventName: string
  description?: string
  businessDomain?: string
}) {
  return http.put<EventDefinition>(`/v1/admin/notification/events/${id}`, data)
}

export function deleteEventDefinition(id: number) {
  return http.delete(`/v1/admin/notification/events/${id}`)
}

export function toggleEventDefinition(id: number) {
  return http.post(`/v1/admin/notification/events/${id}/toggle`)
}
