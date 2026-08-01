import http from '@/utils/http'
import type { R } from '@/types/common'
import type { MenuTree, MenuCreateForm, MenuUpdateForm } from '@/types/menu'

export function getMenuTree() {
  return http.get<any, R<MenuTree[]>>('/menus/tree')
}

export function createMenu(data: MenuCreateForm) {
  return http.post<any, R<MenuTree>>('/menus', data)
}

export function updateMenu(id: number, data: MenuUpdateForm) {
  return http.put<any, R<MenuTree>>(`/menus/${id}`, data)
}

export function deleteMenu(id: number) {
  return http.delete<any, R<null>>(`/menus/${id}`)
}