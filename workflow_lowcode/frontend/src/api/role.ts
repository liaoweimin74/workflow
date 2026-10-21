import http from '@/utils/http'
import type { R } from '@/types/common'
import type { RoleVO, RoleCreateForm, RoleUpdateForm, RoleQueryParams } from '@/types/role'
import type { DataScopeCondition } from '@/api/dataScope'

/** 角色在某权限对象上的授权勾选（角色管理视角；v3 单轴：授权即赋予可见行） */
export interface RoleDataPermission {
  permissionId: number
  permissionName: string
  remark: string | null
  conditions: DataScopeCondition[]
  dataSourceIds: string[]
  granted: boolean
}

export interface RoleDataPermissionSaveItem {
  permissionId: number
}

export function getRoleList(params: RoleQueryParams) {
  return http.get<any, R<{ rows: RoleVO[]; total: number; page: number; size: number }>>('/roles', { params, cache: true })
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

/** 角色数据权限：全部权限对象 + 该角色当前的读写勾选 */
export function getRoleDataPermissions(id: number) {
  return http.get<any, R<RoleDataPermission[]>>(`/roles/${id}/data-permissions`)
}

/** 全量替换该角色的数据权限（只影响本角色的授权，其他角色不动） */
export function saveRoleDataPermissions(id: number, items: RoleDataPermissionSaveItem[]) {
  return http.put<any, R<null>>(`/roles/${id}/data-permissions`, { items })
}