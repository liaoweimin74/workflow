export interface MenuTree {
  id: number
  parentId: number
  menuName: string
  menuType: number
  path: string
  component: string
  permission: string
  icon: string
  sortOrder: number
  /** 1 启用（侧边栏可见）/ 0 停用；sys_menu 无 visible 列，可见性由此字段承载 */
  status: number
  /** 所属客户端 id（V51 后端增量字段，树按端过滤后每节点携带） */
  clientId?: number
  children: MenuTree[]
}

export interface MenuCreateForm {
  parentId?: number
  menuName: string
  menuType: number
  path?: string
  component?: string
  permission?: string
  icon?: string
  sortOrder?: number
  /** 后端 MenuCreateRequest.status（1 启用/0 停用） */
  status?: number
}

export interface MenuUpdateForm {
  menuName?: string
  path?: string
  component?: string
  permission?: string
  icon?: string
  sortOrder?: number
  status?: number
}

/** PUT /menus/{id}/move 载荷：parentId=null 表示移到根级，index 为目标子项（排除自身后）的插入位 */
export interface MenuMoveForm {
  parentId: number | null
  index: number
}