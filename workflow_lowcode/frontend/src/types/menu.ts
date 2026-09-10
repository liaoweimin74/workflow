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
  visible: number
  status: number
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
  visible?: number
}

export interface MenuUpdateForm {
  menuName?: string
  path?: string
  component?: string
  permission?: string
  icon?: string
  sortOrder?: number
  visible?: number
  status?: number
}