export interface RoleVO {
  id: number
  roleName: string
  roleCode: string
  description: string
  status: number
  createdAt: string
  /** 所属客户端 id（V52 后端增量字段；一个角色恰好归属一个端）。 */
  clientId?: number
}

export interface RoleQueryParams {
  page?: number
  size?: number
  roleName?: string
  roleCode?: string
  status?: number
  /** 按端筛选（GET /roles?clientId=，Task 5）；缺省 = 全端不过滤。 */
  clientId?: number
}

export interface RoleCreateForm {
  roleName: string
  roleCode: string
  description?: string
  status?: number
  /** 归属端，缺省 portal(1)（后端 createRole 语义）。 */
  clientId?: number | null
}

export interface RoleUpdateForm {
  roleName?: string
  description?: string
  status?: number
  /** 改端：内置角色（ROLE_ADMIN/ROLE_USER）拒绝（后端 500），自定义放行。 */
  clientId?: number | null
}