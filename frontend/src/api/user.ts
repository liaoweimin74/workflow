import http from '@/utils/http'
import type { R } from '@/types/common'
import type { UserVO, UserQueryParams, UserCreateForm, UserUpdateForm } from '@/types/user'

export function getUserList(params: UserQueryParams) {
  return http.get<any, R<{ rows: UserVO[]; total: number; page: number; size: number }>>('/users', { params })
}

export function getUserById(id: number) {
  return http.get<any, R<UserVO>>(`/users/${id}`)
}

export function createUser(data: UserCreateForm) {
  return http.post<any, R<UserVO>>('/users', data)
}

export function updateUser(id: number, data: UserUpdateForm) {
  return http.put<any, R<UserVO>>(`/users/${id}`, data)
}

export function deleteUser(id: number) {
  return http.delete<any, R<null>>(`/users/${id}`)
}

export function updateUserStatus(id: number, status: number) {
  return http.put<any, R<null>>(`/users/${id}/status`, { status })
}

export function resetUserPassword(id: number) {
  return http.put<any, R<null>>(`/users/${id}/password`, {})
}