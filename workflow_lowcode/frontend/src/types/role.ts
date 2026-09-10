export interface RoleVO {
  id: number
  roleName: string
  roleCode: string
  description: string
  status: number
  createdAt: string
}

export interface RoleQueryParams {
  page?: number
  size?: number
  roleName?: string
  roleCode?: string
  status?: number
}

export interface RoleCreateForm {
  roleName: string
  roleCode: string
  description?: string
  status?: number
}

export interface RoleUpdateForm {
  roleName?: string
  description?: string
  status?: number
}