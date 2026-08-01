import http from '@/utils/http'
import type { R } from '@/types/common'
import type { RoleVO, RoleCreateForm, RoleUpdateForm, RoleQueryParams } from '@/types/role'

export function getRoleList(params: RoleQueryParams) {
  return http.get<any, R<{ rows: RoleVO[]; total: number; page: number; size: number }>>('/roles', { params })
}

export function createRole(data: RoleCreateForm) {
  return http.post<any, R<RoleVO>>('/roles', data)
}

export function updateRole(id: number, data: RoleUpdateForm) {
  return http.put<any, R<RoleVO>>(`/roles/${id}`, data)
}

export function deleteRole(id: number) {
  return http.delete<any, R<null>>(`/roles/${id}`)
}

export function getRoleMenus(id: number) {
  return http.get<any, R<number[]>>(`/roles/${id}/menus`)
}

export function assignRoleMenus(id: number, menuIds: number[]) {
  return http.put<any, R<null>>(`/roles/${id}/menus`, { menuIds })
}