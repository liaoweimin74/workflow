import http from '@/utils/http'
import type { R } from '@/types/common'
import type { MenuTree, MenuCreateForm, MenuUpdateForm, MenuMoveForm } from '@/types/menu'

/** 按端取树（Task 8 A3）：clientId=端 Tab 当前选中；缺省由服务端按请求端上下文归一 portal。 */
export function getMenuTree(clientId?: number) {
  return http.get<any, R<MenuTree[]>>('/menus/tree', { params: clientId ? { clientId } : undefined })
}

export function createMenu(data: MenuCreateForm) {
  return http.post<any, R<MenuTree>>('/menus', data)
}

export function updateMenu(id: number, data: MenuUpdateForm) {
  return http.put<any, R<MenuTree>>(`/menus/${id}`, data)
}

/** 拖动调整层级与排序：后端会重排原父级/新父级两组兄弟节点的 sortOrder */
export function moveMenu(id: number, data: MenuMoveForm) {
  return http.put<any, R<MenuTree>>(`/menus/${id}/move`, data)
}

export function deleteMenu(id: number) {
  return http.delete<any, R<null>>(`/menus/${id}`)
}